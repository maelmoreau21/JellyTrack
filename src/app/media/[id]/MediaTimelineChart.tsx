"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

export type EventType = "pause" | "stop" | "download" | "audio_change" | "subtitle_change" | "seek" | "replay" | "speed_change";

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
    download: "#8b5cf6",
    audio_change: "#a855f7",
    subtitle_change: "#06b6d4",
};

const EVENT_TOKENS: Record<EventType, string> = {
    stop: "Stop",
    pause: "Pause",
    seek: "Skip",
    replay: "Replay",
    speed_change: "Vitesse",
    download: "DL",
    audio_change: "Audio",
    subtitle_change: "Sous-titres",
};

const EVENT_TYPES: EventType[] = ["stop", "download", "pause", "seek", "replay", "speed_change", "audio_change", "subtitle_change"];

function formatMs(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
}

function parsePositionMs(value: unknown): number | null {
    const parsed = typeof value === "number"
        ? value
        : typeof value === "string"
            ? Number(value)
            : NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
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
        const fromMs = parsePositionMs(md.fromMs);
        const toMs = parsePositionMs(md.toMs);
        const from = typeof md.fromLabel === "string" ? md.fromLabel : fromMs !== null ? formatMs(fromMs) : null;
        const to = typeof md.toLabel === "string" ? md.toLabel : toMs !== null ? formatMs(toMs) : null;
        if (from !== null && to !== null) return `${from} -> ${to}`;
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
                events: { stop: 0, download: 0, pause: 0, seek: 0, replay: 0, speed_change: 0, audio_change: 0, subtitle_change: 0 },
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
        return <p className="text-sm text-muted-foreground text-center py-6">{t("noDataSmall")}</p>;
    }

    return (
        <TooltipProvider delayDuration={80}>
            <div className="space-y-4">
                {/* Event Type Filter Pills */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-background/40 p-2.5 rounded-xl border border-border/40">
                    <div className="flex flex-wrap gap-2 text-xs">
                        {EVENT_TYPES.map((et) => {
                            const isActive = activeTypes.has(et);
                            return (
                                <button
                                    key={et}
                                    onClick={() => toggleType(et)}
                                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium transition-all ${
                                        isActive
                                            ? "border-primary/40 bg-primary/15 text-primary shadow-sm"
                                            : "border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/60 opacity-60"
                                    }`}
                                >
                                    <span className="w-2.5 h-2.5 rounded-full ring-2 ring-background shrink-0" style={{ backgroundColor: EVENT_COLORS[et] }} />
                                    <span>
                                        {EVENT_TOKENS[et]}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    {uniqueUsers.length > 1 && (
                        <select
                            value={selectedUser}
                            onChange={(e) => setSelectedUser(e.target.value)}
                            className="app-field text-xs rounded-lg px-3 py-1.5 text-foreground bg-background border border-border/60 focus:outline-none focus:ring-1 focus:ring-primary/40 shadow-sm"
                        >
                            <option value="all">{t("allUsers")}</option>
                            {uniqueUsers.map(([uid, name]) => (
                                <option key={uid} value={uid}>{name}</option>
                            ))}
                        </select>
                    )}
                </div>

                {/* Main Timeline Chart Box */}
                <div className="relative w-full rounded-xl border border-border/60 bg-gradient-to-b from-card/80 to-background/90 p-4 shadow-sm backdrop-blur-sm overflow-hidden">
                    {/* Background Grid Lines */}
                    <div className="absolute inset-x-4 top-4 bottom-8 flex flex-col justify-between pointer-events-none opacity-20">
                        <div className="border-b border-dashed border-border w-full" />
                        <div className="border-b border-dashed border-border w-full" />
                        <div className="border-b border-dashed border-border w-full" />
                    </div>

                    {/* Chart Bars */}
                    <div className="flex w-full gap-[2px] items-end h-[140px] relative z-10 pt-2 pb-1">
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
                                            className="flex-1 flex flex-col justify-end cursor-pointer group transition-all duration-150 h-full"
                                            onMouseEnter={() => setHovered(i)}
                                            onMouseLeave={() => setHovered(null)}
                                        >
                                            <div
                                                className={`w-full rounded-t-sm transition-all duration-150 flex flex-col justify-end overflow-hidden ${
                                                    isHovered ? "ring-2 ring-primary ring-offset-1 ring-offset-background scale-y-105" : "opacity-90 hover:opacity-100"
                                                }`}
                                                style={{ height: `${heightPct}%`, minHeight: total > 0 ? "4px" : "0" }}
                                            >
                                                {segments.map((seg, si) => {
                                                    const segPct = total > 0 ? (seg.count / total) * 100 : 0;
                                                    return (
                                                        <div
                                                            key={si}
                                                            style={{
                                                                backgroundColor: seg.color,
                                                                height: `${segPct}%`,
                                                                minHeight: seg.count > 0 ? "2px" : "0",
                                                            }}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </TooltipTrigger>
                                    {total > 0 && (
                                        <TooltipContent className="app-surface text-xs space-y-1.5 border border-border/80 shadow-md p-3">
                                            <p className="font-semibold text-foreground border-b border-border/50 pb-1">
                                                ⏱️ {formatMs(bucket.startMs)} - {formatMs(bucket.endMs)}
                                            </p>
                                            <div className="space-y-1">
                                                {segments.map(seg => (
                                                    <div key={seg.type} className="flex items-center justify-between gap-3 text-xs">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="w-2.5 h-2.5 rounded-full ring-1 ring-background" style={{ backgroundColor: seg.color }} />
                                                            <span className="text-muted-foreground">{EVENT_TOKENS[seg.type]} {t(`timeline_${seg.type}`)}</span>
                                                        </div>
                                                        <span className="font-mono font-bold text-foreground">{seg.count}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </TooltipContent>
                                    )}
                                </Tooltip>
                            );
                        })}
                    </div>

                    {/* Timeline Axis Track */}
                    <div className="w-full h-1.5 bg-muted/60 rounded-full my-2 overflow-hidden relative">
                        <div className="absolute inset-0 bg-gradient-to-r from-primary/30 via-primary/50 to-primary/30" />
                    </div>

                    {/* Timeline X-Axis Time Markers */}
                    <div className="flex justify-between text-[11px] font-mono text-muted-foreground px-0.5 pt-0.5">
                        <span>0:00</span>
                        <span>{formatMs(durationMs * 0.25)}</span>
                        <span>{formatMs(durationMs * 0.5)}</span>
                        <span>{formatMs(durationMs * 0.75)}</span>
                        <span>{formatMs(durationMs)}</span>
                    </div>
                </div>

                {/* Per-Session Timeline Breakdown */}
                {sessions.length > 0 && filteredSessions.length > 0 && (
                    <div className="space-y-2 mt-4 pt-4 border-t border-border/50">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                            <span>{t("sessionDetail")} ({filteredSessions.length})</span>
                            <span className="text-[10px] font-normal normal-case opacity-70">Positions des événements par utilisateur</span>
                        </h4>
                        <div className="max-h-[260px] overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
                            {filteredSessions.slice(0, 30).map((session) => (
                                <div key={session.id} className="flex items-center gap-3 group p-1.5 rounded-lg hover:bg-muted/30 transition-colors border border-transparent hover:border-border/40">
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <span className="text-xs font-medium text-foreground/90 w-24 shrink-0 truncate cursor-default">
                                                {session.username}
                                            </span>
                                        </TooltipTrigger>
                                        <TooltipContent className="app-surface text-xs p-2">
                                            <p className="font-semibold">{session.username}</p>
                                            <p className="text-muted-foreground">{new Date(session.startedAt).toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" })}</p>
                                            <p className="text-muted-foreground">{Math.round(session.durationWatched / 60)} min - {t("eventsCount", { count: session.events.length })}</p>
                                        </TooltipContent>
                                    </Tooltip>
                                    <div className="relative flex-1 h-6 bg-muted/40 rounded-md border border-border/40 group-hover:border-primary/40 transition-colors overflow-hidden">
                                        <div
                                            className="absolute inset-y-0 left-0 bg-primary/15 rounded-l-md"
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
                                                                className="absolute top-0 bottom-0 w-[4px] rounded-full cursor-pointer hover:w-2 hover:z-20 transition-all shadow-sm"
                                                                style={{ left: `${pct}%`, backgroundColor: color }}
                                                            />
                                                        </TooltipTrigger>
                                                        <TooltipContent className="app-surface text-xs p-2 border border-border/80">
                                                            <div className="font-medium text-foreground">
                                                                {EVENT_TOKENS[evt.eventType]} {t(`timeline_${evt.eventType}`)}
                                                            </div>
                                                            {detail && <div className="text-muted-foreground text-[11px] mt-0.5">{detail}</div>}
                                                            <div className="text-[10px] font-mono text-primary mt-1">@ {formatMs(evt.positionMs)}</div>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                );
                                            })}
                                    </div>
                                    <span className="text-[11px] font-mono text-muted-foreground w-12 text-right shrink-0">
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
