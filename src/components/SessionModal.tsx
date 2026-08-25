"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTranslations, useLocale } from "next-intl";
import { useTimeFormat } from "@/lib/timeFormat";
import { 
  Pause, 
  Volume2, 
  Subtitles, 
  FastForward, 
  RotateCcw, 
  Gauge, 
  Download, 
  Square, 
  Activity, 
  LucideIcon 
} from "lucide-react";

type TelemetryEvent = {
  eventType?: string | null;
  positionMs?: number | string | null;
  metadata?: unknown;
  createdAt?: string | number | null;
};

type SessionType = {
  durationWatched?: number | string | null;
  mediaSubtitle?: string | null;
  media?: { jellyfinMediaId?: string | null; title?: string | null; durationMs?: string | number | null } | null;
  user?: { username?: string | null } | null;
  clientName?: string | null;
  pauseCount?: number | null;
  audioChanges?: number | null;
  subtitleChanges?: number | null;
  seekCount?: number | null;
  rewatchCount?: number | null;
  speedChangeCount?: number | null;
  telemetryEvents?: TelemetryEvent[];
};

type NormalizedEvent = {
  eventType: string;
  positionMs: number;
  metadata?: unknown;
  createdAt?: string | number | null;
};

type GroupedEvent = {
  key: string;
  pos: number;
  events: NormalizedEvent[];
  repType: string;
  count: number;
};

