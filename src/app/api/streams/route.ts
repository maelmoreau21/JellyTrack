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
                    totalBandwidthMbps += payload.IsTranscoding ? 12 : 6;

                    let mediaSubtitle: string | null = null;
                    if (payload.SeriesName) {
                        mediaSubtitle = payload.SeriesName + (payload.SeasonName ? ` â€” ${payload.SeasonName}` : '');
                    } else if (payload.AlbumName) {
                        mediaSubtitle = (payload.AlbumArtist ? `${payload.AlbumArtist} â€” ` : '') + payload.AlbumName;
                    }

                    let progressPercent = 0;
                    if (payload.PlaybackPositionTicks && payload.RunTimeTicks && payload.RunTimeTicks > 0) {
                        progressPercent = Math.min(100, Math.round((payload.PlaybackPositionTicks / payload.RunTimeTicks) * 100));
                    }

                    return {
                        sessionId: payload.SessionId,
                        itemId: payload.ItemId || null,
                        parentItemId: payload.AlbumId || payload.SeriesId || payload.SeasonId || null,
                        user: payload.UserName || payload.UserId || "Unknown",
                        mediaTitle: payload.ItemName || "Unknown",
                        mediaSubtitle,
                        playMethod: payload.PlayMethod || (payload.IsTranscoding ? "Transcode" : "DirectPlay"),
                        device: payload.DeviceName || "Unknown",
                        country: payload.Country || "Unknown",
                        city: payload.City || "Unknown",
                        progressPercent,
                        isPaused: payload.IsPaused === true,
                        audioLanguage: payload.AudioLanguage || null,
                        audioCodec: payload.AudioCodec || null,
                        subtitleLanguage: payload.SubtitleLanguage || null,
                        subtitleCodec: payload.SubtitleCodec || null,
                    };
                });
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
