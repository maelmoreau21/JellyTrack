"use client";

import React, { useMemo, useRef, useState, useEffect } from 'react';
import LogRow from './LogRow';
import SessionModal from '@/components/SessionModal';
import { useTranslations } from 'next-intl';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { SafeLog } from '@/types/logs';

type ColState = { key: string; width: number };

type FlattenedItem = { type: 'party'; mediaTitle: string; members: string[] } | { type: 'log'; log: SafeLog };

const computeDefaultWidths = (keys: string[]) => {
  const base: Record<string, number> = {
    date: 180, startedAt: 140, endedAt: 140, user: 140, media: 480,
    client: 160, resolution: 80, audioBitrate: 90, ip: 140, country: 120, status: 110, codecs: 120,
    duration: 90, pauseCount: 70, audioChanges: 70, subtitleChanges: 70,
  };
  const arr = keys.map(k => base[k] ?? 100);
  const total = arr.reduce((s, v) => s + v, 0);
  if (total <= 1920) return arr.map(v => Math.max(40, v));
  const scale = 1920 / total;
  return arr.map(v => Math.max(40, Math.floor(v * scale)));
};

export default function LogsListClient({ serverLogs, visibleColumns, initialColumns }: { serverLogs: SafeLog[]; visibleColumns: string[]; initialColumns?: ColState[] }) {
  const t = useTranslations('logs');
  const [selectedLog, setSelectedLog] = useState<SafeLog | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Column state: order + widths (persisted to localStorage)
  const STORAGE_KEY = 'jellytrack.logs.columns.v1';

  const [columns, setColumns] = useState<ColState[]>(() => {
    // Prefer initialColumns prop (from server / query param) when provided
    try {
      if (initialColumns && initialColumns.length > 0) {
        const filtered = initialColumns.filter(ic => visibleColumns.includes(ic.key));
        const missing = visibleColumns.filter(k => !filtered.some(f => f.key === k));
        const missingWidths = computeDefaultWidths(missing);
        const missingCols = missing.map((k, i) => ({ key: k, width: missingWidths[i] }));
        return [...filtered, ...missingCols];
      }
    } catch {}
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as ColState[];
        // Keep only keys that are present in visibleColumns (server-side source of truth)
        const filtered = parsed.filter(p => visibleColumns.includes(p.key));
        const missing = visibleColumns.filter(k => !filtered.some(f => f.key === k));
        const missingWidths = computeDefaultWidths(missing);
        const missingCols = missing.map((k, i) => ({ key: k, width: missingWidths[i] }));
        return [...filtered, ...missingCols];
      }
    } catch {}
    const defaults = computeDefaultWidths(visibleColumns);
    return visibleColumns.map((k, i) => ({ key: k, width: defaults[i] || 100 }));
  });

  const visibleColsKey = visibleColumns.join(',');
  useEffect(() => {
    setColumns(prev => {
      const currentVisible = visibleColsKey.split(',').filter(Boolean);
      const prevKeys = prev.map(p => p.key);
      // If lists are identical, do nothing
      if (prevKeys.length === currentVisible.length && prevKeys.every((k, i) => k === currentVisible[i])) return prev;
      // Merge saved order with new visibleColumns
      const filtered = prev.filter(p => currentVisible.includes(p.key));
      const missing = currentVisible.filter(k => !filtered.some(f => f.key === k));
      if (missing.length === 0) return filtered;
      const missingWidths = computeDefaultWidths(missing);
      const missingCols = missing.map((k, i) => ({ key: k, width: missingWidths[i] }));
      return [...filtered, ...missingCols];
    });
  }, [visibleColsKey]);

  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Persist column settings when changed (localStorage + update query param `colsState`)
  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(columns)); } catch {}
    try {
      const params = new URLSearchParams(typeof searchParams === 'object' ? String(searchParams.toString()) : '');
      const colsState = columns.map(c => `${c.key}:${c.width}`).join(',');
      if (params.get('colsState') !== colsState) {
        params.set('colsState', colsState);
        const base = `${pathname}${params.toString() ? `?${params.toString()}` : ''}`;
        router.replace(base, { scroll: false });
      }
    } catch {}
  }, [columns, router, searchParams, pathname]);

  // No client-side search here; server-side LogFilters drives the results.
  const filtered = useMemo(() => serverLogs || [], [serverLogs]);

  // Build watch-party detection locally for display banners
  const watchPartyMap = useMemo(() => {
    const WINDOW_MS = 5 * 60 * 1000;
    const byMedia = new Map<string, Array<{ log: SafeLog; started: number }>>();
    filtered.forEach((log) => {
      const mId = log.mediaId;
      const started = new Date(String(log.startedAt || '')).getTime();
      if (!mId || !Number.isFinite(started)) return;
      if (!byMedia.has(mId)) byMedia.set(mId, []);
      byMedia.get(mId)!.push({ log, started });
    });
    const map = new Map<string, string>();
    let counter = 0;
    byMedia.forEach(list => {
      const sorted = list.sort((a, b) => a.started - b.started);
      let clusterStart = 0;
      for (let i = 1; i <= sorted.length; i++) {
        if (i === sorted.length || sorted[i].started - sorted[i - 1].started > WINDOW_MS) {
          const cluster = sorted.slice(clusterStart, i);
          const uniqueUsers = new Set(cluster.map(it => it.log.userId));
          if (uniqueUsers.size >= 2) {
            counter++;
            const pid = `party-${counter}`;
            cluster.forEach(item => map.set(item.log.id, pid));
          }
          clusterStart = i;
        }
      }
    });
    return map;
  }, [filtered]);

  // Helper: localized column headings
  const headingForKey = (key: string) => {
    switch (key) {
      case 'date': return t('colDate');
      case 'startedAt': return t('colStartedAt');
      case 'endedAt': return t('colEndedAt');
      case 'user': return t('colUser');
      case 'media': return t('colMedia');
      case 'client': return t('colClient');
      case 'ip': return t('colIp');
      case 'country': return t('colCountry');
      case 'status': return t('colStatus');
      case 'resolution': return t('colResolution');
      case 'audioBitrate': return t('colAudioBitrate');
      case 'codecs': return t('colCodecs');
      case 'duration': return t('colDuration');
      case 'pauseCount': return t('colPauseCount');
      case 'audioChanges': return t('colAudioChanges');
      case 'subtitleChanges': return t('colSubtitleChanges');
      default: return key;
    }
  };

  // Flatten logs and inject watch-party banners (client-side)
  const flattened = useMemo(() => {
    const out: FlattenedItem[] = [];
    const shown = new Set<string>();
    for (const log of filtered) {
      const pid = watchPartyMap.get(log.id);
      if (pid && !shown.has(pid)) {
        const cluster = filtered.filter(l => watchPartyMap.get(l.id) === pid);
        const members = Array.from(new Set(cluster.map(c => c.user?.username || '?')));
        const mediaTitle = cluster[0]?.media?.title || '';
        out.push({ type: 'party', mediaTitle, members });
        shown.add(pid);
      }
      out.push({ type: 'log', log });
    }
    return out;
  }, [filtered, watchPartyMap]);
  // Drag & drop + resize logic
  const dragIndexRef = useRef<number | null>(null);

  const onDragStart = (e: React.DragEvent, idx: number) => {
    dragIndexRef.current = idx;
    try { e.dataTransfer.setData('text/plain', String(columns[idx].key)); } catch {}
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  const onDrop = (e: React.DragEvent, toIdx: number) => {
    e.preventDefault();
    const from = dragIndexRef.current ?? (() => {
      const key = e.dataTransfer.getData('text/plain');
      return columns.findIndex(c => c.key === key);
    })();
    if (from === -1 || from === null || from === undefined) return;
    if (from === toIdx) return;
    setColumns(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
    dragIndexRef.current = null;
  };

  const [resizingIdx, setResizingIdx] = useState<number | null>(null);

  const startResize = (e: React.MouseEvent, idx: number) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingIdx(idx);
    const startX = e.clientX;
    const startWidth = columns[idx].width;
    
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      const newW = Math.max(60, Math.round(startWidth + delta));
      setColumns(prev => {
        const next = [...prev];
        if (next[idx].width === newW) return prev;
        next[idx] = { ...next[idx], width: newW };
        return next;
      });
    };

    const onUp = () => {
      setResizingIdx(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div ref={containerRef} className="w-full">
      <Table className="table-fixed border-separate border-spacing-0">
        <TableHeader className="sticky top-0 z-30 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md">
          <TableRow className="hover:bg-transparent border-b border-zinc-200 dark:border-zinc-800">
            {columns.map((col, idx) => {
              const isResizing = resizingIdx === idx;
              return (
                <TableHead
                  key={col.key}
                  draggable={resizingIdx === null}
                  onDragStart={(e) => onDragStart(e, idx)}
                  onDragOver={onDragOver}
                  onDrop={(e) => onDrop(e, idx)}
                  style={{ width: `${col.width}px`, minWidth: `${col.width}px` }}
                  className={cn(
                    "relative h-12 px-4 text-left align-middle font-semibold text-muted-foreground transition-colors",
                    "border-r border-border/60 dark:border-border/20 last:border-r-0",
                    isResizing && "bg-accent/10"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0 h-full group">
                    <span className="cursor-move opacity-0 group-hover:opacity-40 transition-opacity text-muted-foreground mr-1">≡</span>
                    <span className="truncate select-none tracking-tight uppercase text-[10px] font-bold">{headingForKey(col.key)}</span>
                  </div>
                  
                  {/* Visual Resizer Handle */}
                  <div
                    onMouseDown={(e) => startResize(e, idx)}
                    className={cn(
                      "absolute right-[-1px] top-0 bottom-0 w-[4px] cursor-col-resize z-40 transition-colors group/resizer",
                      "hover:bg-primary/50",
                      isResizing && "bg-primary w-[2px] shadow-[0_0_8px_rgba(var(--primary),0.6)]"
                    )}
                    aria-hidden
                  >
                    <div className={cn(
                      "absolute right-0 top-0 bottom-0 w-[1px] transition-colors",
                      "bg-border/60 dark:bg-border/20",
                      isResizing && "bg-primary"
                    )} />
                  </div>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {flattened.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="text-center py-8 text-zinc-400">{t('noResults')}</TableCell>
            </TableRow>
          ) : (
            flattened.map((item, idx) => item.type === 'party' ? (
              <TableRow key={`party-${idx}`} className="bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 border-l-4 border-l-violet-500 shadow-sm">
                <TableCell colSpan={columns.length} className="p-3 font-semibold text-violet-700 dark:text-violet-300 flex items-center gap-2">
                  <span className="text-lg">✨</span> Watch Party — {item.mediaTitle}
                </TableCell>
              </TableRow>
              ) : (
              <LogRow key={item.log.id} log={item.log} visibleColumns={columns.map(c => c.key)} onOpenDetails={(l: SafeLog) => setSelectedLog(l)} />
            ))
          )}
        </TableBody>
      </Table>

      {selectedLog && (
        <SessionModal open={true} onClose={() => setSelectedLog(null)} session={selectedLog} />
      )}
    </div>
  );
    }
