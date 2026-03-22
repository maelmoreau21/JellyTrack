"use client";

import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from 'next-intl';

export function ThemeToggle() {
    const { theme, setTheme } = useTheme();
    const t = useTranslations('common');
    const [mounted, setMounted] = useState(false);

    // Avoid cascading renders from synchronous setState in effect by deferring
    // the mounted flag set to a microtask.
    useEffect(() => {
        const t = setTimeout(() => setMounted(true), 0);
        return () => clearTimeout(t);
    }, []);

    if (!mounted) {
        return (
            <button className="flex items-center gap-3 w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 px-3 py-3 text-sm bg-zinc-100 dark:bg-zinc-950/90 text-zinc-500 dark:text-zinc-400" aria-label={t('switchToLight')}>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20">
                    <Moon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1 text-left">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400 dark:text-zinc-500">{t('theme')}</div>
                    <div className="mt-0.5 font-medium text-zinc-700 dark:text-zinc-200">{t('themeDark')}</div>
                </div>
            </button>
        );
    }

    const isDark = theme === "dark";

    return (
        <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className={`group flex items-center gap-3 w-full rounded-2xl border px-3 py-3 text-sm transition-all ${
                isDark
                    ? "border-zinc-200 dark:border-zinc-800 bg-zinc-950/90 text-zinc-200 hover:border-zinc-700 hover:bg-zinc-900"
                    : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
            }`}
            aria-label={isDark ? t('switchToLight') : t('switchToDark')}
        >
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ${
                isDark
                    ? "bg-amber-500/10 text-amber-400 ring-amber-500/20"
                    : "bg-indigo-500/10 text-indigo-600 ring-indigo-500/20"
            }`}>
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </div>
            <div className="min-w-0 flex-1 text-left">
                <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400 dark:text-zinc-500">{t('theme')}</div>
                <div className="mt-0.5 font-medium">{isDark ? t('themeDark') : t('themeLight')}</div>
            </div>
        </button>
    );
}
