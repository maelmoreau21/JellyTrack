import prisma from "@/lib/prisma";
import redis from "@/lib/redis";
import { getGeoLocation } from "@/lib/geoip";

let isMonitoringStarted = false;
let monitorTimeoutId: ReturnType<typeof setTimeout> | null = null;
let pollIntervalActive = 1000;   // 1s when sessions are active (mutable, configurable via settings)
let pollIntervalIdle   = 5000;   // 5s when idle (mutable, configurable via settings)
const POLL_INTERVAL_ERROR  = 30000;  // 30s backoff when Jellyfin is unreachable
let consecutiveErrors = 0;

/** Update monitor polling intervals at runtime (called from settings API) */
export function updateMonitorIntervals(active: number, idle: number) {
    pollIntervalActive = Math.max(500, active);
    pollIntervalIdle = Math.max(1000, idle);
    console.log(`[Monitor] Intervalles mis à jour: actif=${pollIntervalActive}ms, veille=${pollIntervalIdle}ms`);
}

/** Get current monitor intervals */
export function getMonitorIntervals() {
    return { active: pollIntervalActive, idle: pollIntervalIdle };
}

// Format IP Address (Jellyfin returns IPv6 or with port like "192.168.1.1:8096")
// We keep the raw IP (no more masking local IPs) for full visibility.
function cleanIpAddress(ip: string | undefined | null) {
    if (!ip) return "Unknown";
    let cleaned = ip.trim();
    // Strip IPv6-mapped prefix (::ffff:192.168.1.1)
    if (cleaned.includes("::ffff:")) cleaned = cleaned.split("::ffff:")[1];
    // Strip port for plain IPv4 (e.g. 192.168.1.1:8096)
    else if (cleaned.includes(":") && !cleaned.includes("::")) cleaned = cleaned.split(":")[0];
    return cleaned;
}

