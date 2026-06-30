import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import prisma from "@/lib/prisma";
import redis from "@/lib/redis";
import { getGeoLocation } from "@/lib/geoip";
import { inferLibraryKey, isLibraryExcluded } from "@/lib/mediaPolicy";
import { compactJellyfinId, normalizeJellyfinId } from "@/lib/jellyfinId";
import { normalizeResolution, clampDuration } from "@/lib/utils";
import { comparePluginApiKey, getPluginKeySnapshot, isPreviousPluginKeyValid } from "@/lib/pluginKeyManager";
import { parsePluginApiKeyCandidate, verifyScopedPluginApiKey } from "@/lib/pluginServerKey";
import { getClientIp, normalizeIp } from "@/lib/requestIp";
import { getCachedPluginIngestSettings } from "@/lib/pluginTelemetrySettings";
import {
    buildStreamRedisKey,
} from "@/lib/serverRegistry";

// Lightweight local types for incoming Jellyfin payloads
export type JellyfinPerson = { type?: string; Type?: string; name?: string; Name?: string };
export type Studio = { name?: string; Name?: string };

export const CORS_HEADERS = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key",
};

export const ALLOWED_PLUGIN_EVENTS = new Set([
    "Heartbeat",
    "MediaDownloaded",
    "PlaybackStart",
    "PlaybackProgress",
    "PlaybackStop",
    "PlaybackStateChanged",
    "SessionEnded",
    "LibraryChanged",
]);

export const DOWNLOAD_EVENT_ALIASES = new Set(["ItemDownloaded", "DownloadCompleted"]);
export const CURRENT_PLUGIN_EVENT_SCHEMA_VERSION = 3;
export const MIN_SUPPORTED_PLUGIN_EVENT_SCHEMA_VERSION = 2;
const parsedMaxPluginEventBytes = Number(process.env.PLUGIN_EVENT_MAX_BYTES);
export const MAX_PLUGIN_EVENT_BYTES = Number.isFinite(parsedMaxPluginEventBytes)
    ? parsedMaxPluginEventBytes
    : 1024 * 1024;

export class PayloadTooLargeError extends Error {
    constructor() {
        super("payload_too_large");
        this.name = "PayloadTooLargeError";
    }
}

// When a new start event arrives but a session for the same user+media was
// closed recently (within this window), prefer reopening that session
// instead of creating a new row. This prevents short-lived race duplicates.
export const MERGE_WINDOW_MS = Number(process.env.MERGE_WINDOW_MS) || 60 * 60 * 1000; // 1 hour default

export interface PluginAuthResult {
    authorized: boolean;
    usedPreviousKey: boolean;
    autoRotated: boolean;
    scopeServerId: string | null;
}

export function corsJson(body: unknown, init?: { status?: number }) {
    return NextResponse.json(body, { ...init, headers: CORS_HEADERS });
}

export async function verifyPluginAuth(req: Request): Promise<PluginAuthResult> {
    const { snapshot, autoRotated } = await getPluginKeySnapshot();

    const currentKeyHash = snapshot.currentKeyHash?.trim() || null;
    const previousKeyHash = snapshot.previousKeyHash?.trim() || null;

    const bearerParsed = parsePluginApiKeyCandidate(extractBearerToken(req.headers.get("authorization")));
    const headerParsed = parsePluginApiKeyCandidate(req.headers.get("x-api-key"));

    const bearerScopedCurrent = verifyScopedPluginApiKey(bearerParsed.scopedToken, currentKeyHash);
    if (bearerScopedCurrent.valid) {
        return {
            authorized: true,
            usedPreviousKey: false,
            autoRotated,
            scopeServerId: bearerScopedCurrent.jellyfinServerId,
        };
    }

    const headerScopedCurrent = verifyScopedPluginApiKey(headerParsed.scopedToken, currentKeyHash);
    if (headerScopedCurrent.valid) {
        return {
            authorized: true,
            usedPreviousKey: false,
            autoRotated,
            scopeServerId: headerScopedCurrent.jellyfinServerId,
        };
    }

    if (!bearerParsed.scoped && await comparePluginApiKey(bearerParsed.rawKey, currentKeyHash)) {
        return {
            authorized: true,
            usedPreviousKey: false,
            autoRotated,
            scopeServerId: null,
        };
    }

    if (!headerParsed.scoped && await comparePluginApiKey(headerParsed.rawKey, currentKeyHash)) {
        return {
            authorized: true,
            usedPreviousKey: false,
            autoRotated,
            scopeServerId: null,
        };
    }

    if (!isPreviousPluginKeyValid(snapshot) || !previousKeyHash) {
        return { authorized: false, usedPreviousKey: false, autoRotated, scopeServerId: null };
    }

    const bearerScopedPrevious = verifyScopedPluginApiKey(bearerParsed.scopedToken, previousKeyHash);
    if (bearerScopedPrevious.valid) {
        return {
            authorized: true,
            usedPreviousKey: true,
            autoRotated,
            scopeServerId: bearerScopedPrevious.jellyfinServerId,
        };
    }

    const headerScopedPrevious = verifyScopedPluginApiKey(headerParsed.scopedToken, previousKeyHash);
    if (headerScopedPrevious.valid) {
        return {
            authorized: true,
            usedPreviousKey: true,
            autoRotated,
            scopeServerId: headerScopedPrevious.jellyfinServerId,
        };
    }

    if (!bearerParsed.scoped && await comparePluginApiKey(bearerParsed.rawKey, previousKeyHash)) {
        return {
            authorized: true,
            usedPreviousKey: true,
            autoRotated,
            scopeServerId: null,
        };
    }

    if (!headerParsed.scoped && await comparePluginApiKey(headerParsed.rawKey, previousKeyHash)) {
        return {
            authorized: true,
            usedPreviousKey: true,
            autoRotated,
            scopeServerId: null,
        };
    }

    return { authorized: false, usedPreviousKey: false, autoRotated, scopeServerId: null };
}

