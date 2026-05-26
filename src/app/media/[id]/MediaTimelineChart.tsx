"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TooltipProvider } from "@/components/ui/tooltip";

export type EventType = "pause" | "stop" | "audio_change" | "subtitle_change" | "seek" | "replay" | "speed_change";

export interface TimelineEvent {
    eventType: EventType;
    positionMs: number;
    count: number;
}

export interface SessionTimeline {
    id: string;
    username: string;
    jellyfinUserId: string;
    durationWatched: number;
    startedAt: string;
    events: { eventType: EventType; positionMs: number; metadata?: unknown | string }[];
}

export interface MediaTimelineChartProps {
    events: TimelineEvent[];
    durationMs: number;
    buckets?: number;
    sessions?: SessionTimeline[];
}

const EVENT_COLORS: Record<EventType, string> = {
    stop: "#ef4444",
    pause: "#eab308",
    seek: "#f97316",
    replay: "#22c55e",
    speed_change: "#3b82f6",
    audio_change: "#a855f7",
    subtitle_change: "#06b6d4",
};

const EVENT_TOKENS: Record<EventType, string> = {
    stop: "Stop",
    pause: "Pause",
    seek: "Skip",
    replay: "Replay",
    speed_change: "x",
    audio_change: "A",
    subtitle_change: "Sub",
};

const EVENT_TYPES: EventType[] = ["stop", "pause", "seek", "replay", "speed_change", "audio_change", "subtitle_change"];

function formatMs(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
}

function parseEventMetadata(metadata: unknown): Record<string, unknown> | null {
    if (!metadata) return null;
    try {
        const parsed = typeof metadata === "string" ? JSON.parse(metadata) : metadata;
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : null;
    } catch {
        return null;
    }
}

function formatRate(raw: unknown): string | null {
    const value = typeof raw === "number"
        ? raw
        : typeof raw === "string"
            ? Number(raw.replace(/^x/i, ""))
            : NaN;
    if (!Number.isFinite(value)) return null;
    return `x${value.toFixed(2).replace(/\.?0+$/, "")}`;
}

function formatEventDetail(eventType: EventType, metadata: unknown): string {
    const md = parseEventMetadata(metadata);
    if (!md) return "";

    if (eventType === "seek" || eventType === "replay") {
        const from = typeof md.fromLabel === "string" ? md.fromLabel : null;
        const to = typeof md.toLabel === "string" ? md.toLabel : null;
        if (from && to) return `${from} -> ${to}`;
    }

    if (eventType === "speed_change") {
        const from = typeof md.fromRateLabel === "string" ? md.fromRateLabel : formatRate(md.fromRate);
        const to = typeof md.toRateLabel === "string" ? md.toRateLabel : formatRate(md.toRate);
        return from && to ? `${from} -> ${to}` : to || "";
    }

    if (md.from && md.to) {
        const fmt = (side: unknown) => {
            if (!side) return "-";
            if (typeof side === "object" && side !== null) {
                const s = side as Record<string, unknown>;
                const label = typeof s.language === "string"
                    ? s.language
                    : s.index !== undefined
                        ? `#${String(s.index)}`
                        : String(side);
                const codec = typeof s.codec === "string" ? ` (${s.codec})` : "";
                return `${label}${codec}`;
            }
            return String(side);
        };
        return `${fmt(md.from)} -> ${fmt(md.to)}`;
    }

    return "";
}

