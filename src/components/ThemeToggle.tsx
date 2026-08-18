"use client";

import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from 'next-intl';

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
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
        if (compact) {
            return (
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sidebar-border bg-sidebar-accent/80 text-muted-foreground">
                    <Moon className="w-4 h-4 text-amber-400" />
                </div>
            );
        }
        return (
            <button className="app-surface-soft flex items-center gap-3 w-full rounded-2xl border border-border px-3 py-3 text-sm text-muted-foreground" aria-label={t('switchToLight')}>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20">
                    <Moon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1 text-left">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{t('theme')}</div>
                    <div className="mt-0.5 font-medium text-zinc-700 dark:text-zinc-200">{t('themeDark')}</div>
                </div>
            </button>
        );
    }

    const isDark = theme === "dark";

    if (compact) {
        return (
            <div className="relative group flex justify-center w-full">
                <button
                    onClick={() => setTheme(isDark ? "light" : "dark")}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-sidebar-border bg-sidebar-accent/80 text-sidebar-foreground transition-all hover:border-sidebar-primary/40 hover:bg-sidebar-primary/15 shadow-sm"
                    aria-label={isDark ? t('switchToLight') : t('switchToDark')}
                >
                    <div className={`flex h-7 w-7 items-center justify-center rounded-lg ring-1 ${
                        isDark
                            ? "bg-amber-500/10 text-amber-400 ring-amber-500/20"
                            : "bg-indigo-500/10 text-indigo-600 ring-indigo-500/20"
                    }`}>
                        {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    </div>
                </button>
                <div className="pointer-events-none absolute left-full ml-2.5 top-1/2 -translate-y-1/2 z-50 hidden rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900 group-hover:block whitespace-nowrap">
                    {isDark ? t('switchToLight') : t('switchToDark')}
                </div>
            </div>
        );
    }

    return (
        <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className="group app-surface-soft flex items-center gap-3 w-full rounded-2xl border border-border px-3 py-3 text-sm text-zinc-700 dark:text-zinc-200 transition-all hover:border-zinc-300 dark:hover:border-zinc-700"
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
                <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{t('theme')}</div>
                <div className="mt-0.5 font-medium">{isDark ? t('themeDark') : t('themeLight')}</div>
            </div>
        </button>
    );
}
