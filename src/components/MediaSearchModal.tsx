"use client";

import React, { useEffect, useState } from "react";
import { Button } from '@/components/ui/button';
import { useTranslations } from "next-intl";
import Link from 'next/link';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

type MediaResult = { jellyfinMediaId: string; title: string; type: string; parentId: string | null };

export default function MediaSearchModal({ open, onClose, query }: { open: boolean; onClose: () => void; query: string | null }) {
  const t = useTranslations('search');
  const tc = useTranslations('common');
  const [results, setResults] = useState<MediaResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !query) return;
    let mounted = true;
    const doFetch = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const json = await res.json();
          if (mounted) setResults(json.media || []);
        }
      } catch {
        // silent
      } finally {
        if (mounted) setLoading(false);
      }
    };
    doFetch();
    return () => { mounted = false; };
  }, [open, query]);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent className="w-[95%] md:w-[800px] max-h-[80vh] overflow-auto p-4">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-8">
            <DialogTitle className="truncate">{query}</DialogTitle>
            <div className="flex items-center gap-2 shrink-0">
              <Link href={`/media/all?q=${encodeURIComponent(query || '')}`} className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
                {t('viewAll')}
              </Link>
              <Button type="button" onClick={onClose} variant="outline">
                {tc('close')}
              </Button>
            </div>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="space-y-2" aria-live="polite" aria-busy="true">
            <p className="text-sm text-muted-foreground">{t('searching')}</p>
            {[1, 2, 3, 4].map((idx) => (
              <Skeleton key={idx} className="h-11 w-full rounded-md" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {results.length === 0 ? (
              <div className="text-sm text-zinc-500 italic">{t('noResults')}</div>
            ) : (
              <ul className="space-y-2">
                {results.map((m) => (
                  <li key={m.jellyfinMediaId}>
                    <Link href={`/media/${m.jellyfinMediaId}`} className="block p-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800/60">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium truncate">{m.title}</div>
                        <div className="text-xs text-zinc-400 shrink-0">{m.type}</div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