export default function MediaTimelineChart({ events, durationMs, buckets = 50, sessions = [] }: MediaTimelineChartProps) {
    const t = useTranslations("mediaProfile");
    const [hovered, setHovered] = useState<number | null>(null);
    const [activeTypes, setActiveTypes] = useState<Set<EventType>>(new Set(EVENT_TYPES));
    const [selectedUser, setSelectedUser] = useState<string>("all");

    const { bucketData, maxCount } = useMemo(() => {
        if (durationMs <= 0 || events.length === 0) {
            return { bucketData: [], maxCount: 0 };
        }

        const bucketSize = durationMs / buckets;
        const data: { startMs: number; endMs: number; events: Record<EventType, number> }[] = [];

        for (let i = 0; i < buckets; i++) {
            data.push({
                startMs: i * bucketSize,
                endMs: (i + 1) * bucketSize,
                events: { stop: 0, pause: 0, seek: 0, replay: 0, speed_change: 0, audio_change: 0, subtitle_change: 0 },
            });
        }

        for (const ev of events) {
            if (!activeTypes.has(ev.eventType)) continue;
            const idx = Math.min(Math.floor(ev.positionMs / bucketSize), buckets - 1);
            if (idx >= 0 && idx < buckets) {
                data[idx].events[ev.eventType] += ev.count;
            }
        }

        let max = 0;
        for (const bucket of data) {
            const total = Object.values(bucket.events).reduce((a, b) => a + b, 0);
            if (total > max) max = total;
        }

        return { bucketData: data, maxCount: max };
    }, [events, durationMs, buckets, activeTypes]);

    const toggleType = (type: EventType) => {
        setActiveTypes(prev => {
            const next = new Set(prev);
            if (next.has(type)) next.delete(type);
            else next.add(type);
            return next;
        });
    };

    const uniqueUsers = useMemo(() => {
        const map = new Map<string, string>();
        sessions.forEach(s => {
            if (s.events && s.events.length > 0) map.set(s.jellyfinUserId, s.username);
        });
        return Array.from(map.entries());
    }, [sessions]);

    const filteredSessions = useMemo(() => {
        if (selectedUser === "all") return sessions.filter(s => s.events && s.events.length > 0);
        return sessions.filter(s => s.jellyfinUserId === selectedUser && s.events && s.events.length > 0);
    }, [sessions, selectedUser]);

    if (durationMs <= 0 || events.length === 0) {
        return <p className="text-sm text-zinc-500 text-center py-6">{t("noDataSmall")}</p>;
    }

    return (
        <TooltipProvider delayDuration={100}>
            <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-3 text-xs">
                        {EVENT_TYPES.map((et) => (
                            <button
                                key={et}
                                onClick={() => toggleType(et)}
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all ${
                                    activeTypes.has(et)
                                        ? "border-zinc-300 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-800"
                                        : "border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 opacity-40"
                                }`}
                            >
                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: EVENT_COLORS[et] }} />
                                <span className="text-zinc-700 dark:text-zinc-300">
                                    {EVENT_TOKENS[et]} {t(`timeline.label.${et}`)}
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

                <div className="relative w-full">
                    <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full mb-1" />

                    <div className="flex w-full gap-px" style={{ height: "120px" }}>
                        {bucketData.map((bucket, i) => {
                            const total = Object.values(bucket.events).reduce((a, b) => a + b, 0);
                            const heightPct = maxCount > 0 ? (total / maxCount) * 100 : 0;
                            const isHovered = hovered === i;
                            const segments = EVENT_TYPES
                                .filter(type => bucket.events[type] > 0 && activeTypes.has(type))
                                .map(type => ({ type, count: bucket.events[type], color: EVENT_COLORS[type] }));

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
                                                {formatMs(bucket.startMs)} - {formatMs(bucket.endMs)}
                                            </p>
                                            {segments.map(seg => (
                                                <div key={seg.type} className="flex items-center gap-1.5">
                                                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: seg.color }} />
                                                    <span>{EVENT_TOKENS[seg.type]} {t(`timeline_${seg.type}`)}: {seg.count}</span>
                                                </div>
                                            ))}
                                        </TooltipContent>
                                    )}
                                </Tooltip>
                            );
                        })}
                    </div>

                    <div className="flex justify-between text-[10px] text-zinc-500 mt-1 px-0.5">
                        <span>0:00</span>
                        <span>{formatMs(durationMs * 0.25)}</span>
                        <span>{formatMs(durationMs * 0.5)}</span>
                        <span>{formatMs(durationMs * 0.75)}</span>
                        <span>{formatMs(durationMs)}</span>
                    </div>
                </div>

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
                                            <p className="text-zinc-400">{Math.round(session.durationWatched / 60)} min - {t("eventsCount", { count: session.events.length })}</p>
                                        </TooltipContent>
                                    </Tooltip>
                                    <div className="relative flex-1 h-5 bg-zinc-800/30 rounded border border-zinc-200 dark:border-zinc-800/50 group-hover:border-zinc-700/50 transition-colors">
                                        <div
                                            className="absolute inset-y-0 left-0 bg-zinc-700/20 rounded-l"
                                            style={{ width: `${Math.min((session.durationWatched * 1000 / durationMs) * 100, 100)}%` }}
                                        />
                                        {session.events
                                            .filter(e => activeTypes.has(e.eventType))
                                            .map((evt, ei) => {
                                                const pct = Math.min((evt.positionMs / durationMs) * 100, 100);
                                                const color = EVENT_COLORS[evt.eventType] || EVENT_COLORS.stop;
                                                const detail = formatEventDetail(evt.eventType, evt.metadata);
                                                return (
                                                    <Tooltip key={ei}>
                                                        <TooltipTrigger asChild>
                                                            <div
                                                                className="absolute top-0 bottom-0 w-[3px] rounded-full cursor-default hover:w-1"
                                                                style={{ left: `${pct}%`, backgroundColor: color, opacity: 0.85 }}
                                                            />
                                                        </TooltipTrigger>
                                                        <TooltipContent className="bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 text-xs">
                                                            {EVENT_TOKENS[evt.eventType]} {t(`timeline_${evt.eventType}`)}{detail ? ` - ${detail}` : ""} @ {formatMs(evt.positionMs)}
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
