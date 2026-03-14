import { NextResponse } from "next/server";
import redis from "@/lib/redis";
import { requireAdmin, isAuthError } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;
    try {
        const keys = await redis.keys("stream:*");
        let liveStreams: any[] = [];
        let totalBandwidthMbps = 0;

        if (keys.length > 0) {
            const payloads = await Promise.all(keys.map((k) => redis.get(k)));
            const parsedPayloads = payloads
                .filter((p): p is string => p !== null)
                .map((p) => {
                    try {
                        return JSON.parse(p);
                    } catch {
                        return null;
                    }
                })
                .filter((p): p is any => Boolean(p));

            const relatedIds = new Set<string>();
            for (const payload of parsedPayloads) {
                const itemId = payload.itemId || payload.ItemId || null;
                const parentItemId = payload.parentItemId || payload.AlbumId || payload.SeriesId || payload.SeasonId || null;
                if (itemId) relatedIds.add(itemId);
                if (parentItemId) relatedIds.add(parentItemId);
            }

            const relatedMedia = relatedIds.size > 0
                ? await prisma.media.findMany({
                    where: { jellyfinMediaId: { in: Array.from(relatedIds) } },
                    select: { jellyfinMediaId: true, title: true, type: true, parentId: true, artist: true },
                })
                : [];
            const mediaMap = new Map(relatedMedia.map((m) => [m.jellyfinMediaId, m]));

            liveStreams = parsedPayloads
                .map((payload: any) => {
                    const isTranscoding = payload.isTranscoding === true
                        || payload.IsTranscoding === true
                        || payload.playMethod === "Transcode"
                        || payload.PlayMethod === "Transcode";
                    totalBandwidthMbps += isTranscoding ? 12 : 6;

                    const itemId = payload.itemId || payload.ItemId || null;
                    const parentItemId = payload.parentItemId || payload.AlbumId || payload.SeriesId || payload.SeasonId || null;
                    const itemMedia = itemId ? mediaMap.get(itemId) : null;
                    const parentMedia = parentItemId ? mediaMap.get(parentItemId) : null;
                    const grandparentMedia = parentMedia?.parentId ? mediaMap.get(parentMedia.parentId) : null;

                    let mediaSubtitle: string | null = null;
                    if (payload.mediaSubtitle) {
                        mediaSubtitle = payload.mediaSubtitle;
                        if (!mediaSubtitle.includes("—") && parentMedia?.title && (itemMedia?.type === "Audio" || itemMedia?.type === "Track")) {
                            mediaSubtitle = `${mediaSubtitle} — ${parentMedia.title}`;
                        }
                    } else if (payload.SeriesName) {
                        mediaSubtitle = payload.SeriesName + (payload.SeasonName ? ` — ${payload.SeasonName}` : '');
                    } else if (payload.AlbumName) {
                        mediaSubtitle = (payload.AlbumArtist ? `${payload.AlbumArtist} — ` : '') + payload.AlbumName;
                    } else if (itemMedia?.type === "Episode" && parentMedia) {
                        mediaSubtitle = grandparentMedia?.title
                            ? `${grandparentMedia.title} — ${parentMedia.title}`
                            : parentMedia.title;
                    } else if ((itemMedia?.type === "Audio" || itemMedia?.type === "Track") && parentMedia) {
                        const resolvedArtist = itemMedia.artist || parentMedia.artist || null;
                        mediaSubtitle = resolvedArtist ? `${resolvedArtist} — ${parentMedia.title}` : parentMedia.title;
                    } else if (parentMedia?.title) {
                        mediaSubtitle = parentMedia.title;
                    }

                    let progressPercent = 0;
                    if (typeof payload.progressPercent === "number") {
                        progressPercent = payload.progressPercent;
                    } else if (payload.PlaybackPositionTicks && payload.RunTimeTicks && payload.RunTimeTicks > 0) {
                        progressPercent = Math.min(100, Math.round((payload.PlaybackPositionTicks / payload.RunTimeTicks) * 100));
                    }

                    const sessionId = payload.sessionId || payload.SessionId;
                    const user = payload.username || payload.UserName || payload.userId || payload.UserId || "Unknown";
                    const mediaTitle = payload.title || payload.ItemName || "Unknown";
                    const playMethod = payload.playMethod || payload.PlayMethod || (isTranscoding ? "Transcode" : "DirectPlay");
                    const device = payload.deviceName || payload.DeviceName || payload.device || "Unknown";
                    const country = payload.country || payload.Country || "Unknown";
                    const city = payload.city || payload.City || "Unknown";
                    const isPaused = payload.isPaused === true || payload.IsPaused === true;
                    const audioLanguage = payload.audioLanguage || payload.AudioLanguage || null;
                    const audioCodec = payload.audioCodec || payload.AudioCodec || null;
                    const subtitleLanguage = payload.subtitleLanguage || payload.SubtitleLanguage || null;
                    const subtitleCodec = payload.subtitleCodec || payload.SubtitleCodec || null;
                    const audioStreamIndex = payload.audioStreamIndex ?? payload.AudioStreamIndex ?? null;
                    const subtitleStreamIndex = payload.subtitleStreamIndex ?? payload.SubtitleStreamIndex ?? null;

                    const mediaType = itemMedia?.type || parentMedia?.type || payload.type || null;
                    const albumArtist = payload.AlbumArtist || itemMedia?.artist || parentMedia?.artist || null;
                    const albumName = payload.AlbumName || payload.Album || parentMedia?.title || null;
                    const seriesName = payload.SeriesName || null;
                    const seasonName = payload.SeasonName || null;
                    const posterItemId = (itemMedia?.type === 'Audio' || itemMedia?.type === 'Track') ? (parentItemId || itemId) : (itemId || parentItemId);

                    return {
                        sessionId,
                        itemId,
                        parentItemId,
                        user,
                        mediaTitle,
                        mediaSubtitle,
                        playMethod,
                        device,
                        country,
                        city,
                        progressPercent,
                        isPaused,
                        audioLanguage,
                        audioCodec,
                        subtitleLanguage,
                        subtitleCodec,
                        audioStreamIndex,
                        subtitleStreamIndex,
                        mediaType,
                        albumArtist,
                        albumName,
                        seriesName,
                        seasonName,
                        posterItemId,
                    };
                })
                .filter((stream) => Boolean(stream.sessionId));
        }

        return NextResponse.json({
            streams: liveStreams,
            count: liveStreams.length,
            totalBandwidthMbps,
        });
    } catch (e: any) {
        console.error("[Live Streams API] Error:", e);
        return NextResponse.json({ streams: [], count: 0, totalBandwidthMbps: 0 });
    }
}
