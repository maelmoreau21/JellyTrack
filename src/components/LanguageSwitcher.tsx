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
        // Setting the cookie is a client-only side-effect; silence immutability lint here
        // eslint-disable-next-line react-hooks/immutability
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
                className={`group flex items-center gap-3 w-full rounded-2xl border px-3 py-3 text-sm transition-all ${open ? 'border-cyan-400/30 bg-cyan-400/10 text-zinc-900 dark:text-zinc-100 shadow-[0_12px_35px_rgba(8,145,178,0.12)]' : 'app-surface-soft border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 hover:border-zinc-300 dark:hover:border-zinc-700'} ${isPending ? 'opacity-50 cursor-wait' : ''}`}
                aria-label="Language"
                aria-expanded={open}
            >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 ring-1 ring-cyan-500/20">
                    <Globe className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1 text-left">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400 dark:text-zinc-500">Langue</div>
                    <div className="mt-0.5 flex items-center gap-2">
                        <img 
                            src={`https://flagcdn.com/w40/${current.iso}.png`} 
                            alt={current.label}
                            className="w-5 h-3.5 object-cover rounded-sm shadow-[0_1px_3px_rgba(0,0,0,0.1)]"
                        />
                        <span className="truncate font-medium">{current.label}</span>
                    </div>
                </div>
                <ChevronDown className={`ml-auto w-4 h-4 text-zinc-400 dark:text-zinc-500 transition-transform group-hover:text-zinc-600 dark:group-hover:text-zinc-300 ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="absolute bottom-full left-0 mb-2 z-[70] w-full overflow-hidden rounded-2xl border app-surface p-2 shadow-[0_20px_50px_rgba(0,0,0,0.15)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200">
                    <div className="mb-2 rounded-xl border border-border/5 bg-muted/30 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500">
                        Interface
                    </div>
                    {AVAILABLE_LOCALES.map((loc) => (
                        <button
                            key={loc.code}
                            onClick={() => switchLocale(loc.code)}
                            className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-all ${loc.code === selectedLocale ? 'border-primary/20 bg-primary/10 text-primary dark:text-cyan-200' : 'border-transparent text-zinc-600 dark:text-zinc-300 hover:bg-muted'}`}
                        >
                            <img 
                                src={`https://flagcdn.com/w40/${loc.iso}.png`} 
                                alt=""
                                className="w-5 h-3.5 object-cover rounded-sm shadow-[0_1px_2px_rgba(0,0,0,0.1)]"
                            />
                            <span className="flex-1 text-left">{loc.label}</span>
                            {loc.code === selectedLocale && <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-600 dark:text-cyan-300">Actif</span>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