export function extractBearerToken(headerValue: string | null): string | null {
    if (!headerValue) return null;
    const match = headerValue.match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    const token = match[1].trim();
    return token.length > 0 ? token : null;
}

export function getPluginEventRateLimitIdentifier(req: Request): string {
    const token = extractBearerToken(req.headers.get("authorization")) || req.headers.get("x-api-key") || "no-key";
    const tokenHash = createHash("sha256").update(token).digest("hex").slice(0, 16);
    const ip = getClientIp(req, "unknown") || "unknown";
    return `${ip}:${tokenHash}`;
}

export function computeProgressPercent(positionTicks: number, runTimeTicks: number | null): number {
    if (!runTimeTicks || runTimeTicks <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((positionTicks / runTimeTicks) * 100)));
}

export function normalizePluginEventName(event: string): string {
    return DOWNLOAD_EVENT_ALIASES.has(event) ? "MediaDownloaded" : event;
}

const AUDIO_WALL_CLOCK_TYPES = new Set(["audio", "track", "audiobook"]);

export function isFeishinClient(clientName: unknown): boolean {
    return typeof clientName === "string" && clientName.toLowerCase().includes("feishin");
}

export function isAudioWallClockCandidate(mediaType: unknown): boolean {
    return typeof mediaType === "string" && AUDIO_WALL_CLOCK_TYPES.has(mediaType.trim().toLowerCase());
}

export function shouldPreferWallClockForFeishinAudio(input: {
    mediaType: unknown;
    clientName: unknown;
    wallDeltaS: number;
    tickDeltaS: number | null;
    isPaused?: boolean;
}): boolean {
    if (input.isPaused) return false;
    if (!isAudioWallClockCandidate(input.mediaType) || !isFeishinClient(input.clientName)) return false;
    if (!Number.isFinite(input.wallDeltaS) || input.wallDeltaS <= 0) return false;

    if (input.tickDeltaS === null || !Number.isFinite(input.tickDeltaS)) return true;
    if (input.tickDeltaS <= 0) return true;

    const wall = Math.max(1, input.wallDeltaS);
    return input.tickDeltaS <= Math.max(3, wall * 0.35);
}

export function shouldPromoteDurationToWallClock(input: {
    mediaType: unknown;
    clientName: unknown;
    wallClockS: number;
    computedDurationS: number;
}): boolean {
    if (!isAudioWallClockCandidate(input.mediaType) || !isFeishinClient(input.clientName)) return false;
    if (!Number.isFinite(input.wallClockS) || input.wallClockS <= 0) return false;
    if (input.computedDurationS <= 0) return true;
    if (input.wallClockS < 20) return false;
    return input.computedDurationS <= input.wallClockS * 0.5;
}

const COMMON_PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];

type PlaybackRateSource = "jellyfin" | "estimated";

type PlaybackRateObservation = {
    rate: number;
    bucket: number;
    source: PlaybackRateSource;
    confidence: number;
    wallDeltaMs?: number;
    positionDeltaMs?: number;
};

export function parseObservedAtMs(payload: Record<string, any>): number | null {
    const raw =
        payload.observedAtUtc ??
        payload.ObservedAtUtc ??
        payload.timestamp ??
        payload.Timestamp;

    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
        return raw > 10_000_000_000 ? Math.round(raw) : Math.round(raw * 1000);
    }

    if (typeof raw === "string" && raw.trim()) {
        const parsed = Date.parse(raw);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}

export function parsePlaybackRate(raw: unknown): number | null {
    const value = typeof raw === "number"
        ? raw
        : typeof raw === "string"
            ? Number(raw.trim().replace(/^x/i, ""))
            : NaN;

    if (!Number.isFinite(value) || value < 0.25 || value > 4) {
        return null;
    }

    return value;
}

export function readPlaybackRate(payload: Record<string, any>, sessionPayload: Record<string, any>): number | null {
    return parsePlaybackRate(
        payload.playbackRate ??
        payload.PlaybackRate ??
        payload.playbackSpeed ??
        payload.PlaybackSpeed ??
        payload.speed ??
        payload.Speed ??
        sessionPayload.playbackRate ??
        sessionPayload.PlaybackRate ??
        sessionPayload.playbackSpeed ??
        sessionPayload.PlaybackSpeed ??
        sessionPayload.speed ??
        sessionPayload.Speed
    );
}

export function bucketPlaybackRate(rate: number): number {
    return COMMON_PLAYBACK_RATES.reduce((best, candidate) => (
        Math.abs(candidate - rate) < Math.abs(best - rate) ? candidate : best
    ), COMMON_PLAYBACK_RATES[0]);
}

export function formatPlaybackRate(rate: number | null | undefined): string | null {
    if (!Number.isFinite(Number(rate))) return null;
    return `x${Number(rate).toFixed(2).replace(/\.?0+$/, "")}`;
}

