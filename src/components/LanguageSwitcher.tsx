'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Globe } from 'lucide-react';
import { AVAILABLE_LOCALES, DEFAULT_LOCALE, isSupportedLocale } from '@/i18n/locales';

export function LanguageSwitcher() {
    const locale = useLocale();
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const selectedLocale = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;

    function switchLocale(newLocale: string) {
        if (!isSupportedLocale(newLocale)) return;
        document.cookie = `locale=${newLocale};path=/;max-age=${365 * 24 * 60 * 60}`;
        startTransition(() => {
            router.refresh();
        });
    }

    return (
        <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-zinc-400" />
            <select
                value={selectedLocale}
                onChange={(e) => switchLocale(e.target.value)}
                disabled={isPending}
                className={`h-9 rounded-md border border-zinc-700 bg-zinc-900/80 px-2 text-xs text-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary/40 ${isPending ? 'opacity-50 cursor-wait' : ''}`}
                aria-label="Language"
            >
                {AVAILABLE_LOCALES.map((loc) => (
                    <option key={loc.code} value={loc.code}>
                        {loc.flag} {loc.label}
                    </option>
                ))}
            </select>
        </div>
    );
}
