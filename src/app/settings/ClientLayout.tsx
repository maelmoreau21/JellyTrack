"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { Server, KeyRound, Shield, Clapperboard, CalendarClock, Database, Bell } from "lucide-react";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    const t = useTranslations('settings');
    const pathname = usePathname();

    const tabs = [
        {
            href: '/settings/jellyfin',
            key: 'jellyfinTitle',
            icon: Server,
            isActive: (p: string) => p === '/settings/jellyfin' || p === '/settings/plugin' || p === '/settings',
        },
        {
            href: '/settings/sso',
            key: 'ssoTitle',
            icon: KeyRound,
            isActive: (p: string) => p?.startsWith('/settings/sso'),
        },
        {
            href: '/settings/plugin/security',
            key: 'authSecurity',
            icon: Shield,
            isActive: (p: string) => p?.startsWith('/settings/plugin/security'),
        },
        {
            href: '/settings/media',
            key: 'mediaSettings',
            icon: Clapperboard,
            isActive: (p: string) => p?.startsWith('/settings/media'),
        },
        {
            href: '/settings/scheduler',
            key: 'taskScheduler',
            icon: CalendarClock,
            isActive: (p: string) => p?.startsWith('/settings/scheduler'),
        },
        {
            href: '/settings/dataBackups',
            key: 'dataBackups',
            icon: Database,
            isActive: (p: string) => p?.startsWith('/settings/dataBackups'),
        },
        {
            href: '/settings/notifications',
            key: 'notifications',
            icon: Bell,
            isActive: (p: string) => p?.startsWith('/settings/notifications'),
        },
    ];

    return (
        <div className="flex-col md:flex">
            <div className="flex-1 p-4 md:p-8 pt-4 md:pt-6 w-full">
                <div className="w-full">
                    <main className="space-y-4 md:space-y-6 max-w-[1300px] mx-auto w-full">
                        <nav className="flex gap-2 overflow-x-auto pb-4 border-b border-border/70 no-scrollbar">
                            {tabs.map(tab => {
                                const active = tab.isActive(pathname || '');
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
                                        <span>{t(tab.key)}</span>
                                    </Link>
                                );
                            })}
                        </nav>
                        {children}
                    </main>
                </div>
            </div>
        </div>
    );
}
