"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Plug, Zap, Save, Database, Download, Clock, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    const t = useTranslations('settings');
    const [open, setOpen] = useState<Record<string, boolean>>({ plugin: true });
    const pathname = usePathname();

    const tabs = [
        { href: '/settings/overview', key: 'overviewTab' },
        { href: '/settings/plugin', key: 'pluginTitle' },
        { href: '/settings/scheduler', key: 'taskScheduler' },
        { href: '/settings/notifications', key: 'notifications' },
        { href: '/settings/libraryRules', key: 'libraryRules' },
        { href: '/settings/dataBackups', key: 'dataBackups' },
    ];

    const toggle = (key: string) => setOpen((p) => ({ ...p, [key]: !p[key] }));

    return (
        <div className="flex-col md:flex">
            <div className="flex-1 p-4 md:p-8 pt-4 md:pt-6 w-full">
                <div className="w-full">
                    <div className="flex gap-6 max-w-[1300px] mx-auto">
                        <aside className="w-80 hidden lg:block shrink-0">
                            <div className="sticky top-20 space-y-4">
                                <div className="text-sm font-semibold text-zinc-400">{t('title')}</div>
                                <nav className="space-y-1 mt-2">
                                    <div>
                                        <button type="button" onClick={() => toggle('plugin')} className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">
                                            <span className="flex items-center gap-2"><Plug className="w-4 h-4" /> <span>{t('pluginTitle')}</span></span>
                                            <ChevronDown className={`w-4 h-4 transform transition-transform ${open['plugin'] ? 'rotate-180' : ''}`} />
                                        </button>
                                        {open['plugin'] && (
                                            <div className="pl-6 mt-1 space-y-1">
                                                <Link href="/settings/plugin" className="block px-3 py-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">{t('pluginTitle')}</Link>
                                                <Link href="/settings#plugin" className="block px-3 py-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">{t('pluginStatus')}</Link>
                                                <Link href="/settings#plugin" className="block px-3 py-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">{t('pluginInstructions')}</Link>
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <button type="button" onClick={() => toggle('scheduler')} className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">
                                            <span className="flex items-center gap-2"><Zap className="w-4 h-4" /> <span>{t('taskScheduler')}</span></span>
                                            <ChevronDown className={`w-4 h-4 transform transition-transform ${open['scheduler'] ? 'rotate-180' : ''}`} />
                                        </button>
                                        {open['scheduler'] && (
                                            <div className="pl-6 mt-1 space-y-1">
                                                <Link href="/settings/scheduler" className="block px-3 py-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">{t('taskScheduler')}</Link>
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <button type="button" onClick={() => toggle('notifications')} className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">
                                            <span className="flex items-center gap-2"><Save className="w-4 h-4" /> <span>{t('notifications')}</span></span>
                                            <ChevronDown className={`w-4 h-4 transform transition-transform ${open['notifications'] ? 'rotate-180' : ''}`} />
                                        </button>
                                        {open['notifications'] && (
                                            <div className="pl-6 mt-1 space-y-1">
                                                <Link href="/settings/notifications" className="block px-3 py-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">{t('notifications')}</Link>
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <button type="button" onClick={() => toggle('libraryRules')} className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">
                                            <span className="flex items-center gap-2"><Database className="w-4 h-4" /> <span>{t('libraryRules')}</span></span>
                                            <ChevronDown className={`w-4 h-4 transform transition-transform ${open['libraryRules'] ? 'rotate-180' : ''}`} />
                                        </button>
                                        {open['libraryRules'] && (
                                            <div className="pl-6 mt-1 space-y-1">
                                                <Link href="/settings/libraryRules" className="block px-3 py-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">{t('libraryRules')}</Link>
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <button type="button" onClick={() => toggle('dataBackups')} className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">
                                            <span className="flex items-center gap-2"><Download className="w-4 h-4" /> <span>{t('dataBackups')}</span></span>
                                            <ChevronDown className={`w-4 h-4 transform transition-transform ${open['dataBackups'] ? 'rotate-180' : ''}`} />
                                        </button>
                                        {open['dataBackups'] && (
                                            <div className="pl-6 mt-1 space-y-1">
                                                <Link href="/settings/dataBackups" className="block px-3 py-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">{t('dataBackups')}</Link>
                                                <Link href="/settings/backupManagement" className="block px-3 py-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">{t('backupManagement')}</Link>
                                            </div>
                                        )}
                                    </div>
                                </nav>
                            </div>
                        </aside>
                        <main className="flex-1 space-y-4 md:space-y-6">
                            <div className="max-w-[1300px] mx-auto w-full">
                                <nav className="flex gap-2 overflow-auto pb-4 border-b border-zinc-800/40">
                                    {tabs.map(tab => {
                                        const active = pathname?.startsWith(tab.href);
                                        return (
                                            <Link
                                                key={tab.href}
                                                href={tab.href}
                                                className={`px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap ${active ? 'bg-zinc-900 text-white' : 'text-zinc-400 hover:text-zinc-100'}`}
                                            >
                                                {t(tab.key)}
                                            </Link>
                                        );
                                    })}
                                </nav>
                            </div>
                            {children}
                        </main>
                    </div>
                </div>
            </div>
        </div>
    );
}
