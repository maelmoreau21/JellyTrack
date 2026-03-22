"use client";

import React, { useEffect, useState } from "react";
import { Button } from '@/components/ui/button';
import { useTranslations } from "next-intl";
import Link from 'next/link';

type MediaResult = { jellyfinMediaId: string; title: string; type: string; parentId: string | null };

export default function MediaSearchModal({ open, onClose, query }: { open: boolean; onClose: () => void; query: string | null }) {
  const t = useTranslations('search');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-zinc-900 rounded-lg w-[95%] md:w-[800px] max-h-[80vh] overflow-auto p-4 shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">{query}</h3>
          <div className="flex items-center gap-2">
            <Link href={`/media?q=${encodeURIComponent(query || '')}`} className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">{t('viewAll') || 'Voir tout'}</Link>
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-zinc-500">Loading…</div>
        ) : (
          <div className="space-y-2">
            {results.length === 0 ? (
              <div className="text-sm text-zinc-500 italic">No results</div>
            ) : results.map((m) => (
              <Link key={m.jellyfinMediaId} href={`/media/${m.jellyfinMediaId}`} className="block p-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800/60">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium truncate">{m.title}</div>
                  <div className="text-xs text-zinc-400">{m.type}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