function formatTime(ms: number): string {
  const safe = Number.isFinite(ms) && ms > 0 ? ms : 0;
  const totalSec = Math.floor(safe / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function parsePositionMs(value: unknown): number | null {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number(value)
      : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function formatRate(value: unknown): string | null {
  const numberValue = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number(value.replace(/^x/i, ""))
      : NaN;
  if (!Number.isFinite(numberValue)) return null;
  return `x${numberValue.toFixed(2).replace(/\.?0+$/, "")}`;
}

function parseChangeDetail(eventType: string, metadata: unknown): string {
  if (!metadata) return "";
  try {
    const mdRaw = typeof metadata === "string" ? JSON.parse(metadata) : metadata;
    const md = mdRaw as Record<string, unknown> | undefined;
    if (!md) return "";

    if (eventType === "seek" || eventType === "replay") {
      const fromMs = parsePositionMs(md.fromMs);
      const toMs = parsePositionMs(md.toMs);
      const from = typeof md.fromLabel === "string" ? md.fromLabel : fromMs !== null ? formatTime(fromMs) : null;
      const to = typeof md.toLabel === "string" ? md.toLabel : toMs !== null ? formatTime(toMs) : null;
      if (from !== null && to !== null) return `${from} -> ${to}`;
    }

    if (eventType === "speed_change") {
      const from = typeof md.fromRateLabel === "string" ? md.fromRateLabel : formatRate(md.fromRate);
      const to = typeof md.toRateLabel === "string" ? md.toRateLabel : formatRate(md.toRate);
      return from && to ? `${from} -> ${to}` : to || "";
    }

    const fmt = (side: unknown) => {
      if (!side) return "-";
      if (typeof side === "string" || typeof side === "number") return String(side);
      const s = side as Record<string, unknown>;
      const language = typeof s.language === "string" ? s.language : undefined;
      const index = typeof s.index === "number" ? `#${s.index}` : undefined;
      const codec = typeof s.codec === "string" ? ` (${s.codec})` : "";
      return `${language ?? index ?? String(side)}${codec}`;
    };

    if (Object.prototype.hasOwnProperty.call(md, "from") && Object.prototype.hasOwnProperty.call(md, "to")) {
      return `${fmt(md.from)} -> ${fmt(md.to)}`;
    }
  } catch {
    return "";
  }
  return "";
}

export default function SessionModal({ open, onClose, session }: { open: boolean; onClose: () => void; session: SessionType }) {
  const t = useTranslations("logs");
  const locale = useLocale();
  const { formatDateTime, timeFormat } = useTimeFormat();

  if (!open) return null;

  const formatCreatedAt = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined) return "";
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return "";
    try {
      return date.toLocaleString(locale === "fr" ? "fr-FR" : locale || "fr-FR", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: timeFormat === "12h",
      });
    } catch {
      return formatDateTime(date);
    }
  };

  const mediaDurationCandidate = Number(session.media?.durationMs || 0);
  const mediaDurationMs = Number.isFinite(mediaDurationCandidate) && mediaDurationCandidate > 0
    ? mediaDurationCandidate
    : 0;

  const watchedDurationMs = Math.max(Number(session.durationWatched || 0) * 1000, 0);

  const normalizedEvents: NormalizedEvent[] = (session.telemetryEvents || [])
    .map((ev) => {
      const eventType = String(ev.eventType || "").trim();
      const numericPosition = Number(ev.positionMs || 0);
      let positionMs = Number.isFinite(numericPosition) ? Math.max(0, numericPosition) : 0;

      // Fix tick vs millisecond mismatches (e.g., positionMs stored in ticks)
      if (mediaDurationMs > 0 && positionMs > mediaDurationMs) {
        if (Math.floor(positionMs / 10000) <= mediaDurationMs) {
          positionMs = Math.floor(positionMs / 10000);
        } else {
          positionMs = Math.min(positionMs, mediaDurationMs);
        }
      }

      return {
        eventType,
        positionMs,
        metadata: ev.metadata,
        createdAt: ev.createdAt,
      };
    })
    .sort((a, b) => a.positionMs - b.positionMs);

  const maxEventPositionMs = normalizedEvents.length > 0
    ? Math.max(...normalizedEvents.map((ev) => ev.positionMs))
    : 0;

  const totalDurationMs = mediaDurationMs > 0
    ? mediaDurationMs
    : Math.max(watchedDurationMs, maxEventPositionMs, 1);

  const watchedPercent = totalDurationMs > 0
    ? Math.min(100, Math.max(0, (watchedDurationMs / totalDurationMs) * 100))
    : 0;

  const groupedMap = new Map<number, NormalizedEvent[]>();
  const GROUP_WINDOW_MS = 1500;
  for (const event of normalizedEvents) {
    const bucket = Math.floor(event.positionMs / GROUP_WINDOW_MS) * GROUP_WINDOW_MS;
    if (!groupedMap.has(bucket)) groupedMap.set(bucket, []);
    groupedMap.get(bucket)!.push(event);
  }

  const groupedEvents: GroupedEvent[] = Array.from(groupedMap.entries())
    .map(([bucket, events]) => {
      const rawAvg = Math.floor(events.reduce((sum, ev) => sum + ev.positionMs, 0) / Math.max(events.length, 1));
      const avg = totalDurationMs > 0 ? Math.min(rawAvg, totalDurationMs) : rawAvg;
      const priority = ["pause", "audio_change", "subtitle_change", "seek", "replay", "speed_change", "stop"];
      let repType = events[0]?.eventType || "default";
      for (const type of priority) {
        if (events.some((ev) => ev.eventType === type)) {
          repType = type;
          break;
        }
      }
      return {
        key: `${bucket}:${repType}`,
        pos: avg,
        events,
        repType,
        count: events.length,
      };
    })
    .sort((a, b) => a.pos - b.pos);

  const eventCounts = normalizedEvents.reduce(
    (acc, ev) => {
      switch (ev.eventType) {
        case "pause":
          acc.pause += 1;
          break;
        case "audio_change":
          acc.audio += 1;
          break;
        case "subtitle_change":
          acc.subtitles += 1;
          break;
        case "seek":
          acc.seek += 1;
          break;
        case "replay":
          acc.replay += 1;
          break;
        case "speed_change":
          acc.speed += 1;
          break;
        case "stop":
          acc.stop += 1;
          break;
        default:
          acc.other += 1;
          break;
      }
      return acc;
    },
    { pause: 0, audio: 0, subtitles: 0, seek: 0, replay: 0, speed: 0, stop: 0, other: 0 },
  );

  const getEventMeta = (type: string): { marker: string; iconColor: string; Icon: LucideIcon; label: string } => {
    switch (type) {
      case "pause":
        return { marker: "bg-amber-500", iconColor: "text-amber-500", Icon: Pause, label: t("timeline.label.pause") };
      case "audio_change":
        return { marker: "bg-sky-500", iconColor: "text-sky-500", Icon: Volume2, label: t("timeline.label.audio_change") };
      case "subtitle_change":
        return { marker: "bg-emerald-500", iconColor: "text-emerald-500", Icon: Subtitles, label: t("timeline.label.subtitle_change") };
      case "seek":
        return { marker: "bg-orange-500", iconColor: "text-orange-500", Icon: FastForward, label: t("timeline.label.seek") };
      case "replay":
        return { marker: "bg-green-500", iconColor: "text-green-500", Icon: RotateCcw, label: t("timeline.label.replay") };
      case "speed_change":
        return { marker: "bg-blue-500", iconColor: "text-blue-500", Icon: Gauge, label: t("timeline.label.speed_change") };
      case "download":
        return { marker: "bg-violet-500", iconColor: "text-violet-500", Icon: Download, label: t("timeline.label.download") };
      case "stop":
        return { marker: "bg-rose-500", iconColor: "text-rose-500", Icon: Square, label: t("timeline.label.stop") };
      default:
        return { marker: "bg-zinc-500", iconColor: "text-zinc-500", Icon: Activity, label: `${t("timeline.label.default")} (${type || "?"})` };
    }
  };

  const jumpTo = (posMs: number) => {
    const s = Math.floor((posMs || 0) / 1000);
    const mediaId = session.media?.jellyfinMediaId;
    if (!mediaId) return;
    window.open(`/media/${mediaId}?t=${s}`, "_blank");
  };

  const copyJump = (posMs: number) => {
    const s = Math.floor((posMs || 0) / 1000);
    const mediaId = session.media?.jellyfinMediaId;
    if (!mediaId) return;
    navigator.clipboard?.writeText(`${window.location.origin}/media/${mediaId}?t=${s}`).catch(() => {});
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative app-surface rounded-xl w-[95%] md:w-[900px] max-h-[85vh] overflow-auto p-6 shadow-2xl border border-border/50">
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <h3 className="text-xl font-bold text-foreground">{session.media?.title || t("unknownMedia")}</h3>
            {session.mediaSubtitle && (
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {(() => {
                  const bulletIdx = session.mediaSubtitle.indexOf(' • ');
                  if (bulletIdx > 0 && bulletIdx <= 20) {
                    const code = session.mediaSubtitle.slice(0, bulletIdx);
                    const rest = session.mediaSubtitle.slice(bulletIdx + 3);
                    return (
                      <>
                        <span className="font-bold text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-md font-mono tracking-wide shadow-sm">
                          {code}
                        </span>
                        <span className="text-sm font-semibold text-primary">{rest}</span>
                      </>
                    );
                  }
                  return <div className="text-xs text-primary font-semibold">{session.mediaSubtitle}</div>;
                })()}
              </div>
            )}
            <div className="text-sm text-muted-foreground font-medium mt-0.5">{session.user?.username} - {session.clientName || t("unknown")}</div>
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-3 flex-wrap">
                <Badge variant="secondary" className="app-surface-soft border-border/50 text-foreground">{t("timeline.legend.pause")}: {eventCounts.pause || (session.pauseCount ?? 0)}</Badge>
                <Badge variant="secondary" className="app-surface-soft border-border/50 text-foreground">{t("timeline.legend.audio")}: {eventCounts.audio || (session.audioChanges ?? 0)}</Badge>
                <Badge variant="secondary" className="app-surface-soft border-border/50 text-foreground">{t("timeline.legend.subtitles")}: {eventCounts.subtitles || (session.subtitleChanges ?? 0)}</Badge>
                <Badge variant="secondary" className="app-surface-soft border-border/50 text-foreground">{t("timeline.label.seek")}: {eventCounts.seek || (session.seekCount ?? 0)}</Badge>
                <Badge variant="secondary" className="app-surface-soft border-border/50 text-foreground">{t("timeline.label.replay")}: {eventCounts.replay || (session.rewatchCount ?? 0)}</Badge>
                <Badge variant="secondary" className="app-surface-soft border-border/50 text-foreground">{t("timeline.label.speed_change")}: {eventCounts.speed || (session.speedChangeCount ?? 0)}</Badge>
                <Badge variant="secondary" className="app-surface-soft border-border/50 text-foreground">{t("timeline.stop")}: {eventCounts.stop}</Badge>
                {eventCounts.other > 0 ? (
                  <Badge variant="secondary" className="app-surface-soft border-border/50 text-foreground">{t("timeline.label.default")}: {eventCounts.other}</Badge>
                ) : null}
              </div>

              <div className="mt-2">
                <div className="mt-2 text-xs text-muted-foreground mb-2">{t("timeline.title")} - {formatTime(totalDurationMs)}</div>
                <div className="w-full app-surface-soft border border-border/50 rounded-lg relative overflow-hidden p-3">
                  <div className="relative h-14">
                    <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-2 rounded-full bg-zinc-300/40 dark:bg-zinc-800/60" />
                    <div
                      className="absolute left-0 top-1/2 -translate-y-1/2 h-2 rounded-full bg-primary/55"
                      style={{ width: `${watchedPercent}%` }}
                    />

                    {groupedEvents.length === 0 ? (
                      <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">{t("timeline.noEvents")}</div>
                    ) : (
                      groupedEvents.map((group, idx) => {
                        const pct = totalDurationMs > 0
                          ? Math.min(99, Math.max(1, (group.pos / totalDurationMs) * 100))
                          : 1;
                        const meta = getEventMeta(group.repType);
                        const detail = parseChangeDetail(group.repType, group.events[0]?.metadata);
                        return (
                          <button
                            key={group.key || idx}
                            className="absolute top-1/2 -translate-y-1/2 z-10"
                            style={{ left: `${pct}%`, transform: "translate(-50%, -50%)" }}
                            onClick={() => jumpTo(group.pos)}
                            title={`${meta.label}${detail ? ` - ${detail}` : ""} @ ${formatTime(group.pos)}${group.count > 1 ? ` (x${group.count})` : ""}`}
                          >
                            <span className={`block h-10 w-[3px] rounded-full ${meta.marker}`} />
                            {group.count > 1 ? (
                              <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground">{group.count}</span>
                            ) : null}
                          </button>
                        );
                      })
                    )}
                  </div>

                  <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
                    <span>0:00</span>
                    <span>{formatTime(totalDurationMs * 0.25)}</span>
                    <span>{formatTime(totalDurationMs * 0.5)}</span>
                    <span>{formatTime(totalDurationMs * 0.75)}</span>
                    <span>{formatTime(totalDurationMs)}</span>
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {groupedEvents.length === 0 ? (
                    <div className="text-xs text-muted-foreground">{t("timeline.noEvents")}</div>
                  ) : groupedEvents.map((group, i: number) => {
                    const meta = getEventMeta(group.repType);
                    const detail = parseChangeDetail(group.repType, group.events[0]?.metadata);
                    const createdAtLabel = formatCreatedAt(group.events[0]?.createdAt);
                    return (
                      <div key={group.key || i} className="p-3 rounded-lg app-surface-soft border border-border/50 hover:border-primary/30 transition-colors">
                        <div className="flex items-center gap-1.5 font-bold text-[12px] text-foreground">
                          <meta.Icon className={`w-3.5 h-3.5 shrink-0 ${meta.iconColor}`} />
                          <span>{meta.label}</span>
                          {group.count > 1 && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono text-muted-foreground border-border/80 ml-1">
                              x{group.count}
                            </Badge>
                          )}
                        </div>
                        {createdAtLabel ? (
                          <div className="text-muted-foreground text-[11px] font-medium mt-0.5">{createdAtLabel}</div>
                        ) : null}
                        <div className="mt-1 text-[11px] text-foreground/80">
                          {formatTime(group.pos)} - {totalDurationMs > 0 ? Math.min(100, Math.max(0, Math.round((group.pos / totalDurationMs) * 100))) : 0}%{detail ? ` - ${detail}` : ""}
                        </div>
                        <div className="mt-3 flex gap-2">
                          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => jumpTo(group.pos)}>{t("timeline.action.jump")}</Button>
                          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => copyJump(group.pos)}>{t("timeline.action.copy")}</Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="flex-shrink-0">
            <button aria-label={t("timeline.action.close")} onClick={onClose} className="app-field px-3 py-2">{t("timeline.action.close")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