export async function startMonitoring() {
    if (isMonitoringStarted) return;
    isMonitoringStarted = true;

    // Load configured intervals from DB
    try {
        const settings = await prisma.globalSettings.findUnique({ where: { id: 'global' } });
        if (settings) {
            pollIntervalActive = Math.max(500, settings.monitorIntervalActive);
            pollIntervalIdle = Math.max(1000, settings.monitorIntervalIdle);
        }
    } catch { /* Use defaults on first run */ }

    const jellyfinUrl = process.env.JELLYFIN_URL || '(not set)';
    console.log(`[Monitor] Démarrage du polling autonome Jellyfin (adaptatif: ${pollIntervalActive}ms actif / ${pollIntervalIdle}ms veille)...`);
    console.log(`[Monitor] JELLYFIN_URL = ${jellyfinUrl}`);

    // Startup cleanup: close all orphan ActiveStreams and their open PlaybackHistory entries
    // This handles app restarts where Redis state was lost but DB ActiveStreams persist
    try {
        const orphanStreams = await prisma.activeStream.findMany();
        if (orphanStreams.length > 0) {
            console.log(`[Monitor] Nettoyage au démarrage: ${orphanStreams.length} session(s) orpheline(s) trouvée(s).`);
            for (const orphan of orphanStreams) {
                const openPlayback = await prisma.playbackHistory.findFirst({
                    where: { userId: orphan.userId, mediaId: orphan.mediaId, endedAt: null },
                    orderBy: { startedAt: 'desc' },
                });
                if (openPlayback) {
                    const endedAt = new Date();
                    let durationS: number;
                    if (orphan.positionTicks && BigInt(orphan.positionTicks) > 0n) {
                        durationS = Math.floor(Number(BigInt(orphan.positionTicks)) / 10_000_000);
                    } else {
                        durationS = Math.floor((endedAt.getTime() - openPlayback.startedAt.getTime()) / 1000);
                    }
                    await prisma.playbackHistory.update({
                        where: { id: openPlayback.id },
                        data: { endedAt, durationWatched: durationS },
                    });
                }
                await prisma.activeStream.delete({ where: { id: orphan.id } });
                await redis.del(`stream:${orphan.sessionId}`);
            }
            console.log(`[Monitor] Nettoyage au démarrage terminé.`);
        }

        // Also clean any orphan Redis stream keys left from a previous container
        const redisStreamKeys = await redis.keys("stream:*");
        if (redisStreamKeys.length > 0) {
            console.log(`[Monitor] Nettoyage Redis: ${redisStreamKeys.length} clé(s) stream orpheline(s) supprimée(s).`);
            for (const key of redisStreamKeys) {
                await redis.del(key);
            }
        }

        // Close any PlaybackHistory entries that have no endedAt (orphan from crash)
        const orphanPlaybacks = await prisma.playbackHistory.findMany({
            where: { endedAt: null },
        });
        if (orphanPlaybacks.length > 0) {
            console.log(`[Monitor] Fermeture de ${orphanPlaybacks.length} session(s) PlaybackHistory ouverte(s) sans fin.`);
            for (const pb of orphanPlaybacks) {
                const endedAt = new Date();
                const durationS = Math.floor((endedAt.getTime() - pb.startedAt.getTime()) / 1000);
                await prisma.playbackHistory.update({
                    where: { id: pb.id },
                    data: { endedAt, durationWatched: Math.min(durationS, 86400) }, // Cap at 24h max
                });
            }
        }
    } catch (err) {
        console.error("[Monitor] Erreur nettoyage au démarrage:", err);
    }

    // Clear previous timeout if any (HMR safety)
    if (monitorTimeoutId) {
        clearTimeout(monitorTimeoutId);
    }

    // Adaptive polling loop: 1s active / 5s idle / 30s on persistent errors
    async function scheduleNextPoll() {
        try {
            const hasActive = await pollJellyfinSessions();
            if (consecutiveErrors > 0) {
                console.log(`[Monitor] Connexion à Jellyfin rétablie après ${consecutiveErrors} erreur(s).`);
                consecutiveErrors = 0;
            }
            const interval = hasActive ? pollIntervalActive : pollIntervalIdle;
            monitorTimeoutId = setTimeout(scheduleNextPoll, interval);
        } catch (error) {
            consecutiveErrors++;
            if (consecutiveErrors === 1) {
                // First error: log full detail
                const msg = error instanceof Error ? error.message : String(error);
                console.error(`[Monitor] Jellyfin injoignable (${process.env.JELLYFIN_URL}): ${msg}`);
            } else if (consecutiveErrors % 60 === 0) {
                // Reminder every ~30 min (60 × 30s)
                console.warn(`[Monitor] Jellyfin toujours injoignable après ${consecutiveErrors} tentatives.`);
            }
            monitorTimeoutId = setTimeout(scheduleNextPoll, POLL_INTERVAL_ERROR);
        }
    }
    scheduleNextPoll();
}