export function formatPositionLabel(ms: number | null | undefined): string | null {
    if (!Number.isFinite(Number(ms)) || Number(ms) < 0) return null;
    const totalSeconds = Math.floor(Number(ms) / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function buildJumpMetadata(input: {
    fromMs: number;
    toMs: number;
    deltaMs: number;
    source: string;
    existing?: Record<string, unknown> | null;
}) {
    const direction = input.deltaMs >= 0 ? "forward" : "backward";
    const rangeStartMs = Math.min(input.fromMs, input.toMs);
    const rangeEndMs = Math.max(input.fromMs, input.toMs);

    return {
        ...(input.existing || {}),
        fromMs: input.fromMs,
        toMs: input.toMs,
        deltaMs: input.deltaMs,
        direction,
        source: input.source,
        fromLabel: formatPositionLabel(input.fromMs),
        toLabel: formatPositionLabel(input.toMs),
        rangeStartMs,
        rangeEndMs,
        rangeLabel: `${formatPositionLabel(rangeStartMs)} -> ${formatPositionLabel(rangeEndMs)}`,
    };
}

export function inferJumpFromMetadata(metadata: Record<string, unknown>, fallbackPositionMs: number): {
    fromMs: number;
    toMs: number;
    deltaMs: number;
    direction: "forward" | "backward";
} | null {
    const fromMsRaw = parseFiniteNumber(metadata.fromMs);
    const toMsRaw = parseFiniteNumber(metadata.toMs);
    const fromTicks = parseFiniteNumber(metadata.fromTicks);
    const toTicks = parseFiniteNumber(metadata.toTicks);

    const fromMs = fromMsRaw ?? (fromTicks !== null ? Math.floor(fromTicks / 10_000) : null);
    const toMs = toMsRaw ?? (toTicks !== null ? Math.floor(toTicks / 10_000) : fallbackPositionMs);

    if (fromMs === null || toMs === null) return null;

    const rawDelta = parseFiniteNumber(metadata.deltaMs);
    const deltaMs = rawDelta ?? (toMs - fromMs);
    const directionRaw = typeof metadata.direction === "string" ? metadata.direction.toLowerCase() : "";
    const direction = directionRaw === "backward" || deltaMs < 0 ? "backward" : "forward";

    return { fromMs, toMs, deltaMs, direction };
}

export function estimatePlaybackRate(input: {
    explicitRate: number | null;
    isPaused: boolean;
    appearsSeek: boolean;
    prevTime: number | null;
    prevTick: number | null;
    now: number;
    positionTicks: number;
}): PlaybackRateObservation | null {
    if (input.explicitRate !== null) {
        const bucket = bucketPlaybackRate(input.explicitRate);
        return {
            rate: input.explicitRate,
            bucket,
            source: "jellyfin",
            confidence: 1,
        };
    }

    if (input.isPaused || input.appearsSeek || input.prevTime === null || input.prevTick === null) {
        return null;
    }

    const wallDeltaMs = input.now - input.prevTime;
    const positionDeltaMs = (input.positionTicks - input.prevTick) / 10_000;
    if (wallDeltaMs < 2_000 || wallDeltaMs > 60_000 || positionDeltaMs <= 0) {
        return null;
    }

    const rate = positionDeltaMs / wallDeltaMs;
    if (!Number.isFinite(rate) || rate < 0.25 || rate > 4) {
        return null;
    }

    const bucket = bucketPlaybackRate(rate);
    const confidence = wallDeltaMs >= 10_000 ? 0.8 : 0.6;

    return {
        rate,
        bucket,
        source: "estimated",
        confidence,
        wallDeltaMs: Math.round(wallDeltaMs),
        positionDeltaMs: Math.round(positionDeltaMs),
    };
}

export interface PluginSchemaVersionResult {
    version: number;
    raw: unknown;
    explicit: boolean;
    valid: boolean;
}

export function parsePositiveInteger(raw: unknown): number | null {
    if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) {
        return raw;
    }

    if (typeof raw === "string") {
        const value = raw.trim();
        if (/^\d+$/.test(value)) {
            const parsed = Number(value);
            if (Number.isInteger(parsed) && parsed > 0) {
                return parsed;
            }
        }
    }

    return null;
}

export function parseFiniteNumber(raw: unknown): number | null {
    if (typeof raw === "number" && Number.isFinite(raw)) {
        return raw;
    }

    if (typeof raw === "string") {
        const value = Number(raw.trim());
        if (Number.isFinite(value)) {
            return value;
        }
    }

    return null;
}

export function cleanIp(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const firstForwardedValue = raw.split(",")[0]?.trim() || raw;
    return normalizeIp(firstForwardedValue);
}

export function resolvePluginSchemaVersion(payload: Record<string, any>): PluginSchemaVersionResult {
    const raw =
        payload.eventSchemaVersion ??
        payload.EventSchemaVersion ??
        payload.schemaVersion ??
        payload.SchemaVersion;

    if (raw === undefined || raw === null) {
        return { version: -1, raw: null, explicit: false, valid: false };
    }

    const parsed = parsePositiveInteger(raw);
    if (parsed === null) {
        return { version: -1, raw, explicit: true, valid: false };
    }

    return { version: parsed, raw, explicit: true, valid: true };
}

export function isPrismaUniqueConstraintError(error: unknown): boolean {
    return Boolean(
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: unknown }).code === "P2002"
    );
}

