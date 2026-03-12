import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import redis from "@/lib/redis";
import { getGeoLocation } from "@/lib/geoip";
import { inferLibraryKey, isLibraryExcluded } from "@/lib/mediaPolicy";

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key",
};

// Handle CORS preflight
export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
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

const MERGE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

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
                const jellyfinUserId = u.jellyfinUserId || u.JellyfinUserId || u.id || u.Id;
                const username = u.username || u.Username || u.name || u.Name;
                if (!jellyfinUserId || !username) continue;
                await prisma.user.upsert({
                    where: { jellyfinUserId },
                    update: { username },
                    create: { jellyfinUserId, username },
                });
                syncedUsers++;
            }

            return corsJson({ success: true, message: `Heartbeat OK, ${syncedUsers} users synced.` });
        }

        // ────── PlaybackStart ──────
        if (event === "PlaybackStart") {
            const user = payload.user || payload.User || {};
            const media = payload.media || payload.Media || {};
            const session = payload.session || payload.Session || {};

            const jellyfinUserId = user.jellyfinUserId || user.JellyfinUserId || user.id || user.Id;
            const username = user.username || user.Username || user.name || user.Name || "Unknown";
            const jellyfinMediaId = media.jellyfinMediaId || media.JellyfinMediaId || media.id || media.Id;
            const title = media.title || media.Title || media.name || media.Name || "Unknown";
            const type = media.type || media.Type || "Unknown";
            const clientName = session.clientName || session.ClientName || "Unknown";
            const deviceName = session.deviceName || session.DeviceName || "Unknown";
            const playMethod = session.playMethod || session.PlayMethod || "Unknown";
            const ipAddress = cleanIp(session.ipAddress || session.IpAddress || null);

            if (!jellyfinUserId || !jellyfinMediaId) {
                return corsJson({ error: "Missing userId or mediaId." }, { status: 400 });
            }

            // Upsert user
            await prisma.user.upsert({
                where: { jellyfinUserId },
                update: { username },
                create: { jellyfinUserId, username },
            });

            // Upsert media with all rich data from the plugin
            const collectionType = media.collectionType || media.CollectionType || inferLibraryKey({ type });
            await prisma.media.upsert({
                where: { jellyfinMediaId },
                update: {
                    title,
                    type,
                    collectionType: collectionType || undefined,
                    genres: media.genres || media.Genres || undefined,
                    resolution: media.resolution || media.Resolution || undefined,
                    durationMs: media.durationMs != null ? BigInt(media.durationMs) : undefined,
                    parentId: media.parentId || media.ParentId || undefined,
                    artist: media.artist || media.Artist || media.albumArtist || media.AlbumArtist || undefined,
                    libraryName: media.libraryName || media.LibraryName || undefined,
                },
                create: {
                    jellyfinMediaId,
                    title,
                    type,
                    collectionType,
                    genres: media.genres || media.Genres || [],
                    resolution: media.resolution || media.Resolution || null,
                    durationMs: media.durationMs != null ? BigInt(media.durationMs) : null,
                    parentId: media.parentId || media.ParentId || null,
                    artist: media.artist || media.Artist || media.albumArtist || media.AlbumArtist || null,
                    libraryName: media.libraryName || media.LibraryName || null,
                },
            });

            // Library exclusion check
            const settings = await prisma.globalSettings.findUnique({
                where: { id: "global" },
                select: { excludedLibraries: true, discordAlertsEnabled: true, discordWebhookUrl: true, discordAlertCondition: true },
            });
            if (isLibraryExcluded({ collectionType, type }, settings?.excludedLibraries || [])) {
                return corsJson({ success: true, ignored: true, message: "Library excluded." });
            }

            // GeoIP
            const geoData = getGeoLocation(ipAddress);

            // Dedup: reuse open or recently-closed session
            const dbUser = await prisma.user.findUnique({ where: { jellyfinUserId } });
            const dbMedia = await prisma.media.findUnique({ where: { jellyfinMediaId } });
            if (dbUser && dbMedia) {
                const existingOpen = await prisma.playbackHistory.findFirst({
                    where: { userId: dbUser.id, mediaId: dbMedia.id, endedAt: null },
                });
                if (!existingOpen) {
                    const mergeWindow = new Date(Date.now() - MERGE_WINDOW_MS);
                    const recentClosed = await prisma.playbackHistory.findFirst({
                        where: { userId: dbUser.id, mediaId: dbMedia.id, endedAt: { not: null, gte: mergeWindow } },
                        orderBy: { endedAt: "desc" },
                    });
                    if (recentClosed) {
                        await prisma.playbackHistory.update({
                            where: { id: recentClosed.id },
                            data: { endedAt: null },
                        });
                        console.log(`[Plugin] Merged session for ${title} (reopened ${recentClosed.id})`);
                    } else {
                        await prisma.playbackHistory.create({
                            data: {
                                user: { connect: { jellyfinUserId } },
                                media: { connect: { jellyfinMediaId } },
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
            }

            // ActiveStream upsert (session tracking)
            const sessionId = session.sessionId || session.SessionId;
            if (sessionId && dbUser && dbMedia) {
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
                    userId: dbUser.id,
                    mediaId: dbMedia.id,
                    title,
                    username,
                    clientName,
                    deviceName,
                    playMethod,
                    ipAddress,
                    positionTicks: session.positionTicks || 0,
                    mediaSubtitle: media.seriesName ? `${media.seriesName} — ${media.seasonName || ""}` : media.albumArtist ? `${media.albumArtist} — ${media.albumName || ""}` : null,
                    progressPercent: session.positionTicks && media.durationMs ? Math.min(100, Math.round(Number(session.positionTicks) / (Number(media.durationMs) * 10_000) * 100)) : 0,
                    isPaused: false,
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
                        const pastCount = await prisma.playbackHistory.count({
                            where: { user: { jellyfinUserId }, ipAddress },
                        });
                        shouldSend = pastCount === 0;
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
            const jellyfinUserId = userPayload.jellyfinUserId || userPayload.JellyfinUserId || userPayload.id || payload.userId;
            const jellyfinMediaId = mediaPayload.jellyfinMediaId || mediaPayload.JellyfinMediaId || mediaPayload.id || payload.mediaId;
            const positionTicks = payload.positionTicks || payload.PositionTicks || 0;
            const sessionId = payload.sessionId || payload.SessionId;

            if (!jellyfinUserId || !jellyfinMediaId) {
                return corsJson({ error: "Missing userId or mediaId." }, { status: 400 });
            }

            const user = await prisma.user.findUnique({ where: { jellyfinUserId } });
            const media = await prisma.media.findUnique({ where: { jellyfinMediaId } });

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
            const jellyfinUserId = userPayload.jellyfinUserId || userPayload.JellyfinUserId || userPayload.id || payload.userId;
            const jellyfinMediaId = mediaPayload.jellyfinMediaId || mediaPayload.JellyfinMediaId || mediaPayload.id || payload.mediaId;
            const isPaused = payload.isPaused === true || payload.IsPaused === true;
            const audioStreamIndex = payload.audioStreamIndex ?? payload.AudioStreamIndex;
            const subtitleStreamIndex = payload.subtitleStreamIndex ?? payload.SubtitleStreamIndex;
            const positionTicks = payload.positionTicks || payload.PositionTicks || 0;
            const positionMs = positionTicks > 0 ? BigInt(Math.floor(positionTicks / 10_000)) : BigInt(0);
            const sessionId = payload.sessionId || payload.SessionId;

            if (!jellyfinUserId || !jellyfinMediaId) {
                return corsJson({ error: "Missing userId or mediaId." }, { status: 400 });
            }

            const user = await prisma.user.findUnique({ where: { jellyfinUserId } });
            const media = await prisma.media.findUnique({ where: { jellyfinMediaId } });

            if (user && media) {
                const lastPlayback = await prisma.playbackHistory.findFirst({
                    where: { userId: user.id, mediaId: media.id, endedAt: null },
                    orderBy: { startedAt: "desc" },
                });

                if (lastPlayback) {
                    const updates: Record<string, any> = {};
                    const telemetryEvents: { eventType: string; positionMs: bigint; metadata?: string }[] = [];

                    // Pause tracking
                    const pauseKey = `pause:${lastPlayback.id}`;
                    const prevPauseState = await redis.get(pauseKey);
                    if (isPaused && prevPauseState !== "paused") {
                        updates.pauseCount = { increment: 1 };
                        await redis.setex(pauseKey, 3600, "paused");
                        if (positionMs > 0) telemetryEvents.push({ eventType: "pause", positionMs });
                    } else if (!isPaused && prevPauseState === "paused") {
                        await redis.setex(pauseKey, 3600, "playing");
                    }

                    // Audio change tracking
                    if (audioStreamIndex !== undefined && audioStreamIndex !== null) {
                        const audioKey = `audio:${lastPlayback.id}`;
                        const prevAudio = await redis.get(audioKey);
                        if (prevAudio !== null && prevAudio !== String(audioStreamIndex)) {
                            updates.audioChanges = { increment: 1 };
                            if (positionMs > 0) telemetryEvents.push({ eventType: "audio_change", positionMs, metadata: JSON.stringify({ from: prevAudio, to: String(audioStreamIndex) }) });
                        }
                        await redis.setex(audioKey, 3600, String(audioStreamIndex));
                    }

                    // Subtitle change tracking
                    if (subtitleStreamIndex !== undefined && subtitleStreamIndex !== null) {
                        const subKey = `sub:${lastPlayback.id}`;
                        const prevSub = await redis.get(subKey);
                        if (prevSub !== null && prevSub !== String(subtitleStreamIndex)) {
                            updates.subtitleChanges = { increment: 1 };
                            if (positionMs > 0) telemetryEvents.push({ eventType: "subtitle_change", positionMs, metadata: JSON.stringify({ from: prevSub, to: String(subtitleStreamIndex) }) });
                        }
                        await redis.setex(subKey, 3600, String(subtitleStreamIndex));
                    }

                    if (Object.keys(updates).length > 0) {
                        await prisma.playbackHistory.update({ where: { id: lastPlayback.id }, data: updates });
                    }
                    if (telemetryEvents.length > 0) {
                        await prisma.telemetryEvent.createMany({
                            data: telemetryEvents.map((e) => ({ playbackId: lastPlayback.id, eventType: e.eventType, positionMs: e.positionMs, metadata: e.metadata || null })),
                        });
                    }
                }

                // Update ActiveStream position + Redis
                if (sessionId) {
                    await prisma.activeStream.updateMany({
                        where: { sessionId },
                        data: { positionTicks: positionTicks > 0 ? BigInt(positionTicks) : undefined },
                    });
                    const cachedStream = await redis.get(`stream:${sessionId}`);
                    if (cachedStream) {
                        try {
                            const parsed = JSON.parse(cachedStream);
                            parsed.positionTicks = positionTicks;
                            parsed.isPaused = isPaused;
                            if (media.durationMs) {
                                parsed.progressPercent = Math.min(100, Math.round(positionTicks / (Number(media.durationMs) * 10_000) * 100));
                            }
                            await redis.setex(`stream:${sessionId}`, 60, JSON.stringify(parsed));
                        } catch { /* ignore parse errors */ }
                    }
                }
            }

            return corsJson({ success: true, message: "PlaybackProgress processed." });
        }

        // ────── LibraryChanged ──────
        if (event === "LibraryChanged") {
            const items = payload.items || payload.Items || [];
            let synced = 0;
            for (const item of items) {
                const jellyfinMediaId = item.jellyfinMediaId || item.JellyfinMediaId || item.id || item.Id;
                const title = item.title || item.Title || item.name || item.Name || "Unknown";
                const type = item.type || item.Type || "Unknown";
                if (!jellyfinMediaId) continue;
                const collectionType = item.collectionType || item.CollectionType || inferLibraryKey({ type });
                await prisma.media.upsert({
                    where: { jellyfinMediaId },
                    update: {
                        title,
                        type,
                        collectionType: collectionType || undefined,
                        genres: item.genres || item.Genres || undefined,
                        resolution: item.resolution || item.Resolution || undefined,
                        durationMs: item.durationMs != null ? BigInt(item.durationMs) : undefined,
                        parentId: item.parentId || item.ParentId || undefined,
                        artist: item.artist || item.Artist || undefined,
                        libraryName: item.libraryName || item.LibraryName || undefined,
                    },
                    create: {
                        jellyfinMediaId,
                        title,
                        type,
                        collectionType,
                        genres: item.genres || item.Genres || [],
                        resolution: item.resolution || item.Resolution || null,
                        durationMs: item.durationMs != null ? BigInt(item.durationMs) : null,
                        parentId: item.parentId || item.ParentId || null,
                        artist: item.artist || item.Artist || null,
                        libraryName: item.libraryName || item.LibraryName || null,
                    },
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
