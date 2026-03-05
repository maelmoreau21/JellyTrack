import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import redis from "@/lib/redis";
import { getGeoLocation } from "@/lib/geoip";
import { apiT } from "@/lib/i18n-api";

/**
 * SECURITY: Webhook authentication via shared secret.
 * Set JELLYFIN_WEBHOOK_SECRET in your .env and configure the same token
 * in the Jellyfin Webhook plugin as a header: "Authorization: Bearer <secret>"
 * or as a query parameter: ?token=<secret>
 */
function verifyWebhookAuth(req: Request): boolean {
    const secret = process.env.JELLYFIN_WEBHOOK_SECRET;
    // In production, fail-closed if secret is missing.
    // In development, keep backward compatibility.
    if (!secret) {
        if (process.env.NODE_ENV === "production") {
            console.error("[Webhook] JELLYFIN_WEBHOOK_SECRET manquant en production — requête rejetée.");
            return false;
        }
        console.warn("[Webhook] JELLYFIN_WEBHOOK_SECRET non configuré (mode dev) — webhook non authentifié !");
        return true;
    }

    // Check Authorization header: "Bearer <secret>"
    const authHeader = req.headers.get("authorization");
    if (authHeader) {
        const token = authHeader.replace(/^Bearer\s+/i, "").trim();
        if (token === secret) return true;
    }

    // Check query parameter: ?token=<secret>
    try {
        const url = new URL(req.url);
        const queryToken = url.searchParams.get("token");
        if (queryToken === secret) return true;
    } catch { /* invalid URL, ignore */ }

    return false;
}

