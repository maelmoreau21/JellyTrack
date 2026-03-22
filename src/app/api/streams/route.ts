import { NextResponse } from "next/server";
import redis from "@/lib/redis";
import { requireAdmin, isAuthError } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;
    try {
        const activeStreamEntries = await prisma.activeStream.findMany({
            include: {
                user: { select: { username: true } },
                media: { select: { title: true, type: true, parentId: true, artist: true, durationMs: true, jellyfinMediaId: true } }
            }
        });

        let liveStreams: any[] = [];
        let totalBandwidthMbps = 0;

        if (activeStreamEntries.length > 0) {
            const redisKeys = activeStreamEntries.map(s => `stream:${s.sessionId}`);
            const redisPayloads = await Promise.all(redisKeys.map(k => redis.get(k)));
            const redisMap = new Map<string, any>();
            
            redisPayloads.forEach((p, idx) => {
                if (p) {
                    try {
                        const parsed = JSON.parse(p);
                        redisMap.set(activeStreamEntries[idx].sessionId, parsed);
                    } catch {}
                }
            });

            const relatedIds = new Set<string>();
            for (const entry of activeStreamEntries) {
                if (entry.media.parentId) relatedIds.add(entry.media.parentId);
            }
            
            const relatedMedia = relatedIds.size > 0
              ? await prisma.media.findMany({
                where: { jellyfinMediaId: { in: Array.from(relatedIds) } },
                select: { jellyfinMediaId: true, title: true, type: true, parentId: true, artist: true },
              })
              : [];
            const mediaHierarchyMap = new Map(relatedMedia.map((m) => [m.jellyfinMediaId, m]));

            liveStreams = activeStreamEntries.map((dbStream: any) => {
                const payload = redisMap.get(dbStream.sessionId) || {};
                
                const isTranscoding = dbStream.playMethod === "Transcode" 
                    || payload?.isTranscoding === true
                    || payload?.IsTranscoding === true;
                    
                totalBandwidthMbps += isTranscoding ? 12 : 6;

                const itemMedia = dbStream.media;
                const parentMedia = itemMedia.parentId ? mediaHierarchyMap.get(itemMedia.parentId) : null;
                const grandparentMedia = parentMedia?.parentId ? mediaHierarchyMap.get(parentMedia.parentId) : null;

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
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[Live Streams API] Error:", e);
        return NextResponse.json({ streams: [], count: 0, totalBandwidthMbps: 0 });
    }
}
