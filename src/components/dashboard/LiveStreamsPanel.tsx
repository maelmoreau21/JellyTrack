"use client";

import { useState, useEffect, useCallback } from "react";
import { PlayCircle, LayoutList, Rows3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FallbackImage } from "@/components/FallbackImage";
import { KillStreamButton } from "@/components/dashboard/KillStreamButton";
import { useTranslations } from "next-intl";

interface LiveStream {
    sessionId: string;
    itemId: string | null;
    parentItemId: string | null;
    user: string;
    mediaTitle: string;
    mediaSubtitle: string | null;
    playMethod: string;
    device: string;
    country: string;
    city: string;
    progressPercent: number;
    isPaused: boolean;
    audioLanguage: string | null;
    audioCodec: string | null;
    subtitleLanguage: string | null;
    subtitleCodec: string | null;
}

function getImageUrl(itemId: string, type: string = 'Primary', fallbackId?: string) {
    let url = `/api/jellyfin/image?itemId=${itemId}&type=${type}`;
    if (fallbackId) url += `&fallbackId=${fallbackId}`;
    return url;
}

function StreamCard({ stream }: { stream: LiveStream }) {
    return (
        <div className="flex items-center gap-4 p-3 border rounded-lg border-zinc-800 bg-zinc-950/50">
            {stream.itemId ? (
                <div className="relative w-12 aspect-[2/3] bg-muted rounded shrink-0 overflow-hidden ring-1 ring-white/10">
                    <FallbackImage
                        src={getImageUrl(stream.itemId, 'Primary', stream.parentItemId || undefined)}
                        alt={stream.mediaTitle}
                        fill
                        className="object-cover"
                    />
                </div>
            ) : (
                <div className="w-12 aspect-[2/3] bg-muted rounded shrink-0 flex items-center justify-center ring-1 ring-white/10">
                    <PlayCircle className="w-5 h-5 opacity-50" />
                </div>
            )}

            <div className="space-y-1 flex-1 min-w-0">
                <p className="text-sm font-medium leading-none truncate">
                    {stream.mediaTitle}
                </p>
                {stream.mediaSubtitle && (
                    <p className="text-[11px] text-zinc-400 truncate">{stream.mediaSubtitle}</p>
                )}
                <p className="text-xs text-muted-foreground flex flex-col gap-0.5">
                    <span className="truncate">{stream.user} • {stream.device}</span>
                    {(stream.audioLanguage || stream.subtitleLanguage) && (
                        <span className="text-[10px] opacity-70 truncate">
                            {stream.audioLanguage ? `🔊 ${stream.audioLanguage.toUpperCase()}` : ''}
                            {stream.audioCodec ? ` (${stream.audioCodec})` : ''}
                            {stream.subtitleLanguage ? ` • 💬 ${stream.subtitleLanguage.toUpperCase()}` : ''}
                            {stream.subtitleCodec ? ` (${stream.subtitleCodec})` : ''}
                        </span>
                    )}
                    {(stream.city !== "Unknown" || stream.country !== "Unknown") && (
                        <span className="text-[10px] opacity-70 truncate">
                            📍 {stream.city !== "Unknown" ? `${stream.city}, ` : ''}{stream.country}
                        </span>
                    )}
                </p>
                {stream.progressPercent > 0 && (
                    <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all ${stream.isPaused ? 'bg-yellow-500' : 'bg-purple-500'}`}
                                style={{ width: `${stream.progressPercent}%` }}
                            />
                        </div>
                        <span className="text-[10px] text-zinc-500 w-8 text-right shrink-0">
                            {stream.isPaused ? '⏸' : ''}{stream.progressPercent}%
                        </span>
                    </div>
                )}
            </div>
            <div className="ml-auto font-medium text-xs shrink-0">
                <span
                    className={`px-2 py-1 rounded-full ${stream.playMethod === "Transcode"
                        ? "bg-orange-500/10 text-orange-500"
                        : "bg-emerald-500/10 text-emerald-500"
                        }`}
                >
                    {stream.playMethod}
                </span>
                <KillStreamButton sessionId={stream.sessionId} mediaTitle={stream.mediaTitle} />
            </div>
        </div>
    );
}

const GANTT_COLORS = [
    { bg: 'bg-purple-500', text: 'text-purple-300', track: 'bg-purple-500/20' },
    { bg: 'bg-blue-500', text: 'text-blue-300', track: 'bg-blue-500/20' },
    { bg: 'bg-emerald-500', text: 'text-emerald-300', track: 'bg-emerald-500/20' },
    { bg: 'bg-orange-500', text: 'text-orange-300', track: 'bg-orange-500/20' },
    { bg: 'bg-pink-500', text: 'text-pink-300', track: 'bg-pink-500/20' },
    { bg: 'bg-cyan-500', text: 'text-cyan-300', track: 'bg-cyan-500/20' },
    { bg: 'bg-yellow-500', text: 'text-yellow-300', track: 'bg-yellow-500/20' },
    { bg: 'bg-red-500', text: 'text-red-300', track: 'bg-red-500/20' },
];

function StreamTimeline({ stream, colorIndex }: { stream: LiveStream; colorIndex: number }) {
    const color = GANTT_COLORS[colorIndex % GANTT_COLORS.length];
    return (
        <div className="group flex items-center gap-3 py-1.5">
            {/* User avatar */}
            <div className={`w-7 h-7 rounded-full ${color.track} flex items-center justify-center shrink-0`}>
                <span className={`text-[10px] font-bold ${color.text}`}>
                    {stream.user.charAt(0).toUpperCase()}
                </span>
            </div>

            {/* Info + Gantt bar */}
            <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-medium text-zinc-200 truncate max-w-[120px]">{stream.user}</span>
                        <span className="text-[10px] text-zinc-500 truncate max-w-[180px]">{stream.mediaTitle}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${stream.playMethod === "Transcode" ? "bg-orange-500/10 text-orange-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                            {stream.playMethod === "Transcode" ? "TC" : "DP"}
                        </span>
                        {stream.isPaused && <span className="text-[10px] text-yellow-500">⏸</span>}
                        <span className="text-[10px] text-zinc-500">{stream.progressPercent}%</span>
                        <KillStreamButton sessionId={stream.sessionId} mediaTitle={stream.mediaTitle} />
                    </div>
                </div>
                {/* Gantt bar */}
                <div className={`h-2.5 w-full rounded-full ${color.track} overflow-hidden`}>
                    <div
                        className={`h-full rounded-full transition-all duration-500 ${stream.isPaused ? 'bg-yellow-500/60' : color.bg}`}
                        style={{ width: `${Math.max(2, stream.progressPercent)}%` }}
                    />
                </div>
            </div>
        </div>
    );
}

export function LiveStreamsPanel({ initialStreams, initialBandwidth }: { initialStreams: LiveStream[]; initialBandwidth: number }) {
    const t = useTranslations('liveStreams');
    const [streams, setStreams] = useState<LiveStream[]>(initialStreams);
    const [bandwidth, setBandwidth] = useState(initialBandwidth);
    const [forceCards, setForceCards] = useState(false);

    const fetchStreams = useCallback(async () => {
        try {
            const res = await fetch("/api/streams", { cache: "no-store" });
            if (res.ok) {
                const data = await res.json();
                setStreams(data.streams || []);
                setBandwidth(data.totalBandwidthMbps || 0);
            }
        } catch {
            // silently ignore network errors
        }
    }, []);

    useEffect(() => {
        const interval = setInterval(fetchStreams, 10000);
        return () => clearInterval(interval);
    }, [fetchStreams]);

    const useTimeline = streams.length >= 3 && !forceCards;

    return (
        <Card className="col-span-3 bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex gap-2"> {t('title')} <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse mt-1.5" /></CardTitle>
                        <CardDescription>
                            {t('description', { count: streams.length })}{bandwidth > 0 ? ` ~${bandwidth} Mbps` : ''}
                        </CardDescription>
                    </div>
                    {streams.length >= 3 && (
                        <button
                            onClick={() => setForceCards(!forceCards)}
                            className="p-1.5 rounded-md border border-zinc-700/50 bg-zinc-800/50 hover:bg-zinc-700/50 transition-colors"
                            title={forceCards ? "Vue Timeline" : "Vue Cartes"}
                        >
                            {forceCards ? <Rows3 className="w-4 h-4 text-zinc-400" /> : <LayoutList className="w-4 h-4 text-zinc-400" />}
                        </button>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                    {streams.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">
                            {t('noStreams')}
                        </p>
                    ) : useTimeline ? (
                        streams.map((stream, i) => (
                            <StreamTimeline key={stream.sessionId} stream={stream} colorIndex={i} />
                        ))
                    ) : (
                        streams.map((stream) => (
                            <StreamCard key={stream.sessionId} stream={stream} />
                        ))
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