export async function upsertCanonicalUser(serverId: string, rawJellyfinUserId: unknown, rawUsername: unknown, bumpLastActive: boolean = false) {
    const jellyfinUserId = normalizeJellyfinId(rawJellyfinUserId);
    if (!jellyfinUserId) return null;
 
    const compactId = compactJellyfinId(jellyfinUserId);
    const candidates = Array.from(new Set([jellyfinUserId, compactId]));
    const username = typeof rawUsername === "string" && rawUsername.trim() && rawUsername !== "Unknown"
        ? rawUsername.trim()
        : null;
 
    return prisma.$transaction(async (tx) => {
        const matches = await tx.user.findMany({
            where: { serverId, jellyfinUserId: { in: candidates } },
            orderBy: { createdAt: "asc" },
        });
 
        let primary = matches.find((u) => u.jellyfinUserId === jellyfinUserId) || matches[0] || null;
 
        if (!primary) {
            try {
                primary = await tx.user.create({
                    data: {
                        serverId,
                        jellyfinUserId,
                        username: username || jellyfinUserId,
                        lastActive: bumpLastActive ? new Date() : undefined,
                    },
                });
            } catch (error) {
                if (!isPrismaUniqueConstraintError(error)) {
                    throw error;
                }

                const fallbackPrimary = await tx.user.findFirst({
                    where: { serverId, jellyfinUserId: { in: candidates } },
                    orderBy: { createdAt: "asc" },
                });
                if (!fallbackPrimary) {
                    throw error;
                }
                primary = fallbackPrimary;

                const fallbackUpdates: { jellyfinUserId?: string; username?: string; lastActive?: Date } = {};
                if (primary.jellyfinUserId !== jellyfinUserId) fallbackUpdates.jellyfinUserId = jellyfinUserId;
                if (username && username !== primary.username) fallbackUpdates.username = username;
                if (bumpLastActive) fallbackUpdates.lastActive = new Date();

                if (Object.keys(fallbackUpdates).length > 0) {
                    primary = await tx.user.update({ where: { id: primary.id }, data: fallbackUpdates });
                }
            }
        } else {
            const updates: { jellyfinUserId?: string; username?: string; lastActive?: Date } = {};
            if (primary.jellyfinUserId !== jellyfinUserId) updates.jellyfinUserId = jellyfinUserId;
            if (username && username !== primary.username) updates.username = username;
            if (bumpLastActive) updates.lastActive = new Date();
            
            if (Object.keys(updates).length > 0) {
                primary = await tx.user.update({ where: { id: primary.id }, data: updates });
            }
        }
 
        if (!primary) {
            throw new Error("Unable to upsert canonical user.");
        }

        const primaryUser = primary;
        const duplicates = matches.filter((u) => u.id !== primaryUser.id);
        for (const duplicate of duplicates) {
            await tx.playbackHistory.updateMany({ where: { userId: duplicate.id }, data: { userId: primaryUser.id } });
            await tx.activeStream.updateMany({ where: { userId: duplicate.id }, data: { userId: primaryUser.id } });
            await tx.user.delete({ where: { id: duplicate.id } });
            console.warn("[Plugin] User merged after ID normalization", {
                kept: primaryUser.jellyfinUserId,
                removed: duplicate.jellyfinUserId,
            });
        }
 
        return primaryUser;
    });
}

export async function upsertCanonicalMedia(input: {
    serverId: string;
    rawJellyfinMediaId: unknown;
    title: string;
    type: string;
    collectionType?: string | null;
    genres?: string[];
    resolution?: string | null;
    durationMs?: bigint | null;
    parentId?: string | null;
    artist?: string | null;
    libraryName?: string | null;
    directors?: string[];
    actors?: string[];
    studios?: string[];
}) {
    const jellyfinMediaId = normalizeJellyfinId(input.rawJellyfinMediaId);
    if (!jellyfinMediaId) return null;

    const compactId = compactJellyfinId(jellyfinMediaId);
    const candidates = Array.from(new Set([jellyfinMediaId, compactId]));

    return prisma.$transaction(async (tx) => {
        const matches = await tx.media.findMany({
            where: { serverId: input.serverId, jellyfinMediaId: { in: candidates } },
            orderBy: { createdAt: "asc" },
        });

        let primary = matches.find((m) => m.jellyfinMediaId === jellyfinMediaId) || matches[0] || null;

        if (!primary) {
            try {
                primary = await tx.media.create({
                    data: {
                        serverId: input.serverId,
                        jellyfinMediaId,
                        title: input.title,
                        type: input.type,
                        collectionType: input.collectionType ?? null,
                        genres: input.genres || [],
                        resolution: input.resolution ?? null,
                        durationMs: input.durationMs ?? null,
                        parentId: input.parentId ?? null,
                        artist: input.artist ?? null,
                        libraryName: input.libraryName ?? null,
                        directors: input.directors || [],
                        actors: input.actors || [],
                        studios: input.studios || [],
                    },
                });
            } catch (error) {
                if (!isPrismaUniqueConstraintError(error)) {
                    throw error;
                }

                const fallbackPrimary = await tx.media.findFirst({
                    where: { serverId: input.serverId, jellyfinMediaId: { in: candidates } },
                    orderBy: { createdAt: "asc" },
                });
                if (!fallbackPrimary) {
                    throw error;
                }
                primary = fallbackPrimary;

                primary = await tx.media.update({
                    where: { id: primary.id },
                    data: {
                        jellyfinMediaId,
                        title: input.title,
                        type: input.type,
                        collectionType: input.collectionType ?? undefined,
                        genres: input.genres ?? undefined,
                        resolution: input.resolution ?? undefined,
                        durationMs: input.durationMs ?? undefined,
                        parentId: input.parentId ?? undefined,
                        artist: input.artist ?? undefined,
                        libraryName: input.libraryName ?? undefined,
                        directors: input.directors ?? undefined,
                        actors: input.actors ?? undefined,
                        studios: input.studios ?? undefined,
                    },
                });
            }
        } else {
            primary = await tx.media.update({
                where: { id: primary.id },
                data: {
                    jellyfinMediaId,
                    title: input.title,
                    type: input.type,
                    collectionType: input.collectionType ?? undefined,
                    genres: input.genres ?? undefined,
                    resolution: input.resolution ?? undefined,
                    durationMs: input.durationMs ?? undefined,
                    parentId: input.parentId ?? undefined,
                    artist: input.artist ?? undefined,
                    libraryName: input.libraryName ?? undefined,
                    directors: input.directors ?? undefined,
                    actors: input.actors ?? undefined,
                    studios: input.studios ?? undefined,
                },
            });
        }

        if (!primary) {
            throw new Error("Unable to upsert canonical media.");
        }

        const primaryMedia = primary;
        const duplicates = matches.filter((m) => m.id !== primaryMedia.id);
        for (const duplicate of duplicates) {
            await tx.playbackHistory.updateMany({ where: { mediaId: duplicate.id }, data: { mediaId: primaryMedia.id } });
            await tx.activeStream.updateMany({ where: { mediaId: duplicate.id }, data: { mediaId: primaryMedia.id } });
            await tx.media.delete({ where: { id: duplicate.id } });
            console.warn("[Plugin] Media merged after ID normalization", {
                kept: primaryMedia.jellyfinMediaId,
                removed: duplicate.jellyfinMediaId,
            });
        }

        return primaryMedia;
    });
}

