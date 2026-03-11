'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useRef, useEffect, useTransition } from 'react';
import { ChevronDown, Globe } from 'lucide-react';
import { AVAILABLE_LOCALES, DEFAULT_LOCALE, isSupportedLocale } from '@/i18n/locales';

export function LanguageSwitcher() {
    const locale = useLocale();
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const selectedLocale = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
    const current = AVAILABLE_LOCALES.find(l => l.code === selectedLocale) || AVAILABLE_LOCALES[0];

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    function switchLocale(newLocale: string) {
        if (!isSupportedLocale(newLocale)) return;
        document.cookie = `locale=${newLocale};path=/;max-age=${365 * 24 * 60 * 60}`;
        setOpen(false);
        startTransition(() => {
            router.refresh();
        });
    }

    return (
        <div className="relative w-full" ref={ref}>
            <button
                onClick={() => setOpen(!open)}
                disabled={isPending}
                className={`group flex items-center gap-3 w-full rounded-2xl border px-3 py-3 text-sm transition-all ${open ? 'border-cyan-400/30 bg-cyan-400/10 text-zinc-900 dark:text-zinc-100 shadow-[0_12px_35px_rgba(8,145,178,0.12)]' : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/90 text-zinc-700 dark:text-zinc-200 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-900'} ${isPending ? 'opacity-50 cursor-wait' : ''}`}
                aria-label="Language"
                aria-expanded={open}
            >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 ring-1 ring-cyan-500/20">
                    <Globe className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1 text-left">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400 dark:text-zinc-500">Langue</div>
                    <div className="mt-0.5 flex items-center gap-2">
                        <span className="emoji-flag text-base leading-none">{current.flag}</span>
                        <span className="truncate font-medium">{current.label}</span>
                    </div>
                </div>
                <ChevronDown className={`ml-auto w-4 h-4 text-zinc-400 dark:text-zinc-500 transition-transform group-hover:text-zinc-600 dark:group-hover:text-zinc-300 ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="absolute bottom-full left-0 mb-3 z-[70] w-full overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800/90 bg-white dark:bg-[linear-gradient(180deg,rgba(9,9,11,0.98),rgba(16,16,18,0.98))] p-2 shadow-[0_20px_50px_rgba(0,0,0,0.15)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl">
                    <div className="mb-2 rounded-xl border border-zinc-100 dark:border-white/5 bg-zinc-50 dark:bg-white/[0.02] px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500">
                        Interface
                    </div>
                    {AVAILABLE_LOCALES.map((loc) => (
                        <button
                            key={loc.code}
                            onClick={() => switchLocale(loc.code)}
                            className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-all ${loc.code === selectedLocale ? 'border-cyan-400/20 bg-cyan-400/10 text-cyan-700 dark:text-cyan-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]' : 'border-transparent text-zinc-600 dark:text-zinc-300 hover:border-zinc-200 dark:hover:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/90 hover:text-zinc-900 dark:hover:text-zinc-100'}`}
                        >
                            <span className="emoji-flag text-lg leading-none">{loc.flag}</span>
                            <span className="flex-1 text-left">{loc.label}</span>
                            {loc.code === selectedLocale && <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-600 dark:text-cyan-300">Actif</span>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
