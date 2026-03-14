import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import redis from "@/lib/redis";
import { getGeoLocation } from "@/lib/geoip";
import { inferLibraryKey, isLibraryExcluded } from "@/lib/mediaPolicy";
import { compactJellyfinId, normalizeJellyfinId } from "@/lib/jellyfinId";

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key",
};

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
async function verifyPluginAuth(req: Request): Promise<boolean> {
    const settings = await prisma.globalSettings.findUnique({
        where: { id: "global" },
        select: { pluginApiKey: true },
    });
    const configuredKey = settings?.pluginApiKey?.trim();
    if (!configuredKey) return false;

    // Check Authorization header: "Bearer <apiKey>"
    const authHeader = req.headers.get("authorization");
    if (authHeader) {
        const token = authHeader.replace(/^Bearer\s+/i, "").trim();
        if (token === configuredKey) return true;
    }

    // Check X-Api-Key header
    const apiKeyHeader = req.headers.get("x-api-key");
    if (apiKeyHeader?.trim() === configuredKey) return true;

    return false;
}

function cleanIp(ip: string | null | undefined): string {
    if (!ip) return "Unknown";
    let cleaned = ip.trim();
    if (cleaned.includes("::ffff:")) cleaned = cleaned.split("::ffff:")[1];
    else if (cleaned.includes(":") && !cleaned.includes("::")) cleaned = cleaned.split(":")[0];
    return cleaned;
}

function computeProgressPercent(positionTicks: number, runTimeTicks: number | null): number {
    if (!runTimeTicks || runTimeTicks <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((positionTicks / runTimeTicks) * 100)));
}

async function upsertCanonicalUser(rawJellyfinUserId: unknown, rawUsername: unknown) {
    const jellyfinUserId = normalizeJellyfinId(rawJellyfinUserId);
    if (!jellyfinUserId) return null;

    const compactId = compactJellyfinId(jellyfinUserId);
    const candidates = Array.from(new Set([jellyfinUserId, compactId]));
    const username = typeof rawUsername === "string" && rawUsername.trim() && rawUsername !== "Unknown"
        ? rawUsername.trim()
        : null;

    return prisma.$transaction(async (tx) => {
        const matches = await tx.user.findMany({
            where: { jellyfinUserId: { in: candidates } },
            orderBy: { createdAt: "asc" },
        });

        let primary = matches.find((u) => u.jellyfinUserId === jellyfinUserId) || matches[0] || null;

        if (!primary) {
            primary = await tx.user.create({
                data: {
                    jellyfinUserId,
                    username: username || jellyfinUserId,
                },
            });
        } else {
            const updates: { jellyfinUserId?: string; username?: string } = {};
            if (primary.jellyfinUserId !== jellyfinUserId) updates.jellyfinUserId = jellyfinUserId;
            if (username && username !== primary.username) updates.username = username;
            if (Object.keys(updates).length > 0) {
                primary = await tx.user.update({ where: { id: primary.id }, data: updates });
            }
        }

        const duplicates = matches.filter((u) => u.id !== primary!.id);
        for (const duplicate of duplicates) {
            await tx.playbackHistory.updateMany({ where: { userId: duplicate.id }, data: { userId: primary!.id } });
            await tx.activeStream.updateMany({ where: { userId: duplicate.id }, data: { userId: primary!.id } });
            await tx.user.delete({ where: { id: duplicate.id } });
            console.warn("[Plugin] User merged after ID normalization", {
                kept: primary!.jellyfinUserId,
                removed: duplicate.jellyfinUserId,
            });
        }

        return primary;
    });
}

