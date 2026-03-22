"use client";

import React, { useMemo, useRef, useState, useEffect } from 'react';
import LogRow from './LogRow';
import SessionModal from '@/components/SessionModal';
import { useTranslations } from 'next-intl';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { useRouter, useSearchParams } from 'next/navigation';
import type { SafeLog } from '@/types/logs';

type ColState = { key: string; width: number };

type FlattenedItem = { type: 'party'; mediaTitle: string; members: string[] } | { type: 'log'; log: SafeLog };

export default function LogsListClient({ serverLogs, visibleColumns, initialColumns }: { serverLogs: SafeLog[]; visibleColumns: string[]; initialColumns?: ColState[] }) {
  const t = useTranslations('logs');
  const [selectedLog, setSelectedLog] = useState<SafeLog | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Column state: order + widths (persisted to localStorage)
  const STORAGE_KEY = 'jellytrack.logs.columns.v1';

  const computeDefaultWidths = (keys: string[]) => {
    const base: Record<string, number> = {
      date: 220, startedAt: 160, endedAt: 160, user: 140, media: 420,
      client: 140, ip: 140, country: 120, status: 120, codecs: 120,
      duration: 100, pauseCount: 80, audioChanges: 80, subtitleChanges: 80,
    };
    const arr = keys.map(k => base[k] ?? 100);
    const total = arr.reduce((s, v) => s + v, 0);
    if (total <= 1920) return arr.map(v => Math.max(40, v));
    const scale = 1920 / total;
    return arr.map(v => Math.max(40, Math.floor(v * scale)));
  };

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

  // Keep columns in sync when server-side visibleColumns change (e.g., toggles)
  useEffect(() => {
    setColumns(prev => {
      const prevKeys = prev.map(p => p.key);
      // If lists are identical, do nothing
      if (prevKeys.length === visibleColumns.length && prevKeys.every((k, i) => k === visibleColumns[i])) return prev;
      // Merge saved order with new visibleColumns
      const filtered = prev.filter(p => visibleColumns.includes(p.key));
      const missing = visibleColumns.filter(k => !filtered.some(f => f.key === k));
      if (missing.length === 0) return filtered;
      const missingWidths = computeDefaultWidths(missing);
      const missingCols = missing.map((k, i) => ({ key: k, width: missingWidths[i] }));
      return [...filtered, ...missingCols];
    });
  }, [visibleColumns.join(',')]);

  const router = useRouter();
  const searchParams = useSearchParams();

  // Persist column settings when changed (localStorage + update query param `colsState`)
  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(columns)); } catch {}
    try {
      const params = new URLSearchParams(typeof searchParams === 'object' ? String(searchParams.toString()) : '');
      const colsState = columns.map(c => `${c.key}:${c.width}`).join(',');
      if (params.get('colsState') !== colsState) {
        params.set('colsState', colsState);
        const base = `/logs${params.toString() ? `?${params.toString()}` : ''}`;
        router.replace(base);
      }
    } catch {}
  }, [columns, router, searchParams]);

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

  const startResize = (e: React.MouseEvent, idx: number) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = columns[idx].width;
    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      const newW = Math.max(40, Math.round(startWidth + delta));
      setColumns(prev => {
        const next = [...prev];
        next[idx] = { ...next[idx], width: newW };
        return next;
      });
    };
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div ref={containerRef} className="w-full">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            {columns.map((col, idx) => (
              <TableHead
                key={col.key}
                draggable
                onDragStart={(e) => onDragStart(e, idx)}
                onDragOver={onDragOver}
                onDrop={(e) => onDrop(e, idx)}
                style={{ width: `${col.width}px` }}
                className="relative"
              >
                <div className="flex items-center gap-2">
                  <span className="cursor-move opacity-70">≡</span>
                  <span className="truncate">{headingForKey(col.key)}</span>
                </div>
                <div
                  onMouseDown={(e) => startResize(e, idx)}
                  className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize z-20"
                  aria-hidden
                />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {flattened.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="text-center py-8 text-zinc-400">{t('noResults')}</TableCell>
            </TableRow>
          ) : (
            flattened.map((item, idx) => item.type === 'party' ? (
              <TableRow key={`party-${idx}`} className="bg-gradient-to-r from-violet-50 to-fuchsia-50">
                <TableCell colSpan={columns.length} className="p-2 font-medium">Watch Party — {item.mediaTitle}</TableCell>
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