export async function buildMediaSubtitle(input: {
    serverId: string;
    type: string;
    seriesName?: string | null;
    seasonName?: string | null;
    albumArtist?: string | null;
    albumName?: string | null;
    artist?: string | null;
    parentItemId?: string | null;
}) {
    if (input.seriesName) {
        return `${input.seriesName}${input.seasonName ? ` — ${input.seasonName}` : ""}`;
    }

    const directArtist = input.albumArtist || input.artist || null;
    if (input.albumName || directArtist) {
        if (directArtist && input.albumName) return `${directArtist} — ${input.albumName}`;
        return directArtist || input.albumName;
    }

    if (!input.parentItemId) return null;

    const parentCandidates = Array.from(new Set([input.parentItemId, compactJellyfinId(input.parentItemId)]));

    const parent = await prisma.media.findFirst({
        where: { serverId: input.serverId, jellyfinMediaId: { in: parentCandidates } },
        select: { title: true, parentId: true, artist: true },
    });

    if (!parent) return null;

    if (input.type === "Audio" || input.type === "Track") {
        const artist = directArtist || parent.artist;
        if (artist) return `${artist} — ${parent.title}`;
        return parent.title;
    }

    if (input.type === "Episode" && parent.parentId) {
        const grandparentCandidates = Array.from(new Set([parent.parentId, compactJellyfinId(parent.parentId)]));
        const grandparent = await prisma.media.findFirst({
            where: { serverId: input.serverId, jellyfinMediaId: { in: grandparentCandidates } },
            select: { title: true },
        });
        if (grandparent?.title) return `${grandparent.title} — ${parent.title}`;
    }

    return parent.title;
}

export function readTrimmedString(...values: unknown[]): string | null {
    for (const value of values) {
        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
        if (typeof value === "number" && Number.isFinite(value)) {
            return String(value);
        }
    }
    return null;
}

export function parseDurationMsFromPayload(mediaPayload: Record<string, unknown>): bigint | null {
    const durationMs = parseFiniteNumber(mediaPayload.durationMs ?? mediaPayload.DurationMs);
    if (durationMs !== null && durationMs > 0) {
        return BigInt(Math.round(durationMs));
    }

    const runTimeTicks = parseFiniteNumber(mediaPayload.runTimeTicks ?? mediaPayload.RunTimeTicks);
    if (runTimeTicks !== null && runTimeTicks > 0) {
        return BigInt(Math.round(runTimeTicks / 10_000));
    }

    return null;
}

export function buildDownloadSourceEventId(
    payload: Record<string, any>,
    sourceServerId: string,
    jellyfinUserId: string,
    jellyfinMediaId: string,
): string | null {
    const direct = readTrimmedString(
        payload.sourceEventId,
        payload.SourceEventId,
        payload.eventId,
        payload.EventId,
        payload.downloadId,
        payload.DownloadId,
    );
    if (direct) return direct;

    const observedAtMs = parseObservedAtMs(payload);
    if (!observedAtMs) return null;

    return createHash("sha256")
        .update(`${sourceServerId}:${jellyfinUserId}:${jellyfinMediaId}:${observedAtMs}`)
        .digest("hex");
}

