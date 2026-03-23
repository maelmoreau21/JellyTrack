"use client";

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Columns3 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { createPortal } from 'react-dom';

const ALL_COLUMNS = ['date', 'startedAt', 'endedAt', 'user', 'media', 'client', 'resolution', 'audioBitrate', 'ip', 'country', 'status', 'codecs', 'duration', 'pauseCount', 'audioChanges', 'subtitleChanges'] as const;
type Column = typeof ALL_COLUMNS[number];

export function ColumnToggle({ visibleColumns }: { visibleColumns: Column[] }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const t = useTranslations('logs');
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement | null>(null);
    const overlayRef = useRef<HTMLDivElement | null>(null);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

    const columnLabels: Record<Column, string> = {
        date: t('colDate'),
        startedAt: t('colStartedAt') || 'Started',
        endedAt: t('colEndedAt') || 'Ended',
        user: t('colUser'),
        media: t('colMedia'),
        client: t('colClient') || 'Client',
        ip: t('colClientIp') || 'Client & IP',
        country: t('colCountry') || 'Country',
        status: t('colStatus'),
        resolution: t('colResolution'),
        audioBitrate: t('colAudioBitrate'),
        codecs: t('colCodecs'),
        duration: t('colDuration'),
        pauseCount: t('colPauseCount') || 'Pauses',
        audioChanges: t('colAudioChanges') || 'Audio changes',
        subtitleChanges: t('colSubtitleChanges') || 'Subtitle changes',
    };

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            const target = e.target as Node;
            const clickedInsideToggle = ref.current && ref.current.contains(target);
            const clickedInsideOverlay = overlayRef.current && overlayRef.current.contains(target);
            if (!clickedInsideToggle && !clickedInsideOverlay) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    useEffect(() => {
        if (!open) return;
        const btn = ref.current?.querySelector('button');
        if (!btn) return;
        const rect = btn.getBoundingClientRect();
        const compute = () => {
            const overlayEl = overlayRef.current;
            const width = overlayEl?.offsetWidth ?? 220;
            const height = overlayEl?.offsetHeight ?? 200;

            const viewportLeft = window.scrollX || 0;
            const viewportRight = (window.scrollX || 0) + window.innerWidth;
            const minLeft = viewportLeft + 8;
            const maxLeft = Math.max(minLeft, viewportRight - width - 8);

            // Prefer aligning overlay's right edge with the button's right edge, but clamp to viewport
            let left = rect.right + window.scrollX - width;
            left = Math.min(Math.max(minLeft, left), maxLeft);

            // Try to open below the button, but if there's not enough vertical space, open above
            let top = rect.bottom + window.scrollY + 6;
            const maxTop = (window.scrollY || 0) + window.innerHeight - height - 8;
            if (top > maxTop) {
                top = Math.max((window.scrollY || 0) + 8, rect.top + window.scrollY - height - 6);
            }

            setPos({ left, top });
        };
        compute();
        const onResize = () => compute();
        window.addEventListener('resize', onResize);
        window.addEventListener('scroll', onResize, true);
        return () => {
            window.removeEventListener('resize', onResize);
            window.removeEventListener('scroll', onResize, true);
        };
    }, [open]);

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

    const overlay = (
        <div
            ref={overlayRef}
            style={pos ? { position: 'fixed', left: `${pos.left}px`, top: `${pos.top}px` } : { display: 'none' }}
            className="z-[99999] border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl p-2 min-w-[220px] md:min-w-[180px] bg-white dark:bg-zinc-900"
        >
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
    );

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
            {open && typeof document !== 'undefined' ? createPortal(overlay, document.body) : null}
        </div>
    );
}
