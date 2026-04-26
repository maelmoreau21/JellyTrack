import { NextResponse } from "next/server";
import redis from "@/lib/redis";
import { requireAdmin, isAuthError } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { buildLegacyStreamRedisKey, buildStreamRedisKey } from "@/lib/serverRegistry";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const url = new URL(req.url);
    const serversParam = url.searchParams.get("servers");
    const selectedServerIds = serversParam
        ? serversParam
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean)
        : [];

    const selectedServerScope = selectedServerIds.length > 0 ? { in: selectedServerIds } : undefined;

    try {
        const activeStreamEntries = await prisma.activeStream.findMany({
            where: selectedServerScope ? { serverId: selectedServerScope } : undefined,
            include: {
                user: { select: { username: true } },
                media: { select: { title: true, type: true, parentId: true, artist: true, durationMs: true, jellyfinMediaId: true, size: true } }
            }
        });

        interface RedisStreamPayload {
            isTranscoding?: boolean;
            IsTranscoding?: boolean;
            mediaSubtitle?: string;
            progressPercent?: number;
            isPaused?: boolean;
            IsPaused?: boolean;
            audioLanguage?: string;
            audioCodec?: string;
            subtitleLanguage?: string;
            subtitleCodec?: string;
            audioStreamIndex?: number;
            AudioStreamIndex?: number;
            subtitleStreamIndex?: number;
            SubtitleStreamIndex?: number;
        }

        let liveStreams: any[] = []; // Final return array can stay any[] or be refined
        let totalBandwidthMbps = 0;

        if (activeStreamEntries.length > 0) {
            const redisKeys = activeStreamEntries.map(s => buildStreamRedisKey(s.serverId, s.sessionId));
            const redisPayloads = await Promise.all(redisKeys.map(k => redis.get(k)));
            const redisMap = new Map<string, RedisStreamPayload>();
            
            redisPayloads.forEach((p, idx) => {
                if (p) {
                    try {
                        const parsed = JSON.parse(p) as RedisStreamPayload;
                        const stream = activeStreamEntries[idx];
                        redisMap.set(`${stream.serverId}:${stream.sessionId}`, parsed);
                    } catch {}
                }
            });

            // Backward compatibility: try legacy key if new key is missing.
            await Promise.all(activeStreamEntries.map(async (stream) => {
                const mapKey = `${stream.serverId}:${stream.sessionId}`;
                if (redisMap.has(mapKey)) return;
                try {
                    const legacyPayload = await redis.get(buildLegacyStreamRedisKey(stream.sessionId));
                    if (!legacyPayload) return;
                    const parsed = JSON.parse(legacyPayload) as RedisStreamPayload;
                    redisMap.set(mapKey, parsed);
                } catch {}
            }));

            const relatedPairs = new Set<string>();
            for (const entry of activeStreamEntries) {
                if (entry.media.parentId) relatedPairs.add(JSON.stringify([entry.serverId, entry.media.parentId]));
            }

            const relatedTargets = Array.from(relatedPairs).map((pair) => {
                const parsed = JSON.parse(pair) as [string, string];
                return { serverId: parsed[0], jellyfinMediaId: parsed[1] };
            });

            const relatedMedia = relatedTargets.length > 0
              ? await prisma.media.findMany({
                where: {
                    OR: relatedTargets.map((target) => ({
                        serverId: target.serverId,
                        jellyfinMediaId: target.jellyfinMediaId,
                    })),
                },
                select: { serverId: true, jellyfinMediaId: true, title: true, type: true, parentId: true, artist: true },
              })
              : [];
            const mediaHierarchyMap = new Map(relatedMedia.map((m) => [`${m.serverId}:${m.jellyfinMediaId}`, m]));

            liveStreams = activeStreamEntries.map((dbStream) => {
                const payload = redisMap.get(`${dbStream.serverId}:${dbStream.sessionId}`) || {};
                
                const isTranscoding = dbStream.playMethod === "Transcode" 
                    || payload?.isTranscoding === true
                    || payload?.IsTranscoding === true;
                    
                const streamBitrate = dbStream.bitrate ?? payload?.bitrate ?? (itemMedia.size && itemMedia.durationMs ? Math.round(Number(itemMedia.size) * 8 / (Number(itemMedia.durationMs) / 1000)) : null);
                if (streamBitrate) {
                    totalBandwidthMbps += streamBitrate / 1000000;
                } else {
                    totalBandwidthMbps += isTranscoding ? 12 : 6;
                }

                const itemMedia = dbStream.media;
                const parentMedia = itemMedia.parentId ? mediaHierarchyMap.get(`${dbStream.serverId}:${itemMedia.parentId}`) : null;
                const grandparentMedia = parentMedia?.parentId ? mediaHierarchyMap.get(`${dbStream.serverId}:${parentMedia.parentId}`) : null;

                let mediaSubtitle: string | null = null;
                if (payload?.mediaSubtitle) {
                    mediaSubtitle = payload.mediaSubtitle;
                } else if (itemMedia.type === "Episode" && parentMedia) {
                    mediaSubtitle = grandparentMedia?.title
                        ? `${grandparentMedia.title} — ${parentMedia.title}`
                        : parentMedia.title;
                } else if ((itemMedia.type === "Audio" || itemMedia.type === "Track") && parentMedia) {
                    const resolvedArtist = itemMedia.artist || parentMedia.artist || null;
                    mediaSubtitle = resolvedArtist ? `${resolvedArtist} — ${parentMedia.title}` : parentMedia.title;
                } else if (parentMedia?.title) {
                    mediaSubtitle = parentMedia.title;
                }

                let progressPercent = 0;
                if (typeof payload?.progressPercent === "number") {
                    progressPercent = payload?.progressPercent;
                } else if (dbStream.positionTicks && itemMedia.durationMs && itemMedia.durationMs > 0) {
                    const runTimeTicks = Number(itemMedia.durationMs) * 10_000;
                    progressPercent = Math.min(100, Math.round((Number(dbStream.positionTicks) / runTimeTicks) * 100));
                }

                return {
                    serverId: dbStream.serverId,
                    sessionId: dbStream.sessionId,
                    itemId: itemMedia.jellyfinMediaId,
                    parentItemId: itemMedia.parentId,
                    user: dbStream.user.username || "Unknown",
                    mediaTitle: itemMedia.title || "Unknown",
                    mediaSubtitle,
                    playMethod: dbStream.playMethod || "Unknown",
                    device: dbStream.deviceName || "Unknown",
                    country: dbStream.country || "Unknown",
                    city: dbStream.city || "Unknown",
                    progressPercent,
                    isPaused: payload?.isPaused === true || payload?.IsPaused === true,
                    audioLanguage: dbStream.audioLanguage || payload?.audioLanguage || null,
                    audioCodec: dbStream.audioCodec || payload?.audioCodec || null,
                    subtitleLanguage: dbStream.subtitleLanguage || payload?.subtitleLanguage || null,
                    subtitleCodec: dbStream.subtitleCodec || payload?.subtitleCodec || null,
                    audioStreamIndex: payload?.audioStreamIndex ?? payload?.AudioStreamIndex ?? null,
                    subtitleStreamIndex: payload?.subtitleStreamIndex ?? payload?.SubtitleStreamIndex ?? null,
                    mediaType: itemMedia.type,
                    albumArtist: itemMedia.artist,
                    posterItemId: (itemMedia.type === 'Audio' || itemMedia.type === 'Track') ? (itemMedia.parentId || itemMedia.jellyfinMediaId) : itemMedia.jellyfinMediaId,
                };
            }).filter((stream) => Boolean(stream.sessionId));
        }

        return NextResponse.json({
            streams: liveStreams,
            count: liveStreams.length,
            totalBandwidthMbps,
        });
    } catch (e: unknown) {
        console.error("[Live Streams API] Error:", e);
        return NextResponse.json({ streams: [], count: 0, totalBandwidthMbps: 0 });
    }
}
