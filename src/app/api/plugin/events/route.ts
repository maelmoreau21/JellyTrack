import { NextResponse } from "next/server";
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
import { isValidDiscordWebhook, safeFetchWebhook } from "@/lib/webhookValidator";
import { getClientIp } from "@/lib/requestIp";
import { getCachedPluginIngestSettings } from "@/lib/pluginTelemetrySettings";
import {
    buildStreamRedisKey,
    extractServerIdentityFromPayload,
    upsertServerRecord,
} from "@/lib/serverRegistry";

// Helpers & Types from pluginEventHelpers
import {
    CORS_HEADERS,
    ALLOWED_PLUGIN_EVENTS,
    MAX_PLUGIN_EVENT_BYTES,
    MERGE_WINDOW_MS,
    PayloadTooLargeError,
    corsJson,
    verifyPluginAuth,
    extractBearerToken,
    getPluginEventRateLimitIdentifier,
    computeProgressPercent,
    normalizePluginEventName,
    shouldPreferWallClockForFeishinAudio,
    parseObservedAtMs,
    parsePlaybackRate,
    readPlaybackRate,
    formatPlaybackRate,
    buildJumpMetadata,
    inferJumpFromMetadata,
    estimatePlaybackRate,
    resolvePluginSchemaVersion,
    parseFiniteNumber,
    cleanIp,
    upsertCanonicalUser,
    upsertCanonicalMedia,
    buildMediaSubtitle,
    handleMediaDownloadedEvent,
    acquirePlaybackLock,
    mergeOpenPlaybacks,
    finalizePlaybackSession,
    readRequestBodyWithLimit,
    CURRENT_PLUGIN_EVENT_SCHEMA_VERSION,
    MIN_SUPPORTED_PLUGIN_EVENT_SCHEMA_VERSION,
} from "@/lib/pluginEventHelpers";
import type { JellyfinPerson, Studio } from "@/lib/pluginEventHelpers";

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
