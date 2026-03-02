'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Globe } from 'lucide-react';

const LOCALES = [
    { code: 'fr', label: 'Français', flag: '🇫🇷' },
    { code: 'en', label: 'English', flag: '🇬🇧' },
];

export function LanguageSwitcher() {
    const locale = useLocale();
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    function switchLocale(newLocale: string) {
        document.cookie = `locale=${newLocale};path=/;max-age=${365 * 24 * 60 * 60}`;
        startTransition(() => {
            router.refresh();
        });
    }

    return (
        <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-zinc-400" />
            <div className="flex gap-1">
                {LOCALES.map((loc) => (
                    <button
                        key={loc.code}
                        onClick={() => switchLocale(loc.code)}
                        disabled={isPending}
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                            locale === loc.code
                                ? 'bg-primary/20 text-primary border border-primary/30'
                                : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-200 border border-zinc-700/50'
                        } ${isPending ? 'opacity-50 cursor-wait' : ''}`}
                    >
                        {loc.flag} {loc.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