export async function POST(req: Request) {
    // Authenticate the webhook request
    if (!verifyWebhookAuth(req)) {
        console.warn("[Webhook] Requête rejetée — token invalide.");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const payload = await req.json();

        // Type d'événement envoyé par le plugin Webhook de Jellyfin
        // ex: "PlaybackStart", "PlaybackStop", "PlaybackProgress", "ItemAdded"
        const eventType = payload.NotificationType || payload.Notification_Type || payload.Event;

        if (!eventType) {
            return NextResponse.json({ error: await apiT('payloadUnrecognized') }, { status: 400 });
        }

        console.log(`[Webhook] Événement reçu: ${eventType}`);

        // Extract real client IP from proxy headers (Docker / reverse proxy)
        const forwardedFor = req.headers.get('x-forwarded-for');
        const realIpHeader = forwardedFor?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;

        // Helper: clean IPs — keep raw value, just strip IPv6-mapped prefix
        const resolveIp = (ip: string | null | undefined): string => {
            if (!ip) return "Unknown";
            let cleaned = ip.trim();
            if (cleaned.includes("::ffff:")) cleaned = cleaned.split("::ffff:")[1];
            return cleaned;
        };

        if (eventType === "PlaybackStart") {
            // Lecture des données du Webhook
            const jellyfinUserId = payload.UserId || payload.UserId || payload.User_Id;
            const username = payload.UserName || payload.Username || "Unknown";
            const jellyfinMediaId = payload.ItemId || payload.Item_Id || payload.MediaId;
            const title = payload.Name || payload.Title || payload.ItemName || "Unknown";
            const type = payload.ItemType || payload.Type || "Unknown";
            const clientName = payload.ClientName || payload.Client || "Unknown";
            const deviceName = payload.DeviceName || payload.Device || "Unknown";

            // Prefer real IP from proxy headers, then webhook payload, then fallback
            const ipAddress = resolveIp(realIpHeader || payload.IpAddress || payload.ClientIp);
            const geoData = getGeoLocation(ipAddress);

            if (!jellyfinUserId || !jellyfinMediaId) {
                return NextResponse.json({ message: await apiT('incompleteData') }, { status: 400 });
            }

            // 1. Mise à jour ou création de l'utilisateur
            await prisma.user.upsert({
                where: { jellyfinUserId: jellyfinUserId },
                update: { username },
                create: { jellyfinUserId, username }
            });

            // 2. Mise à jour ou création du média
            await prisma.media.upsert({
                where: { jellyfinMediaId: jellyfinMediaId },
                update: { title, type },
                create: { jellyfinMediaId, title, type }
            });

            // 3. Create PlaybackHistory if no open session exists for this user+media (dedup guard)
            // This ensures short tracks (e.g. music < 5s) are logged even if the monitor misses them
            const dbUser = await prisma.user.findUnique({ where: { jellyfinUserId: jellyfinUserId } });
            const dbMedia = await prisma.media.findUnique({ where: { jellyfinMediaId: jellyfinMediaId } });
            if (dbUser && dbMedia) {
                const existingOpen = await prisma.playbackHistory.findFirst({
                    where: { userId: dbUser.id, mediaId: dbMedia.id, endedAt: null },
                });
                if (!existingOpen) {
                    await prisma.playbackHistory.create({
                        data: {
                            user: { connect: { jellyfinUserId: jellyfinUserId } },
                            media: { connect: { jellyfinMediaId: jellyfinMediaId } },
                            playMethod: payload.PlayMethod || "Unknown",
                            clientName: clientName,
                            deviceName: deviceName,
                            ipAddress: ipAddress,
                            country: geoData.country,
                            city: geoData.city,
                        },
                    });
                    console.log(`[Webhook] PlaybackStart: Created PlaybackHistory for ${title}`);
                }
            }

            // 4. Envoi de la notification Discord
            try {
                const settings = await prisma.globalSettings.findUnique({ where: { id: "global" } });

                if (settings?.discordAlertsEnabled && settings?.discordWebhookUrl) {
                    const condition = settings.discordAlertCondition || "ALL";
                    let shouldSend = true;

                    if (condition === "TRANSCODE_ONLY") {
                        shouldSend = payload.PlayMethod === "Transcode" || payload.IsTranscoding || false;
                    } else if (condition === "NEW_IP_ONLY") {
                        const pastIpCount = await prisma.playbackHistory.count({
                            where: { user: { jellyfinUserId: jellyfinUserId }, ipAddress: ipAddress }
                        });
                        shouldSend = pastIpCount === 0;
                    }

                    if (shouldSend) {
                        // Utilisation de notre API proxy interne pour sécuriser l'URL de l'image
                        // Fallback uses runtime PORT to stay correct when app port changes
                        const fallbackPort = process.env.PORT || "3000";
                        const appUrl = process.env.NEXTAUTH_URL || `http://localhost:${fallbackPort}`;
                        const posterUrl = `${appUrl}/api/jellyfin/image?itemId=${jellyfinMediaId}&type=Primary`;

                        const discordPayload = {
                            embeds: [
                                {
                                    title: `\uD83C\uDFAC Now Playing: ${title}`,
                                    color: 10181046, // Jellyfin Purple
                                    fields: [
                                        { name: "\uD83D\uDC64 User", value: username, inline: true },
                                        { name: "\uD83D\uDCF1 Device", value: `${clientName} (${deviceName})`, inline: true },
                                        { name: "\uD83C\uDF0D Location", value: geoData.country !== "Unknown" ? `${geoData.city}, ${geoData.country}` : "Unknown", inline: true }
                                    ],
                                    thumbnail: { url: posterUrl },
                                    timestamp: new Date().toISOString()
                                }
                            ]
                        };

                        await fetch(settings.discordWebhookUrl, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(discordPayload)
                        });
                        console.log(`[Webhook] Alerte Discord envoyée pour ${title}.`);
                    }
                }
            } catch (err) {
                console.error("[Webhook] Erreur lors de l'envoi Discord:", err);
            }
        }

        else if (eventType === "PlaybackStop") {
            console.log(`[Webhook] Fin de lecture interceptée.`);
            const jellyfinUserId = payload.UserId || payload.User_Id;
            const jellyfinMediaId = payload.ItemId || payload.Item_Id || payload.MediaId;
            const positionTicks = payload.PlaybackPositionTicks || payload.PositionTicks || 0;
            const runTimeTicks = payload.RunTimeTicks || payload.Item?.RunTimeTicks || 0;

            if (jellyfinUserId && jellyfinMediaId) {
                // Find the user and media internal IDs
                const user = await prisma.user.findUnique({ where: { jellyfinUserId } });
                const media = await prisma.media.findUnique({ where: { jellyfinMediaId } });

                if (user && media) {
                    // Close the open PlaybackHistory
                    const lastPlayback = await prisma.playbackHistory.findFirst({
                        where: { userId: user.id, mediaId: media.id, endedAt: null },
                        orderBy: { startedAt: 'desc' },
                    });

                    if (lastPlayback) {
                        const endedAt = new Date();
                        const wallClockS = Math.floor((endedAt.getTime() - lastPlayback.startedAt.getTime()) / 1000);
                        let durationS: number;
                        if (positionTicks > 0) {
                            const positionS = Math.floor(positionTicks / 10_000_000);
                            // min(wallClock, position) prevents inflated duration on resume
                            // (positionTicks is absolute position in media, not session duration)
                            durationS = Math.min(wallClockS, positionS);
                        } else {
                            durationS = wallClockS;
                        }
                        durationS = Math.max(0, Math.min(durationS, 86400)); // Clamp 0..24h
                        await prisma.playbackHistory.update({
                            where: { id: lastPlayback.id },
                            data: { endedAt, durationWatched: durationS },
                        });

                        // Record stop position as telemetry event
                        const stopPositionMs = positionTicks > 0 ? BigInt(Math.floor(positionTicks / 10_000)) : BigInt(0);
                        if (stopPositionMs > 0) {
                            await prisma.telemetryEvent.create({
                                data: {
                                    playbackId: lastPlayback.id,
                                    eventType: "stop",
                                    positionMs: stopPositionMs,
                                },
                            });
                        }

                        console.log(`[Webhook] PlaybackStop: Session ${lastPlayback.id} closed, duration=${durationS}s`);
                    }

                    // Also clean up ActiveStream + Redis to avoid ghost sessions
                    const activeStream = await prisma.activeStream.findFirst({
                        where: { userId: user.id, mediaId: media.id },
                    });
                    if (activeStream) {
                        await redis.del(`stream:${activeStream.sessionId}`);
                        await prisma.activeStream.delete({ where: { id: activeStream.id } });
                        console.log(`[Webhook] PlaybackStop: ActiveStream ${activeStream.sessionId} nettoyé.`);
                    }
                }
            }
        }

        else if (eventType === "PlaybackProgress") {
            const jellyfinUserId = payload.UserId || payload.User_Id;
            const jellyfinMediaId = payload.ItemId || payload.Item_Id || payload.MediaId;
            const isPaused = payload.IsPaused === true || payload.PlayState?.IsPaused === true;
            const currentAudioIndex = payload.PlayState?.AudioStreamIndex ?? payload.AudioStreamIndex;
            const currentSubIndex = payload.PlayState?.SubtitleStreamIndex ?? payload.SubtitleStreamIndex;
            const positionTicks = payload.PlaybackPositionTicks || payload.PositionTicks || payload.PlayState?.PositionTicks || 0;
            const positionMs = positionTicks > 0 ? BigInt(Math.floor(positionTicks / 10_000)) : BigInt(0);

            if (jellyfinUserId && jellyfinMediaId) {
                const user = await prisma.user.findUnique({ where: { jellyfinUserId } });
                const media = await prisma.media.findUnique({ where: { jellyfinMediaId } });

                if (user && media) {
                    const lastPlayback = await prisma.playbackHistory.findFirst({
                        where: { userId: user.id, mediaId: media.id, endedAt: null },
                        orderBy: { startedAt: 'desc' },
                    });

                    if (lastPlayback) {
                        const updates: any = {};
                        const telemetryEvents: { eventType: string; positionMs: bigint; metadata?: string }[] = [];

                        // Track pause events: if currently paused and we track transitions
                        // We use a Redis key to store the previous pause state
                        const pauseKey = `pause:${lastPlayback.id}`;
                        const prevPauseState = await (await import("@/lib/redis")).default.get(pauseKey);
                        if (isPaused && prevPauseState !== "paused") {
                            updates.pauseCount = { increment: 1 };
                            await (await import("@/lib/redis")).default.setex(pauseKey, 3600, "paused");
                            if (positionMs > 0) {
                                telemetryEvents.push({ eventType: "pause", positionMs });
                            }
                        } else if (!isPaused && prevPauseState === "paused") {
                            await (await import("@/lib/redis")).default.setex(pauseKey, 3600, "playing");
                        }

                        // Track audio/subtitle changes via Redis
                        const audioKey = `audio:${lastPlayback.id}`;
                        const subKey = `sub:${lastPlayback.id}`;
                        if (currentAudioIndex !== undefined && currentAudioIndex !== null) {
                            const prevAudio = await (await import("@/lib/redis")).default.get(audioKey);
                            if (prevAudio !== null && prevAudio !== String(currentAudioIndex)) {
                                updates.audioChanges = { increment: 1 };
                                if (positionMs > 0) {
                                    telemetryEvents.push({
                                        eventType: "audio_change",
                                        positionMs,
                                        metadata: JSON.stringify({ from: prevAudio, to: String(currentAudioIndex) }),
                                    });
                                }
                            }
                            await (await import("@/lib/redis")).default.setex(audioKey, 3600, String(currentAudioIndex));
                        }
                        if (currentSubIndex !== undefined && currentSubIndex !== null) {
                            const prevSub = await (await import("@/lib/redis")).default.get(subKey);
                            if (prevSub !== null && prevSub !== String(currentSubIndex)) {
                                updates.subtitleChanges = { increment: 1 };
                                if (positionMs > 0) {
                                    telemetryEvents.push({
                                        eventType: "subtitle_change",
                                        positionMs,
                                        metadata: JSON.stringify({ from: prevSub, to: String(currentSubIndex) }),
                                    });
                                }
                            }
                            await (await import("@/lib/redis")).default.setex(subKey, 3600, String(currentSubIndex));
                        }

                        if (Object.keys(updates).length > 0) {
                            await prisma.playbackHistory.update({
                                where: { id: lastPlayback.id },
                                data: updates,
                            });
                        }

                        // Write telemetry events with position data
                        if (telemetryEvents.length > 0) {
                            await prisma.telemetryEvent.createMany({
                                data: telemetryEvents.map(e => ({
                                    playbackId: lastPlayback.id,
                                    eventType: e.eventType,
                                    positionMs: e.positionMs,
                                    metadata: e.metadata || null,
                                })),
                            });
                        }
                    }
                }
            }
        }

        return NextResponse.json({ success: true, message: await apiT('eventProcessed', { eventType }) });
    } catch (error) {
        console.error("[Webhook Error]:", error);
        return NextResponse.json({ error: await apiT('serverError500') }, { status: 500 });
    }
}
