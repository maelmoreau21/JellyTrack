"use client";

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Columns3 } from 'lucide-react';
import { useTranslations } from 'next-intl';

const ALL_COLUMNS = ['date', 'user', 'media', 'clientIp', 'status', 'codecs', 'duration'] as const;
type Column = typeof ALL_COLUMNS[number];
const DEFAULT_VISIBLE: Column[] = ['date', 'user', 'media', 'clientIp', 'status', 'duration'];

export function ColumnToggle({ visibleColumns }: { visibleColumns: Column[] }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const t = useTranslations('logs');
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const columnLabels: Record<Column, string> = {
        date: t('colDate'),
        user: t('colUser'),
        media: t('colMedia'),
        clientIp: t('colClientIp'),
        status: t('colStatus'),
        codecs: t('colCodecs'),
        duration: t('colDuration'),
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
                className="flex items-center gap-2 px-3 py-2 h-10 md:h-9 text-sm rounded-md border border-zinc-700 hover:bg-zinc-800 transition-colors"
                title={t('toggleColumns')}
            >
                <Columns3 className="w-4 h-4" />
                <span className="hidden md:inline">{t('columns')}</span>
            </button>
            {open && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl p-2 min-w-[220px] md:min-w-[180px]">
                    {ALL_COLUMNS.map(col => (
                        <label
                            key={col}
                            className="flex items-center gap-2 px-2 py-2 rounded hover:bg-zinc-800 cursor-pointer text-sm text-zinc-300"
                        >
                            <input
                                type="checkbox"
                                checked={visibleColumns.includes(col)}
                                onChange={() => toggleColumn(col)}
                                className="rounded border-zinc-600 bg-zinc-800 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0"
                            />
                            {columnLabels[col]}
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
}

export function parseVisibleColumns(colsParam: string | undefined): Column[] {
    if (!colsParam) return DEFAULT_VISIBLE;
    const parsed = colsParam.split(',').filter(c => ALL_COLUMNS.includes(c as Column)) as Column[];
    return parsed.length >= 2 ? parsed : DEFAULT_VISIBLE;
}
