"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';

export default function SessionModal({ open, onClose, session }: { open: boolean; onClose: () => void; session: any }) {
  const t = useTranslations('logs');
  if (!open) return null;

  const durationMs = Math.max(Number(session.durationWatched || 0) * 1000, 1);

  const jumpTo = (posMs: number) => {
    const s = Math.floor((posMs || 0) / 1000);
    const mediaId = session.media?.jellyfinMediaId;
    if (!mediaId) return;
    const url = `/media/${mediaId}?t=${s}`;
    window.open(url, '_blank');
  };

  const copyJump = (posMs: number) => {
    const s = Math.floor((posMs || 0) / 1000);
    const mediaId = session.media?.jellyfinMediaId;
    if (!mediaId) return;
    const url = `${window.location.origin}/media/${mediaId}?t=${s}`;
    navigator.clipboard.writeText(url);
    alert('Link copied');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-zinc-900 rounded-lg w-[95%] md:w-[900px] max-h-[85vh] overflow-auto p-4 shadow-lg">
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <h3 className="text-lg font-semibold">{session.media?.title || t('unknownMedia')}</h3>
            <div className="text-sm text-zinc-500">{session.user?.username} — {session.clientName || t('unknown')}</div>
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-3">
                <Badge className="bg-zinc-100 dark:bg-zinc-800">{t('timeline.legend.pause')}: {session.pauseCount ?? 0}</Badge>
                <Badge className="bg-zinc-100 dark:bg-zinc-800">{t('timeline.legend.audio')}: {session.audioChanges ?? 0}</Badge>
                <Badge className="bg-zinc-100 dark:bg-zinc-800">{t('timeline.legend.subtitles')}: {session.subtitleChanges ?? 0}</Badge>
              </div>

              <div className="mt-2">
                <div className="text-xs text-zinc-400 mb-2">{t('timeline.title')}</div>
                <div className="w-full h-12 bg-zinc-100 dark:bg-zinc-800 rounded relative">
                  {(session.telemetryEvents || []).map((ev: any, i: number) => {
                    const pos = Number(ev.positionMs || 0);
                    const pct = Math.min(100, Math.max(0, Math.round((pos / durationMs) * 100)));
                    return (
                      <button key={i} title={`${ev.eventType} @ ${Math.floor(pos/1000)}s`} onClick={() => jumpTo(pos)} className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-amber-500" style={{ left: `${pct}%`, transform: 'translate(-50%, -50%)' }} />
                    );
                  })}
                </div>

                <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
                  {(session.telemetryEvents || []).map((ev: any, i: number) => (
                    <div key={i} className="p-2 rounded bg-zinc-50 dark:bg-zinc-900/50">
                      <div className="font-medium text-[12px]">{ev.eventType}</div>
                      <div className="text-zinc-400 text-[11px]">{format(new Date(String(ev.createdAt || '')), 'PPpp')}</div>
                      <div className="mt-1 text-[11px]">{Math.floor(Number(ev.positionMs || 0) / 1000)}s</div>
                      <div className="mt-2 flex gap-2">
                        <Button onClick={() => jumpTo(ev.positionMs)}>Jump</Button>
                        <Button onClick={() => copyJump(ev.positionMs)}>Copy</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex-shrink-0">
            <button aria-label="Close" onClick={onClose} className="app-field px-3 py-2">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