export async function handleMediaDownloadedEvent(payload: Record<string, any>, sourceServer: { id: string }) {
    const userPayload = (payload.user || payload.User || {}) as Record<string, unknown>;
    const mediaPayload = (payload.media || payload.Media || payload.item || payload.Item || {}) as Record<string, unknown>;
    const sessionPayload = (payload.session || payload.Session || payload.client || payload.Client || {}) as Record<string, unknown>;

    const jellyfinUserId = normalizeJellyfinId(
        userPayload.jellyfinUserId ||
        userPayload.JellyfinUserId ||
        userPayload.id ||
        userPayload.Id ||
        payload.userId ||
        payload.UserId,
    );
    const jellyfinMediaId = normalizeJellyfinId(
        mediaPayload.jellyfinMediaId ||
        mediaPayload.JellyfinMediaId ||
        mediaPayload.id ||
        mediaPayload.Id ||
        payload.mediaId ||
        payload.MediaId ||
        payload.itemId ||
        payload.ItemId,
    );

    if (!jellyfinUserId || !jellyfinMediaId) {
        return corsJson({ error: "Missing userId or mediaId." }, { status: 400 });
    }

    const username = readTrimmedString(
        userPayload.username,
        userPayload.Username,
        userPayload.name,
        userPayload.Name,
    ) || "Unknown";
    const title = readTrimmedString(
        mediaPayload.title,
        mediaPayload.Title,
        mediaPayload.name,
        mediaPayload.Name,
    ) || "Unknown";
    const type = readTrimmedString(mediaPayload.type, mediaPayload.Type) || "Unknown";
    const collectionType = readTrimmedString(mediaPayload.collectionType, mediaPayload.CollectionType) || inferLibraryKey({ type });
    const libraryName = readTrimmedString(mediaPayload.libraryName, mediaPayload.LibraryName);
    const parentItemId = normalizeJellyfinId(readTrimmedString(mediaPayload.parentId, mediaPayload.ParentId));
    const rawGenres = mediaPayload.genres || mediaPayload.Genres;
    const genres = Array.isArray(rawGenres) ? rawGenres.filter((genre): genre is string => typeof genre === "string") : [];
    const resolution = readTrimmedString(mediaPayload.resolution, mediaPayload.Resolution);

    const ingestSettings = await getCachedPluginIngestSettings();
    if (isLibraryExcluded({ serverId: sourceServer.id, libraryName, collectionType, type }, ingestSettings.excludedLibraries)) {
        console.log("[Plugin] MediaDownloaded ignored due excluded library", {
            serverId: sourceServer.id,
            jellyfinUserId,
            jellyfinMediaId,
            libraryName,
            collectionType: collectionType || null,
            type,
        });
        return corsJson({ success: true, ignored: true, message: "Library excluded." });
    }

    const [dbUser, dbMedia] = await Promise.all([
        upsertCanonicalUser(sourceServer.id, jellyfinUserId, username, true),
        upsertCanonicalMedia({
            serverId: sourceServer.id,
            rawJellyfinMediaId: jellyfinMediaId,
            title,
            type,
            collectionType,
            genres,
            resolution: resolution ? normalizeResolution(resolution) : null,
            durationMs: parseDurationMsFromPayload(mediaPayload),
            parentId: parentItemId,
            artist: readTrimmedString(mediaPayload.artist, mediaPayload.Artist, mediaPayload.albumArtist, mediaPayload.AlbumArtist),
            libraryName,
        }),
    ]);

    if (!dbUser || !dbMedia) {
        return corsJson({ error: "Unable to resolve canonical user/media." }, { status: 400 });
    }

    const durationMs = dbMedia.durationMs ? Number(dbMedia.durationMs) : 0;
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
        return corsJson({ error: "Downloaded media requires a positive duration." }, { status: 400 });
    }

    const sourceEventId = buildDownloadSourceEventId(payload, sourceServer.id, jellyfinUserId, jellyfinMediaId);
    if (sourceEventId) {
        const existing = await prisma.playbackHistory.findFirst({
            where: { serverId: sourceServer.id, sourceEventId },
            select: { id: true },
        });
        if (existing) {
            return corsJson({ success: true, duplicate: true, playbackId: existing.id, message: "MediaDownloaded already processed." });
        }
    }

    const observedAtMs = parseObservedAtMs(payload);
    const completedAt = observedAtMs ? new Date(observedAtMs) : new Date();
    const ipAddress = cleanIp(
        sessionPayload.ipAddress ||
        sessionPayload.IpAddress ||
        payload.ipAddress ||
        payload.IpAddress ||
        null,
    );
    const geoData = getGeoLocation(ipAddress);
    const durationWatched = Math.ceil(durationMs / 1000);
    const audioLanguage = readTrimmedString(sessionPayload.audioLanguage, sessionPayload.AudioLanguage);
    const audioCodec = readTrimmedString(sessionPayload.audioCodec, sessionPayload.AudioCodec);
    const subtitleLanguage = readTrimmedString(sessionPayload.subtitleLanguage, sessionPayload.SubtitleLanguage);
    const subtitleCodec = readTrimmedString(sessionPayload.subtitleCodec, sessionPayload.SubtitleCodec);

    try {
        const playback = await prisma.playbackHistory.create({
            data: {
                serverId: sourceServer.id,
                userId: dbUser.id,
                mediaId: dbMedia.id,
                playMethod: "Download",
                eventSource: "download",
                sourceEventId: sourceEventId || null,
                clientName: readTrimmedString(sessionPayload.clientName, sessionPayload.ClientName, payload.clientName, payload.ClientName) || "Download",
                deviceName: readTrimmedString(sessionPayload.deviceName, sessionPayload.DeviceName, payload.deviceName, payload.DeviceName),
                ipAddress,
                country: geoData.country,
                city: geoData.city,
                durationWatched,
                startedAt: completedAt,
                endedAt: completedAt,
                bitrate: dbMedia.size && dbMedia.durationMs ? Math.round(Number(dbMedia.size) * 8000 / Number(dbMedia.durationMs)) : null,
                audioLanguage,
                audioCodec,
                subtitleLanguage,
                subtitleCodec,
            },
        });

        await prisma.telemetryEvent.create({
            data: {
                serverId: sourceServer.id,
                playbackId: playback.id,
                eventType: "download",
                positionMs: BigInt(durationMs),
                metadata: JSON.stringify({
                    sourceEventId,
                    fullView: true,
                    durationMs,
                    event: "MediaDownloaded",
                }),
            },
        });

        return corsJson({ success: true, playbackId: playback.id, message: "MediaDownloaded processed." });
    } catch (error) {
        if (sourceEventId && isPrismaUniqueConstraintError(error)) {
            const existing = await prisma.playbackHistory.findFirst({
                where: { serverId: sourceServer.id, sourceEventId },
                select: { id: true },
            });
            if (existing) {
                return corsJson({ success: true, duplicate: true, playbackId: existing.id, message: "MediaDownloaded already processed." });
            }
        }
        throw error;
    }
}

