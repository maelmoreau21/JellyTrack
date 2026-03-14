"use client";

import React, { useMemo, useRef, useState } from 'react';
import LogRow from './LogRow';
import SessionModal from '@/components/SessionModal';
import { useTranslations } from 'next-intl';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';

export default function LogsListClient({ serverLogs, visibleColumns }: { serverLogs: any[]; visibleColumns: string[] }) {
  const t = useTranslations('logs');

  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // No client-side search here; server-side LogFilters drives the results.
  const filtered = useMemo(() => serverLogs || [], [serverLogs]);

  // Build watch-party detection locally for display banners
  const watchPartyMap = useMemo(() => {
    const WINDOW_MS = 5 * 60 * 1000;
    const byMedia = new Map();
    filtered.forEach((log: any) => {
      const mId = log.mediaId;
      const started = new Date(String(log.startedAt || '')).getTime();
      if (!mId || !Number.isFinite(started)) return;
      if (!byMedia.has(mId)) byMedia.set(mId, []);
      byMedia.get(mId).push({ log, started });
    });
    const map = new Map();
    let counter = 0;
    byMedia.forEach(list => {
      const sorted = list.sort((a: any, b: any) => a.started - b.started);
      let clusterStart = 0;
      for (let i = 1; i <= sorted.length; i++) {
        if (i === sorted.length || sorted[i].started - sorted[i - 1].started > WINDOW_MS) {
          const cluster = sorted.slice(clusterStart, i);
          const uniqueUsers = new Set(cluster.map((it: any) => it.log.userId));
          if (uniqueUsers.size >= 2) {
            counter++;
            const pid = `party-${counter}`;
            cluster.forEach((item: any) => map.set(item.log.id, pid));
          }
          clusterStart = i;
        }
      }
    });
    return map;
  }, [filtered]);

  const flattened = useMemo(() => {
    const seenParty = new Set<string>();
    const out: any[] = [];
    filtered.forEach((log: any) => {
      const pid = watchPartyMap.get(log.id);
      const isFirst = pid && !seenParty.has(pid);
      if (isFirst) {
        seenParty.add(pid);
        out.push({ type: 'party', id: pid, members: [] as string[], mediaTitle: log.media?.title || '' });
      }
      out.push({ type: 'log', log });
    });
    return out;
  }, [filtered, watchPartyMap]);

  const headingForKey = (k: string) => {
    switch (k) {
      case 'date': return t('colDate');
      case 'startedAt': return t('colStartedAt');
      case 'endedAt': return t('colEndedAt');
      case 'user': return t('colUser');
      case 'media': return t('colMedia');
      case 'client': return t('colClient');
      case 'ip': return t('colClientIp');
      case 'country': return t('colCountry');
      case 'status': return t('colStatus');
      case 'codecs': return t('colCodecs');
      case 'duration': return t('colDuration');
      case 'pauseCount': return t('colPauseCount');
      case 'audioChanges': return t('colAudioChanges');
      case 'subtitleChanges': return t('colSubtitleChanges');
      default: return k;
    }
  };

  return (
    <div ref={containerRef} className="w-full">
      <Table>
        <TableHeader>
          <TableRow>
            {visibleColumns.map((col) => (
              <TableHead key={col}>{headingForKey(col)}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {flattened.length === 0 ? (
            <TableRow>
              <TableCell colSpan={visibleColumns.length} className="text-center py-8 text-zinc-400">{t('noResults')}</TableCell>
            </TableRow>
          ) : (
            flattened.map((item, idx) => item.type === 'party' ? (
              <TableRow key={`party-${idx}`} className="bg-gradient-to-r from-violet-50 to-fuchsia-50">
                <TableCell colSpan={visibleColumns.length} className="p-2 font-medium">Watch Party — {item.mediaTitle}</TableCell>
              </TableRow>
            ) : (
              <LogRow key={item.log.id} log={item.log} visibleColumns={visibleColumns} onOpenDetails={(l: any) => setSelectedLog(l)} />
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
