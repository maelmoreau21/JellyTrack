"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { Film, Sparkles, Trophy, BarChart3, Layers, Newspaper } from "lucide-react";

export function MediaHeaderNav() {
    const t = useTranslations('media');
    const tn = useTranslations('nav');
    const pathname = usePathname() || '';

    const tabs = [
        { href: '/media/all', label: t('allMedia'), icon: Film, isActive: (p: string) => p.startsWith('/media/all') || p === '/media' },
        { href: '/media/popular', label: t.has('popularTab') ? t('popularTab') : 'Top Contenus', icon: Trophy, isActive: (p: string) => p.startsWith('/media/popular') },
        { href: '/media/analysis', label: t('deepAnalysisTitle'), icon: BarChart3, isActive: (p: string) => p.startsWith('/media/analysis') },
        { href: '/media/collections', label: t('libraries'), icon: Layers, isActive: (p: string) => p.startsWith('/media/collections') },
        { href: '/newsletter', label: 'Bilan & Newsletter', icon: Newspaper, isActive: (p: string) => p.startsWith('/newsletter') },
    ];

    return (
        <nav className="flex gap-2 overflow-x-auto pb-4 border-b border-border/70 no-scrollbar">
            {tabs.map((tab) => {
                const active = tab.isActive(pathname);
                const Icon = tab.icon;
                return (
                    <Link
                        key={tab.href}
                        href={tab.href}
                        className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all border ${
                            active
                                ? 'bg-primary/15 text-primary shadow-sm border-primary/30 font-bold'
                                : 'text-muted-foreground border-transparent hover:bg-muted hover:text-foreground hover:border-border'
                        }`}
                    >
                        <Icon className={`w-4 h-4 ${active ? 'text-primary' : 'text-muted-foreground/70'}`} />
                        <span>{tab.label}</span>
                    </Link>
                );
            })}
        </nav>
    );
}
