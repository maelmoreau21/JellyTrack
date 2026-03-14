"use client";

import React, { useMemo, useState } from "react";
import { TableRow, TableCell } from "@/components/ui/table";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
import { ChevronDown, Eye } from "lucide-react";
import { FallbackImage } from "@/components/FallbackImage";
import { useTranslations } from 'next-intl';

export default function LogRow({ log, visibleColumns, onOpenDetails }: { log: any; visibleColumns: string[]; onOpenDetails?: (log:any)=>void }) {
  const t = useTranslations('logs');
  const [open, setOpen] = useState(false);
  const [bucketMs, setBucketMs] = useState<number>(0); // 0 = exact positions

  const isTranscode = String(log.playMethod || "").toLowerCase().includes("transcode");
  const isParty = !!log.partyId;

  const events = useMemo(() => {
    return (log.telemetryEvents || []).slice().sort((a: any, b: any) => {
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
    const fromLog = Number(log.durationWatched || 0) * 1000;
    const maxEvent = events.length ? Math.max(...events.map((e: any) => Number(e.positionMs || 0))) : 0;
    return Math.max(fromLog, maxEvent, 1);
  }, [log.durationWatched, events]);

  const groupedEvents = useMemo(() => {
    if (!events || events.length === 0) return [];
    if (!bucketMs) return events.map((e: any) => ({ key: Number(e.positionMs || 0), pos: Number(e.positionMs || 0), events: [e], count: 1, repType: e.eventType }));

    const map = new Map<number, any[]>();
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

  const getEventMeta = (type: string | undefined) => {
    switch (type) {
      case 'pause': return { color: 'bg-amber-600', label: t('timeline.label.pause'), icon: '⏸' };
      case 'audio_change': return { color: 'bg-sky-500', label: t('timeline.label.audio_change'), icon: '🔊' };
      case 'subtitle_change': return { color: 'bg-emerald-500', label: t('timeline.label.subtitle_change'), icon: '💬' };
      case 'seek': return { color: 'bg-indigo-500', label: t('timeline.label.seek'), icon: '🔁' };
      default: return { color: 'bg-zinc-700', label: String(type || t('timeline.label.default')).replace(/_/g, ' '), icon: '•' };
    }
  };

  return (
    <>
      <TableRow className={`even:bg-zinc-100/50 dark:even:bg-slate-900/35 hover:bg-zinc-100 dark:hover:bg-slate-800/55 border-zinc-200/50 dark:border-zinc-700/50 transition-colors ${isParty ? 'border-l-2 border-l-violet-500/40' : ''}`}>
        {/* Date (with expand toggle) */}
        {visibleColumns.includes('date') && (
          <TableCell className="font-medium whitespace-nowrap">
            <div className="flex items-center gap-1.5">
              <button onClick={() => setOpen(v => !v)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOpen(v=>!v); }} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1" aria-expanded={open} aria-label={open ? 'Collapse' : 'Expand'}>
                <ChevronDown className={`w-4 h-4 transform ${open ? 'rotate-180' : 'rotate-0'}`} />
              </button>
              <button onClick={() => onOpenDetails?.(log)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpenDetails?.(log); }} aria-label="Open details" className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1">
                <Eye className="w-4 h-4" />
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
          <TableCell className="font-semibold text-primary">
            {log.user ? (
              <Link href={`/users/${log.user.jellyfinUserId}`} className="hover:underline">{log.user.username}</Link>
            ) : '—'}
          </TableCell>
        )}

        {/* Media */}
        {visibleColumns.includes('media') && (
          <TableCell className="overflow-hidden">
            <div className="flex items-center gap-2 md:gap-3 w-full overflow-hidden" title={log.media?.title || 'Unknown'}>
              <div className="relative w-12 md:w-14 aspect-[2/3] bg-muted rounded-md shrink-0 overflow-hidden ring-1 ring-white/10">
                {log.media?.jellyfinMediaId ? (
                  <FallbackImage
                    src={`/api/jellyfin/image?itemId=${log.media.jellyfinMediaId}&type=Primary${log.fallbackImageParentId ? `&fallbackId=${log.fallbackImageParentId}` : ''}`}
                    alt={log.media?.title || 'Unknown'}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <FallbackImage src={undefined} alt={'Unknown'} fill className="object-cover" />
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
                  {log.media?.resolution && (
                    <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">{log.media.resolution}</span>
                  )}
                  <span className={`px-1.5 py-0.5 rounded ${isTranscode ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'}`}>{log.playMethod || 'DirectPlay'}</span>
                  {log.clientName && <span className="truncate">{log.clientName}</span>}
                  <span className="text-zinc-400">·</span>
                  <span>{Math.floor((log.durationWatched || 0) / 60)} min</span>
                </div>

              </div>
            </div>
          </TableCell>
        )}

        {/* Combined Client & IP */}
        {visibleColumns.includes('clientIp') && (
          <TableCell className="hidden lg:table-cell">
            <div className="flex flex-col">
              <div className="text-sm font-semibold">{log.clientName || '—'}</div>
              <div className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded-sm w-fit mt-1">{log.ipAddress || '—'}</div>
            </div>
          </TableCell>
        )}

        {/* Country */}
        {visibleColumns.includes('country') && (
          <TableCell className="hidden lg:table-cell">
            <div className="text-xs">{log.city && log.country ? `${log.city}, ${log.country}` : (log.country || '—')}</div>
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
              : log.durationWatched > 0
                ? `${Math.floor(log.durationWatched / 60)} min`
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
                    <button onClick={() => setBucketMs(0)} className={`px-2 py-0.5 rounded text-xs ${bucketMs===0 ? 'bg-primary text-primary-foreground' : 'app-field'}`}>{t('timeline.toggle.exact')}</button>
                    <button onClick={() => setBucketMs(5000)} className={`px-2 py-0.5 rounded text-xs ${bucketMs===5000 ? 'bg-primary text-primary-foreground' : 'app-field'}`}>{t('timeline.toggle.5s')}</button>
                    <button onClick={() => setBucketMs(30000)} className={`px-2 py-0.5 rounded text-xs ${bucketMs===30000 ? 'bg-primary text-primary-foreground' : 'app-field'}`}>{t('timeline.toggle.30s')}</button>
                  </div>
                </div>
              </div>

              <div className="w-full h-9 bg-zinc-100 dark:bg-zinc-800 rounded relative">
                {/* axis labels */}
                <div className="absolute left-0 -bottom-5 text-[11px] text-zinc-500">0:00</div>
                <div className="absolute left-1/2 -bottom-5 -translate-x-1/2 text-[11px] text-zinc-500">{formatTime(Math.floor(durationMs/2))}</div>
                <div className="absolute right-0 -bottom-5 text-[11px] text-zinc-500">{formatTime(durationMs)}</div>

                {groupedEvents.map((g: any, idx: number) => {
                  const pct = Math.min(100, Math.max(0, Math.round((g.pos / durationMs) * 100)));
                  const meta = getEventMeta(g.repType);
                  const size = g.count > 1 ? 9 : 7;
                  return (
                    <div key={g.key ?? idx} title={`${meta.icon} ${meta.label} — ${formatTime(g.pos)}${g.count>1 ? ` (${g.count} events)` : ''}`} aria-label={`${meta.label} at ${formatTime(g.pos)}`} className={`absolute top-1/2 -translate-y-1/2 ${meta.color} rounded-full shadow-sm`} style={{ left: `${pct}%`, width: size, height: size, transform: 'translate(-50%, -50%)' }}>
                      {g.count > 1 && (
                        <div className="absolute -right-2 -top-2 text-[9px] bg-zinc-800/90 text-white rounded-full w-4 h-4 flex items-center justify-center">{g.count}</div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                {groupedEvents.length === 0 && (
                  <div className="text-zinc-400">{t('timeline.noEvents')}</div>
                )}
                {groupedEvents.map((g: any, idx: number) => {
                  const meta = getEventMeta(g.repType);
                  return (
                    <div key={g.key ?? idx} className="flex items-center gap-2 p-2 rounded bg-zinc-50 dark:bg-zinc-900/50">
                      <div className={`${meta.color} w-6 h-6 rounded-full flex items-center justify-center text-xs text-white`}>{meta.icon}</div>
                      <div className="flex-1">
                        <div className="text-[12px] font-medium">{meta.label}{g.count>1 ? ` · ${g.count}` : ''}</div>
                        <div className="text-zinc-400 text-[11px]">{formatTime(g.pos)} — {Math.round((g.pos / durationMs) * 100)}%</div>
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
