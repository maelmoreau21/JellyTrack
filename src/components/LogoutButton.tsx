"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { useTranslations } from 'next-intl';

interface LogoutButtonProps {
    className?: string;
}

export function LogoutButton({ className = "" }: LogoutButtonProps) {
    const t = useTranslations('nav');
    const handleLogout = async () => {
        await signOut({ redirect: false });
        window.location.href = '/login';
    };

    return (
        <button
            type="button"
            onClick={handleLogout}
            className={`group app-surface-soft flex items-center gap-3 w-full rounded-xl border border-border px-3 py-2 text-sm text-zinc-700 dark:text-zinc-200 transition-all hover:border-red-500/30 hover:bg-red-500/5 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 ${className}`}
        >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-500 ring-1 ring-red-500/20 group-hover:bg-red-500/20 transition-all">
                <LogOut className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0 flex-1 text-left">
                <div className="font-medium group-hover:text-red-500 transition-colors">{t('logout')}</div>
            </div>
        </button>
    );
}
