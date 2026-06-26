import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import prisma from "@/lib/prisma";
import redis from "@/lib/redis";
import { getGeoLocation } from "@/lib/geoip";
import { inferLibraryKey, isLibraryExcluded } from "@/lib/mediaPolicy";
import { compactJellyfinId, normalizeJellyfinId } from "@/lib/jellyfinId";
import { cleanupOrphanedSessions } from "@/lib/cleanup";
import { normalizeResolution, clampDuration } from '@/lib/utils';
import { markMonitorPoll, appendHealthEvent } from "@/lib/systemHealth";
import { consumePluginEventRateLimit } from "@/lib/pluginEventRateLimit";
import { writeAdminAuditLog } from "@/lib/adminAudit";
import { comparePluginApiKey, getPluginKeySnapshot, isPreviousPluginKeyValid } from "@/lib/pluginKeyManager";
import { parsePluginApiKeyCandidate, verifyScopedPluginApiKey } from "@/lib/pluginServerKey";
import { isValidDiscordWebhook, safeFetchWebhook } from "@/lib/webhookValidator";
import { getClientIp, normalizeIp } from "@/lib/requestIp";
import { getCachedPluginIngestSettings } from "@/lib/pluginTelemetrySettings";
import {
    buildStreamRedisKey,
    extractServerIdentityFromPayload,
    upsertServerRecord,
} from "@/lib/serverRegistry";
// Lightweight local types for incoming Jellyfin payloads
type JellyfinPerson = { type?: string; Type?: string; name?: string; Name?: string };
type Studio = { name?: string; Name?: string };

const CORS_HEADERS = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key",
};

const ALLOWED_PLUGIN_EVENTS = new Set([
    "Heartbeat",
    "MediaDownloaded",
    "PlaybackStart",
    "PlaybackProgress",
    "PlaybackStop",
    "PlaybackStateChanged",
    "SessionEnded",
    "LibraryChanged",
]);
const DOWNLOAD_EVENT_ALIASES = new Set(["ItemDownloaded", "DownloadCompleted"]);
const CURRENT_PLUGIN_EVENT_SCHEMA_VERSION = 3;
const MIN_SUPPORTED_PLUGIN_EVENT_SCHEMA_VERSION = 2;
const parsedMaxPluginEventBytes = Number(process.env.PLUGIN_EVENT_MAX_BYTES);
const MAX_PLUGIN_EVENT_BYTES = Number.isFinite(parsedMaxPluginEventBytes)
    ? parsedMaxPluginEventBytes
    : 1024 * 1024;

class PayloadTooLargeError extends Error {
    constructor() {
        super("payload_too_large");
        this.name = "PayloadTooLargeError";
    }
}

// When a new start event arrives but a session for the same user+media was
// closed recently (within this window), prefer reopening that session
// instead of creating a new row. This prevents short-lived race duplicates.
const MERGE_WINDOW_MS = Number(process.env.MERGE_WINDOW_MS) || 60 * 60 * 1000; // 1 hour default

// Handle CORS preflight
export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// Lightweight diagnostics for manual browser checks.
export async function GET() {
    return corsJson({
        ok: true,
        endpoint: "/api/plugin/events",
        method: "POST",
        message: "Endpoint reachable. Send plugin events with POST and API key headers.",
    });
}

// ────────────────────────────────────────────────────
// Plugin Authentication — API key from GlobalSettings
// ────────────────────────────────────────────────────
interface PluginAuthResult {
    authorized: boolean;
    usedPreviousKey: boolean;
    autoRotated: boolean;
    scopeServerId: string | null;
}

async function verifyPluginAuth(req: Request): Promise<PluginAuthResult> {
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

function extractBearerToken(headerValue: string | null): string | null {
    if (!headerValue) return null;
    const match = headerValue.match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    const token = match[1].trim();
    return token.length > 0 ? token : null;
}

function getPluginEventRateLimitIdentifier(req: Request): string {
    const token = extractBearerToken(req.headers.get("authorization")) || req.headers.get("x-api-key") || "no-key";
    const tokenHash = createHash("sha256").update(token).digest("hex").slice(0, 16);
    const ip = getClientIp(req, "unknown") || "unknown";
    return `${ip}:${tokenHash}`;
}

function computeProgressPercent(positionTicks: number, runTimeTicks: number | null): number {
    if (!runTimeTicks || runTimeTicks <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((positionTicks / runTimeTicks) * 100)));
}

function normalizePluginEventName(event: string): string {
    return DOWNLOAD_EVENT_ALIASES.has(event) ? "MediaDownloaded" : event;
}

const AUDIO_WALL_CLOCK_TYPES = new Set(["audio", "track", "audiobook"]);

function isFeishinClient(clientName: unknown): boolean {
    return typeof clientName === "string" && clientName.toLowerCase().includes("feishin");
}

function isAudioWallClockCandidate(mediaType: unknown): boolean {
    return typeof mediaType === "string" && AUDIO_WALL_CLOCK_TYPES.has(mediaType.trim().toLowerCase());
}

