"use client";

import { useState, useEffect, useCallback } from "react";
import { PlayCircle, LayoutList, Rows3, Headphones, Languages, MapPin } from "lucide-react";
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
    audioStreamIndex?: number | null;
    subtitleStreamIndex?: number | null;
    mediaType?: string | null;
    albumArtist?: string | null;
    albumName?: string | null;
    seriesName?: string | null;
    seasonName?: string | null;
    posterItemId?: string | null;
}

function getImageUrl(itemId: string, type: string = 'Primary', fallbackId?: string) {
    let url = `/api/jellyfin/image?itemId=${itemId}&type=${type}`;
    if (fallbackId) url += `&fallbackId=${fallbackId}`;
    return url;
}

function StreamCard({ stream }: { stream: LiveStream }) {
    const isAudio = stream.mediaType ? (stream.mediaType.toLowerCase().includes('audio') || stream.mediaType.toLowerCase() === 'track') : false;
    const isEpisode = stream.mediaType === 'Episode';
    const aspectClass = isAudio ? 'aspect-square' : isEpisode ? 'aspect-video' : 'aspect-[2/3]';
    const widthClass = isEpisode ? 'w-20' : 'w-12';
    const posterId = stream.posterItemId || stream.itemId;

    let detail: string | null = null;
    if (stream.mediaSubtitle) detail = stream.mediaSubtitle;
    else if (isAudio) {
        const a = stream.albumArtist ? `${stream.albumArtist}` : '';
        const b = stream.albumName ? `${stream.albumName}` : '';
        detail = [a, b].filter(Boolean).join(' — ') || null;
    } else if (stream.seriesName || stream.seasonName) {
        detail = `${stream.seriesName || ''}${stream.seasonName ? ` — ${stream.seasonName}` : ''}`.trim() || null;
    }

    return (
        <div className="flex items-center gap-4 p-3 border rounded-lg border-border/50 app-surface-soft hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
            {posterId ? (
                <div className={`relative ${widthClass} ${aspectClass} bg-muted rounded shrink-0 overflow-hidden ring-1 ring-white/10`}>
                    <FallbackImage
                        src={getImageUrl(posterId, 'Primary', stream.parentItemId || undefined)}
                        alt={stream.mediaTitle}
                        fill
                        className="object-cover"
                    />
                </div>
            ) : (
                <div className={`relative ${widthClass} ${aspectClass} bg-muted rounded shrink-0 flex items-center justify-center ring-1 ring-white/10`}>
                    <PlayCircle className="w-5 h-5 opacity-50" />
                </div>
            )}

            <div className="space-y-1 flex-1 min-w-0">
                <p className="text-sm font-medium leading-none truncate">
                    {stream.mediaTitle}
                </p>
                {detail && (
                    <p className="text-[11px] text-muted-foreground font-medium truncate">{detail}</p>
                )}
                <p className="text-xs text-muted-foreground flex flex-col gap-0.5">
                    <span className="truncate">{stream.user} . {stream.device}</span>
                    {(stream.audioLanguage || stream.subtitleLanguage) && (
                        <span className="text-[10px] opacity-70 truncate inline-flex items-center gap-1">
                            {stream.audioLanguage ? (
                                <span className="inline-flex items-center gap-1">
                                    <Headphones className="w-3 h-3" />
                                    <span className="font-mono uppercase">{stream.audioLanguage.toUpperCase()}</span>
                                </span>
                            ) : null}
                            {stream.audioCodec ? <span className="text-[10px] opacity-70">({stream.audioCodec})</span> : null}
                            {stream.audioStreamIndex != null ? <span>· A:{stream.audioStreamIndex}</span> : null}
                            {stream.subtitleLanguage ? (
                                <span className="inline-flex items-center gap-1">
                                    <Languages className="w-3 h-3" />
                                    <span className="font-mono uppercase">{stream.subtitleLanguage.toUpperCase()}</span>
                                </span>
                            ) : null}
                            {stream.subtitleCodec ? <span className="text-[10px] opacity-70">({stream.subtitleCodec})</span> : null}
                            {stream.subtitleStreamIndex != null ? <span>· S:{stream.subtitleStreamIndex}</span> : null}
                        </span>
                    )}
                    {(stream.city !== "Unknown" || stream.country !== "Unknown") && (
                        <span className="text-[10px] opacity-70 truncate inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            <span>{stream.city !== "Unknown" ? `${stream.city}, ` : ''}{stream.country}</span>
                        </span>
                    )}
                </p>
                    <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1.5 app-surface-soft border border-border/30 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all ${stream.isPaused ? 'bg-yellow-500' : 'bg-purple-500'}`}
                                style={{ width: `${stream.progressPercent}%` }}
                            />
                        </div>
                        <span className="text-[10px] text-muted-foreground w-8 text-right shrink-0">
                            {stream.isPaused ? '⏸' : ''}{stream.progressPercent}%
                        </span>
                    </div>
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
                    <div className="flex items-center gap-2 min-w-0 font-medium">
                        <span className="text-xs text-foreground truncate max-w-[120px]">{stream.user}</span>
                        <span className="text-[10px] text-muted-foreground truncate max-w-[180px]">{stream.mediaTitle}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${stream.playMethod === "Transcode" ? "bg-orange-500/10 text-orange-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                            {stream.playMethod === "Transcode" ? "TC" : "DP"}
                        </span>
                        {stream.isPaused && <span className="text-[10px] text-yellow-500">⏸</span>}
                        <span className="text-[10px] text-muted-foreground">{stream.progressPercent}%</span>
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
        let interval: NodeJS.Timeout;

        const startPolling = () => {
            if (interval) clearInterval(interval);
            interval = setInterval(fetchStreams, 4000);
        };

        const handleVisibilityChange = () => {
            if (document.hidden) {
                clearInterval(interval);
            } else {
                fetchStreams();
                startPolling();
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        startPolling();

        return () => {
            clearInterval(interval);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [fetchStreams]);

    const useTimeline = streams.length >= 3 && !forceCards;

    return (
        <Card className="col-span-3 app-surface-soft border-border/50 shadow-sm">
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
                                className="p-1.5 rounded-md border border-border/50 app-surface-soft hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                                title={forceCards ? "Vue Timeline" : "Vue Cartes"}
                            >
                            {forceCards ? <Rows3 className="w-4 h-4 text-muted-foreground" /> : <LayoutList className="w-4 h-4 text-muted-foreground" />}
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