// Acquire a short Redis-based lock for a user+media pair to avoid concurrent
// creation of duplicate PlaybackHistory rows when multiple plugin events
// arrive in parallel (PlaybackStart vs PlaybackProgress bootstrap).
export async function acquirePlaybackLock(userId: string, mediaId: string, retries = 10, delayMs = 50, ttlSec = 5) {
    const key = `lock:playback:${userId}:${mediaId}`;
    for (let i = 0; i < retries; i++) {
        try {
            const v = await redis.incr(key);
            if (v === 1) {
                await redis.expire(key, ttlSec);
                return { acquired: true, key };
            }
        } catch {
            // Redis may be unavailable; fail open (don't block main flow).
            return { acquired: false, key };
        }
        // backoff a little to let the other process finish
        await new Promise((r) => setTimeout(r, delayMs));
    }
    return { acquired: false, key };
}

// Merge multiple concurrently-open PlaybackHistory rows for the same user+media.
// This is a safety net for rare race conditions where parallel event processing
// creates more than one open session. We migrate telemetry, merge Redis keys
// and delete duplicate rows, keeping the earliest started session as primary.
export async function mergeOpenPlaybacks(userId: string, mediaId: string) {
    const opens = await prisma.playbackHistory.findMany({
        where: { userId, mediaId, endedAt: null },
        orderBy: { startedAt: "asc" },
        select: { id: true, startedAt: true },
    });
    if (opens.length <= 1) return;

    const primaryId = opens[0].id;
    const duplicateIds = opens.slice(1).map((o) => o.id);

    try {
        await prisma.$transaction(async (tx) => {
            for (const dupId of duplicateIds) {
                await tx.telemetryEvent.updateMany({ where: { playbackId: dupId }, data: { playbackId: primaryId } });
                await tx.playbackHistory.delete({ where: { id: dupId } });
            }
        });
    } catch (err) {
        console.error("[Plugin] mergeOpenPlaybacks prisma transaction failed:", err);
        return;
    }

    // Merge ephemeral Redis keys (durations, last tick/time, start_pos, audio/sub/pause)
    for (const dupId of duplicateIds) {
        try {
            // dur: sum durations
            const dupDur = await redis.get(`dur:${dupId}`);
            if (dupDur) {
                const primDur = await redis.get(`dur:${primaryId}`) || "0";
                const newDur = Math.max(parseFloat(primDur), parseFloat(dupDur)).toString();
                await redis.setex(`dur:${primaryId}`, 86400, newDur);
            }

            // last_time: keep the most recent
            const dupLastTime = await redis.get(`last_time:${dupId}`);
            const primLastTime = await redis.get(`last_time:${primaryId}`);
            if (dupLastTime && (!primLastTime || Number(dupLastTime) > Number(primLastTime))) {
                await redis.setex(`last_time:${primaryId}`, 86400, dupLastTime);
            }

            // last_tick: keep the most recent
            const dupLastTick = await redis.get(`last_tick:${dupId}`);
            const primLastTick = await redis.get(`last_tick:${primaryId}`);
            if (dupLastTick && (!primLastTick || Number(dupLastTick) > Number(primLastTick))) {
                await redis.setex(`last_tick:${primaryId}`, 86400, dupLastTick);
            }

            // start_pos: prefer primary, else copy dup
            const dupStart = await redis.get(`start_pos:${dupId}`);
            const primStart = await redis.get(`start_pos:${primaryId}`);
            if (dupStart && !primStart) await redis.setex(`start_pos:${primaryId}`, 86400, dupStart);

            // audio/sub/pause keys: prefer existing primary, else copy
            for (const k of ["audio", "sub", "pause"]) {
                const dupVal = await redis.get(`${k}:${dupId}`);
                const primVal = await redis.get(`${k}:${primaryId}`);
                if (dupVal && !primVal) await redis.setex(`${k}:${primaryId}`, 3600, dupVal);
            }

            // cleanup dup keys
            await redis.del(`dur:${dupId}`, `last_time:${dupId}`, `last_tick:${dupId}`, `start_pos:${dupId}`, `audio:${dupId}`, `sub:${dupId}`, `pause:${dupId}`);
        } catch (err) {
            console.error("[Plugin] mergeOpenPlaybacks redis merge failed:", err);
        }
    }
}

export async function cleanupActiveStreamForSession(serverId: string, activeStream: { id: string; sessionId: string } | null) {
    if (!activeStream?.sessionId) return;
    await redis.del(buildStreamRedisKey(serverId, activeStream.sessionId));
    await (prisma.activeStream as any).delete({ where: { id: activeStream.id } }).catch(() => undefined);
}

export async function cleanupPlaybackRedisKeys(playbackId: string) {
    await redis.del(
        `pause:${playbackId}`,
        `audio:${playbackId}`,
        `sub:${playbackId}`,
        `dur:${playbackId}`,
        `last_time:${playbackId}`,
        `last_tick:${playbackId}`,
        `start_pos:${playbackId}`,
        `rate:${playbackId}`,
        `jump:${playbackId}`,
    );
}

