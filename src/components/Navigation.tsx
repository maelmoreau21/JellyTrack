"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from 'next-intl';

export function Navigation() {
    const pathname = usePathname();
    const t = useTranslations('nav');

    const isActive = (path: string) => {
        if (path === "/" && pathname !== "/") return false;
        return pathname.startsWith(path);
    };

    return (
        <nav className="flex items-center space-x-4 lg:space-x-6 mx-6">
            <Link
                href="/"
                className={`text-sm font-medium transition-colors ${isActive('/') ? 'text-primary' : 'text-muted-foreground hover:text-primary'}`}
            >
                Dashboard
            </Link>
            <Link
                href="/media"
                className={`text-sm font-medium transition-colors ${isActive('/media') ? 'text-primary' : 'text-muted-foreground hover:text-primary'}`}
            >
                {t('library')}
            </Link>
            <Link
                href="/logs"
                className={`text-sm font-medium transition-colors ${isActive('/logs') ? 'text-primary' : 'text-muted-foreground hover:text-primary'}`}
            >
                {t('logs')}
            </Link>
            <Link
                href="/newsletter"
                className={`text-sm font-medium transition-colors ${isActive('/newsletter') ? 'text-primary' : 'text-emerald-500 hover:text-emerald-400'}`}
            >
                Newsletter
            </Link>
            <Link
                href="/settings/plugin"
                className={`text-sm font-medium transition-colors ${isActive('/settings') ? 'text-primary' : 'text-muted-foreground hover:text-primary'}`}
            >
                {t('settings')}
            </Link>
        </nav>
    );
}