async function upsertCanonicalMedia(input: {
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
}) {
    const jellyfinMediaId = normalizeJellyfinId(input.rawJellyfinMediaId);
    if (!jellyfinMediaId) return null;

    const compactId = compactJellyfinId(jellyfinMediaId);
    const candidates = Array.from(new Set([jellyfinMediaId, compactId]));

    return prisma.$transaction(async (tx) => {
        const matches = await tx.media.findMany({
            where: { jellyfinMediaId: { in: candidates } },
            orderBy: { createdAt: "asc" },
        });

        let primary = matches.find((m) => m.jellyfinMediaId === jellyfinMediaId) || matches[0] || null;

        if (!primary) {
            primary = await tx.media.create({
                data: {
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
                },
            });
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
                },
            });
        }

        const duplicates = matches.filter((m) => m.id !== primary!.id);
        for (const duplicate of duplicates) {
            await tx.playbackHistory.updateMany({ where: { mediaId: duplicate.id }, data: { mediaId: primary!.id } });
            await tx.activeStream.updateMany({ where: { mediaId: duplicate.id }, data: { mediaId: primary!.id } });
            await tx.media.delete({ where: { id: duplicate.id } });
            console.warn("[Plugin] Media merged after ID normalization", {
                kept: primary!.jellyfinMediaId,
                removed: duplicate.jellyfinMediaId,
            });
        }

        return primary;
    });
}

