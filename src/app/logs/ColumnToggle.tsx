"use client";

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Columns3 } from 'lucide-react';
import { useTranslations } from 'next-intl';

const ALL_COLUMNS = ['date', 'startedAt', 'endedAt', 'user', 'media', 'clientIp', 'country', 'status', 'codecs', 'duration', 'pauseCount', 'audioChanges', 'subtitleChanges'] as const;
type Column = typeof ALL_COLUMNS[number];

export function ColumnToggle({ visibleColumns }: { visibleColumns: Column[] }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const t = useTranslations('logs');
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const columnLabels: Record<Column, string> = {
        date: t('colDate'),
        startedAt: t('colStartedAt') || 'Started',
        endedAt: t('colEndedAt') || 'Ended',
        user: t('colUser'),
        media: t('colMedia'),
        clientIp: t('colClientIp') || 'Client & IP',
        country: t('colCountry') || 'Country',
        status: t('colStatus'),
        codecs: t('colCodecs'),
        duration: t('colDuration'),
        pauseCount: t('colPauseCount') || 'Pauses',
        audioChanges: t('colAudioChanges') || 'Audio changes',
        subtitleChanges: t('colSubtitleChanges') || 'Subtitle changes',
    };

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const toggleColumn = (col: Column) => {
        const current = new Set(visibleColumns);
        if (current.has(col)) {
            if (current.size <= 2) return; // Must keep at least 2
            current.delete(col);
        } else {
            current.add(col);
        }
        const params = new URLSearchParams(searchParams.toString());
        params.set('cols', Array.from(current).join(','));
        router.push(`/logs?${params.toString()}`);
    };

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen(!open)}
                className="app-field flex items-center gap-2 px-3 py-2 h-10 md:h-9 text-sm rounded-md hover:bg-zinc-100 dark:hover:bg-slate-700/50 transition-colors"
                title={t('toggleColumns')}
            >
                <Columns3 className="w-4 h-4" />
                <span className="hidden md:inline">{t('columns')}</span>
            </button>
            {open && (
                <div className="app-surface-soft absolute right-0 top-full mt-1 z-50 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl p-2 min-w-[220px] md:min-w-[180px]">
                    {ALL_COLUMNS.map(col => (
                        <label
                            key={col}
                            className="flex items-center gap-2 px-2 py-2 rounded hover:bg-zinc-100 dark:hover:bg-slate-700/45 cursor-pointer text-sm text-zinc-700 dark:text-zinc-200"
                        >
                            <input
                                type="checkbox"
                                checked={visibleColumns.includes(col)}
                                onChange={() => toggleColumn(col)}
                                className="rounded border-zinc-300 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-800 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0"
                            />
                            {columnLabels[col]}
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
}
