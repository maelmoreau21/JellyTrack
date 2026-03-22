"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

export default function SettingsSchedulerLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const t = useTranslations('settings');

    const tabs = [
        { href: '/settings/scheduler/tasks', label: t('schedulerTasks') },
        { href: '/settings/scheduler/schedules', label: t('schedulerSchedules') },
        { href: '/settings/scheduler/backups', label: t('schedulerBackups') },
    ];

    return (
        <div className="p-4 max-w-[1300px] mx-auto w-full">
            <nav className="flex gap-2 overflow-auto pb-4 border-b border-zinc-800/40 mb-6">
                {tabs.map(tab => {
                    const active = pathname?.startsWith(tab.href);
                    return (
                        <Link
                            key={tab.href}
                            href={tab.href}
                            className={`px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors border ${active ? 'bg-zinc-900 text-white shadow-sm border-zinc-800/60' : 'text-zinc-300 border-transparent hover:bg-zinc-900/40 hover:border-zinc-800/30'}`}
                        >
                            {tab.label}
                        </Link>
                    );
                })}
            </nav>
            <div>{children}</div>
        </div>
    );
}
