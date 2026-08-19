"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    const t = useTranslations('settings');
    const pathname = usePathname();

    const tabs = [
        {
            href: '/settings/jellyfin',
            key: 'jellyfinTitle',
            isActive: (p: string) => p === '/settings/jellyfin' || p === '/settings/plugin' || p === '/settings',
        },
        {
            href: '/settings/sso',
            key: 'ssoTitle',
            isActive: (p: string) => p?.startsWith('/settings/sso'),
        },
        {
            href: '/settings/plugin/security',
            key: 'authSecurity',
            isActive: (p: string) => p?.startsWith('/settings/plugin/security'),
        },
        {
            href: '/settings/scheduler',
            key: 'taskScheduler',
            isActive: (p: string) => p?.startsWith('/settings/scheduler'),
        },
        {
            href: '/settings/notifications',
            key: 'notifications',
            isActive: (p: string) => p?.startsWith('/settings/notifications'),
        },
        {
            href: '/settings/media',
            key: 'mediaSettings',
            isActive: (p: string) => p?.startsWith('/settings/media'),
        },
        {
            href: '/settings/dataBackups',
            key: 'dataBackups',
            isActive: (p: string) => p?.startsWith('/settings/dataBackups'),
        },
    ];

    return (
        <div className="flex-col md:flex">
            <div className="flex-1 p-4 md:p-8 pt-4 md:pt-6 w-full">
                <div className="w-full">
                    <main className="space-y-4 md:space-y-6 max-w-[1300px] mx-auto w-full">
                        <nav className="flex gap-2 overflow-auto pb-4 border-b border-border/70">
                            {tabs.map(tab => {
                                const active = tab.isActive(pathname || '');
                                return (
                                    <Link
                                        key={tab.href}
                                        href={tab.href}
                                        className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all border ${active ? 'bg-primary/15 text-primary shadow-sm border-primary/30' : 'text-muted-foreground border-transparent hover:bg-muted hover:text-foreground hover:border-border'}`}
                                    >
                                        {t(tab.key)}
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