async function pollJellyfinSessions(): Promise<boolean> {
    const baseUrl = process.env.JELLYFIN_URL;
    const apiKey = process.env.JELLYFIN_API_KEY;

    if (!baseUrl || !apiKey) {
        console.warn("[Monitor] JELLYFIN_URL or JELLYFIN_API_KEY env vars missing.");
        return false;
    }

    const response = await fetch(`${baseUrl}/Sessions`, {
        headers: {
            "X-Emby-Token": apiKey,
        },
    });
    if (!response.ok) return false;

    const sessions = await response.json();

    // Only care about active playing sessions
    const activeSessions = sessions.filter((s: any) => s.NowPlayingItem && s.PlayState);

    // Fetch existing active streams from Redis to compute deltas
    const activeKeys = await redis.keys("stream:*");
    const activeRedisSessions = await Promise.all(activeKeys.map(k => redis.get(k)));

    const previousSessionIds = new Set(
        activeRedisSessions
            .filter((s): s is string => s !== null)
            .map(s => JSON.parse(s).SessionId)
    );

    const currentSessionIds = new Set(activeSessions.map((s: any) => s.Id));

    // Handle Start & Progress
    for (const session of activeSessions) {
        const SessionId = session.Id;
        const UserId = session.UserId;
        const UserName = session.UserName;
        const Item = session.NowPlayingItem;
        const ItemId = Item?.Id;
        const ItemName = Item?.Name;
        const ItemType = Item?.Type;
        const ClientName = session.Client;
        const DeviceName = session.DeviceName;
        const IpAddress = cleanIpAddress(session.RemoteEndPoint);

        // Parent chain metadata (for enriched display: "Episode — Season — Series")
        const SeriesName = Item?.SeriesName || null;
        const SeasonName = Item?.SeasonName || null;
        const AlbumName = Item?.Album || null;
        const AlbumArtist = Item?.AlbumArtist || Item?.AlbumArtists?.[0] || null;
        const AlbumId = Item?.AlbumId || null;
        const SeriesId = Item?.SeriesId || null;
        const SeasonId = Item?.SeasonId || null;
        const RunTimeTicks = Item?.RunTimeTicks || null;

        const PlayState = session.PlayState;
        const PlayMethod = PlayState?.PlayMethod || "DirectPlay";
        const PlaybackPositionTicks = PlayState?.PositionTicks;

        const TranscodingInfo = session.TranscodingInfo;
        const TranscodeVideoCodec = TranscodingInfo ? TranscodingInfo.VideoCodec : null;
        const TranscodeAudioCodec = TranscodingInfo ? TranscodingInfo.AudioCodec : null;
        const TranscodeFps = TranscodingInfo ? TranscodingInfo.Framerate : null;
        const Bitrate = TranscodingInfo ? TranscodingInfo.Bitrate : null;

        // Telemetry: Audio & Subtitles Extraction + Resolution
        let AudioLanguage: string | null = null;
        let AudioCodecFromStream: string | null = null;
        let SubtitleLanguage: string | null = null;
        let SubtitleCodec: string | null = null;
        let DetectedResolution: string | null = null;

        if (session.NowPlayingItem && session.NowPlayingItem.MediaStreams) {
            const streams: any[] = session.NowPlayingItem.MediaStreams;
            const audioStreamIndex = PlayState?.AudioStreamIndex;
            const subtitleStreamIndex = PlayState?.SubtitleStreamIndex;

            if (audioStreamIndex !== undefined && audioStreamIndex !== null) {
                const audioStream = streams.find(s => s.Index === audioStreamIndex && s.Type === "Audio");
                if (audioStream) {
                    AudioLanguage = audioStream.Language || audioStream.DisplayTitle || "Unknown";
                    AudioCodecFromStream = audioStream.Codec || null;
                }
            } else {
                // Fallback to first/default audio stream
                const audioStream = streams.find(s => s.Type === "Audio" && s.IsDefault) || streams.find(s => s.Type === "Audio");
                if (audioStream) {
                    AudioLanguage = audioStream.Language || audioStream.DisplayTitle || "Unknown";
                    AudioCodecFromStream = audioStream.Codec || null;
                }
            }

            if (subtitleStreamIndex !== undefined && subtitleStreamIndex !== null && subtitleStreamIndex >= 0) {
                const subStream = streams.find(s => s.Index === subtitleStreamIndex && s.Type === "Subtitle");
                if (subStream) {
                    SubtitleLanguage = subStream.Language || subStream.DisplayTitle || "Unknown";
                    SubtitleCodec = subStream.Codec || "Unknown";
                }
            }

            // Extract video resolution from the stream (fills resolution for media that sync missed)
            const videoStream = streams.find((s: any) => s.Type === "Video");
            if (videoStream && videoStream.Width) {
                const w = videoStream.Width;
                if (w >= 3800) DetectedResolution = "4K";
                else if (w >= 1900) DetectedResolution = "1080p";
                else if (w >= 1200) DetectedResolution = "720p";
                else DetectedResolution = "SD";
            }
        }

        // Combined codecs: prefer MediaStreams (works for DirectPlay), fallback to TranscodingInfo
        const VideoCodec = TranscodeVideoCodec;
        const AudioCodec = AudioCodecFromStream || TranscodeAudioCodec;

        const isNew = !previousSessionIds.has(SessionId);

        // Detect item change within same session (e.g., auto-play next episode)
        let itemChanged = false;
        if (!isNew) {
            const redisData = await redis.get(`stream:${SessionId}`);
            if (redisData) {
                const prev = JSON.parse(redisData);
                if (prev.ItemId && prev.ItemId !== ItemId) {
                    itemChanged = true;
                    // Close the previous item's PlaybackHistory
                    const prevMedia = await prisma.media.findUnique({ where: { jellyfinMediaId: prev.ItemId } });
                    const prevUser = UserId ? await prisma.user.findUnique({ where: { jellyfinUserId: UserId } }) : null;
                    if (prevMedia && prevUser) {
                        const prevPlayback = await prisma.playbackHistory.findFirst({
                            where: { userId: prevUser.id, mediaId: prevMedia.id, endedAt: null },
                            orderBy: { startedAt: 'desc' },
                        });
                        if (prevPlayback) {
                            const endedAt = new Date();
                            // For item changes, always use wall clock duration
                            // (PlaybackPositionTicks belongs to the NEW item, not the old one)
                            const durationS = Math.floor((endedAt.getTime() - prevPlayback.startedAt.getTime()) / 1000);
                            await prisma.playbackHistory.update({
                                where: { id: prevPlayback.id },
                                data: { endedAt, durationWatched: durationS },
                            });
                            console.log(`[Monitor] Item changed in session ${SessionId}: closed ${prev.ItemId} (${durationS}s), now playing ${ItemId}`);
                        }
                    }
                }
            }
        }

        // Ensure User exists in DB
        if (UserId) {
            await prisma.user.upsert({
                where: { jellyfinUserId: UserId },
                update: { username: UserName || "Unknown" },
                create: {
                    jellyfinUserId: UserId,
                    username: UserName || "Unknown",
                },
            });
        }

        // Ensure Media exists in DB (and update resolution if we detected one from the stream)
        if (ItemId) {
            const updateData: any = { title: ItemName || "Unknown", type: ItemType || "Unknown" };
            if (DetectedResolution) updateData.resolution = DetectedResolution;
            await prisma.media.upsert({
                where: { jellyfinMediaId: ItemId },
                update: updateData,
                create: {
                    jellyfinMediaId: ItemId,
                    title: ItemName || "Unknown",
                    type: ItemType || "Unknown",
                    resolution: DetectedResolution,
                },
            });
        }

        // Compute GeoIP
        const geoData = getGeoLocation(IpAddress);

        // Redis Payload (enriched with parent chain + progress info)
        const redisPayload = {
            SessionId,
            UserId,
            UserName,
            ItemId,
            ItemName,
            ItemType,
            ClientName,
            DeviceName,
            IpAddress,
            PlayMethod,
            PlaybackPositionTicks,
            RunTimeTicks,
            IsPaused: PlayState?.IsPaused === true,
            SeriesName,
            SeasonName,
            AlbumName,
            AlbumArtist,
            AlbumId,
            SeriesId,
            SeasonId,
            AudioLanguage,
            AudioCodec,
            SubtitleLanguage,
            SubtitleCodec,
            Country: geoData.country,
            City: geoData.city,
        };

        // Cache for 60s (refreshed every 5s, extra margin prevents premature expiry)
        await redis.setex(`stream:${SessionId}`, 60, JSON.stringify(redisPayload));

        // DB Upsert (Active Stream)
        if (UserId && ItemId) {
            await prisma.activeStream.upsert({
                where: { sessionId: SessionId },
                update: {
                    positionTicks: PlaybackPositionTicks || null,
                    playMethod: PlayMethod,
                    lastPingAt: new Date(),
                    videoCodec: VideoCodec,
                    audioCodec: AudioCodec,
                    audioLanguage: AudioLanguage,
                    subtitleCodec: SubtitleCodec,
                    subtitleLanguage: SubtitleLanguage,
                    transcodeFps: TranscodeFps ? parseFloat(TranscodeFps) : null,
                    bitrate: Bitrate ? parseInt(Bitrate, 10) : null,
                    country: geoData.country,
                    city: geoData.city,
                },
                create: {
                    sessionId: SessionId,
                    user: { connect: { jellyfinUserId: UserId } },
                    media: { connect: { jellyfinMediaId: ItemId } },
                    playMethod: PlayMethod,
                    clientName: ClientName,
                    deviceName: DeviceName,
                    ipAddress: IpAddress,
                    videoCodec: VideoCodec,
                    audioCodec: AudioCodec,
                    audioLanguage: AudioLanguage,
                    subtitleCodec: SubtitleCodec,
                    subtitleLanguage: SubtitleLanguage,
                    transcodeFps: TranscodeFps ? parseFloat(TranscodeFps) : null,
                    bitrate: Bitrate ? parseInt(Bitrate, 10) : null,
                    positionTicks: PlaybackPositionTicks || null,
                    country: geoData.country,
                    city: geoData.city,
                },
            });
        }

        // Telemetry tracking for ongoing sessions (pause/audio/subtitle changes)
        if (!isNew && UserId && ItemId) {
            const user = await prisma.user.findUnique({ where: { jellyfinUserId: UserId } });
            const media = await prisma.media.findUnique({ where: { jellyfinMediaId: ItemId } });
            if (user && media) {
                const openPlayback = await prisma.playbackHistory.findFirst({
                    where: { userId: user.id, mediaId: media.id, endedAt: null },
                    orderBy: { startedAt: 'desc' },
                });
                if (openPlayback) {
                    const updates: any = {};
                    const isPaused = PlayState?.IsPaused === true;
                    const positionMs = PlaybackPositionTicks ? BigInt(Math.floor(Number(PlaybackPositionTicks) / 10_000)) : BigInt(0);
                    const telemetryEvents: { eventType: string; positionMs: bigint; metadata?: string }[] = [];

                    // Track pause state transitions
                    const pauseKey = `pause:${openPlayback.id}`;
                    const prevPauseState = await redis.get(pauseKey);
                    if (isPaused && prevPauseState !== "paused") {
                        updates.pauseCount = { increment: 1 };
                        await redis.setex(pauseKey, 3600, "paused");
                        if (positionMs > 0) {
                            telemetryEvents.push({ eventType: "pause", positionMs });
                        }
                    } else if (!isPaused && prevPauseState === "paused") {
                        await redis.setex(pauseKey, 3600, "playing");
                    }

                    // Track audio stream changes
                    const audioStreamIndex = PlayState?.AudioStreamIndex;
                    if (audioStreamIndex !== undefined && audioStreamIndex !== null) {
                        const audioKey = `audio:${openPlayback.id}`;
                        const prevAudio = await redis.get(audioKey);
                        if (prevAudio !== null && prevAudio !== String(audioStreamIndex)) {
                            updates.audioChanges = { increment: 1 };
                            if (positionMs > 0) {
                                telemetryEvents.push({
                                    eventType: "audio_change",
                                    positionMs,
                                    metadata: JSON.stringify({ from: prevAudio, to: String(audioStreamIndex) }),
                                });
                            }
                        }
                        await redis.setex(audioKey, 3600, String(audioStreamIndex));
                    }

                    // Track subtitle stream changes
                    const subtitleStreamIndex = PlayState?.SubtitleStreamIndex;
                    if (subtitleStreamIndex !== undefined && subtitleStreamIndex !== null) {
                        const subKey = `sub:${openPlayback.id}`;
                        const prevSub = await redis.get(subKey);
                        if (prevSub !== null && prevSub !== String(subtitleStreamIndex)) {
                            updates.subtitleChanges = { increment: 1 };
                            if (positionMs > 0) {
                                telemetryEvents.push({
                                    eventType: "subtitle_change",
                                    positionMs,
                                    metadata: JSON.stringify({ from: prevSub, to: String(subtitleStreamIndex) }),
                                });
                            }
                        }
                        await redis.setex(subKey, 3600, String(subtitleStreamIndex));
                    }

                    if (Object.keys(updates).length > 0) {
                        await prisma.playbackHistory.update({
                            where: { id: openPlayback.id },
                            data: updates,
                        });
                    }

                    // Write telemetry events with position data
                    if (telemetryEvents.length > 0) {
                        await prisma.telemetryEvent.createMany({
                            data: telemetryEvents.map(e => ({
                                playbackId: openPlayback.id,
                                eventType: e.eventType,
                                positionMs: e.positionMs,
                                metadata: e.metadata || null,
                            })),
                        });
                    }

                    // Always update audio/subtitle info if available (fills in data that was
                    // missing on initial create — MediaStreams may not be in first poll response)
                    const mediaUpdates: any = {};
                    if (AudioLanguage && !openPlayback.audioLanguage) mediaUpdates.audioLanguage = AudioLanguage;
                    if (AudioCodec && !openPlayback.audioCodec) mediaUpdates.audioCodec = AudioCodec;
                    if (SubtitleLanguage && !openPlayback.subtitleLanguage) mediaUpdates.subtitleLanguage = SubtitleLanguage;
                    if (SubtitleCodec && !openPlayback.subtitleCodec) mediaUpdates.subtitleCodec = SubtitleCodec;
                    // Also update if the stream changed (user switched audio/sub track)
                    if (AudioLanguage && openPlayback.audioLanguage && openPlayback.audioLanguage !== AudioLanguage) {
                        mediaUpdates.audioLanguage = AudioLanguage;
                    }
                    if (AudioCodec && openPlayback.audioCodec && openPlayback.audioCodec !== AudioCodec) {
                        mediaUpdates.audioCodec = AudioCodec;
                    }
                    if (SubtitleLanguage && openPlayback.subtitleLanguage && openPlayback.subtitleLanguage !== SubtitleLanguage) {
                        mediaUpdates.subtitleLanguage = SubtitleLanguage;
                    }
                    if (SubtitleCodec && openPlayback.subtitleCodec && openPlayback.subtitleCodec !== SubtitleCodec) {
                        mediaUpdates.subtitleCodec = SubtitleCodec;
                    }
                    if (Object.keys(mediaUpdates).length > 0) {
                        await prisma.playbackHistory.update({
                            where: { id: openPlayback.id },
                            data: mediaUpdates,
                        });
                    }
                }
            }
        }

        // Handle PlaybackStart Logic (new session or item changed within session)
        if ((isNew || itemChanged) && UserId && ItemId) {
            const pastIpCount = await prisma.playbackHistory.count({
                where: { user: { jellyfinUserId: UserId }, ipAddress: IpAddress }
            });
            const isNewIp = pastIpCount === 0;

            // Dedup guard: only create PlaybackHistory if no open session exists for this user+media
            // (the webhook PlaybackStart may have already created one)
            const user = await prisma.user.findUnique({ where: { jellyfinUserId: UserId } });
            const media = await prisma.media.findUnique({ where: { jellyfinMediaId: ItemId } });
            let alreadyExists = false;
            if (user && media) {
                const existingOpen = await prisma.playbackHistory.findFirst({
                    where: { userId: user.id, mediaId: media.id, endedAt: null },
                });
                alreadyExists = !!existingOpen;
            }

            if (!alreadyExists) {
                // New Session! Add to PlaybackHistory
                await prisma.playbackHistory.create({
                    data: {
                        user: { connect: { jellyfinUserId: UserId } },
                        media: { connect: { jellyfinMediaId: ItemId } },
                        playMethod: PlayMethod,
                        clientName: ClientName,
                        deviceName: DeviceName,
                        ipAddress: IpAddress,
                        country: geoData.country,
                        city: geoData.city,
                        audioCodec: AudioCodec,
                        audioLanguage: AudioLanguage,
                        subtitleCodec: SubtitleCodec,
                        subtitleLanguage: SubtitleLanguage,
                    },
                });
            }

            // Discord Notifications
            try {
                const settings = await prisma.globalSettings.findUnique({ where: { id: "global" } });
                const webhookUrl = settings?.discordWebhookUrl;
                const isEnabled = settings?.discordAlertsEnabled;
                const condition = settings?.discordAlertCondition || "ALL";

                let shouldSend = true;
                if (condition === "TRANSCODE_ONLY") {
                    shouldSend = PlayMethod === "Transcode";
                } else if (condition === "NEW_IP_ONLY") {
                    shouldSend = isNewIp;
                }

                if (isEnabled && webhookUrl && shouldSend) {
                    const posterUrl = `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/jellyfin/image?itemId=${ItemId}`;

                    const discordPayload = {
                        embeds: [
                            {
                                title: `🎬 Now Playing: ${ItemName || "Unknown"}`,
                                color: 10181046, // Jellyfin Purple
                                fields: [
                                    { name: "👤 User", value: UserName || "Unknown", inline: true },
                                    { name: "📱 Device", value: `${ClientName || "Unknown"} (${DeviceName || "Unknown"})`, inline: true },
                                    { name: "🌍 Location", value: geoData.country !== "Unknown" ? `${geoData.city}, ${geoData.country}` : "Unknown", inline: true },
                                    { name: "⚙️ Quality", value: PlayMethod || "Unknown", inline: true }
                                ],
                                thumbnail: { url: posterUrl },
                                timestamp: new Date().toISOString()
                            }
                        ]
                    };

                    await fetch(webhookUrl, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(discordPayload)
                    });
                }
            } catch (discordErr) {
                console.error("[Monitor] Failed to send Discord webhook:", discordErr);
            }
        }
    }

    // Handle PlaybackStop (Sessions that disappeared)
    for (const previousSessionId of previousSessionIds) {
        if (!currentSessionIds.has(previousSessionId)) {
            // It stopped!
            await redis.del(`stream:${previousSessionId}`);

            // We need to find the related active stream in DB to know which User/Item to update
            const activeStream = await prisma.activeStream.findUnique({
                where: { sessionId: previousSessionId }
            });

            if (activeStream) {
                // Remove from ActiveStream
                await prisma.activeStream.delete({
                    where: { sessionId: previousSessionId },
                });

                // Update the PlaybackHistory with endedAt & durationWatched
                const lastPlayback = await prisma.playbackHistory.findFirst({
                    where: {
                        userId: activeStream.userId,
                        mediaId: activeStream.mediaId,
                        endedAt: null,
                    },
                    orderBy: { startedAt: 'desc' },
                });

                if (lastPlayback) {
                    const endedAt = new Date();
                    // Use positionTicks from the last known ActiveStream state if available
                    let durationS: number;
                    if (activeStream.positionTicks && BigInt(activeStream.positionTicks) > 0n) {
                        durationS = Math.floor(Number(BigInt(activeStream.positionTicks)) / 10_000_000);
                        // Record stop position as telemetry event
                        const stopPositionMs = BigInt(Math.floor(Number(BigInt(activeStream.positionTicks)) / 10_000));
                        if (stopPositionMs > 0) {
                            await prisma.telemetryEvent.create({
                                data: {
                                    playbackId: lastPlayback.id,
                                    eventType: "stop",
                                    positionMs: stopPositionMs,
                                },
                            });
                        }
                    } else {
                        durationS = Math.floor((endedAt.getTime() - lastPlayback.startedAt.getTime()) / 1000);
                    }
                    await prisma.playbackHistory.update({
                        where: { id: lastPlayback.id },
                        data: { endedAt, durationWatched: durationS },
                    });
                }
            }
        }
    }

    // Cross-validation: clean DB ActiveStreams that Jellyfin doesn't know about anymore
    // This is the primary defense against ghost sessions after restart
    const allDbStreams = await prisma.activeStream.findMany();
    for (const dbStream of allDbStreams) {
        if (!currentSessionIds.has(dbStream.sessionId)) {
            // This session is in our DB but NOT in Jellyfin — it's a ghost
            console.log(`[Monitor] Session fantôme détectée: ${dbStream.sessionId} — absente de Jellyfin, nettoyage.`);

            await redis.del(`stream:${dbStream.sessionId}`);

            const openPlayback = await prisma.playbackHistory.findFirst({
                where: { userId: dbStream.userId, mediaId: dbStream.mediaId, endedAt: null },
                orderBy: { startedAt: 'desc' },
            });

            if (openPlayback) {
                const endedAt = new Date();
                let durationS: number;
                if (dbStream.positionTicks && BigInt(dbStream.positionTicks) > 0n) {
                    durationS = Math.floor(Number(BigInt(dbStream.positionTicks)) / 10_000_000);
                } else {
                    durationS = Math.floor((endedAt.getTime() - openPlayback.startedAt.getTime()) / 1000);
                }
                await prisma.playbackHistory.update({
                    where: { id: openPlayback.id },
                    data: { endedAt, durationWatched: durationS },
                });
            }

            await prisma.activeStream.delete({ where: { id: dbStream.id } });
        }
    }

    // Also clean orphan Redis stream keys that have no matching DB record
    const allRedisStreamKeys = await redis.keys("stream:*");
    for (const key of allRedisStreamKeys) {
        const sessionId = key.replace("stream:", "");
        if (!currentSessionIds.has(sessionId)) {
            await redis.del(key);
        }
    }

    // Return whether there are active sessions (drives adaptive polling interval)
    return activeSessions.length > 0;
}
