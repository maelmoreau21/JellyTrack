import { NextResponse } from "next/server";
import redis from "@/lib/redis";
import { requireAdmin, isAuthError } from "@/lib/auth";

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
            liveStreams = payloads
                .filter((p): p is string => p !== null)
                .map((p) => {
                    const payload: any = JSON.parse(p);
                    const isTranscoding = payload.isTranscoding === true
                        || payload.IsTranscoding === true
                        || payload.playMethod === "Transcode"
                        || payload.PlayMethod === "Transcode";
                    totalBandwidthMbps += isTranscoding ? 12 : 6;

                    let mediaSubtitle: string | null = null;
                    if (payload.mediaSubtitle) {
                        mediaSubtitle = payload.mediaSubtitle;
                    } else if (payload.SeriesName) {
                        mediaSubtitle = payload.SeriesName + (payload.SeasonName ? ` — ${payload.SeasonName}` : '');
                    } else if (payload.AlbumName) {
                        mediaSubtitle = (payload.AlbumArtist ? `${payload.AlbumArtist} — ` : '') + payload.AlbumName;
                    }

                    let progressPercent = 0;
                    if (typeof payload.progressPercent === "number") {
                        progressPercent = payload.progressPercent;
                    } else if (payload.PlaybackPositionTicks && payload.RunTimeTicks && payload.RunTimeTicks > 0) {
                        progressPercent = Math.min(100, Math.round((payload.PlaybackPositionTicks / payload.RunTimeTicks) * 100));
                    }

                    const sessionId = payload.sessionId || payload.SessionId;
                    const itemId = payload.itemId || payload.ItemId || null;
                    const parentItemId = payload.parentItemId || payload.AlbumId || payload.SeriesId || payload.SeasonId || null;
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
