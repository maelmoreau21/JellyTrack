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
                className={`flex items-center gap-2 w-full h-10 rounded-lg border px-2.5 text-xs transition-colors ${open ? 'border-primary/40 bg-zinc-800 text-zinc-100' : 'border-zinc-700 bg-zinc-900/80 text-zinc-200 hover:bg-zinc-800'} ${isPending ? 'opacity-50 cursor-wait' : ''}`}
                aria-label="Language"
                aria-expanded={open}
            >
                <Globe className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                <span className="emoji-flag text-base leading-none">{current.flag}</span>
                <span className="truncate text-left">{current.label}</span>
                <ChevronDown className={`ml-auto w-3.5 h-3.5 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="absolute bottom-full left-0 mb-2 z-[70] w-full max-h-64 overflow-y-auto rounded-xl border border-zinc-700/90 bg-zinc-950/95 p-1 shadow-[0_12px_30px_rgba(0,0,0,0.45)] backdrop-blur-sm">
                    {AVAILABLE_LOCALES.map((loc) => (
                        <button
                            key={loc.code}
                            onClick={() => switchLocale(loc.code)}
                            className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-xs transition-colors ${loc.code === selectedLocale ? 'border-primary/30 bg-primary/10 text-primary' : 'border-transparent text-zinc-300 hover:bg-zinc-800/80 hover:text-zinc-100'}`}
                        >
                            <span className="emoji-flag text-base leading-none">{loc.flag}</span>
                            <span>{loc.label}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
