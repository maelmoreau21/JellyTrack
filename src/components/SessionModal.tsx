"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';

type TelemetryEvent = {
  eventType?: string | null;
  positionMs?: number | string | null;
  metadata?: unknown;
  createdAt?: string | number | null;
};

type SessionType = {
  durationWatched?: number | string | null;
  media?: { jellyfinMediaId?: string | null; title?: string | null } | null;
  user?: { username?: string | null } | null;
  clientName?: string | null;
  pauseCount?: number | null;
  audioChanges?: number | null;
  subtitleChanges?: number | null;
  telemetryEvents?: TelemetryEvent[];
};

export default function SessionModal({ open, onClose, session }: { open: boolean; onClose: () => void; session: SessionType }) {
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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative app-surface rounded-xl w-[95%] md:w-[900px] max-h-[85vh] overflow-auto p-6 shadow-2xl border border-border/50">
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <h3 className="text-xl font-bold text-foreground">{session.media?.title || t('unknownMedia')}</h3>
            <div className="text-sm text-muted-foreground font-medium">{session.user?.username} — {session.clientName || t('unknown')}</div>
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="app-surface-soft border-border/50 text-foreground">{t('timeline.legend.pause')}: {session.pauseCount ?? 0}</Badge>
                <Badge variant="secondary" className="app-surface-soft border-border/50 text-foreground">{t('timeline.legend.audio')}: {session.audioChanges ?? 0}</Badge>
                <Badge variant="secondary" className="app-surface-soft border-border/50 text-foreground">{t('timeline.legend.subtitles')}: {session.subtitleChanges ?? 0}</Badge>
              </div>

              <div className="mt-2">
              <div className="mt-2 text-xs text-muted-foreground mb-2">{t('timeline.title')}</div>
              <div className="w-full h-12 app-surface-soft border border-border/50 rounded-lg relative overflow-hidden">
                  {(session.telemetryEvents || []).map((ev: TelemetryEvent, i: number) => {
                    const pos = Number(ev.positionMs || 0);
                    const pct = Math.min(100, Math.max(0, Math.round((pos / durationMs) * 100)));
                    return (
                      <button key={i} title={`${ev.eventType} @ ${Math.floor(pos/1000)}s`} onClick={() => jumpTo(pos)} className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-amber-500" style={{ left: `${pct}%`, transform: 'translate(-50%, -50%)' }} />
                    );
                  })}
                </div>

                    <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
                  {(session.telemetryEvents || []).map((ev: TelemetryEvent, i: number) => {
                    let detail = '';
                    try {
                      const md = typeof (ev.metadata as unknown) === 'string' ? JSON.parse(ev.metadata as string) : ev.metadata;
                      if (md && typeof md === 'object' && 'from' in md && 'to' in md) {
                        const fmt = (side: unknown) => {
                          if (!side) return '—';
                          const s = side as Record<string, unknown>;
                          const label = typeof s['language'] === 'string' ? s['language'] : (s['index'] !== undefined ? `#${String(s['index'])}` : String(side));
                          const codec = typeof s['codec'] === 'string' ? ` (${s['codec']})` : '';
                          return `${label}${codec}`;
                        };
                        detail = `${fmt((md as Record<string, unknown>)['from'])} → ${fmt((md as Record<string, unknown>)['to'])}`;
                      } else if (md && typeof md === 'object' && 'from' in md && 'to' in md) {
                        detail = `${String((md as Record<string, unknown>)['from'])} → ${String((md as Record<string, unknown>)['to'])}`;
                      }
                    } catch {}
                    return (
                      <div key={i} className="p-3 rounded-lg app-surface-soft border border-border/50 hover:border-primary/30 transition-colors">
                        <div className="font-bold text-[12px] text-foreground">{ev.eventType}</div>
                        <div className="text-muted-foreground text-[11px] font-medium">{format(new Date(String(ev.createdAt || '')), 'PPpp')}</div>
                        <div className="mt-1 text-[11px] text-foreground/80">{Math.floor(Number(ev.positionMs || 0) / 1000)}s{detail ? ` · ${detail}` : ''}</div>
                        <div className="mt-3 flex gap-2">
                          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => jumpTo(Number(ev.positionMs || 0))}>Jump</Button>
                          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => copyJump(Number(ev.positionMs || 0))}>Copy</Button>
                        </div>
                      </div>
                    );
                  })}
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
