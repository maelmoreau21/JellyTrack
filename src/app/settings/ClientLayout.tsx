"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    const t = useTranslations('settings');
    const pathname = usePathname();

    const tabs = [
        { href: '/settings/plugin', key: 'pluginTitle', exact: true },
        { href: '/settings/plugin/security', key: 'authSecurity' },
        { href: '/settings/scheduler', key: 'taskScheduler' },
        { href: '/settings/notifications', key: 'notifications' },
        { href: '/settings/media', key: 'mediaSettings' },
        { href: '/settings/dataBackups', key: 'dataBackups' },
    ];

    return (
        <div className="flex-col md:flex">
            <div className="flex-1 p-4 md:p-8 pt-4 md:pt-6 w-full">
                <div className="w-full">
                    <main className="space-y-4 md:space-y-6 max-w-[1300px] mx-auto w-full">
                        <nav className="flex gap-2 overflow-auto pb-4 border-b border-zinc-800/40">
                            {tabs.map(tab => {
                                const active = tab.exact ? pathname === tab.href : pathname?.startsWith(tab.href);
                                return (
                                    <Link
                                        key={tab.href}
                                        href={tab.href}
                                        className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all border ${active ? 'bg-zinc-900 dark:bg-zinc-800 text-white shadow-sm border-zinc-800/60' : 'text-zinc-600 dark:text-zinc-400 border-transparent hover:bg-zinc-200/50 dark:hover:bg-zinc-900/40 hover:border-zinc-300/50 dark:hover:border-zinc-800/30'}`}
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
