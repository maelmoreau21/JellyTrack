"use client";

import React, { useMemo, useState } from "react";
import { TableRow, TableCell } from "@/components/ui/table";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ChevronDown } from "lucide-react";
import { FallbackImage } from "@/components/FallbackImage";
import { useTranslations } from 'next-intl';
import { normalizeResolution } from '@/lib/utils';
import type { SafeLog, SafeTelemetryEvent } from '@/types/logs';

export default function LogRow({ log, visibleColumns, onOpenDetails }: { log: SafeLog; visibleColumns: string[]; onOpenDetails?: (log: SafeLog)=>void }) {
  const t = useTranslations('logs');
  const [open, setOpen] = useState(false);
  const [bucketMs, setBucketMs] = useState<number>(0); // 0 = exact positions

  const isTranscode = String(log.playMethod || "").toLowerCase().includes("transcode");
  const isParty = !!(log as any).partyId;
  const isAudioMedia = log.media?.type ? (String(log.media.type).toLowerCase().includes('audio') || String(log.media.type).toLowerCase() === 'track') : false;

  const events = useMemo<SafeTelemetryEvent[]>(() => {
    return (log.telemetryEvents || []).slice().sort((a, b) => {
      const pa = Number(a.positionMs || 0);
      const pb = Number(b.positionMs || 0);
      return pa - pb;
    });
  }, [log.telemetryEvents]);

  const formatTime = (ms: number | string | undefined) => {
    const n = Number(ms || 0);
    if (!Number.isFinite(n) || n <= 0) return '0:00';
    const s = Math.floor(n / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const durationMs = useMemo(() => {
    const fromLog = Number(log.durationWatched ?? 0) * 1000;
    const maxEvent = events.length ? Math.max(...events.map((e) => Number(e.positionMs || 0))) : 0;
    return Math.max(fromLog, maxEvent, 1);
  }, [log.durationWatched, events]);

  const groupedEvents = useMemo(() => {
    if (!events || events.length === 0) return [] as Array<{ key: number; pos: number; events: SafeTelemetryEvent[]; count: number; repType?: string }>;
    if (!bucketMs) return events.map((e) => ({ key: Number(e.positionMs || 0), pos: Number(e.positionMs || 0), events: [e], count: 1, repType: e.eventType }));

    const map = new Map<number, SafeTelemetryEvent[]>();
    for (const ev of events) {
      const pos = Math.max(0, Number(ev.positionMs || 0));
      const bucket = Math.floor(pos / bucketMs) * bucketMs;
      if (!map.has(bucket)) map.set(bucket, []);
      map.get(bucket)!.push(ev);
    }

    const out = Array.from(map.entries()).map(([bucket, arr]) => {
      const posAvg = Math.floor(arr.reduce((s, a) => s + Number(a.positionMs || 0), 0) / arr.length);
      const priority = ['pause', 'audio_change', 'subtitle_change'];
      let repType = arr[0].eventType;
      for (const p of priority) if (arr.some(a => a.eventType === p)) { repType = p; break; }
      return { key: bucket, pos: posAvg, events: arr, count: arr.length, repType };
    });
    return out.sort((a, b) => a.pos - b.pos);
  }, [events, bucketMs]);

  const normalizedResolution = log.media?.resolution ? normalizeResolution(log.media.resolution) : null;

  const getEventMeta = (type: string | null | undefined) => {
    switch (type) {
      case 'pause': return { color: 'bg-amber-600', label: t('timeline.label.pause'), icon: '⏸' };
      case 'audio_change': return { color: 'bg-sky-500', label: t('timeline.label.audio_change'), icon: '🔊' };
      case 'subtitle_change': return { color: 'bg-emerald-500', label: t('timeline.label.subtitle_change'), icon: '💬' };
      case 'seek': return { color: 'bg-indigo-500', label: t('timeline.label.seek'), icon: '🔁' };
      default: return { color: 'bg-zinc-700', label: String(type || t('timeline.label.default')).replace(/_/g, ' '), icon: '•' };
    }
  };

  const formatChangeDetail = (ev: SafeTelemetryEvent | null | undefined) => {
    if (!ev || !ev.metadata) return '';
    try {
      const mdRaw = typeof ev.metadata === 'string' ? JSON.parse(ev.metadata) : ev.metadata;
      const md = mdRaw as Record<string, unknown> | undefined;
      if (!md) return '';

      const hasFrom = Object.prototype.hasOwnProperty.call(md, 'from');
      const hasTo = Object.prototype.hasOwnProperty.call(md, 'to');

      const fmtSide = (side: unknown) => {
        if (!side) return '—';
        if (typeof side === 'string' || typeof side === 'number') return String(side);
        const s = side as Record<string, unknown>;
        const language = typeof s.language === 'string' ? s.language : undefined;
        const index = typeof s.index === 'number' ? `#${s.index}` : undefined;
        const codec = typeof s.codec === 'string' ? ` (${s.codec})` : '';
        const label = language ?? index ?? String(side);
        return `${label}${codec}`;
      };

      if (hasFrom && hasTo) {
        const from = md['from'];
        const to = md['to'];
        return `${fmtSide(from)} → ${fmtSide(to)}`;
      }
    } catch {}
    return '';
  };

  return (
    <>
      <TableRow className={`even:bg-zinc-100/50 dark:even:bg-slate-900/35 hover:bg-zinc-100 dark:hover:bg-slate-800/55 border-zinc-200/50 dark:border-zinc-700/50 transition-colors ${isParty ? 'border-l-2 border-l-violet-500/40' : ''}`}>
        {/* Date (with expand toggle) */}
        {visibleColumns.includes('date') && (
          <TableCell className="font-medium whitespace-nowrap pr-3">
            <div className="flex items-center gap-1.5 min-w-0">
              <button onClick={() => setOpen(v => !v)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOpen(v=>!v); }} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1" aria-expanded={open} aria-label={open ? 'Collapse' : 'Expand'}>
                <ChevronDown className={`w-4 h-4 transform ${open ? 'rotate-180' : 'rotate-0'}`} />
              </button>
              <span>
                {(() => {
                  try {
                    const d = new Date(log.startedAt);
                    if (isNaN(d.getTime())) return '—';
                    return d.toLocaleString();
                  } catch { return '—'; }
                })()}
              </span>
            </div>
          </TableCell>
        )}

        {/* StartedAt */}
        {visibleColumns.includes('startedAt') && (
          <TableCell className="hidden md:table-cell whitespace-nowrap">
            {log.startedAt ? new Date(log.startedAt).toLocaleString() : '—'}
          </TableCell>
        )}

        {/* EndedAt */}
        {visibleColumns.includes('endedAt') && (
          <TableCell className="hidden md:table-cell whitespace-nowrap">
            {log.endedAt ? new Date(log.endedAt).toLocaleString() : '—'}
          </TableCell>
        )}

        {/* User */}
        {visibleColumns.includes('user') && (
          <TableCell className="font-semibold text-primary pl-3">
            {log.user ? (
              <Link href={`/users/${log.user.jellyfinUserId}`} className="hover:underline">{log.user.username}</Link>
            ) : '—'}
          </TableCell>
        )}

        {/* Media */}
        {visibleColumns.includes('media') && (
          <TableCell className="overflow-hidden">
            <div className="flex items-center gap-2 md:gap-3 w-full overflow-hidden" title={log.media?.title || 'Unknown'}>
              <div className={`relative ${log.media?.type === 'Episode' ? 'aspect-video w-20' : isAudioMedia ? 'aspect-square w-12 md:w-14' : 'aspect-[2/3] w-12 md:w-14'} bg-muted rounded-md shrink-0 overflow-hidden ring-1 ring-white/10`}>
                {log.media?.jellyfinMediaId ? (
                  <FallbackImage
                    src={`/api/jellyfin/image?itemId=${log.media.jellyfinMediaId}&type=Primary${log.fallbackImageParentId ? `&fallbackId=${log.fallbackImageParentId}` : ''}`}
                    alt={log.media?.title || 'Unknown'}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <FallbackImage src="" alt={'Unknown'} fill className="object-cover" />
                )}
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                {log.media?.jellyfinMediaId ? (
                  <Link href={`/media/${log.media.jellyfinMediaId}`} className="truncate font-medium text-zinc-800 dark:text-zinc-100 hover:underline" title={log.media?.title || 'Unknown'}>
                    {log.media?.title || 'Unknown'}
                  </Link>
                ) : (
                  <span className="truncate font-medium text-zinc-400">Unknown</span>
                )}
                {log.mediaSubtitle ? (
                  <span className="text-xs text-zinc-500 truncate flex items-center gap-1" title={log.mediaSubtitle}>{log.mediaSubtitle}</span>
                ) : (
                  <span className="text-xs text-zinc-500">{log.media?.type || '—'}</span>
                )}

                <div className="hidden md:flex items-center gap-2 mt-1 text-xs text-zinc-500">
                  {normalizedResolution && (
                      <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">{normalizedResolution}</span>
                    )}
                  {isAudioMedia && (
                    <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">{typeof log.bitrate === 'number' && log.bitrate > 0 ? `${log.bitrate} kbps` : 'Unknown'}</span>
                  )}
                  <span className={`px-1.5 py-0.5 rounded ${isTranscode ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'}`}>{log.playMethod || 'DirectPlay'}</span>
                  {log.clientName && <span className="truncate">{log.clientName}</span>}
                </div>

              </div>
            </div>
          </TableCell>
        )}

        {/* Client */}
        {visibleColumns.includes('client') && (
          <TableCell className="hidden lg:table-cell">
            <div className="text-sm font-semibold">{log.clientName || '—'}</div>
          </TableCell>
        )}

        {/* IP */}
        {visibleColumns.includes('ip') && (
          <TableCell className="hidden lg:table-cell">
            <div className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded-sm w-fit">{log.ipAddress || '—'}</div>
          </TableCell>
        )}

        {/* Country */}
        {visibleColumns.includes('country') && (
          <TableCell className="hidden lg:table-cell">
            <div className="text-xs">
              {(() => {
                if (!log.country || log.country === 'Unknown') {
                  return log.city && log.city !== 'Unknown' ? log.city : '—';
                }
                return log.city && log.city !== 'Unknown' ? `${log.city}, ${log.country}` : log.country;
              })()}
            </div>
          </TableCell>
        )}

        {/* Status */}
        {visibleColumns.includes('status') && (
          <TableCell className="hidden md:table-cell">
            <Badge variant={isTranscode ? "destructive" : "default"} className={`shadow-sm ${isTranscode ? 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20' : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'}`}>
              {log.playMethod || 'DirectPlay'}
            </Badge>
          </TableCell>
        )}

        {/* Codecs */}
        {visibleColumns.includes('codecs') && (
          <TableCell className="hidden lg:table-cell">
            {isTranscode && log.videoCodec ? (
              <div className="flex flex-col text-xs text-muted-foreground font-mono">
                <span>V: {log.videoCodec}</span>
                {log.audioCodec && <span>A: {log.audioCodec}</span>}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground italic">source</span>
            )}
          </TableCell>
        )}

        {/* Duration */}
        {visibleColumns.includes('duration') && (
          <TableCell className="text-right whitespace-nowrap hidden md:table-cell">
            {log.isActuallyActive
              ? (
                <span className="text-amber-500/80 animate-pulse text-xs uppercase tracking-wider font-semibold flex flex-row items-center justify-end gap-1"><span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>Active</span>
              )
              : (log.durationWatched ?? 0) > 0
                ? `${Math.floor((log.durationWatched ?? 0) / 60)} min`
                : '0 min'
            }
          </TableCell>
        )}

        {/* Telemetry quick columns */}
        {visibleColumns.includes('pauseCount') && (
          <TableCell className="hidden lg:table-cell text-sm">{log.pauseCount ?? 0}</TableCell>
        )}
        {visibleColumns.includes('audioChanges') && (
          <TableCell className="hidden lg:table-cell text-sm">{log.audioChanges ?? 0}</TableCell>
        )}
        {visibleColumns.includes('subtitleChanges') && (
          <TableCell className="hidden lg:table-cell text-sm">{log.subtitleChanges ?? 0}</TableCell>
        )}

      </TableRow>

      {/* Expanded row */}
      <TableRow className={`${open ? '' : 'hidden'} bg-muted/10 dark:bg-zinc-950/60`}> 
        <TableCell colSpan={visibleColumns.length} className="px-4 py-3">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">{t('timeline.legend.pause')}:</span>
                <Badge className="bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">{log.pauseCount ?? 0}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">{t('timeline.legend.audio')}:</span>
                <Badge className="bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">{log.audioChanges ?? 0}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">{t('timeline.legend.subtitles')}:</span>
                <Badge className="bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">{log.subtitleChanges ?? 0}</Badge>
              </div>
              <div className="ml-auto text-xs text-zinc-500">{t('colStartedAt')}: {log.startedAt ? new Date(log.startedAt).toLocaleString() : '—'} — {t('colEndedAt')}: {log.endedAt ? new Date(log.endedAt).toLocaleString() : '—'}</div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <div className="text-xs text-zinc-400 mb-2">{t('timeline.title')}</div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="hidden sm:flex items-center gap-2 text-zinc-500">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-600 inline-block"/> ⏸ {t('timeline.legend.pause')}</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-sky-500 inline-block"/> 🔊 {t('timeline.legend.audio')}</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block"/> 💬 {t('timeline.legend.subtitles')}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-zinc-400">{t('timeline.toggle.exact')}</span>
                  </div>
                </div>
              </div>

              <div className="w-full">
                <div className="app-surface-soft border rounded-md p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs text-zinc-400">{t('timeline.title')}</div>
                    <div className="text-xs text-zinc-400">{`Events: ${events.length}`}</div>
                  </div>
                  <div className="relative h-8 md:h-6 bg-zinc-50 dark:bg-zinc-900/50 rounded-full overflow-visible py-2">
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent opacity-40 pointer-events-none" />

                    {groupedEvents.length === 0 ? (
                      <div className="absolute inset-0 flex items-center justify-center text-zinc-400">{t('timeline.noEvents')}</div>
                    ) : (
                      groupedEvents.map((g, idx: number) => {
                        const pos = Number(g.pos || 0);
                        const pct = Number.isFinite(durationMs) && durationMs > 0 ? Math.min(99, Math.max(1, Math.round((pos / durationMs) * 100))) : 1;
                        const meta = getEventMeta(g.repType);
                        const size = g.count > 1 ? 10 : 8;
                        const detail = formatChangeDetail(g.events && g.events[0] ? g.events[0] : null);
                        return (
                          <div key={g.key ?? idx} className="absolute top-1/2 z-20" style={{ left: `${pct}%`, transform: 'translate(-50%, -50%)' }}>
                            <button
                              title={`${meta.icon} ${meta.label}${detail ? ` — ${detail}` : ''} — ${formatTime(pos)}${g.count > 1 ? ` (${g.count} events)` : ''}`}
                              aria-label={`${meta.label} at ${formatTime(pos)}`}
                              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs text-white shadow ${meta.color} ring-1 ring-white/20 focus:outline-none focus:ring-2 focus:ring-offset-1 z-30`}
                            >
                              <span className="leading-none">{meta.icon}</span>
                            </button>
                            {g.count > 1 && (
                              <div className="mt-1 text-[10px] text-zinc-500 text-center">{g.count}</div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="flex justify-between text-[11px] text-zinc-500 mt-2 px-1">
                    <div>0:00</div>
                    <div className="text-center">{formatTime(Math.floor(durationMs / 2))}</div>
                    <div className="text-right">{formatTime(durationMs)}</div>
                  </div>
                </div>
              </div>

              <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                {groupedEvents.length === 0 && (
                  <div className="text-zinc-400">{t('timeline.noEvents')}</div>
                )}
                    {groupedEvents.map((g, idx: number) => {
                  const meta = getEventMeta(g.repType);
                  const detail = formatChangeDetail(g.events && g.events[0] ? g.events[0] : null);
                  return (
                    <div key={g.key ?? idx} className="flex items-center gap-2 p-2 rounded bg-zinc-50 dark:bg-zinc-900/50">
                      <div className={`${meta.color} w-6 h-6 rounded-full flex items-center justify-center text-xs text-white`}>{meta.icon}</div>
                      <div className="flex-1">
                        <div className="text-[12px] font-medium">{meta.label}{g.count>1 ? ` · ${g.count}` : ''}</div>
                        <div className="text-zinc-400 text-[11px]">{formatTime(g.pos)} — {Math.round((g.pos / durationMs) * 100)}%{detail ? ` · ${detail}` : ''}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </TableCell>
      </TableRow>
    </>
  );
}
