"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FixedSizeList as List } from 'react-window';
import Fuse from 'fuse.js';
import LogRow from './LogRow';
import SessionModal from '@/components/SessionModal';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function LogsListClient({ serverLogs, visibleColumns }: { serverLogs: any[]; visibleColumns: string[] }) {
  const t = useTranslations('logs');
  const tc = useTranslations('common');

  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'exact' | 'regex' | 'fuzzy'>('exact');
  const [savedFilters, setSavedFilters] = useState<Array<{ name: string; query: string; mode: string }>>([]);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('jt.savedFilters');
      if (raw) setSavedFilters(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('jt.savedFilters', JSON.stringify(savedFilters));
    } catch {}
  }, [savedFilters]);

  const fuse = useMemo(() => {
    return new Fuse(serverLogs || [], {
      keys: ['user.username', 'media.title', 'ipAddress', 'clientName'],
      threshold: 0.4,
      ignoreLocation: true,
    });
  }, [serverLogs]);

  const filtered = useMemo(() => {
    if (!query) return serverLogs;
    if (mode === 'regex') {
      let re: RegExp;
      try { re = new RegExp(query, 'i'); }
      catch { return serverLogs.filter(l => String(l.media?.title || '').toLowerCase().includes(query.toLowerCase()) || String(l.user?.username || '').toLowerCase().includes(query.toLowerCase())); }
      return serverLogs.filter(l => re.test(String(l.media?.title || '')) || re.test(String(l.user?.username || '')) || re.test(String(l.ipAddress || '')) || re.test(String(l.clientName || '')));
    }
    if (mode === 'fuzzy') {
      return fuse.search(query).map(r => r.item);
    }
    // exact (case-insensitive contains)
    const q = query.toLowerCase();
    return serverLogs.filter(l => String(l.media?.title || '').toLowerCase().includes(q) || String(l.user?.username || '').toLowerCase().includes(q) || String(l.ipAddress || '').toLowerCase().includes(q) || String(l.clientName || '').toLowerCase().includes(q));
  }, [serverLogs, query, mode, fuse]);

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

  const threshold = 250;

  const saveCurrentFilter = () => {
    const name = prompt('Save filter name') || `Filter ${savedFilters.length + 1}`;
    setSavedFilters(prev => [...prev, { name, query, mode }]);
  };

  const applySaved = (item: { name: string; query: string; mode: string }) => {
    setQuery(item.query);
    setMode(item.mode as any);
  };

  const exportSaved = () => {
    const payload = encodeURIComponent(JSON.stringify(savedFilters));
    const url = `${window.location.href.split('?')[0]}?saved=${payload}`;
    navigator.clipboard.writeText(url).then(() => alert('Link copied'));
  };

  // Renderers
  const Row = ({ index, style }: { index: number; style: any }) => {
    const item = flattened[index];
    if (!item) return null;
    if (item.type === 'party') {
      return (
        <div style={style} className="p-2 border-b bg-gradient-to-r from-violet-50 to-fuchsia-50">
          <div className="font-medium">Watch Party — {item.mediaTitle}</div>
        </div>
      );
    }
    return (
      <div style={style} className="border-b">
        <LogRow log={item.log} visibleColumns={visibleColumns} onOpenDetails={(l: any) => setSelectedLog(l)} />
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('searchPlaceholder')} className="flex-1" />
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1"><input type="radio" name="mode" checked={mode==='exact'} onChange={() => setMode('exact')} /> Exact</label>
          <label className="flex items-center gap-1"><input type="radio" name="mode" checked={mode==='fuzzy'} onChange={() => setMode('fuzzy')} /> Fuzzy</label>
          <label className="flex items-center gap-1"><input type="radio" name="mode" checked={mode==='regex'} onChange={() => setMode('regex')} /> Regex</label>
        </div>
        <Button onClick={saveCurrentFilter}>Save filter</Button>
        <Button onClick={exportSaved}>Export</Button>
      </div>

      {savedFilters.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {savedFilters.map((s, i) => (
            <button key={i} onClick={() => applySaved(s)} className="app-field px-2 py-1 text-sm">{s.name}</button>
          ))}
        </div>
      )}

      <div ref={containerRef} className="w-full">
        {flattened.length === 0 ? (
          <div className="text-center py-8 text-zinc-400">{t('noResults')}</div>
        ) : (
          flattened.length > threshold ? (
            <List height={600} itemCount={flattened.length} itemSize={84} width={'100%'}>
              {Row}
            </List>
          ) : (
            <div>
              {flattened.map((item, idx) => item.type === 'party' ? (
                <div key={`party-${idx}`} className="p-2 border-b bg-gradient-to-r from-violet-50 to-fuchsia-50">Watch Party — {item.mediaTitle}</div>
              ) : (
                <div key={item.log.id} className="border-b">
                  <LogRow log={item.log} visibleColumns={visibleColumns} onOpenDetails={(l: any) => setSelectedLog(l)} />
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {selectedLog && (
        <SessionModal open={true} onClose={() => setSelectedLog(null)} session={selectedLog} />
      )}
    </div>
  );
}
