"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TooltipProvider } from "@/components/ui/tooltip";

// --- Types ---
export interface TimelineEvent {
    eventType: "pause" | "stop" | "audio_change" | "subtitle_change";
    positionMs: number;   // ms position within the media
    count: number;        // aggregated count at this bucket
}

export interface SessionTimeline {
    id: string;
    username: string;
    jellyfinUserId: string;
    durationWatched: number; // seconds
    startedAt: string;
    events: { eventType: string; positionMs: number; metadata?: any }[];
}

export interface MediaTimelineChartProps {
    events: TimelineEvent[];
    durationMs: number;   // total media duration in ms
    buckets?: number;     // number of segments (default 50)
    sessions?: SessionTimeline[]; // per-user session data for detail view
}

// --- Constants ---
const EVENT_COLORS: Record<string, string> = {
    stop:            "#ef4444", // red
    pause:           "#eab308", // yellow
    audio_change:    "#a855f7", // purple
    subtitle_change: "#06b6d4", // cyan
};

const EVENT_ICONS: Record<string, string> = {
    stop:            "⏹",
    pause:           "⏸",
    audio_change:    "🔊",
    subtitle_change: "💬",
};

// --- Helpers ---
function formatMs(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
}

// --- Component ---
export default function MediaTimelineChart({ events, durationMs, buckets = 50, sessions = [] }: MediaTimelineChartProps) {
    const t = useTranslations("mediaProfile");
    const [hovered, setHovered] = useState<number | null>(null);
    const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set(["stop", "pause", "audio_change", "subtitle_change"]));
    const [selectedUser, setSelectedUser] = useState<string>("all");

    // Aggregate events into buckets
    const { bucketData, maxCount } = useMemo(() => {
        if (durationMs <= 0 || events.length === 0) {
            return { bucketData: [], maxCount: 0 };
        }

        const bucketSize = durationMs / buckets;
        const data: { startMs: number; endMs: number; events: Record<string, number> }[] = [];

        for (let i = 0; i < buckets; i++) {
            data.push({
                startMs: i * bucketSize,
                endMs: (i + 1) * bucketSize,
                events: { stop: 0, pause: 0, audio_change: 0, subtitle_change: 0 },
            });
        }

        for (const ev of events) {
            if (!activeTypes.has(ev.eventType)) continue;
            const idx = Math.min(Math.floor(ev.positionMs / bucketSize), buckets - 1);
            if (idx >= 0 && idx < buckets) {
                data[idx].events[ev.eventType] = (data[idx].events[ev.eventType] || 0) + ev.count;
            }
        }

        let max = 0;
        for (const bucket of data) {
            const total = Object.values(bucket.events).reduce((a, b) => a + b, 0);
            if (total > max) max = total;
        }

        return { bucketData: data, maxCount: max };
    }, [events, durationMs, buckets, activeTypes]);

    const toggleType = (type: string) => {
        setActiveTypes(prev => {
            const next = new Set(prev);
            if (next.has(type)) next.delete(type);
            else next.add(type);
            return next;
        });
    };

    if (durationMs <= 0 || events.length === 0) {
        return <p className="text-sm text-zinc-500 text-center py-6">{t("noDataSmall")}</p>;
    }

    // Unique users from sessions
    const uniqueUsers = useMemo(() => {
        const map = new Map<string, string>();
        sessions.forEach(s => {
            if (s.events.length > 0) map.set(s.jellyfinUserId, s.username);
        });
        return Array.from(map.entries());
    }, [sessions]);

    // Filtered sessions for detail view
    const filteredSessions = useMemo(() => {
        if (selectedUser === "all") return sessions.filter(s => s.events.length > 0);
        return sessions.filter(s => s.jellyfinUserId === selectedUser && s.events.length > 0);
    }, [sessions, selectedUser]);

    return (
        <TooltipProvider delayDuration={100}>
            <div className="space-y-3">
                {/* Legend / Filters */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-3 text-xs">
                        {Object.entries(EVENT_COLORS).map(([type, color]) => (
                            <button
                                key={type}
                                onClick={() => toggleType(type)}
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all ${
                                    activeTypes.has(type)
                                        ? "border-zinc-300 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-800"
                                        : "border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 opacity-40"
                                }`}
                            >
                                <span
                                    className="w-2.5 h-2.5 rounded-full"
                                    style={{ backgroundColor: color }}
                                />
                                <span className="text-zinc-700 dark:text-zinc-300">
                                    {EVENT_ICONS[type]} {t(`timeline_${type}` as any)}
                                </span>
                            </button>
                        ))}
                    </div>
                    {uniqueUsers.length > 1 && (
                        <select
                            value={selectedUser}
                            onChange={(e) => setSelectedUser(e.target.value)}
                            className="text-xs bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-md px-2 py-1.5 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                        >
                            <option value="all">{t("allUsers")}</option>
                            {uniqueUsers.map(([uid, name]) => (
                                <option key={uid} value={uid}>{name}</option>
                            ))}
                        </select>
                    )}
                </div>

                {/* Timeline chart */}
                <div className="relative w-full">
                    {/* Progress bar background */}
                    <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full mb-1" />

                    {/* Stacked bar chart */}
                    <div className="flex w-full gap-px" style={{ height: "120px" }}>
                        {bucketData.map((bucket, i) => {
                            const total = Object.values(bucket.events).reduce((a, b) => a + b, 0);
                            const heightPct = maxCount > 0 ? (total / maxCount) * 100 : 0;
                            const isHovered = hovered === i;

                            // Stack segments within the bar
                            const segments: { type: string; count: number; color: string }[] = [];
                            for (const type of ["stop", "pause", "audio_change", "subtitle_change"]) {
                                if (bucket.events[type] > 0 && activeTypes.has(type)) {
                                    segments.push({ type, count: bucket.events[type], color: EVENT_COLORS[type] });
                                }
                            }

                            return (
                                <Tooltip key={i}>
                                    <TooltipTrigger asChild>
                                        <div
                                            className="flex-1 flex flex-col justify-end cursor-pointer transition-opacity"
                                            style={{ opacity: isHovered ? 1 : 0.85 }}
                                            onMouseEnter={() => setHovered(i)}
                                            onMouseLeave={() => setHovered(null)}
                                        >
                                            <div
                                                className="w-full rounded-t transition-all duration-150 flex flex-col justify-end overflow-hidden"
                                                style={{ height: `${heightPct}%`, minHeight: total > 0 ? "2px" : "0" }}
                                            >
                                                {segments.map((seg, si) => {
                                                    const segPct = total > 0 ? (seg.count / total) * 100 : 0;
                                                    return (
                                                        <div
                                                            key={si}
                                                            style={{
                                                                backgroundColor: seg.color,
                                                                height: `${segPct}%`,
                                                                minHeight: seg.count > 0 ? "1px" : "0",
                                                            }}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </TooltipTrigger>
                                    {total > 0 && (
                                        <TooltipContent className="bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 text-xs space-y-1">
                                            <p className="font-semibold text-zinc-300">
                                                {formatMs(bucket.startMs)} – {formatMs(bucket.endMs)}
                                            </p>
                                            {segments.map(seg => (
                                                <div key={seg.type} className="flex items-center gap-1.5">
                                                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: seg.color }} />
                                                    <span>{EVENT_ICONS[seg.type]} {t(`timeline_${seg.type}` as any)}: {seg.count}</span>
                                                </div>
                                            ))}
                                        </TooltipContent>
                                    )}
                                </Tooltip>
                            );
                        })}
                    </div>

                    {/* Time axis labels */}
                    <div className="flex justify-between text-[10px] text-zinc-500 mt-1 px-0.5">
                        <span>0:00</span>
                        <span>{formatMs(durationMs * 0.25)}</span>
                        <span>{formatMs(durationMs * 0.5)}</span>
                        <span>{formatMs(durationMs * 0.75)}</span>
                        <span>{formatMs(durationMs)}</span>
                    </div>
                </div>

                {/* Per-session detail timelines */}
                {sessions.length > 0 && filteredSessions.length > 0 && (
                    <div className="space-y-1.5 mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-800/50">
                        <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
                            {t("sessionDetail")} ({filteredSessions.length})
                        </h4>
                        <div className="max-h-[220px] overflow-y-auto space-y-1 pr-1 scrollbar-thin">
                            {filteredSessions.slice(0, 30).map((session) => (
                                <div key={session.id} className="flex items-center gap-2 group">
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <span className="text-[10px] text-zinc-500 w-20 shrink-0 truncate cursor-default">
                                                {session.username}
                                            </span>
                                        </TooltipTrigger>
                                        <TooltipContent className="bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 text-xs">
                                            <p>{session.username}</p>
                                            <p className="text-zinc-400">{new Date(session.startedAt).toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" })}</p>
                                            <p className="text-zinc-400">{Math.round(session.durationWatched / 60)} min • {session.events.length} {t("eventsCount")}</p>
                                        </TooltipContent>
                                    </Tooltip>
                                    <div className="relative flex-1 h-5 bg-zinc-800/30 rounded border border-zinc-200 dark:border-zinc-800/50 group-hover:border-zinc-700/50 transition-colors">
                                        {/* Watched progress overlay */}
                                        <div
                                            className="absolute inset-y-0 left-0 bg-zinc-700/20 rounded-l"
                                            style={{ width: `${Math.min((session.durationWatched * 1000 / durationMs) * 100, 100)}%` }}
                                        />
                                        {/* Event markers */}
                                        {session.events
                                            .filter(e => activeTypes.has(e.eventType))
                                            .map((evt, ei) => {
                                                const pct = Math.min((evt.positionMs / durationMs) * 100, 100);
                                                const color = EVENT_COLORS[evt.eventType] || EVENT_COLORS.stop;
                                                let detail = '';
                                                try {
                                                    const md = typeof evt.metadata === 'string' ? JSON.parse(evt.metadata) : evt.metadata;
                                                    if (md && md.from && md.to) {
                                                        const fmt = (side: any) => {
                                                            if (!side) return '—';
                                                            const label = side.language ?? (side.index !== undefined ? `#${side.index}` : String(side));
                                                            const codec = side.codec ? ` (${side.codec})` : '';
                                                            return `${label}${codec}`;
                                                        };
                                                        detail = `${fmt(md.from)} → ${fmt(md.to)}`;
                                                    } else if (md && md.from !== undefined && md.to !== undefined) {
                                                        detail = `${md.from} → ${md.to}`;
                                                    }
                                                } catch {}
                                                return (
                                                    <Tooltip key={ei}>
                                                        <TooltipTrigger asChild>
                                                            <div
                                                                className="absolute top-0 bottom-0 w-[3px] rounded-full cursor-default hover:w-1"
                                                                style={{ left: `${pct}%`, backgroundColor: color, opacity: 0.85 }}
                                                            />
                                                        </TooltipTrigger>
                                                        <TooltipContent className="bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 text-xs">
                                                            {EVENT_ICONS[evt.eventType]} {t(`timeline_${evt.eventType}` as any)}{detail ? ` — ${detail}` : ''} @ {formatMs(evt.positionMs)}
                                                        </TooltipContent>
                                                    </Tooltip>
                                                );
                                            })}
                                    </div>
                                    <span className="text-[10px] text-zinc-600 w-10 text-right shrink-0">
                                        {Math.round(session.durationWatched / 60)}m
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </TooltipProvider>
    );
}
