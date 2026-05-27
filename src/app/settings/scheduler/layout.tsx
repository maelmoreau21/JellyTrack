"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

export default function SettingsSchedulerLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const t = useTranslations('settings');

    const tabs = [
        { href: '/settings/scheduler', label: t('taskScheduler') },
    ];

    return (
        <div className="p-4 max-w-[1300px] mx-auto w-full">
            {tabs.length > 1 && (
                <nav className="flex gap-2 overflow-auto pb-4 border-b border-border/70 mb-6">
                    {tabs.map(tab => {
                        const active = pathname?.startsWith(tab.href);
                        return (
                            <Link
                                key={tab.href}
                                href={tab.href}
                                className={`px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors border ${active ? 'bg-primary/15 text-primary shadow-sm border-primary/30' : 'text-muted-foreground border-transparent hover:bg-muted hover:text-foreground hover:border-border'}`}
                            >
                                {tab.label}
                            </Link>
                        );
                    })}
                </nav>
            )}
            <div>{children}</div>
        </div>
    );
}
