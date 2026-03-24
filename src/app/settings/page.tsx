"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Plug, Zap, Bell, Film, Database } from "lucide-react";
import { useTranslations } from "next-intl";

export default function SettingsPage() {
    const t = useTranslations('settings');

    const cards = [
        { href: '/settings/plugin', icon: <Plug className="w-5 h-5" />, title: t('pluginTitle'), desc: t('pluginDesc') },
        { href: '/settings/scheduler', icon: <Zap className="w-5 h-5" />, title: t('taskScheduler'), desc: t('taskSchedulerDesc') },
        { href: '/settings/notifications', icon: <Bell className="w-5 h-5" />, title: t('notifications'), desc: t('notificationsDesc') },
        { href: '/settings/media', icon: <Film className="w-5 h-5" />, title: t('mediaSettings'), desc: t('mediaSettingsDesc') },
        { href: '/settings/dataBackups', icon: <Database className="w-5 h-5" />, title: t('dataBackups'), desc: t('dataBackupsDesc') },
    ];

    return (
        <div className="p-4 md:p-8">
            <div className="max-w-[1100px] mx-auto">
                <header className="mb-6">
                    <h2 className="text-2xl md:text-3xl font-bold tracking-tight">{t('title')}</h2>
                    <p className="text-sm text-muted-foreground mt-2">{t('overviewDesc') || ''}</p>
                </header>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {cards.map(c => (
                        <Link key={c.href} href={c.href} className="group">
                            <Card className="hover:shadow-lg transition">
                                <CardHeader>
                                    <div className="flex items-center gap-3">
                                        {c.icon}
                                        <CardTitle className="text-sm font-semibold text-foreground">{c.title}</CardTitle>
                                    </div>
                                    <CardDescription className="mt-1 text-xs text-muted-foreground">{c.desc}</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-xs text-muted-foreground">{t('manage') || ''}</div>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
}