async function buildMediaSubtitle(input: {
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

    const parent = await prisma.media.findUnique({
        where: { jellyfinMediaId: input.parentItemId },
        select: { title: true, parentId: true, artist: true },
    });

    if (!parent) return null;

    if (input.type === "Audio" || input.type === "Track") {
        const artist = directArtist || parent.artist;
        if (artist) return `${artist} — ${parent.title}`;
        return parent.title;
    }

    if (input.type === "Episode" && parent.parentId) {
        const grandparent = await prisma.media.findUnique({
            where: { jellyfinMediaId: parent.parentId },
            select: { title: true },
        });
        if (grandparent?.title) return `${grandparent.title} — ${parent.title}`;
    }

    return parent.title;
}

function corsJson(body: unknown, init?: { status?: number }) {
    return NextResponse.json(body, { ...init, headers: CORS_HEADERS });
}

// ────────────────────────────────────────────────────
// POST /api/plugin/events — Receive events from the Jellyfin Plugin
// ────────────────────────────────────────────────────
export async function POST(req: Request) {
    if (!(await verifyPluginAuth(req))) {
        return corsJson({ error: "Unauthorized — invalid or missing API key." }, { status: 401 });
    }

    try {
        const payload = await req.json();
        const event = payload.event || payload.Event;

        if (!event) {
            return corsJson({ error: "Missing 'event' field." }, { status: 400 });
        }

        // Keep connection status fresh even if the plugin sends few heartbeats.
        if (event !== "Heartbeat" && event !== "PlaybackProgress") {
            await prisma.globalSettings.upsert({
                where: { id: "global" },
                update: { pluginLastSeen: new Date() },
                create: { id: "global", pluginLastSeen: new Date() },
            });
        }

        console.log(`[Plugin] Event received: ${event}`);

        // ────── Heartbeat ──────
        if (event === "Heartbeat") {
            await prisma.globalSettings.upsert({
                where: { id: "global" },
                update: {
                    pluginLastSeen: new Date(),
                    pluginVersion: payload.pluginVersion || payload.PluginVersion || null,
                    pluginServerName: payload.serverName || payload.ServerName || null,
                },
                create: {
                    id: "global",
                    pluginLastSeen: new Date(),
                    pluginVersion: payload.pluginVersion || payload.PluginVersion || null,
                    pluginServerName: payload.serverName || payload.ServerName || null,
                },
            });

            // Sync users from heartbeat payload
            const users = payload.users || payload.Users || [];
            let syncedUsers = 0;
            for (const u of users) {
                const jellyfinUserId = normalizeJellyfinId(u.jellyfinUserId || u.JellyfinUserId || u.id || u.Id);
                const username = u.username || u.Username || u.name || u.Name;
                if (!jellyfinUserId || !username) continue;
                await upsertCanonicalUser(jellyfinUserId, username);
                syncedUsers++;
            }

            return corsJson({ success: true, message: `Heartbeat OK, ${syncedUsers} users synced.` });
        }

        // ────── PlaybackStart ──────
        if (event === "PlaybackStart") {
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
            const dbUser = await upsertCanonicalUser(jellyfinUserId, username);
            const collectionType = media.collectionType || media.CollectionType || inferLibraryKey({ type });
            const dbMedia = await upsertCanonicalMedia({
                rawJellyfinMediaId: jellyfinMediaId,
                title,
                type,
                collectionType,
                genres: media.genres || media.Genres || [],
                resolution: media.resolution || media.Resolution || null,
                durationMs: media.durationMs != null ? BigInt(media.durationMs) : null,
                parentId: parentItemId,
                artist: media.artist || media.Artist || media.albumArtist || media.AlbumArtist || null,
                libraryName: media.libraryName || media.LibraryName || null,
            });

            // Library exclusion check
            const settings = await prisma.globalSettings.findUnique({
                where: { id: "global" },
                select: { excludedLibraries: true, discordAlertsEnabled: true, discordWebhookUrl: true, discordAlertCondition: true },
            });
            if (isLibraryExcluded({ collectionType, type }, settings?.excludedLibraries || [])) {
                console.log("[Plugin] PlaybackStart ignored due excluded library", {
                    jellyfinUserId,
                    jellyfinMediaId,
                    collectionType: collectionType || null,
                    type,
                });
                return corsJson({ success: true, ignored: true, message: "Library excluded." });
            }

            // GeoIP
            const geoData = getGeoLocation(ipAddress);

            if (dbUser && dbMedia) {
                const existingOpen = await prisma.playbackHistory.findFirst({
                    where: { userId: dbUser.id, mediaId: dbMedia.id, endedAt: null },
                });
                if (!existingOpen) {
                    await prisma.playbackHistory.create({
                        data: {
                            userId: dbUser.id,
                            mediaId: dbMedia.id,
                            playMethod,
                            clientName,
                            deviceName,
                            ipAddress,
                            country: geoData.country,
                            city: geoData.city,
                            audioLanguage: session.audioLanguage || session.AudioLanguage || null,
                            audioCodec: session.audioCodec || session.AudioCodec || null,
                            subtitleLanguage: session.subtitleLanguage || session.SubtitleLanguage || null,
                            subtitleCodec: session.subtitleCodec || session.SubtitleCodec || null,
                        },
                    });
                    console.log(`[Plugin] PlaybackStart: Created session for ${title}`);
                }
            }

            // ActiveStream upsert (session tracking)
            const sessionId = session.sessionId || session.SessionId;
            if (sessionId && dbUser && dbMedia) {
                const runTimeTicks = media.durationMs ? Number(media.durationMs) * 10_000 : null;
                const playbackPositionTicks = Number(session.positionTicks || 0);
                const progressPercent = computeProgressPercent(playbackPositionTicks, runTimeTicks);
                const mediaSubtitle = await buildMediaSubtitle({
                    type,
                    seriesName: media.seriesName || media.SeriesName || null,
                    seasonName: media.seasonName || media.SeasonName || null,
                    albumArtist: media.albumArtist || media.AlbumArtist || null,
                    albumName: media.albumName || media.AlbumName || null,
                    artist: media.artist || media.Artist || null,
                    parentItemId,
                });
                await prisma.activeStream.upsert({
                    where: { sessionId },
                    update: {
                        userId: dbUser.id,
                        mediaId: dbMedia.id,
                        playMethod,
                        clientName,
                        deviceName,
                        ipAddress,
                        country: geoData.country,
                        city: geoData.city,
                        videoCodec: session.videoCodec || session.VideoCodec || null,
                        audioCodec: session.audioCodec || session.AudioCodec || null,
                        transcodeFps: session.transcodeFps ?? session.TranscodeFps ?? null,
                        bitrate: session.bitrate ?? session.Bitrate ?? null,
                        audioLanguage: session.audioLanguage || session.AudioLanguage || null,
                        subtitleLanguage: session.subtitleLanguage || session.SubtitleLanguage || null,
                        subtitleCodec: session.subtitleCodec || session.SubtitleCodec || null,
                        positionTicks: session.positionTicks != null ? BigInt(session.positionTicks) : null,
                    },
                    create: {
                        sessionId,
                        userId: dbUser.id,
                        mediaId: dbMedia.id,
                        playMethod,
                        clientName,
                        deviceName,
                        ipAddress,
                        country: geoData.country,
                        city: geoData.city,
                        videoCodec: session.videoCodec || session.VideoCodec || null,
                        audioCodec: session.audioCodec || session.AudioCodec || null,
                        transcodeFps: session.transcodeFps ?? session.TranscodeFps ?? null,
                        bitrate: session.bitrate ?? session.Bitrate ?? null,
                        audioLanguage: session.audioLanguage || session.AudioLanguage || null,
                        subtitleLanguage: session.subtitleLanguage || session.SubtitleLanguage || null,
                        subtitleCodec: session.subtitleCodec || session.SubtitleCodec || null,
                        positionTicks: session.positionTicks != null ? BigInt(session.positionTicks) : null,
                    },
                });

                // Redis live stream data
                const redisPayload = JSON.stringify({
                    sessionId,
                    SessionId: sessionId,
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
                    subtitleStreamIndex: session.subtitleStreamIndex ?? session.SubtitleStreamIndex ?? null,
                    SubtitleStreamIndex: session.subtitleStreamIndex ?? session.SubtitleStreamIndex ?? null,
                });
                await redis.setex(`stream:${sessionId}`, 60, redisPayload);
            }

            // Discord notification
            try {
                if (settings?.discordAlertsEnabled && settings?.discordWebhookUrl) {
                    const condition = settings.discordAlertCondition || "ALL";
                    let shouldSend = true;
                    if (condition === "TRANSCODE_ONLY") {
                        shouldSend = playMethod === "Transcode";
                    } else if (condition === "NEW_IP_ONLY") {
                        if (dbUser) {
                            const pastCount = await prisma.playbackHistory.count({
                                where: { userId: dbUser.id, ipAddress },
                            });
                            shouldSend = pastCount === 0;
                        }
                    }
                    if (shouldSend) {
                        const fallbackPort = process.env.PORT || "3000";
                        const appUrl = process.env.NEXTAUTH_URL || `http://localhost:${fallbackPort}`;
                        const posterUrl = `${appUrl}/api/jellyfin/image?itemId=${jellyfinMediaId}&type=Primary`;
                        await fetch(settings.discordWebhookUrl, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                embeds: [{
                                    title: `\uD83C\uDFAC Now Playing: ${title}`,
                                    color: 10181046,
                                    fields: [
                                        { name: "\uD83D\uDC64 User", value: username, inline: true },
                                        { name: "\uD83D\uDCF1 Device", value: `${clientName} (${deviceName})`, inline: true },
                                        { name: "\uD83C\uDF0D Location", value: geoData.country !== "Unknown" ? `${geoData.city}, ${geoData.country}` : "Unknown", inline: true },
                                    ],
                                    thumbnail: { url: posterUrl },
                                    timestamp: new Date().toISOString(),
                                }],
                            }),
                        });
                    }
                }
            } catch (err) {
                console.error("[Plugin] Discord notification error:", err);
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
            const mediaCandidates = jellyfinMediaId ? Array.from(new Set([jellyfinMediaId, compactJellyfinId(jellyfinMediaId)])) : [];
            const user = userCandidates.length > 0
                ? await prisma.user.findFirst({ where: { jellyfinUserId: { in: userCandidates } }, orderBy: { createdAt: "asc" } })
                : null;
            const media = mediaCandidates.length > 0
                ? await prisma.media.findFirst({ where: { jellyfinMediaId: { in: mediaCandidates } }, orderBy: { createdAt: "asc" } })
                : null;

            if (user && media) {
                const lastPlayback = await prisma.playbackHistory.findFirst({
                    where: { userId: user.id, mediaId: media.id, endedAt: null },
                    orderBy: { startedAt: "desc" },
                });

                if (lastPlayback) {
                    const endedAt = new Date();
                    const wallClockS = Math.floor((endedAt.getTime() - lastPlayback.startedAt.getTime()) / 1000);
                    let durationS: number;
                    if (positionTicks > 0) {
                        const positionS = Math.floor(positionTicks / 10_000_000);
                        durationS = Math.min(wallClockS, positionS);
                    } else {
                        durationS = wallClockS;
                    }
                    durationS = Math.max(0, Math.min(durationS, 86400));
                    await prisma.playbackHistory.update({
                        where: { id: lastPlayback.id },
                        data: { endedAt, durationWatched: durationS },
                    });

                    // Telemetry stop event
                    const stopPositionMs = positionTicks > 0 ? BigInt(Math.floor(positionTicks / 10_000)) : BigInt(0);
                    if (stopPositionMs > 0) {
                        await prisma.telemetryEvent.create({
                            data: { playbackId: lastPlayback.id, eventType: "stop", positionMs: stopPositionMs },
                        });
                    }

                    // Clean Redis telemetry keys
                    await redis.del(`pause:${lastPlayback.id}`);
                    await redis.del(`audio:${lastPlayback.id}`);
                    await redis.del(`sub:${lastPlayback.id}`);

                    console.log(`[Plugin] PlaybackStop: Session ${lastPlayback.id} closed, duration=${durationS}s`);
                }

                // Cleanup ActiveStream + Redis
                if (sessionId) {
                    const activeStream = await prisma.activeStream.findUnique({ where: { sessionId } });
                    if (activeStream) {
                        await redis.del(`stream:${sessionId}`);
                        await prisma.activeStream.delete({ where: { id: activeStream.id } });
                    }
                } else {
                    const activeStream = await prisma.activeStream.findFirst({ where: { userId: user.id, mediaId: media.id } });
                    if (activeStream) {
                        await redis.del(`stream:${activeStream.sessionId}`);
                        await prisma.activeStream.delete({ where: { id: activeStream.id } });
                    }
                }
            }

            return corsJson({ success: true, message: "PlaybackStop processed." });
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
                where: { jellyfinMediaId: { in: mediaCandidates } },
                orderBy: { createdAt: "asc" },
                select: { title: true, type: true, collectionType: true, durationMs: true, artist: true, libraryName: true, parentId: true },
            });
            const existingStream = sessionId
                ? await prisma.activeStream.findUnique({
                    where: { sessionId },
                    select: {
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
                    },
                })
                : null;

            const resolvedTitle = title !== "Unknown"
                ? title
                : (existingMedia?.title || `Media ${String(jellyfinMediaId).slice(0, 8)}`);
            const resolvedType = type !== "Unknown" ? type : (existingMedia?.type || "Unknown");
            const resolvedCollectionType = collectionType || existingMedia?.collectionType || inferLibraryKey({ type: resolvedType });
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

            const settings = await prisma.globalSettings.findUnique({
                where: { id: "global" },
                select: { excludedLibraries: true },
            });
            if (isLibraryExcluded({ collectionType: resolvedCollectionType, type: resolvedType }, settings?.excludedLibraries || [])) {
                console.log("[Plugin] PlaybackProgress ignored due excluded library", {
                    jellyfinUserId,
                    jellyfinMediaId,
                    collectionType: resolvedCollectionType || null,
                    type: resolvedType,
                    sessionId: sessionId || null,
                });
                return corsJson({ success: true, ignored: true, message: "Library excluded." });
            }

            const user = await upsertCanonicalUser(jellyfinUserId, username);
            const media = await upsertCanonicalMedia({
                rawJellyfinMediaId: jellyfinMediaId,
                title: resolvedTitle,
                type: resolvedType,
                collectionType: resolvedCollectionType,
                genres: mediaPayload.genres || mediaPayload.Genres || [],
                resolution: mediaPayload.resolution || mediaPayload.Resolution || null,
                durationMs: Number.isFinite(mediaDurationMs) && mediaDurationMs > 0 ? BigInt(mediaDurationMs) : null,
                parentId: parentItemId || existingMedia?.parentId || null,
                artist: mediaPayload.artist || mediaPayload.Artist || albumArtist || existingMedia?.artist || null,
                libraryName: mediaPayload.libraryName || mediaPayload.LibraryName || existingMedia?.libraryName || null,
            });

            if (!user || !media) {
                return corsJson({ error: "Unable to resolve canonical user/media." }, { status: 400 });
            }

            if (runTimeTicks <= 0 && media.durationMs) {
                runTimeTicks = Number(media.durationMs) * 10_000;
            }

            const geoData = getGeoLocation(resolvedIpAddress);

            const lastPlayback = await prisma.playbackHistory.findFirst({
                where: { userId: user.id, mediaId: media.id, endedAt: null },
                orderBy: { startedAt: "desc" },
            });

            const activePlayback = lastPlayback ?? await prisma.playbackHistory.create({
                data: {
                    userId: user.id,
                    mediaId: media.id,
                    playMethod: resolvedPlayMethod,
                    clientName: resolvedClientName,
                    deviceName: resolvedDeviceName,
                    ipAddress: resolvedIpAddress,
                    country: geoData.country,
                    city: geoData.city,
                    audioLanguage: resolvedAudioLanguage,
                    audioCodec: resolvedAudioCodec,
                    subtitleLanguage: resolvedSubtitleLanguage,
                    subtitleCodec: resolvedSubtitleCodec,
                },
            });

            if (!lastPlayback) {
                console.log("[Plugin] PlaybackProgress bootstrap: created session because PlaybackStart was missing", {
                    jellyfinUserId,
                    jellyfinMediaId,
                    sessionId: sessionId || null,
                });
            }

            const updates: Record<string, any> = {};
            const telemetryEvents: { eventType: string; positionMs: bigint; metadata?: string }[] = [];

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

            // Audio change tracking
            if (audioStreamIndex !== undefined && audioStreamIndex !== null) {
                const audioKey = `audio:${activePlayback.id}`;
                const prevAudio = await redis.get(audioKey);
                if (prevAudio !== null && prevAudio !== String(audioStreamIndex)) {
                    updates.audioChanges = { increment: 1 };
                    if (positionMs > 0) telemetryEvents.push({ eventType: "audio_change", positionMs, metadata: JSON.stringify({ from: prevAudio, to: String(audioStreamIndex) }) });
                }
                await redis.setex(audioKey, 3600, String(audioStreamIndex));
            }

            // Subtitle change tracking
            if (subtitleStreamIndex !== undefined && subtitleStreamIndex !== null) {
                const subKey = `sub:${activePlayback.id}`;
                const prevSub = await redis.get(subKey);
                if (prevSub !== null && prevSub !== String(subtitleStreamIndex)) {
                    updates.subtitleChanges = { increment: 1 };
                    if (positionMs > 0) telemetryEvents.push({ eventType: "subtitle_change", positionMs, metadata: JSON.stringify({ from: prevSub, to: String(subtitleStreamIndex) }) });
                }
                await redis.setex(subKey, 3600, String(subtitleStreamIndex));
            }

            if (Object.keys(updates).length > 0) {
                await prisma.playbackHistory.update({ where: { id: activePlayback.id }, data: updates });
            }
            if (telemetryEvents.length > 0) {
                await prisma.telemetryEvent.createMany({
                    data: telemetryEvents.map((e) => ({ playbackId: activePlayback.id, eventType: e.eventType, positionMs: e.positionMs, metadata: e.metadata || null })),
                });
            }

            // Update ActiveStream position + Redis
            if (sessionId) {
                await prisma.activeStream.upsert({
                    where: { sessionId },
                    update: {
                        userId: user.id,
                        mediaId: media.id,
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
                        positionTicks: positionTicks > 0 ? BigInt(positionTicks) : null,
                    },
                    create: {
                        sessionId,
                        userId: user.id,
                        mediaId: media.id,
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
                        positionTicks: positionTicks > 0 ? BigInt(positionTicks) : null,
                    },
                });

                const progressPercent = computeProgressPercent(positionTicks, runTimeTicks > 0 ? runTimeTicks : null);
                const redisKey = `stream:${sessionId}`;
                const cachedStream = await redis.get(redisKey);
                let parsed: any = {};
                if (cachedStream) {
                    try {
                        parsed = JSON.parse(cachedStream);
                    } catch {
                        parsed = {};
                    }
                }

                const mediaSubtitle = await buildMediaSubtitle({
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
                    rawJellyfinMediaId: jellyfinMediaId,
                    title,
                    type,
                    collectionType,
                    genres: item.genres || item.Genres || [],
                    resolution: item.resolution || item.Resolution || null,
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