export async function finalizePlaybackSession(input: {
    sourceServerId: string;
    sessionId?: string | null;
    jellyfinUserId?: string | null;
    jellyfinMediaId?: string | null;
    positionTicks?: number | null;
    reason: "stop" | "session_end";
    metadata?: Record<string, unknown>;
}) {
    const sessionId = typeof input.sessionId === "string" && input.sessionId.trim()
        ? input.sessionId.trim()
        : null;
    const positionTicks = Number.isFinite(Number(input.positionTicks)) && Number(input.positionTicks) > 0
        ? Number(input.positionTicks)
        : 0;

    const activeStream = sessionId
        ? await (prisma.activeStream as any).findUnique({
            where: { sessionId_serverId: { sessionId, serverId: input.sourceServerId } },
            select: {
                id: true,
                sessionId: true,
                userId: true,
                mediaId: true,
                playbackId: true,
                positionTicks: true,
            },
        })
        : null;

    let userId = activeStream?.userId || null;
    let mediaId = activeStream?.mediaId || null;

    if (!userId && input.jellyfinUserId) {
        const userCandidates = Array.from(new Set([input.jellyfinUserId, compactJellyfinId(input.jellyfinUserId)]));
        const user = await prisma.user.findFirst({
            where: { serverId: input.sourceServerId, jellyfinUserId: { in: userCandidates } },
            orderBy: { createdAt: "asc" },
            select: { id: true },
        });
        userId = user?.id || null;
    }

    if (!mediaId && input.jellyfinMediaId) {
        const mediaCandidates = Array.from(new Set([input.jellyfinMediaId, compactJellyfinId(input.jellyfinMediaId)]));
        const media = await prisma.media.findFirst({
            where: { serverId: input.sourceServerId, jellyfinMediaId: { in: mediaCandidates } },
            orderBy: { createdAt: "asc" },
            select: { id: true },
        });
        mediaId = media?.id || null;
    }

    let playback = activeStream?.playbackId
        ? await prisma.playbackHistory.findUnique({
            where: { id: activeStream.playbackId },
            include: { media: { select: { title: true, type: true, durationMs: true } } },
        })
        : null;

    if ((!playback || playback.endedAt) && userId && mediaId) {
        playback = await prisma.playbackHistory.findFirst({
            where: { serverId: input.sourceServerId, userId, mediaId, endedAt: null },
            orderBy: { startedAt: "desc" },
            include: { media: { select: { title: true, type: true, durationMs: true } } },
        });
    }

    if (!playback) {
        await cleanupActiveStreamForSession(input.sourceServerId, activeStream);
        return { closed: false, reason: "no_open_playback" };
    }

    if (playback.endedAt) {
        await cleanupActiveStreamForSession(input.sourceServerId, activeStream);
        await cleanupPlaybackRedisKeys(playback.id);
        return { closed: false, reason: "already_closed", playbackId: playback.id };
    }

    const endedAt = new Date();
    const wallClockS = Math.floor((endedAt.getTime() - playback.startedAt.getTime()) / 1000);
    let effectiveTicks = positionTicks;
    if (effectiveTicks <= 0 && activeStream?.positionTicks) {
        effectiveTicks = Number(activeStream.positionTicks);
    }

    const durKey = `dur:${playback.id}`;
    const cumulativeDurRaw = await redis.get(durKey);
    let curDur = cumulativeDurRaw !== null ? parseFloat(cumulativeDurRaw) : 0;

    const lastTimeRaw = await redis.get(`last_time:${playback.id}`);
    const lastTickRaw = await redis.get(`last_tick:${playback.id}`);
    if (lastTimeRaw && lastTickRaw) {
        const prevTime = parseInt(lastTimeRaw, 10);
        const prevTick = parseInt(lastTickRaw, 10);
        const wallDeltaS = (endedAt.getTime() - prevTime) / 1000;
        const tickDeltaS = (effectiveTicks - prevTick) / 10_000_000;

        if (wallDeltaS > 0 && wallDeltaS <= 300) {
            if (shouldPreferWallClockForFeishinAudio({
                mediaType: playback.media?.type,
                clientName: playback.clientName,
                wallDeltaS,
                tickDeltaS,
            })) {
                curDur += wallDeltaS;
            } else if (tickDeltaS > 0 && tickDeltaS <= 300) {
                curDur += tickDeltaS;
            } else {
                curDur += wallDeltaS;
            }
        }
    }

    let durationS = Math.round(curDur);
    if (durationS <= 0 && cumulativeDurRaw === null) {
        durationS = wallClockS;
    }

    if (shouldPromoteDurationToWallClock({
        mediaType: playback.media?.type,
        clientName: playback.clientName,
        wallClockS,
        computedDurationS: durationS,
    })) {
        durationS = wallClockS;
    }

    durationS = clampDuration(durationS, playback.media?.durationMs);

    await prisma.playbackHistory.update({
        where: { id: playback.id },
        data: { endedAt, durationWatched: durationS },
    });

    const eventType = input.reason === "session_end" ? "session_end" : "stop";
    const stopPositionMs = effectiveTicks > 0 ? BigInt(Math.floor(effectiveTicks / 10_000)) : BigInt(0);
    await prisma.telemetryEvent.create({
        data: {
            serverId: input.sourceServerId,
            playbackId: playback.id,
            eventType,
            positionMs: stopPositionMs,
            metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        },
    });

    await cleanupPlaybackRedisKeys(playback.id);
    await cleanupActiveStreamForSession(input.sourceServerId, activeStream);

    return { closed: true, playbackId: playback.id, durationS };
}

export async function readRequestBodyWithLimit(req: Request, maxBytes: number): Promise<string> {
    const reader = req.body?.getReader();
    if (!reader) return "";

    const decoder = new TextDecoder();
    let totalBytes = 0;
    let raw = "";

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value) continue;

            totalBytes += value.byteLength;
            if (totalBytes > maxBytes) {
                try {
                    await reader.cancel();
                } catch {
                    // Ignore cancellation errors while enforcing payload cap.
                }
                throw new PayloadTooLargeError();
            }

            raw += decoder.decode(value, { stream: true });
        }

        raw += decoder.decode();
        return raw;
    } finally {
        reader.releaseLock();
    }
}