function shouldPreferWallClockForFeishinAudio(input: {
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

function shouldPromoteDurationToWallClock(input: {
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

function parseObservedAtMs(payload: Record<string, any>): number | null {
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

function parsePlaybackRate(raw: unknown): number | null {
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

function readPlaybackRate(payload: Record<string, any>, sessionPayload: Record<string, any>): number | null {
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

function bucketPlaybackRate(rate: number): number {
    return COMMON_PLAYBACK_RATES.reduce((best, candidate) => (
        Math.abs(candidate - rate) < Math.abs(best - rate) ? candidate : best
    ), COMMON_PLAYBACK_RATES[0]);
}

function formatPlaybackRate(rate: number | null | undefined): string | null {
    if (!Number.isFinite(Number(rate))) return null;
    return `x${Number(rate).toFixed(2).replace(/\.?0+$/, "")}`;
}

function formatPositionLabel(ms: number | null | undefined): string | null {
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

function buildJumpMetadata(input: {
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

function inferJumpFromMetadata(metadata: Record<string, unknown>, fallbackPositionMs: number): {
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

function estimatePlaybackRate(input: {
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

interface PluginSchemaVersionResult {
    version: number;
    raw: unknown;
    explicit: boolean;
    valid: boolean;
}

function parsePositiveInteger(raw: unknown): number | null {
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

function parseFiniteNumber(raw: unknown): number | null {
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

function cleanIp(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const firstForwardedValue = raw.split(",")[0]?.trim() || raw;
    return normalizeIp(firstForwardedValue);
}

function resolvePluginSchemaVersion(payload: Record<string, any>): PluginSchemaVersionResult {
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

function isPrismaUniqueConstraintError(error: unknown): boolean {
    return Boolean(
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: unknown }).code === "P2002"
    );
}

async function upsertCanonicalUser(serverId: string, rawJellyfinUserId: unknown, rawUsername: unknown, bumpLastActive: boolean = false) {
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

async function upsertCanonicalMedia(input: {
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

async function buildMediaSubtitle(input: {
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

function readTrimmedString(...values: unknown[]): string | null {
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

function parseDurationMsFromPayload(mediaPayload: Record<string, unknown>): bigint | null {
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

function buildDownloadSourceEventId(
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

async function handleMediaDownloadedEvent(payload: Record<string, any>, sourceServer: { id: string }) {
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
async function acquirePlaybackLock(userId: string, mediaId: string, retries = 10, delayMs = 50, ttlSec = 5) {
    const key = `lock:playback:${userId}:${mediaId}`;
    for (let i = 0; i < retries; i++) {
        try {
            const v = await redis.incr(key);
            if (v === 1) {
                await redis.expire(key, ttlSec);
                return { acquired: true, key };
            }
        } catch (err) {
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
async function mergeOpenPlaybacks(userId: string, mediaId: string) {
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

async function cleanupActiveStreamForSession(serverId: string, activeStream: { id: string; sessionId: string } | null) {
    if (!activeStream?.sessionId) return;
    await redis.del(buildStreamRedisKey(serverId, activeStream.sessionId));
    await (prisma.activeStream as any).delete({ where: { id: activeStream.id } }).catch(() => undefined);
}

async function cleanupPlaybackRedisKeys(playbackId: string) {
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

async function finalizePlaybackSession(input: {
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

function corsJson(body: unknown, init?: { status?: number }) {
    return NextResponse.json(body, { ...init, headers: CORS_HEADERS });
}

async function readRequestBodyWithLimit(req: Request, maxBytes: number): Promise<string> {
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

// ────────────────────────────────────────────────────
// POST /api/plugin/events — Receive events from the Jellyfin Plugin
// ────────────────────────────────────────────────────
export async function POST(req: Request) {
    const requesterIp = getClientIp(req, "unknown") || "unknown";
    const contentType = (req.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("application/json")) {
        await writeAdminAuditLog({
            action: "plugin.events.invalid_content_type",
            actorUsername: "plugin-client",
            target: "/api/plugin/events",
            ipAddress: requesterIp,
            details: { contentType: req.headers.get("content-type") || null },
        });
        return corsJson({ error: "Unsupported content type. Expected application/json." }, { status: 415 });
    }

    const contentLengthHeader = req.headers.get("content-length");
    if (contentLengthHeader) {
        const contentLength = Number(contentLengthHeader);
        if (Number.isFinite(contentLength) && contentLength > MAX_PLUGIN_EVENT_BYTES) {
            await writeAdminAuditLog({
                action: "plugin.events.payload_too_large",
                actorUsername: "plugin-client",
                target: "/api/plugin/events",
                ipAddress: requesterIp,
                details: {
                    contentLength,
                    maxBytes: MAX_PLUGIN_EVENT_BYTES,
                },
            });
            return corsJson({ error: "Payload too large." }, { status: 413 });
        }
    }

    const preAuthRateLimit = await consumePluginEventRateLimit(`preauth:${requesterIp}`);
    if (!preAuthRateLimit.allowed) {
        await writeAdminAuditLog({
            action: "plugin.events.rate_limited",
            actorUsername: "plugin-client",
            target: "/api/plugin/events",
            ipAddress: requesterIp,
            details: {
                scope: "preauth",
                retryAfterSeconds: preAuthRateLimit.retryAfterSeconds ?? null,
            },
        });
        return corsJson(
            { error: "Too many plugin events. Please retry later.", retryAfterSeconds: preAuthRateLimit.retryAfterSeconds },
            { status: 429 }
        );
    }

    const authResult = await verifyPluginAuth(req);
    if (!authResult.authorized) {
        await writeAdminAuditLog({
            action: "plugin.events.unauthorized",
            actorUsername: "plugin-client",
            target: "/api/plugin/events",
            ipAddress: requesterIp,
            details: {
                autoRotated: authResult.autoRotated,
                hasBearer: Boolean(extractBearerToken(req.headers.get("authorization"))),
                hasApiKeyHeader: Boolean(req.headers.get("x-api-key")),
            },
        });
        return corsJson({ error: "Unauthorized — invalid or missing API key." }, { status: 401 });
    }

    if (authResult.usedPreviousKey) {
        await writeAdminAuditLog({
            action: "plugin.key.previous_key_used",
            actorUsername: "plugin-client",
            target: "/api/plugin/events",
            ipAddress: requesterIp,
            details: {
                autoRotated: authResult.autoRotated,
            },
        });
    }

    const rateLimitIdentifier = getPluginEventRateLimitIdentifier(req);
    const rateLimit = await consumePluginEventRateLimit(rateLimitIdentifier);
    if (!rateLimit.allowed) {
        await writeAdminAuditLog({
            action: "plugin.events.rate_limited",
            actorUsername: "plugin-client",
            target: "/api/plugin/events",
            ipAddress: requesterIp,
            details: {
                retryAfterSeconds: rateLimit.retryAfterSeconds ?? null,
            },
        });
        return corsJson(
            { error: "Too many plugin events. Please retry later.", retryAfterSeconds: rateLimit.retryAfterSeconds },
            { status: 429 }
        );
    }

    let payload: Record<string, any>;
    try {
        const rawPayload = await readRequestBodyWithLimit(req, MAX_PLUGIN_EVENT_BYTES);
        if (!rawPayload.trim()) {
            await writeAdminAuditLog({
                action: "plugin.events.invalid_payload",
                actorUsername: "plugin-client",
                target: "/api/plugin/events",
                ipAddress: requesterIp,
                details: { reason: "payload_empty" },
            });
            return corsJson({ error: "Invalid JSON payload." }, { status: 400 });
        }

        const parsedPayload = JSON.parse(rawPayload);
        if (!parsedPayload || typeof parsedPayload !== "object" || Array.isArray(parsedPayload)) {
            await writeAdminAuditLog({
                action: "plugin.events.invalid_payload",
                actorUsername: "plugin-client",
                target: "/api/plugin/events",
                ipAddress: requesterIp,
                details: { reason: "payload_not_object" },
            });
            return corsJson({ error: "Invalid JSON payload." }, { status: 400 });
        }
        payload = parsedPayload as Record<string, any>;
    } catch (error) {
        if (error instanceof PayloadTooLargeError) {
            await writeAdminAuditLog({
                action: "plugin.events.payload_too_large",
                actorUsername: "plugin-client",
                target: "/api/plugin/events",
                ipAddress: requesterIp,
                details: {
                    contentLength: req.headers.get("content-length") || null,
                    maxBytes: MAX_PLUGIN_EVENT_BYTES,
                },
            });
            return corsJson({ error: "Payload too large." }, { status: 413 });
        }

        await writeAdminAuditLog({
            action: "plugin.events.invalid_payload",
            actorUsername: "plugin-client",
            target: "/api/plugin/events",
            ipAddress: requesterIp,
            details: { reason: "json_parse_failed" },
        });
        return corsJson({ error: "Invalid JSON payload." }, { status: 400 });
    }

    try {
        const eventRaw = payload.event || payload.Event;
        const rawEvent = typeof eventRaw === "string" ? eventRaw.trim() : "";
        const event = normalizePluginEventName(rawEvent);
        const schemaVersionResult = resolvePluginSchemaVersion(payload);

        if (!rawEvent) {
            return corsJson({ error: "Missing 'event' field." }, { status: 400 });
        }

        if (!ALLOWED_PLUGIN_EVENTS.has(event)) {
            return corsJson({ error: `Unknown event: ${rawEvent}` }, { status: 400 });
        }

        if (!schemaVersionResult.valid) {
            const schemaVersionReason = schemaVersionResult.explicit
                ? "schema_version_not_positive_integer"
                : "schema_version_required";
            const schemaVersionError = schemaVersionResult.explicit
                ? "Invalid eventSchemaVersion. Expected a positive integer."
                : `Missing eventSchemaVersion. Required version is ${CURRENT_PLUGIN_EVENT_SCHEMA_VERSION}.`;

            await writeAdminAuditLog({
                action: "plugin.events.invalid_schema_version",
                actorUsername: "plugin-client",
                target: "/api/plugin/events",
                ipAddress: requesterIp,
                details: {
                    event,
                    schemaVersion: schemaVersionResult.raw,
                    reason: schemaVersionReason,
                    minSupported: MIN_SUPPORTED_PLUGIN_EVENT_SCHEMA_VERSION,
                    maxSupported: CURRENT_PLUGIN_EVENT_SCHEMA_VERSION,
                },
            });

            return corsJson(
                {
                    error: schemaVersionError,
                    minSupported: MIN_SUPPORTED_PLUGIN_EVENT_SCHEMA_VERSION,
                    maxSupported: CURRENT_PLUGIN_EVENT_SCHEMA_VERSION,
                },
                { status: 400 },
            );
        }

        const eventSchemaVersion = schemaVersionResult.version;
        if (
            eventSchemaVersion < MIN_SUPPORTED_PLUGIN_EVENT_SCHEMA_VERSION ||
            eventSchemaVersion > CURRENT_PLUGIN_EVENT_SCHEMA_VERSION
        ) {
            await writeAdminAuditLog({
                action: "plugin.events.unsupported_schema_version",
                actorUsername: "plugin-client",
                target: "/api/plugin/events",
                ipAddress: requesterIp,
                details: {
                    event,
                    schemaVersion: eventSchemaVersion,
                    explicit: schemaVersionResult.explicit,
                    minSupported: MIN_SUPPORTED_PLUGIN_EVENT_SCHEMA_VERSION,
                    maxSupported: CURRENT_PLUGIN_EVENT_SCHEMA_VERSION,
                },
            });

            return corsJson(
                {
                    error: "Unsupported eventSchemaVersion.",
                    schemaVersion: eventSchemaVersion,
                    minSupported: MIN_SUPPORTED_PLUGIN_EVENT_SCHEMA_VERSION,
                    maxSupported: CURRENT_PLUGIN_EVENT_SCHEMA_VERSION,
                },
                { status: 400 },
            );
        }

        const sourceServerIdentity = extractServerIdentityFromPayload(payload);
        if (authResult.scopeServerId && authResult.scopeServerId !== sourceServerIdentity.jellyfinServerId) {
            await writeAdminAuditLog({
                action: "plugin.events.scoped_key_server_mismatch",
                actorUsername: "plugin-client",
                target: "/api/plugin/events",
                ipAddress: requesterIp,
                details: {
                    tokenServerId: authResult.scopeServerId,
                    payloadServerId: sourceServerIdentity.jellyfinServerId,
                    event,
                },
            });
            return corsJson(
                {
                    error: "Forbidden — scoped plugin key does not match payload server.",
                    tokenServerId: authResult.scopeServerId,
                    payloadServerId: sourceServerIdentity.jellyfinServerId,
                },
                { status: 403 },
            );
        }

        const sourceServer = await upsertServerRecord(sourceServerIdentity);

        // Keep connection status fresh even if the plugin sends few heartbeats.
        if (event !== "Heartbeat" && event !== "PlaybackProgress") {
            await prisma.globalSettings.upsert({
                where: { id: "global" },
                update: { pluginLastSeen: new Date() },
                create: { id: "global", pluginLastSeen: new Date() },
            });
        }

        console.log(`[Plugin] Event received: ${event}`);

        // ────── MediaDownloaded ──────
        if (event === "MediaDownloaded") {
            return handleMediaDownloadedEvent(payload, sourceServer);
        }

        // ────── Heartbeat ──────
        if (event === "Heartbeat") {
            const metrics = payload.pluginMetrics || payload.PluginMetrics || {};
            const queueDepthRaw = parseFiniteNumber(metrics.queueDepth ?? metrics.QueueDepth);
            const retriesRaw = parseFiniteNumber(metrics.retries ?? metrics.Retries ?? metrics.retryCount ?? metrics.RetryCount);
            const lastHttpCodeRaw = parseFiniteNumber(metrics.lastHttpCode ?? metrics.LastHttpCode ?? metrics.lastHttpStatusCode ?? metrics.LastHttpStatusCode);
            const coalescedRaw = parseFiniteNumber(metrics.coalescedProgressEvents ?? metrics.CoalescedProgressEvents);

            const queueDepth = queueDepthRaw !== null ? Math.max(0, Math.floor(queueDepthRaw)) : null;
            const retries = retriesRaw !== null ? Math.max(0, Math.floor(retriesRaw)) : null;
            const lastHttpCode = lastHttpCodeRaw !== null ? Math.max(0, Math.floor(lastHttpCodeRaw)) : null;
            const coalescedProgressEvents = coalescedRaw !== null ? Math.max(0, Math.floor(coalescedRaw)) : null;

            await prisma.globalSettings.upsert({
                where: { id: "global" },
                update: {
                    pluginLastSeen: new Date(),
                    pluginVersion: payload.pluginVersion || payload.PluginVersion || null,
                    pluginServerName: sourceServer.name || payload.serverName || payload.ServerName || null,
                },
                create: {
                    id: "global",
                    pluginLastSeen: new Date(),
                    pluginVersion: payload.pluginVersion || payload.PluginVersion || null,
                    pluginServerName: sourceServer.name || payload.serverName || payload.ServerName || null,
                },
            });

            // Sync users from heartbeat payload
            const users = payload.users || payload.Users || [];
            let syncedUsers = 0;
            for (const u of users) {
                const jellyfinUserId = normalizeJellyfinId(u.jellyfinUserId || u.JellyfinUserId || u.id || u.Id);
                const username = u.username || u.Username || u.name || u.Name;
                if (!jellyfinUserId || !username) continue;
                await upsertCanonicalUser(sourceServer.id, jellyfinUserId, username, true);
                syncedUsers++;
            }

            // Run background cleanup on heartbeat to keep DB healthy
            cleanupOrphanedSessions().catch(err => console.error("[Plugin] Heartbeat cleanup error:", err));

            // Record monitor activity for Log Health
            const sessionCount = Array.isArray(users) ? users.length : 0;
            await markMonitorPoll({ active: true, sessionCount, consecutiveErrors: 0 });
            await appendHealthEvent({
                source: "monitor",
                kind: "monitor_ping",
                message: `Monitor heartbeat received (${sessionCount} sessions)`,
                details: {
                    sessions: sessionCount,
                    version: payload.pluginVersion || "unknown",
                    jellyfinVersion: payload.jellyfinVersion || payload.JellyfinVersion || "unknown",
                    eventSchemaVersion,
                    queueDepth,
                    retries,
                    lastHttpCode,
                    coalescedProgressEvents,
                }
            });

            return corsJson({ success: true, message: `Heartbeat OK, ${syncedUsers} users synced.` });
        }

        // ────── PlaybackStart ──────
        if (event === "PlaybackStart") {
            // Record monitor activity for Log Health
            await markMonitorPoll({ active: true, sessionCount: 1, consecutiveErrors: 0 });

            const user = payload.user || payload.User || {};
            const media = payload.media || payload.Media || {};
            const session = payload.session || payload.Session || {};

            const jellyfinUserId = normalizeJellyfinId(user.jellyfinUserId || user.JellyfinUserId || user.id || user.Id);
            const username = user.username || user.Username || user.name || user.Name || "Unknown";
            const jellyfinMediaId = normalizeJellyfinId(media.jellyfinMediaId || media.JellyfinMediaId || media.id || media.Id);
            const title = media.title || media.Title || media.name || media.Name || "Unknown";
            const type = media.type || media.Type || "Unknown";
            const parentItemId = normalizeJellyfinId(media.parentId || media.ParentId || null);
            const clientName = session.clientName || session.ClientName || "Unknown";
            const deviceName = session.deviceName || session.DeviceName || "Unknown";
            const playMethod = session.playMethod || session.PlayMethod || "Unknown";
            const ipAddress = cleanIp(session.ipAddress || session.IpAddress || null);

            if (!jellyfinUserId || !jellyfinMediaId) {
                console.warn("[Plugin] PlaybackStart rejected: missing userId or mediaId", {
                    event,
                    hasUser: Boolean(jellyfinUserId),
                    hasMedia: Boolean(jellyfinMediaId),
                    sessionId: session.sessionId || session.SessionId || null,
                });
                return corsJson({ error: "Missing userId or mediaId." }, { status: 400 });
            }

            // Upsert canonical user/media and merge legacy compact IDs when needed.
            const dbUser = await upsertCanonicalUser(sourceServer.id, jellyfinUserId, username, true);
            const collectionType = media.collectionType || media.CollectionType || inferLibraryKey({ type });
            const payloadLibraryName = media.libraryName || media.LibraryName || null;
            const dbMedia = await upsertCanonicalMedia({
                serverId: sourceServer.id,
                rawJellyfinMediaId: jellyfinMediaId,
                title,
                type,
                collectionType,
                genres: media.genres || media.Genres || [],
                resolution: (media.resolution || media.Resolution) ? normalizeResolution(media.resolution || media.Resolution) : null,
                durationMs: media.durationMs != null ? BigInt(media.durationMs) : null,
                parentId: parentItemId,
                artist: media.artist || media.Artist || media.albumArtist || media.AlbumArtist || null,
                libraryName: payloadLibraryName,
                directors: ((media.people || media.People || []) as JellyfinPerson[])
                    .filter((p) => (p.type === "Director" || p.Type === "Director"))
                    .map((p) => p.name || p.Name)
                    .filter((x): x is string => !!x),
                actors: ((media.people || media.People || []) as JellyfinPerson[])
                    .filter((p) => (p.type === "Actor" || p.Type === "Actor"))
                    .map((p) => p.name || p.Name)
                    .filter((x): x is string => !!x),
                studios: ((media.studios || media.Studios || []) as Studio[])
                    .map((s) => s.name || s.Name)
                    .filter((x): x is string => !!x),
            });

            // Library exclusion check
            const settings = await prisma.globalSettings.findUnique({
                where: { id: "global" },
                select: { 
                    excludedLibraries: true, 
                    discordAlertsEnabled: true, 
                    discordWebhookUrl: true, 
                    discordAlertCondition: true,
                    maxConcurrentTranscodes: true 
                },
            });
            if (isLibraryExcluded({ serverId: sourceServer.id, libraryName: payloadLibraryName, collectionType, type }, settings?.excludedLibraries || [])) {
                console.log("[Plugin] PlaybackStart ignored due excluded library", {
                    serverId: sourceServer.id,
                    jellyfinUserId,
                    jellyfinMediaId,
                    libraryName: payloadLibraryName,
                    collectionType: collectionType || null,
                    type,
                });
                return corsJson({ success: true, ignored: true, message: "Library excluded." });
            }

            // GeoIP
            const geoData = getGeoLocation(ipAddress);
            let activePlaybackHistoryId: string | null = null;

            if (dbUser && dbMedia) {
                const lock = await acquirePlaybackLock(dbUser.id, dbMedia.id);
                try {
                    if (lock.acquired) {
                        const positionTicks = session.positionTicks != null ? Number(session.positionTicks) : 0;
                        const now = Date.now();
                        
                        const existingOpen = await prisma.playbackHistory.findFirst({
                            where: { serverId: sourceServer.id, userId: dbUser.id, mediaId: dbMedia.id, endedAt: null },
                        });
                        
                        let historyId: string | null = null;
                        
                        if (!existingOpen) {
                            const recentMergeWindowMs = (type === 'Audio' || type === 'Track') 
                                ? 5 * 60 * 1000 
                                : MERGE_WINDOW_MS;
                            
                            const mergeWindow = new Date(now - recentMergeWindowMs);
                            const recentClosed = await prisma.playbackHistory.findFirst({
                                where: { serverId: sourceServer.id, userId: dbUser.id, mediaId: dbMedia.id, endedAt: { not: null, gte: mergeWindow } },
                                orderBy: { endedAt: "desc" },
                            });
                            
                            if (recentClosed) {
                                await prisma.playbackHistory.update({
                                    where: { id: recentClosed.id },
                                    data: {
                                        endedAt: null,
                                        playMethod,
                                        clientName,
                                        deviceName,
                                        ipAddress,
                                        country: geoData.country,
                                        city: geoData.city,
                                        audioLanguage: (session.audioLanguage || session.AudioLanguage || "").split(' ')[0] || null,
                                        audioCodec: session.audioCodec || session.AudioCodec || null,
                                        subtitleLanguage: (session.subtitleLanguage || session.SubtitleLanguage || "").split(' ')[0] || null,
                                        subtitleCodec: session.subtitleCodec || session.SubtitleCodec || null,
                                    },
                                });
                                historyId = recentClosed.id;
                                console.log(`[Plugin] PlaybackStart: Reopened recent session ${recentClosed.id} for ${title}`);
                            } else {
                                const created = await prisma.playbackHistory.create({
                                    data: {
                                        serverId: sourceServer.id,
                                        userId: dbUser.id,
                                        mediaId: dbMedia.id,
                                        playMethod,
                                        clientName,
                                        deviceName,
                                        ipAddress,
                                        country: geoData.country,
                                        city: geoData.city,
                                        bitrate: session.bitrate ?? session.Bitrate ?? (dbMedia.size && dbMedia.durationMs ? Math.round(Number(dbMedia.size) * 8000 / Number(dbMedia.durationMs)) : null),
                                        audioLanguage: session.audioLanguage || session.AudioLanguage || null,
                                        audioCodec: session.audioCodec || session.AudioCodec || null,
                                        subtitleLanguage: session.subtitleLanguage || session.SubtitleLanguage || null,
                                        subtitleCodec: session.subtitleCodec || session.SubtitleCodec || null,
                                    },
                                });
                                historyId = created.id;
                                console.log(`[Plugin] PlaybackStart: Created session ${historyId} for ${title}`);

                                await prisma.playbackHistory.updateMany({
                                    where: { 
                                        serverId: sourceServer.id,
                                        userId: dbUser.id, 
                                        endedAt: null, 
                                        NOT: { id: historyId } 
                                    },
                                    data: { endedAt: new Date() }
                                });
                                await mergeOpenPlaybacks(dbUser.id, dbMedia.id);
                            }
                        } else {
                            historyId = existingOpen.id;
                        }

                        // Initialize Redis tracking keys for accurate cumulative duration
                        if (historyId) {
                            activePlaybackHistoryId = historyId;
                            await Promise.all([
                                redis.setex(`last_time:${historyId}`, 86400, now.toString()),
                                redis.setex(`last_tick:${historyId}`, 86400, positionTicks.toString()),
                                redis.setex(`start_pos:${historyId}`, 86400, positionTicks.toString()),
                            ]);
                        }
                    } else {
                        // Fallback without lock
                        const existingOpen = await prisma.playbackHistory.findFirst({
                            where: { serverId: sourceServer.id, userId: dbUser.id, mediaId: dbMedia.id, endedAt: null },
                        });
                        const positionTicks = session.positionTicks != null ? Number(session.positionTicks) : 0;
                        const now = Date.now();
                        let historyId: string | null = null;
                        
                        if (!existingOpen) {
                            const recentMergeWindowMs = (type === 'Audio' || type === 'Track') 
                                ? 5 * 60 * 1000 
                                : MERGE_WINDOW_MS;
                            
                            const mergeWindow = new Date(now - recentMergeWindowMs);
                            const recentClosed = await prisma.playbackHistory.findFirst({
                                where: { serverId: sourceServer.id, userId: dbUser.id, mediaId: dbMedia.id, endedAt: { not: null, gte: mergeWindow } },
                                orderBy: { endedAt: "desc" },
                            });
                            
                            if (recentClosed) {
                                await prisma.playbackHistory.update({
                                    where: { id: recentClosed.id },
                                    data: { endedAt: null },
                                });
                                historyId = recentClosed.id;
                            } else {
                                const created = await prisma.playbackHistory.create({
                                    data: {
                                        serverId: sourceServer.id,
                                        userId: dbUser.id,
                                        mediaId: dbMedia.id,
                                        playMethod, clientName, deviceName, ipAddress,
                                        country: geoData.country, city: geoData.city,
                                        bitrate: session.bitrate ?? session.Bitrate ?? (dbMedia.size && dbMedia.durationMs ? Math.round(Number(dbMedia.size) * 8000 / Number(dbMedia.durationMs)) : null),
                                    },
                                });
                                historyId = created.id;
                                await prisma.playbackHistory.updateMany({
                                    where: { serverId: sourceServer.id, userId: dbUser.id, endedAt: null, NOT: { id: historyId } },
                                    data: { endedAt: new Date() }
                                });
                                await mergeOpenPlaybacks(dbUser.id, dbMedia.id);
                            }
                        } else {
                            historyId = existingOpen.id;
                        }
                        
                        if (historyId) {
                            activePlaybackHistoryId = historyId;
                            await Promise.all([
                                redis.setex(`last_time:${historyId}`, 86400, now.toString()),
                                redis.setex(`last_tick:${historyId}`, 86400, positionTicks.toString()),
                                redis.setex(`start_pos:${historyId}`, 86400, positionTicks.toString()),
                            ]);
                        }
                    }
                } finally {
                    try {
                        if (lock.acquired) await redis.del(lock.key);
                    } catch {}
                }
            }

            // ActiveStream upsert (session tracking)
            const sessionId = session.sessionId || session.SessionId;
            if (sessionId && dbUser && dbMedia) {
                const runTimeTicks = media.durationMs ? Number(media.durationMs) * 10_000 : null;
                const playbackPositionTicks = Number(session.positionTicks || 0);
                const playbackRate = readPlaybackRate(payload, session);
                const progressPercent = computeProgressPercent(playbackPositionTicks, runTimeTicks);
                const mediaSubtitle = await buildMediaSubtitle({
                    serverId: sourceServer.id,
                    type,
                    seriesName: media.seriesName || media.SeriesName || null,
                    seasonName: media.seasonName || media.SeasonName || null,
                    albumArtist: media.albumArtist || media.AlbumArtist || null,
                    albumName: media.albumName || media.AlbumName || null,
                    artist: media.artist || media.Artist || null,
                    parentItemId,
                });
                await (prisma.activeStream as any).upsert({
                    where: { sessionId_serverId: { sessionId, serverId: sourceServer.id } },
                    update: {
                        serverId: sourceServer.id,
                        userId: dbUser.id,
                        mediaId: dbMedia.id,
                        playbackId: activePlaybackHistoryId,
                        playMethod,
                        clientName,
                        deviceName,
                        ipAddress,
                        country: geoData.country,
                        city: geoData.city,
                        videoCodec: session.videoCodec || session.VideoCodec || null,
                        audioCodec: session.audioCodec || session.AudioCodec || null,
                        transcodeFps: session.transcodeFps ?? session.TranscodeFps ?? null,
                        bitrate: session.bitrate ?? session.Bitrate ?? (dbMedia.size && dbMedia.durationMs ? Math.round(Number(dbMedia.size) * 8000 / Number(dbMedia.durationMs)) : null),
                        audioLanguage: (session.audioLanguage || session.AudioLanguage || "").split(' ')[0] || null,
                        subtitleLanguage: (session.subtitleLanguage || session.SubtitleLanguage || "").split(' ')[0] || null,
                        subtitleCodec: session.subtitleCodec || session.SubtitleCodec || null,
                        playbackRate,
                        positionTicks: session.positionTicks != null ? BigInt(session.positionTicks) : null,
                    },
                    create: {
                        serverId: sourceServer.id,
                        sessionId,
                        userId: dbUser.id,
                        mediaId: dbMedia.id,
                        playbackId: activePlaybackHistoryId,
                        playMethod,
                        clientName,
                        deviceName,
                        ipAddress,
                        country: geoData.country,
                        city: geoData.city,
                        videoCodec: session.videoCodec || session.VideoCodec || null,
                        audioCodec: session.audioCodec || session.AudioCodec || null,
                        transcodeFps: session.transcodeFps ?? session.TranscodeFps ?? null,
                        bitrate: session.bitrate ?? session.Bitrate ?? (dbMedia.size && dbMedia.durationMs ? Math.round(Number(dbMedia.size) * 8000 / Number(dbMedia.durationMs)) : null),
                        audioLanguage: (session.audioLanguage || session.AudioLanguage || "").split(' ')[0] || null,
                        subtitleLanguage: (session.subtitleLanguage || session.SubtitleLanguage || "").split(' ')[0] || null,
                        subtitleCodec: session.subtitleCodec || session.SubtitleCodec || null,
                        playbackRate,
                        positionTicks: session.positionTicks != null ? BigInt(session.positionTicks) : null,
                    },
                });

                // Redis live stream data
                const redisPayload = JSON.stringify({
                    sessionId,
                    SessionId: sessionId,
                    serverId: sourceServer.id,
                    sourceServerId: sourceServer.jellyfinServerId,
                    sourceServerName: sourceServer.name,
                    userId: dbUser.id,
                    UserId: dbUser.id,
                    mediaId: dbMedia.id,
                    itemId: jellyfinMediaId,
                    ItemId: jellyfinMediaId,
                    parentItemId: parentItemId || null,
                    title,
                    ItemName: title,
                    username,
                    UserName: username,
                    clientName,
                    deviceName,
                    DeviceName: deviceName,
                    playMethod,
                    PlayMethod: playMethod,
                    isTranscoding: playMethod === "Transcode",
                    IsTranscoding: playMethod === "Transcode",
                    ipAddress,
                    country: geoData.country,
                    Country: geoData.country,
                    city: geoData.city,
                    City: geoData.city,
                    positionTicks: playbackPositionTicks,
                    playbackPositionTicks: playbackPositionTicks,
                    PlaybackPositionTicks: playbackPositionTicks,
                    runTimeTicks,
                    RunTimeTicks: runTimeTicks,
                    mediaSubtitle,
                    progressPercent,
                    isPaused: false,
                    IsPaused: false,
                    audioLanguage: session.audioLanguage || session.AudioLanguage || null,
                    AudioLanguage: session.audioLanguage || session.AudioLanguage || null,
                    audioCodec: session.audioCodec || session.AudioCodec || null,
                    AudioCodec: session.audioCodec || session.AudioCodec || null,
                    audioStreamIndex: session.audioStreamIndex ?? session.AudioStreamIndex ?? null,
                    AudioStreamIndex: session.audioStreamIndex ?? session.AudioStreamIndex ?? null,
                    subtitleLanguage: session.subtitleLanguage || session.SubtitleLanguage || null,
                    SubtitleLanguage: session.subtitleLanguage || session.SubtitleLanguage || null,
                    subtitleCodec: session.subtitleCodec || session.SubtitleCodec || null,
                    SubtitleCodec: session.subtitleCodec || session.SubtitleCodec || null,
                    playbackRate,
                    PlaybackRate: playbackRate,
                    subtitleStreamIndex: session.subtitleStreamIndex ?? session.SubtitleStreamIndex ?? null,
                    SubtitleStreamIndex: session.subtitleStreamIndex ?? session.SubtitleStreamIndex ?? null,
                });
                await redis.setex(buildStreamRedisKey(sourceServer.id, sessionId), 60, redisPayload);
            }

            // Discord notification
            try {
                if (settings?.discordAlertsEnabled && settings?.discordWebhookUrl) {
                    // SECURITY: Validate webhook URL to prevent SSRF attacks
                    if (!isValidDiscordWebhook(settings.discordWebhookUrl)) {
                        console.warn("[Plugin] Invalid Discord webhook URL: rejecting");
                    } else {
                        const condition = settings.discordAlertCondition || "ALL";
                        let shouldSend = true;
                        if (condition === "TRANSCODE_ONLY") {
                            shouldSend = playMethod === "Transcode";
                        } else if (condition === "NEW_IP_ONLY") {
                            if (dbUser) {
                                const pastCount = await prisma.playbackHistory.count({
                                    where: { serverId: sourceServer.id, userId: dbUser.id, ipAddress },
                                });
                                shouldSend = pastCount === 0;
                            }
                        }
                        if (shouldSend) {
                            const appUrl = process.env.NEXTAUTH_URL || null;
                            const posterUrl = appUrl
                                ? `${appUrl}/api/jellyfin/image?itemId=${jellyfinMediaId}&type=Primary`
                                : null;
                            const embed: Record<string, unknown> = {
                                title: `🎬 Now Playing: ${title}`,
                                color: 10181046,
                                fields: [
                                    { name: "👤 User", value: username, inline: true },
                                    { name: "📱 Device", value: `${clientName} (${deviceName})`, inline: true },
                                    { name: "🌍 Location", value: geoData.country !== "Unknown" ? `${geoData.city}, ${geoData.country}` : "Unknown", inline: true },
                                ],
                                timestamp: new Date().toISOString(),
                            };
                            if (posterUrl) {
                                embed.thumbnail = { url: posterUrl };
                            }

                            try {
                                await safeFetchWebhook(settings.discordWebhookUrl, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                        embeds: [embed],
                                    }),
                                }, isValidDiscordWebhook);
                            } catch (fetchErr) {
                                console.error("[Plugin] Discord webhook fetch failed:", fetchErr instanceof Error ? fetchErr.message : String(fetchErr));
                            }
                        }
                    }
                }
            } catch (err) {
                console.error("[Plugin] Discord notification error:", err);
            }

            // ────── Capacity Alerts (Transcoding) ──────
            try {
                if (settings?.maxConcurrentTranscodes && settings.maxConcurrentTranscodes > 0) {
                    const transcodeCount = await prisma.activeStream.count({
                        where: { playMethod: "Transcode" }
                    });

                    if (transcodeCount > settings.maxConcurrentTranscodes) {
                        console.warn(`[Alert] Critical transcode threshold exceeded: ${transcodeCount}/${settings.maxConcurrentTranscodes}`);
                        if (settings.discordAlertsEnabled && settings.discordWebhookUrl) {
                            // SECURITY: Validate webhook URL to prevent SSRF attacks
                            if (!isValidDiscordWebhook(settings.discordWebhookUrl)) {
                                console.warn("[Alert] Invalid Discord webhook URL: rejecting");
                            } else {
                                try {
                                    await safeFetchWebhook(settings.discordWebhookUrl, {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                            embeds: [{
                                                title: `⚠️ Capacity Alert: Critical Transcode Usage`,
                                                color: 16711680, // Red
                                                description: `The number of simultaneous transcodes has reached a critical level.`,
                                                fields: [
                                                    { name: "Current Transcodes", value: `${transcodeCount}`, inline: true },
                                                    { name: "Configured Threshold", value: `${settings.maxConcurrentTranscodes}`, inline: true },
                                                ],
                                                timestamp: new Date().toISOString(),
                                            }],
                                        }),
                                    }, isValidDiscordWebhook);
                                } catch (fetchErr) {
                                    console.error("[Alert] Discord webhook fetch failed:", fetchErr instanceof Error ? fetchErr.message : String(fetchErr));
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                console.error("[Alert] Capacity check failed:", err);
            }

            return corsJson({ success: true, message: "PlaybackStart processed." });
        }

        // ────── PlaybackStop ──────
        if (event === "PlaybackStop") {
            const userPayload = payload.user || payload.User || {};
            const mediaPayload = payload.media || payload.Media || {};
            const jellyfinUserId = normalizeJellyfinId(userPayload.jellyfinUserId || userPayload.JellyfinUserId || userPayload.id || payload.userId);
            const jellyfinMediaId = normalizeJellyfinId(mediaPayload.jellyfinMediaId || mediaPayload.JellyfinMediaId || mediaPayload.id || payload.mediaId);
            const positionTicks = payload.positionTicks || payload.PositionTicks || 0;
            const sessionId = payload.sessionId || payload.SessionId;

            if (!jellyfinUserId || !jellyfinMediaId) {
                console.warn("[Plugin] PlaybackStop rejected: missing userId or mediaId", {
                    event,
                    hasUser: Boolean(jellyfinUserId),
                    hasMedia: Boolean(jellyfinMediaId),
                    sessionId: sessionId || null,
                    payloadKeys: Object.keys(payload || {}),
                });
                return corsJson({ error: "Missing userId or mediaId." }, { status: 400 });
            }

            const userCandidates = jellyfinUserId ? Array.from(new Set([jellyfinUserId, compactJellyfinId(jellyfinUserId)])) : [];
            if (userCandidates.length > 0) {
                const user = await prisma.user.findFirst({
                    where: { serverId: sourceServer.id, jellyfinUserId: { in: userCandidates } },
                    orderBy: { createdAt: "asc" },
                    select: { id: true },
                });
                if (user) {
                    await prisma.user.update({ where: { id: user.id }, data: { lastActive: new Date() } });
                }
            }

            const result = await finalizePlaybackSession({
                sourceServerId: sourceServer.id,
                sessionId,
                jellyfinUserId,
                jellyfinMediaId,
                positionTicks: Number(positionTicks),
                reason: "stop",
            });

            if (result.closed) {
                console.log(`[Plugin] PlaybackStop: Session ${result.playbackId} closed, duration=${result.durationS}s`);
            }

            return corsJson({ success: true, message: "PlaybackStop processed." });
        }

        // ────── PlaybackStateChanged ──────
        if (event === "PlaybackStateChanged") {
            const userPayload = payload.user || payload.User || {};
            const mediaPayload = payload.media || payload.Media || {};
            const sessionPayload = payload.session || payload.Session || {};
            const sessionId = payload.sessionId || payload.SessionId || sessionPayload.sessionId || sessionPayload.SessionId;
            const changeTypeRaw = payload.changeType || payload.ChangeType || payload.stateChangeType || payload.StateChangeType;
            const changeType = typeof changeTypeRaw === "string" ? changeTypeRaw.trim().toLowerCase() : "";
            const positionTicks = Number(payload.positionTicks ?? payload.PositionTicks ?? sessionPayload.positionTicks ?? sessionPayload.PositionTicks ?? 0);
            const positionMs = positionTicks > 0 ? BigInt(Math.floor(positionTicks / 10_000)) : BigInt(0);
            const positionMsNumber = Number(positionMs);
            const explicitPlaybackRate = readPlaybackRate(payload, sessionPayload);
            const jellyfinUserId = normalizeJellyfinId(userPayload.jellyfinUserId || userPayload.JellyfinUserId || userPayload.id || payload.userId);
            const jellyfinMediaId = normalizeJellyfinId(mediaPayload.jellyfinMediaId || mediaPayload.JellyfinMediaId || mediaPayload.id || payload.mediaId);

            if (!sessionId) {
                return corsJson({ error: "Missing sessionId." }, { status: 400 });
            }

            const activeStream = await (prisma.activeStream as any).findUnique({
                where: { sessionId_serverId: { sessionId, serverId: sourceServer.id } },
                select: {
                    id: true,
                    sessionId: true,
                    userId: true,
                    mediaId: true,
                    playbackId: true,
                },
            });

            let playbackId = activeStream?.playbackId || null;
            if (!playbackId && jellyfinUserId && jellyfinMediaId) {
                const userCandidates = Array.from(new Set([jellyfinUserId, compactJellyfinId(jellyfinUserId)]));
                const mediaCandidates = Array.from(new Set([jellyfinMediaId, compactJellyfinId(jellyfinMediaId)]));
                const [user, media] = await Promise.all([
                    prisma.user.findFirst({ where: { serverId: sourceServer.id, jellyfinUserId: { in: userCandidates } }, orderBy: { createdAt: "asc" }, select: { id: true } }),
                    prisma.media.findFirst({ where: { serverId: sourceServer.id, jellyfinMediaId: { in: mediaCandidates } }, orderBy: { createdAt: "asc" }, select: { id: true } }),
                ]);
                if (user && media) {
                    const playback = await prisma.playbackHistory.findFirst({
                        where: { serverId: sourceServer.id, userId: user.id, mediaId: media.id, endedAt: null },
                        orderBy: { startedAt: "desc" },
                        select: { id: true },
                    });
                    playbackId = playback?.id || null;
                }
            }

            const validTypes = new Set(["pause", "resume", "seek", "audio_change", "subtitle_change", "speed_change"]);
            if (!validTypes.has(changeType)) {
                return corsJson({ error: `Unsupported state change: ${changeType || "unknown"}` }, { status: 400 });
            }

            if (playbackId) {
                const rawMetadata = payload.metadata || payload.Metadata || {};
                const metadataRecord = rawMetadata && typeof rawMetadata === "object" && !Array.isArray(rawMetadata)
                    ? rawMetadata as Record<string, unknown>
                    : {};
                const jumpDetails = changeType === "seek"
                    ? inferJumpFromMetadata(metadataRecord, positionMsNumber)
                    : null;
                const storedEventType = jumpDetails?.direction === "backward" ? "replay" : changeType;
                const updateData: Record<string, unknown> = {};
                if (changeType === "pause") updateData.pauseCount = { increment: 1 };
                if (changeType === "audio_change") updateData.audioChanges = { increment: 1 };
                if (changeType === "subtitle_change") updateData.subtitleChanges = { increment: 1 };
                if (changeType === "seek") updateData.seekCount = { increment: 1 };
                if (storedEventType === "replay") updateData.rewatchCount = { increment: 1 };
                if (changeType === "speed_change") {
                    updateData.speedChangeCount = { increment: 1 };
                    const rate = parsePlaybackRate(metadataRecord.toRate ?? metadataRecord.rate ?? explicitPlaybackRate);
                    if (rate !== null) updateData.maxPlaybackRate = rate;
                }
                if (Object.keys(updateData).length > 0) {
                    await prisma.playbackHistory.update({ where: { id: playbackId }, data: updateData });
                }

                const metadata = jumpDetails
                    ? buildJumpMetadata({
                        fromMs: jumpDetails.fromMs,
                        toMs: jumpDetails.toMs,
                        deltaMs: jumpDetails.deltaMs,
                        source: typeof metadataRecord.source === "string" ? metadataRecord.source : "state_change",
                        existing: metadataRecord,
                    })
                    : {
                        ...metadataRecord,
                        ...(explicitPlaybackRate !== null && changeType === "speed_change"
                            ? {
                                toRate: explicitPlaybackRate,
                                toRateLabel: formatPlaybackRate(explicitPlaybackRate),
                                source: "jellyfin",
                                confidence: 1,
                            }
                            : {}),
                    };
                await prisma.telemetryEvent.create({
                    data: {
                        serverId: sourceServer.id,
                        playbackId,
                        eventType: storedEventType,
                        positionMs,
                        metadata: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
                    },
                });

                if (jumpDetails) {
                    await redis.setex(`jump:${playbackId}`, 30, JSON.stringify({
                        fromMs: jumpDetails.fromMs,
                        toMs: jumpDetails.toMs,
                        at: Date.now(),
                    }));
                }
            }

            const redisKey = buildStreamRedisKey(sourceServer.id, sessionId);
            const cachedStream = await redis.get(redisKey);
            if (cachedStream) {
                try {
                    const parsed = JSON.parse(cachedStream) as Record<string, unknown>;
                    if (changeType === "pause" || changeType === "resume") {
                        const isPaused = changeType === "pause";
                        parsed.isPaused = isPaused;
                        parsed.IsPaused = isPaused;
                    }
                    if (changeType === "audio_change") {
                        const audioStreamIndex = payload.audioStreamIndex ?? payload.AudioStreamIndex;
                        parsed.audioStreamIndex = audioStreamIndex ?? parsed.audioStreamIndex ?? null;
                        parsed.AudioStreamIndex = audioStreamIndex ?? parsed.AudioStreamIndex ?? null;
                        parsed.audioLanguage = sessionPayload.audioLanguage || sessionPayload.AudioLanguage || parsed.audioLanguage || null;
                        parsed.AudioLanguage = sessionPayload.audioLanguage || sessionPayload.AudioLanguage || parsed.AudioLanguage || null;
                        parsed.audioCodec = sessionPayload.audioCodec || sessionPayload.AudioCodec || parsed.audioCodec || null;
                        parsed.AudioCodec = sessionPayload.audioCodec || sessionPayload.AudioCodec || parsed.AudioCodec || null;
                    }
                    if (changeType === "subtitle_change") {
                        const subtitleStreamIndex = payload.subtitleStreamIndex ?? payload.SubtitleStreamIndex;
                        parsed.subtitleStreamIndex = subtitleStreamIndex ?? parsed.subtitleStreamIndex ?? null;
                        parsed.SubtitleStreamIndex = subtitleStreamIndex ?? parsed.SubtitleStreamIndex ?? null;
                        parsed.subtitleLanguage = sessionPayload.subtitleLanguage || sessionPayload.SubtitleLanguage || parsed.subtitleLanguage || null;
                        parsed.SubtitleLanguage = sessionPayload.subtitleLanguage || sessionPayload.SubtitleLanguage || parsed.SubtitleLanguage || null;
                        parsed.subtitleCodec = sessionPayload.subtitleCodec || sessionPayload.SubtitleCodec || parsed.subtitleCodec || null;
                        parsed.SubtitleCodec = sessionPayload.subtitleCodec || sessionPayload.SubtitleCodec || parsed.SubtitleCodec || null;
                    }
                    if (explicitPlaybackRate !== null) {
                        parsed.playbackRate = explicitPlaybackRate;
                        parsed.PlaybackRate = explicitPlaybackRate;
                    }
                    if (positionTicks > 0) {
                        parsed.positionTicks = positionTicks;
                        parsed.playbackPositionTicks = positionTicks;
                        parsed.PlaybackPositionTicks = positionTicks;
                    }
                    await redis.setex(redisKey, 60, JSON.stringify(parsed));
                } catch {
                    // Ignore malformed legacy live-stream cache entries.
                }
            }

            return corsJson({ success: true, message: "PlaybackStateChanged processed." });
        }

        // ────── SessionEnded ──────
        if (event === "SessionEnded") {
            const userPayload = payload.user || payload.User || {};
            const sessionPayload = payload.session || payload.Session || {};
            const sessionId = payload.sessionId || payload.SessionId || sessionPayload.sessionId || sessionPayload.SessionId;
            const jellyfinUserId = normalizeJellyfinId(userPayload.jellyfinUserId || userPayload.JellyfinUserId || userPayload.id || payload.userId);
            const positionTicks = Number(sessionPayload.positionTicks ?? sessionPayload.PositionTicks ?? payload.positionTicks ?? payload.PositionTicks ?? 0);

            if (!sessionId) {
                return corsJson({ error: "Missing sessionId." }, { status: 400 });
            }

            const result = await finalizePlaybackSession({
                sourceServerId: sourceServer.id,
                sessionId,
                jellyfinUserId,
                positionTicks,
                reason: "session_end",
                metadata: {
                    source: "session_ended",
                    clientName: sessionPayload.clientName || sessionPayload.ClientName || null,
                    deviceName: sessionPayload.deviceName || sessionPayload.DeviceName || null,
                },
            });

            return corsJson({ success: true, message: "SessionEnded processed.", result });
        }

        // ────── PlaybackProgress ──────
        if (event === "PlaybackProgress") {
            const userPayload = payload.user || payload.User || {};
            const mediaPayload = payload.media || payload.Media || {};
            const sessionPayload = payload.session || payload.Session || {};
            const jellyfinUserId = normalizeJellyfinId(userPayload.jellyfinUserId || userPayload.JellyfinUserId || userPayload.id || payload.userId);
            const jellyfinMediaId = normalizeJellyfinId(mediaPayload.jellyfinMediaId || mediaPayload.JellyfinMediaId || mediaPayload.id || payload.mediaId);
            const username = userPayload.username || userPayload.Username || userPayload.name || userPayload.Name || "Unknown";
            const title = mediaPayload.title || mediaPayload.Title || mediaPayload.name || mediaPayload.Name || "Unknown";
            const type = mediaPayload.type || mediaPayload.Type || "Unknown";
            const collectionType = mediaPayload.collectionType || mediaPayload.CollectionType || null;
            const mediaDurationMsRaw = mediaPayload.durationMs ?? mediaPayload.DurationMs;
            const mediaDurationMs = Number(mediaDurationMsRaw);
            const sessionId = payload.sessionId || payload.SessionId || sessionPayload.sessionId || sessionPayload.SessionId;
            const pausedRaw = payload.isPaused ?? payload.IsPaused ?? sessionPayload.isPaused ?? sessionPayload.IsPaused;
            const hasPausedState = typeof pausedRaw === "boolean";
            const isPaused = pausedRaw === true;
            const audioStreamIndex = payload.audioStreamIndex ?? payload.AudioStreamIndex;
            const subtitleStreamIndex = payload.subtitleStreamIndex ?? payload.SubtitleStreamIndex;
            const positionTicksRaw = payload.positionTicks ?? payload.PositionTicks ?? sessionPayload.positionTicks ?? sessionPayload.PositionTicks ?? 0;
            const positionTicks = Number(positionTicksRaw) > 0 ? Number(positionTicksRaw) : 0;
            const positionMs = positionTicks > 0 ? BigInt(Math.floor(positionTicks / 10_000)) : BigInt(0);
            const clientNameRaw = sessionPayload.clientName || sessionPayload.ClientName || "Unknown";
            const deviceNameRaw = sessionPayload.deviceName || sessionPayload.DeviceName || "Unknown";
            const playMethodRaw = sessionPayload.playMethod || sessionPayload.PlayMethod || "Unknown";
            const ipAddressRaw = cleanIp(sessionPayload.ipAddress || sessionPayload.IpAddress || null);
            const videoCodec = sessionPayload.videoCodec || sessionPayload.VideoCodec || null;
            const audioCodec = sessionPayload.audioCodec || sessionPayload.AudioCodec || null;
            const audioLanguage = sessionPayload.audioLanguage || sessionPayload.AudioLanguage || null;
            const subtitleLanguage = sessionPayload.subtitleLanguage || sessionPayload.SubtitleLanguage || null;
            const subtitleCodec = sessionPayload.subtitleCodec || sessionPayload.SubtitleCodec || null;
            const transcodeFps = sessionPayload.transcodeFps ?? sessionPayload.TranscodeFps ?? null;
            const bitrate = sessionPayload.bitrate ?? sessionPayload.Bitrate ?? null;
            const explicitPlaybackRate = readPlaybackRate(payload, sessionPayload);
            const seriesName = mediaPayload.seriesName || mediaPayload.SeriesName || null;
            const seasonName = mediaPayload.seasonName || mediaPayload.SeasonName || null;
            const albumArtist = mediaPayload.albumArtist || mediaPayload.AlbumArtist || null;
            const albumName = mediaPayload.albumName || mediaPayload.AlbumName || null;
            const parentItemId = normalizeJellyfinId(mediaPayload.parentId || mediaPayload.ParentId || null);
            const runTimeTicksRaw = mediaPayload.runTimeTicks ?? mediaPayload.RunTimeTicks;
            let runTimeTicks = Number(runTimeTicksRaw);
            if (!Number.isFinite(runTimeTicks) || runTimeTicks <= 0) {
                runTimeTicks = 0;
            }

            if (!jellyfinUserId || !jellyfinMediaId) {
                return corsJson({ error: "Missing userId or mediaId." }, { status: 400 });
            }

            const mediaCandidates = Array.from(new Set([jellyfinMediaId, compactJellyfinId(jellyfinMediaId)]));
            const existingMedia = await prisma.media.findFirst({
                where: { serverId: sourceServer.id, jellyfinMediaId: { in: mediaCandidates } },
                orderBy: { createdAt: "asc" },
                select: { title: true, type: true, collectionType: true, durationMs: true, artist: true, libraryName: true, parentId: true },
            });
            const existingStream = sessionId
                ? await (prisma.activeStream as any).findUnique({
                    where: { sessionId_serverId: { sessionId, serverId: sourceServer.id } },
                    select: {
                        playbackId: true,
                        userId: true,
                        mediaId: true,
                        clientName: true,
                        deviceName: true,
                        playMethod: true,
                        ipAddress: true,
                        videoCodec: true,
                        audioCodec: true,
                        audioLanguage: true,
                        subtitleLanguage: true,
                        subtitleCodec: true,
                        transcodeFps: true,
                        bitrate: true,
                        playbackRate: true,
                        user: { select: { id: true, username: true, jellyfinUserId: true } },
                        media: {
                            select: {
                                id: true,
                                title: true,
                                type: true,
                                collectionType: true,
                                durationMs: true,
                                artist: true,
                                libraryName: true,
                                parentId: true,
                                size: true,
                            },
                        },
                    },
                })
                : null;

            const resolvedTitle = title !== "Unknown"
                ? title
                : (existingMedia?.title || `Media ${String(jellyfinMediaId).slice(0, 8)}`);
            const resolvedType = type !== "Unknown" ? type : (existingMedia?.type || "Unknown");
            const resolvedCollectionType = collectionType || existingMedia?.collectionType || inferLibraryKey({ type: resolvedType });
            const resolvedLibraryName = mediaPayload.libraryName || mediaPayload.LibraryName || existingMedia?.libraryName || null;
            const resolvedClientName = clientNameRaw !== "Unknown" ? clientNameRaw : (existingStream?.clientName || "Unknown");
            const resolvedDeviceName = deviceNameRaw !== "Unknown" ? deviceNameRaw : (existingStream?.deviceName || "Unknown");
            const resolvedPlayMethod = playMethodRaw !== "Unknown" ? playMethodRaw : (existingStream?.playMethod || "DirectPlay");
            const resolvedIpAddress = ipAddressRaw !== "Unknown" ? ipAddressRaw : (existingStream?.ipAddress || "Unknown");
            const resolvedVideoCodec = videoCodec || existingStream?.videoCodec || null;
            const resolvedAudioCodec = audioCodec || existingStream?.audioCodec || null;
            const resolvedAudioLanguage = audioLanguage || existingStream?.audioLanguage || null;
            const resolvedSubtitleLanguage = subtitleLanguage || existingStream?.subtitleLanguage || null;
            const resolvedSubtitleCodec = subtitleCodec || existingStream?.subtitleCodec || null;
            const resolvedTranscodeFps = transcodeFps ?? existingStream?.transcodeFps ?? null;
            const resolvedBitrate = bitrate ?? existingStream?.bitrate ?? null;
            const resolvedPlaybackRate = explicitPlaybackRate ?? parsePlaybackRate(existingStream?.playbackRate);

            const ingestSettings = await getCachedPluginIngestSettings();
            if (isLibraryExcluded({ serverId: sourceServer.id, libraryName: resolvedLibraryName, collectionType: resolvedCollectionType, type: resolvedType }, ingestSettings.excludedLibraries)) {
                console.log("[Plugin] PlaybackProgress ignored due excluded library", {
                    serverId: sourceServer.id,
                    jellyfinUserId,
                    jellyfinMediaId,
                    libraryName: resolvedLibraryName,
                    collectionType: resolvedCollectionType || null,
                    type: resolvedType,
                    sessionId: sessionId || null,
                });
                return corsJson({ success: true, ignored: true, message: "Library excluded." });
            }

            let user: any = null;
            let media: any = null;
            let activePlayback: any = null;

            if (existingStream?.playbackId && existingStream.user && existingStream.media) {
                user = existingStream.user;
                media = existingStream.media;
                activePlayback = await prisma.playbackHistory.findUnique({
                    where: { id: existingStream.playbackId },
                    include: { media: true },
                });
                if (user?.id) {
                    await prisma.user.update({ where: { id: user.id }, data: { lastActive: new Date() } });
                }
            } else {
                user = await upsertCanonicalUser(sourceServer.id, jellyfinUserId, username, true);
                media = await upsertCanonicalMedia({
                    serverId: sourceServer.id,
                    rawJellyfinMediaId: jellyfinMediaId,
                    title: resolvedTitle,
                    type: resolvedType,
                    collectionType: resolvedCollectionType,
                    genres: mediaPayload.genres || mediaPayload.Genres || [],
                    resolution: (mediaPayload.resolution || mediaPayload.Resolution) ? normalizeResolution(mediaPayload.resolution || mediaPayload.Resolution) : null,
                    durationMs: Number.isFinite(mediaDurationMs) && mediaDurationMs > 0 ? BigInt(mediaDurationMs) : null,
                    parentId: parentItemId || existingMedia?.parentId || null,
                    artist: mediaPayload.artist || mediaPayload.Artist || albumArtist || existingMedia?.artist || null,
                    libraryName: resolvedLibraryName,
                });
            }

            // Record monitor activity for Log Health
            await markMonitorPoll({ active: true, sessionCount: 1, consecutiveErrors: 0 });

            if (!user || !media) {
                return corsJson({ error: "Unable to resolve canonical user/media." }, { status: 400 });
            }

            if (runTimeTicks <= 0 && media.durationMs) {
                runTimeTicks = Number(media.durationMs) * 10_000;
            }

            const geoData = getGeoLocation(resolvedIpAddress);

            if (!activePlayback || activePlayback.endedAt) {
                activePlayback = await prisma.playbackHistory.findFirst({
                    where: { serverId: sourceServer.id, userId: user.id, mediaId: media.id, endedAt: null },
                    orderBy: { startedAt: "desc" },
                });
            }

            if (!activePlayback) {
                const lock = await acquirePlaybackLock(user.id, media.id);
                try {
                    if (lock.acquired) {
                        // Re-check inside the lock to avoid races
                        const recheck = await prisma.playbackHistory.findFirst({
                            where: { serverId: sourceServer.id, userId: user.id, mediaId: media.id, endedAt: null },
                            orderBy: { startedAt: "desc" },
                        });
                        if (recheck) {
                            activePlayback = recheck;
                        } else {
                            // Try to reopen recent closed session before creating a new one
                            const mergeWindow = new Date(Date.now() - ingestSettings.telemetry.mergeWindowSeconds * 1000);
                            const recentClosed = await prisma.playbackHistory.findFirst({
                                where: { serverId: sourceServer.id, userId: user.id, mediaId: media.id, endedAt: { not: null, gte: mergeWindow } },
                                orderBy: { endedAt: "desc" },
                            });
                            if (recentClosed) {
                                activePlayback = await prisma.playbackHistory.update({
                                    where: { id: recentClosed.id },
                                    data: { endedAt: null, playMethod: resolvedPlayMethod, clientName: resolvedClientName, deviceName: resolvedDeviceName, ipAddress: resolvedIpAddress, country: geoData.country, city: geoData.city, audioLanguage: resolvedAudioLanguage, audioCodec: resolvedAudioCodec, subtitleLanguage: resolvedSubtitleLanguage, subtitleCodec: resolvedSubtitleCodec },
                                });
                                console.log("[Plugin] PlaybackProgress bootstrap: reopened recent session because PlaybackStart was missing", {
                                    jellyfinUserId,
                                    jellyfinMediaId,
                                    sessionId: sessionId || null,
                                    reopened: recentClosed.id,
                                });
                            } else {
                                activePlayback = await prisma.playbackHistory.create({
                                    data: {
                                        serverId: sourceServer.id,
                                        userId: user.id,
                                        mediaId: media.id,
                                        playMethod: resolvedPlayMethod,
                                        clientName: resolvedClientName,
                                        deviceName: resolvedDeviceName,
                                        ipAddress: resolvedIpAddress,
                                        country: geoData.country,
                                        city: geoData.city,
                                        bitrate: resolvedBitrate ?? (media.size && media.durationMs ? Math.round(Number(media.size) * 8000 / Number(media.durationMs)) : null),
                                        audioLanguage: resolvedAudioLanguage,
                                        audioCodec: resolvedAudioCodec,
                                        subtitleLanguage: resolvedSubtitleLanguage,
                                        subtitleCodec: resolvedSubtitleCodec,
                                    },
                                });
                                console.log("[Plugin] PlaybackProgress bootstrap: created session because PlaybackStart was missing", {
                                    jellyfinUserId,
                                    jellyfinMediaId,
                                    sessionId: sessionId || null,
                                });
                                // Merge any concurrently-created open sessions and re-resolve the activePlayback
                                await mergeOpenPlaybacks(user.id, media.id);
                                activePlayback = await prisma.playbackHistory.findFirst({ where: { serverId: sourceServer.id, userId: user.id, mediaId: media.id, endedAt: null }, orderBy: { startedAt: "desc" } });
                            }
                        }
                    } else {
                        // fallback: wait briefly and re-check, then create if still missing
                        for (let i = 0; i < 6 && !activePlayback; i++) {
                            await new Promise((r) => setTimeout(r, 50));
                            const re = await prisma.playbackHistory.findFirst({
                                where: { serverId: sourceServer.id, userId: user.id, mediaId: media.id, endedAt: null },
                                orderBy: { startedAt: "desc" },
                            });
                            if (re) {
                                activePlayback = re;
                                break;
                            }
                        }
                        if (!activePlayback) {
                            const mergeWindow = new Date(Date.now() - ingestSettings.telemetry.mergeWindowSeconds * 1000);
                            const recentClosed = await prisma.playbackHistory.findFirst({
                                where: { serverId: sourceServer.id, userId: user.id, mediaId: media.id, endedAt: { not: null, gte: mergeWindow } },
                                orderBy: { endedAt: "desc" },
                            });
                            if (recentClosed) {
                                activePlayback = await prisma.playbackHistory.update({ where: { id: recentClosed.id }, data: { endedAt: null } });
                                console.log("[Plugin] PlaybackProgress bootstrap (nolock fallback): reopened recent session", { jellyfinUserId, jellyfinMediaId, reopened: recentClosed.id });
                            } else {
                                activePlayback = await prisma.playbackHistory.create({
                                    data: {
                                        serverId: sourceServer.id,
                                        userId: user.id,
                                        mediaId: media.id,
                                        playMethod: resolvedPlayMethod,
                                        clientName: resolvedClientName,
                                        deviceName: resolvedDeviceName,
                                        ipAddress: resolvedIpAddress,
                                        country: geoData.country,
                                        city: geoData.city,
                                        bitrate: resolvedBitrate ?? (media.size && media.durationMs ? Math.round(Number(media.size) * 8000 / Number(media.durationMs)) : null),
                                        audioLanguage: resolvedAudioLanguage,
                                        audioCodec: resolvedAudioCodec,
                                        subtitleLanguage: resolvedSubtitleLanguage,
                                        subtitleCodec: resolvedSubtitleCodec,
                                    },
                                });
                                console.log("[Plugin] PlaybackProgress bootstrap (nolock fallback): created session because PlaybackStart was missing", {
                                    jellyfinUserId,
                                    jellyfinMediaId,
                                    sessionId: sessionId || null,
                                });
                                // Merge any concurrently-created open sessions and re-resolve the activePlayback
                                await mergeOpenPlaybacks(user.id, media.id);
                                activePlayback = await prisma.playbackHistory.findFirst({ where: { serverId: sourceServer.id, userId: user.id, mediaId: media.id, endedAt: null }, orderBy: { startedAt: "desc" } });
                            }
                        }
                    }
                } finally {
                    try {
                        if (lock.acquired) await redis.del(lock.key);
                    } catch {}
                }
            }

            if (!activePlayback) {
                console.warn("[Plugin] PlaybackProgress aborted: No active playback found or created", { jellyfinUserId, jellyfinMediaId });
                return corsJson({ error: "No active playback session found." }, { status: 404 });
            }

            // Ensure we have a start position recorded (for fallback)
            const startPosKey = `start_pos:${activePlayback.id}`;
            const existingStart = await redis.get(startPosKey);
            if (!existingStart && positionTicks >= 0) {
                await redis.setex(startPosKey, 86400, positionTicks.toString());
            }

            // --- ACCUMULATE ACCURATE DURATION ---
            const durKey = `dur:${activePlayback.id}`;
            const lastTimeKey = `last_time:${activePlayback.id}`;
            const lastTickKey = `last_tick:${activePlayback.id}`;

            const prevDurRaw = await redis.get(durKey);
            const prevTimeRaw = await redis.get(lastTimeKey);
            const prevTickRaw = await redis.get(lastTickKey);

            let curDur = parseFloat(prevDurRaw || "0");
            const prevTime = prevTimeRaw ? parseInt(prevTimeRaw, 10) : null;
            const prevTick = prevTickRaw ? parseInt(prevTickRaw, 10) : null;
            const observedAtMs = parseObservedAtMs(payload);
            const now = observedAtMs ?? Date.now();

            if (!isPaused && prevTime !== null && prevTick !== null) {
                const wallDeltaS = (now - prevTime) / 1000;
                const tickDeltaS = (positionTicks - prevTick) / 10_000_000;

                // Increased threshold to 120s to avoid losing data on slow pings (especially for music)
                if (wallDeltaS > 0 && wallDeltaS <= 120) {
                    if (shouldPreferWallClockForFeishinAudio({
                        mediaType: media.type,
                        clientName: resolvedClientName,
                        wallDeltaS,
                        tickDeltaS,
                        isPaused,
                    })) {
                        curDur += wallDeltaS;
                    } else if (tickDeltaS > 0 && tickDeltaS <= 120) {
                        curDur += tickDeltaS;
                    } else if (positionTicks !== prevTick) {
                        // Cap wallDeltaS to 35s if it's used as fallback for seek/invalid tick to maintain sanity
                        curDur += Math.min(wallDeltaS, 35);
                    }
                }
            }

            await Promise.all([
                redis.setex(durKey, 86400, curDur.toString()),
                redis.setex(lastTimeKey, 86400, now.toString()),
                redis.setex(lastTickKey, 86400, positionTicks.toString())
            ]);

            const durationWatched = clampDuration(Math.round(curDur), media.durationMs);
            const updates: Record<string, unknown> = {
                durationWatched,
                bitrate: resolvedBitrate
            };
            const telemetryEvents: { eventType: string; positionMs: bigint; metadata?: string }[] = [];

            // Seek tracking (manual skip / Intro Skipper style jumps)
            const prevPositionMs = prevTick !== null ? Math.max(0, Math.floor(prevTick / 10_000)) : null;
            const currentPositionMs = Number(positionMs);
            const wallDeltaMs = prevTime !== null ? Math.max(0, now - prevTime) : null;
            const seekDeltaMs = prevPositionMs !== null ? currentPositionMs - prevPositionMs : 0;
            const seekThresholdMs = ingestSettings.telemetry.seekThresholdSeconds * 1000;
            const expectedAdvanceBudgetMs = wallDeltaMs !== null ? Math.max(15_000, wallDeltaMs + 12_000) : 45_000;
            const appearsSeek = prevPositionMs !== null
                && Number.isFinite(currentPositionMs)
                && Math.abs(seekDeltaMs) >= seekThresholdMs
                && Math.abs(seekDeltaMs) > expectedAdvanceBudgetMs;
            if (appearsSeek && positionMs > 0 && (!hasPausedState || !isPaused)) {
                const metadata = buildJumpMetadata({
                    fromMs: prevPositionMs,
                    toMs: currentPositionMs,
                    deltaMs: seekDeltaMs,
                    source: "progress_delta",
                });
                const previousJumpRaw = await redis.get(`jump:${activePlayback.id}`);
                let duplicateJump = false;
                if (previousJumpRaw) {
                    try {
                        const previousJump = JSON.parse(previousJumpRaw) as Record<string, unknown>;
                        const previousFromMs = parseFiniteNumber(previousJump.fromMs);
                        const previousToMs = parseFiniteNumber(previousJump.toMs);
                        if (previousFromMs !== null && previousToMs !== null) {
                            duplicateJump = Math.abs(previousFromMs - prevPositionMs) <= 1_500
                                && Math.abs(previousToMs - currentPositionMs) <= 1_500;
                        }
                    } catch {
                        duplicateJump = false;
                    }
                }

                if (!duplicateJump) {
                    updates.seekCount = { increment: 1 };
                    if (seekDeltaMs < 0) {
                        updates.rewatchCount = { increment: 1 };
                    }
                    telemetryEvents.push({
                        eventType: seekDeltaMs < 0 ? "replay" : "seek",
                        positionMs,
                        metadata: JSON.stringify(metadata),
                    });
                    await redis.setex(`jump:${activePlayback.id}`, 30, JSON.stringify({
                        fromMs: prevPositionMs,
                        toMs: currentPositionMs,
                        at: now,
                    }));
                }
            }

            const rateObservation = estimatePlaybackRate({
                explicitRate: explicitPlaybackRate,
                isPaused,
                appearsSeek,
                prevTime,
                prevTick,
                now,
                positionTicks,
            });
            if (rateObservation && positionMs > 0) {
                const currentMaxRate = parsePlaybackRate((activePlayback as Record<string, unknown>).maxPlaybackRate);
                if (currentMaxRate === null || rateObservation.bucket > currentMaxRate) {
                    updates.maxPlaybackRate = rateObservation.bucket;
                }

                const rateKey = `rate:${activePlayback.id}`;
                const previousRateRaw = await redis.get(rateKey);
                let previousRate: { bucket?: number; rate?: number; at?: number } | null = null;
                if (previousRateRaw) {
                    try {
                        previousRate = JSON.parse(previousRateRaw) as { bucket?: number; rate?: number; at?: number };
                    } catch {
                        previousRate = null;
                    }
                }

                const previousBucket = parsePlaybackRate(previousRate?.bucket);
                const previousRateValue = parsePlaybackRate(previousRate?.rate);
                const previousAt = typeof previousRate?.at === "number" && Number.isFinite(previousRate.at)
                    ? previousRate.at
                    : null;
                const bucketChanged = previousBucket === null || Math.abs(previousBucket - rateObservation.bucket) > 0.001;
                const outsideCooldown = previousAt === null || now - previousAt >= 15_000;

                if (bucketChanged && outsideCooldown) {
                    if (previousBucket !== null) {
                        updates.speedChangeCount = { increment: 1 };
                    }
                    telemetryEvents.push({
                        eventType: "speed_change",
                        positionMs,
                        metadata: JSON.stringify({
                            fromRate: previousRateValue,
                            fromRateLabel: formatPlaybackRate(previousRateValue),
                            toRate: rateObservation.bucket,
                            toRateRaw: Number(rateObservation.rate.toFixed(3)),
                            toRateLabel: formatPlaybackRate(rateObservation.bucket),
                            source: rateObservation.source,
                            confidence: rateObservation.confidence,
                            wallDeltaMs: rateObservation.wallDeltaMs ?? null,
                            positionDeltaMs: rateObservation.positionDeltaMs ?? null,
                            initial: previousBucket === null,
                        }),
                    });
                }

                await redis.setex(rateKey, 86400, JSON.stringify({
                    rate: rateObservation.rate,
                    bucket: rateObservation.bucket,
                    source: rateObservation.source,
                    confidence: rateObservation.confidence,
                    at: now,
                }));
            }

            // Pause tracking
            const pauseKey = `pause:${activePlayback.id}`;
            const prevPauseState = await redis.get(pauseKey);
            if (hasPausedState) {
                if (isPaused && prevPauseState !== "paused") {
                    updates.pauseCount = { increment: 1 };
                    await redis.setex(pauseKey, 3600, "paused");
                    if (positionMs > 0) telemetryEvents.push({ eventType: "pause", positionMs });
                } else if (!isPaused && prevPauseState === "paused") {
                    await redis.setex(pauseKey, 3600, "playing");
                }
            }

            // Audio change tracking (store readable labels with the index)
            if (audioStreamIndex !== undefined && audioStreamIndex !== null) {
                const audioKey = `audio:${activePlayback.id}`;
                const prevRaw = await redis.get(audioKey);
                let prevObj: unknown = null;
                let prevIndex: unknown = null;
                if (prevRaw !== null) {
                    try {
                        prevObj = JSON.parse(prevRaw);
                        if (prevObj && typeof prevObj === 'object' && 'index' in prevObj) {
                            prevIndex = prevObj.index;
                        } else {
                            prevIndex = prevObj;
                        }
                    } catch {
                        // legacy raw string (index)
                        prevIndex = isNaN(Number(prevRaw)) ? prevRaw : Number(prevRaw);
                        prevObj = { index: prevIndex };
                    }
                }

                if (prevRaw !== null && String(prevIndex) !== String(audioStreamIndex)) {
                    updates.audioChanges = { increment: 1 };
                    if (positionMs > 0) {
                        const prevObjRec = prevObj && typeof prevObj === 'object' ? (prevObj as Record<string, unknown>) : null;
                        const prevLanguage = prevObjRec && typeof prevObjRec.language === 'string' ? prevObjRec.language : null;
                        const prevCodec = prevObjRec && typeof prevObjRec.codec === 'string' ? prevObjRec.codec : null;
                        const metadata = {
                            from: { index: prevIndex ?? null, language: prevLanguage, codec: prevCodec },
                            to: { index: audioStreamIndex, language: resolvedAudioLanguage ?? null, codec: resolvedAudioCodec ?? null },
                        };
                        telemetryEvents.push({ eventType: "audio_change", positionMs, metadata: JSON.stringify(metadata) });
                    }
                }

                const toObj = { index: audioStreamIndex, language: resolvedAudioLanguage ?? null, codec: resolvedAudioCodec ?? null };
                await redis.setex(audioKey, 3600, JSON.stringify(toObj));
            }

            // Subtitle change tracking (store readable labels with the index)
            if (subtitleStreamIndex !== undefined && subtitleStreamIndex !== null) {
                const subKey = `sub:${activePlayback.id}`;
                const prevRaw = await redis.get(subKey);
                let prevObj: unknown = null;
                let prevIndex: unknown = null;
                if (prevRaw !== null) {
                    try {
                        prevObj = JSON.parse(prevRaw);
                        if (prevObj && typeof prevObj === 'object' && 'index' in prevObj) {
                            prevIndex = prevObj.index;
                        } else {
                            prevIndex = prevObj;
                        }
                    } catch {
                        prevIndex = isNaN(Number(prevRaw)) ? prevRaw : Number(prevRaw);
                        prevObj = { index: prevIndex };
                    }
                }

                if (prevRaw !== null && String(prevIndex) !== String(subtitleStreamIndex)) {
                    updates.subtitleChanges = { increment: 1 };
                    if (positionMs > 0) {
                        const prevObjRec = prevObj && typeof prevObj === 'object' ? (prevObj as Record<string, unknown>) : null;
                        const prevLanguage = prevObjRec && typeof prevObjRec.language === 'string' ? prevObjRec.language : null;
                        const prevCodec = prevObjRec && typeof prevObjRec.codec === 'string' ? prevObjRec.codec : null;
                        const metadata = {
                            from: { index: prevIndex ?? null, language: prevLanguage, codec: prevCodec },
                            to: { index: subtitleStreamIndex, language: resolvedSubtitleLanguage ?? null, codec: resolvedSubtitleCodec ?? null },
                        };
                        telemetryEvents.push({ eventType: "subtitle_change", positionMs, metadata: JSON.stringify(metadata) });
                    }
                }

                const toObj = { index: subtitleStreamIndex, language: resolvedSubtitleLanguage ?? null, codec: resolvedSubtitleCodec ?? null };
                await redis.setex(subKey, 3600, JSON.stringify(toObj));
            }

            if (Object.keys(updates).length > 0) {
                await prisma.playbackHistory.update({ where: { id: activePlayback.id }, data: updates });
            }
            if (telemetryEvents.length > 0) {
                await prisma.telemetryEvent.createMany({
                    data: telemetryEvents.map((e) => ({ serverId: sourceServer.id, playbackId: activePlayback.id, eventType: e.eventType, positionMs: e.positionMs, metadata: e.metadata || null })),
                });
            }

            // Update ActiveStream position + Redis
            if (sessionId) {
                await (prisma.activeStream as any).upsert({
                    where: { sessionId_serverId: { sessionId, serverId: sourceServer.id } },
                    update: {
                        serverId: sourceServer.id,
                        userId: user.id,
                        mediaId: media.id,
                        playbackId: activePlayback.id,
                        playMethod: resolvedPlayMethod,
                        clientName: resolvedClientName,
                        deviceName: resolvedDeviceName,
                        ipAddress: resolvedIpAddress,
                        country: geoData.country,
                        city: geoData.city,
                        videoCodec: resolvedVideoCodec,
                        audioCodec: resolvedAudioCodec,
                        transcodeFps: resolvedTranscodeFps,
                        bitrate: resolvedBitrate,
                        audioLanguage: resolvedAudioLanguage,
                        subtitleLanguage: resolvedSubtitleLanguage,
                        subtitleCodec: resolvedSubtitleCodec,
                        playbackRate: resolvedPlaybackRate,
                        positionTicks: positionTicks > 0 ? BigInt(positionTicks) : null,
                    },
                    create: {
                        serverId: sourceServer.id,
                        sessionId,
                        userId: user.id,
                        mediaId: media.id,
                        playbackId: activePlayback.id,
                        playMethod: resolvedPlayMethod,
                        clientName: resolvedClientName,
                        deviceName: resolvedDeviceName,
                        ipAddress: resolvedIpAddress,
                        country: geoData.country,
                        city: geoData.city,
                        videoCodec: resolvedVideoCodec,
                        audioCodec: resolvedAudioCodec,
                        transcodeFps: resolvedTranscodeFps,
                        bitrate: resolvedBitrate,
                        audioLanguage: resolvedAudioLanguage,
                        subtitleLanguage: resolvedSubtitleLanguage,
                        subtitleCodec: resolvedSubtitleCodec,
                        playbackRate: resolvedPlaybackRate,
                        positionTicks: positionTicks > 0 ? BigInt(positionTicks) : null,
                    },
                });

                const progressPercent = computeProgressPercent(positionTicks, runTimeTicks > 0 ? runTimeTicks : null);
                const redisKey = buildStreamRedisKey(sourceServer.id, sessionId);
                const cachedStream = await redis.get(redisKey);
                let parsed: Record<string, unknown> = {};
                if (cachedStream) {
                    try {
                        parsed = JSON.parse(cachedStream);
                    } catch {
                        parsed = {};
                    }
                }

                const mediaSubtitle = await buildMediaSubtitle({
                    serverId: sourceServer.id,
                    type: resolvedType,
                    seriesName,
                    seasonName,
                    albumArtist,
                    albumName,
                    artist: media.artist,
                    parentItemId: parentItemId || media.parentId,
                });

                const redisPayload = {
                    ...parsed,
                    sessionId,
                    SessionId: sessionId,
                    serverId: sourceServer.id,
                    sourceServerId: sourceServer.jellyfinServerId,
                    sourceServerName: sourceServer.name,
                    itemId: jellyfinMediaId,
                    ItemId: jellyfinMediaId,
                    parentItemId: parentItemId || null,
                    userId: user.id,
                    UserId: user.id,
                    username: username !== "Unknown" ? username : (parsed.username || parsed.UserName || user.username || user.jellyfinUserId),
                    UserName: username !== "Unknown" ? username : (parsed.UserName || parsed.username || user.username || user.jellyfinUserId),
                    mediaId: media.id,
                    title: media.title || resolvedTitle,
                    ItemName: media.title || resolvedTitle,
                    mediaSubtitle,
                    playMethod: resolvedPlayMethod,
                    PlayMethod: resolvedPlayMethod,
                    isTranscoding: resolvedPlayMethod === "Transcode",
                    IsTranscoding: resolvedPlayMethod === "Transcode",
                    clientName: resolvedClientName,
                    deviceName: resolvedDeviceName,
                    DeviceName: resolvedDeviceName,
                    ipAddress: resolvedIpAddress,
                    country: geoData.country,
                    Country: geoData.country,
                    city: geoData.city,
                    City: geoData.city,
                    positionTicks,
                    playbackPositionTicks: positionTicks,
                    PlaybackPositionTicks: positionTicks,
                    runTimeTicks: runTimeTicks > 0 ? runTimeTicks : null,
                    RunTimeTicks: runTimeTicks > 0 ? runTimeTicks : null,
                    progressPercent,
                    isPaused: hasPausedState ? isPaused : (parsed.isPaused === true || parsed.IsPaused === true),
                    IsPaused: hasPausedState ? isPaused : (parsed.IsPaused === true || parsed.isPaused === true),
                    audioLanguage: resolvedAudioLanguage,
                    AudioLanguage: resolvedAudioLanguage,
                    audioCodec: resolvedAudioCodec,
                    AudioCodec: resolvedAudioCodec,
                    audioStreamIndex: audioStreamIndex ?? parsed?.audioStreamIndex ?? parsed?.AudioStreamIndex ?? null,
                    AudioStreamIndex: audioStreamIndex ?? parsed?.AudioStreamIndex ?? parsed?.audioStreamIndex ?? null,
                    subtitleLanguage: resolvedSubtitleLanguage,
                    SubtitleLanguage: resolvedSubtitleLanguage,
                    subtitleCodec: resolvedSubtitleCodec,
                    SubtitleCodec: resolvedSubtitleCodec,
                    playbackRate: resolvedPlaybackRate,
                    PlaybackRate: resolvedPlaybackRate,
                    subtitleStreamIndex: subtitleStreamIndex ?? parsed?.subtitleStreamIndex ?? parsed?.SubtitleStreamIndex ?? null,
                    SubtitleStreamIndex: subtitleStreamIndex ?? parsed?.SubtitleStreamIndex ?? parsed?.subtitleStreamIndex ?? null,
                };

                await redis.setex(redisKey, 60, JSON.stringify(redisPayload));
            }

            return corsJson({ success: true, message: "PlaybackProgress processed." });
        }

        // ────── LibraryChanged ──────
        if (event === "LibraryChanged") {
            const items = payload.items || payload.Items || [];
            let synced = 0;
            for (const item of items) {
                const jellyfinMediaId = normalizeJellyfinId(item.jellyfinMediaId || item.JellyfinMediaId || item.id || item.Id);
                const title = item.title || item.Title || item.name || item.Name || "Unknown";
                const type = item.type || item.Type || "Unknown";
                if (!jellyfinMediaId) continue;
                const collectionType = item.collectionType || item.CollectionType || inferLibraryKey({ type });
                await upsertCanonicalMedia({
                    serverId: sourceServer.id,
                    rawJellyfinMediaId: jellyfinMediaId,
                    title,
                    type,
                    collectionType,
                    genres: item.genres || item.Genres || [],
                    resolution: (item.resolution || item.Resolution) ? normalizeResolution(item.resolution || item.Resolution) : null,
                    durationMs: item.durationMs != null ? BigInt(item.durationMs) : null,
                    parentId: normalizeJellyfinId(item.parentId || item.ParentId || null),
                    artist: item.artist || item.Artist || null,
                    libraryName: item.libraryName || item.LibraryName || null,
                });
                synced++;
            }
            console.log(`[Plugin] LibraryChanged: ${synced} items synced.`);
            return corsJson({ success: true, message: `${synced} items synced.` });
        }

        return corsJson({ error: `Unknown event: ${event}` }, { status: 400 });
    } catch (error) {
        console.error("[Plugin Events Error]:", error);
        return corsJson({ error: "Internal Server Error" }, { status: 500 });
    }
}
