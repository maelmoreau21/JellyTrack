"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from 'next-intl';
import { Activity, AlertTriangle, CheckCircle2, Clock3, DatabaseBackup, HeartPulse, RefreshCw, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

type SystemStatus = {
    monitor: { status: string; lastPollAt?: string | null };
    sync: { lastSuccessAt?: string | null };
    backup: { lastSuccessAt?: string | null };
};

type Snapshot = {
    status: SystemStatus;
    isValkeyEnabled?: boolean;
    excludedLibraries: string[];
    counts: {
        activeStreams: number;
        openPlaybackOrphans: number;
        dbStreamsWithoutValkey: number;
        valkeyOrphans: number;
    };
};

export function SystemHealthWidgets({ initialSnapshot }: { initialSnapshot: Snapshot }) {
    const t = useTranslations('dashboard');
    const [snapshot, setSnapshot] = useState(initialSnapshot);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 60_000);
        return () => clearInterval(id);
    }, []);

    function formatRelative(dateString: string | null) {
        if (!dateString) return t('never') || 'Never';
        const deltaMinutes = Math.max(0, Math.round((now - new Date(dateString).getTime()) / 60000));
        if (deltaMinutes < 1) return t('justNow') || 'just now';
        if (deltaMinutes < 60) return t('minutesAgo', { count: deltaMinutes }) || `about ${deltaMinutes} min ago`;
        const deltaHours = Math.round(deltaMinutes / 60);
        if (deltaHours < 24) return t('hoursAgo', { count: deltaHours }) || `about ${deltaHours} h ago`;
        return new Date(dateString).toLocaleString();
    }

    useEffect(() => {
        let cancelled = false;
        const refresh = async () => {
            try {
                const res = await fetch('/api/admin/health', { cache: 'no-store' });
                if (!res.ok) return;
                const data = await res.json();
                if (!cancelled) setSnapshot(data);
            } catch {
                // Ignore transient polling errors in the UI.
            }
        };

        const timer = setInterval(refresh, 15000);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, []);

    const monitorTone = snapshot.status.monitor.status === 'error'
        ? 'app-chip border-red-500/35 bg-red-500/10 text-red-500 dark:text-red-300'
        : 'app-chip-success';

    return (
        <div className="space-y-4">
            <div className="app-surface flex flex-wrap items-center gap-2 rounded-lg px-3 py-3 md:gap-3">
                <div className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold ${monitorTone}`}>
                    <Activity className="h-3.5 w-3.5" />
                    {t('monitor')} {snapshot.status.monitor.status === 'error' ? t('monitorStatusError') : t('monitorStatusActive')}
                </div>
                <div className="app-chip inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground">
                    <Clock3 className="h-3.5 w-3.5 text-primary" />
                    {t('lastPoll')}: {formatRelative(snapshot.status.monitor.lastPollAt as string | null)}
                </div>
                <div className="app-chip inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground">
                    <RefreshCw className="h-3.5 w-3.5 text-amber-500" />
                    {t('lastSync')}: {formatRelative(snapshot.status.sync.lastSuccessAt as string | null)}
                </div>
                <div className="app-chip inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground">
                    <DatabaseBackup className="h-3.5 w-3.5 text-emerald-500" />
                    {t('lastBackup')}: {formatRelative(snapshot.status.backup.lastSuccessAt as string | null)}
                </div>
                <Link href="/admin/health" className="ml-auto inline-flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/15">
                    <HeartPulse className="h-3.5 w-3.5" />
                    {t('logHealth')}
                </Link>
            </div>

            <Card className="app-surface border-border">
                <CardContent className={`grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 p-4 sm:p-5 ${snapshot.isValkeyEnabled !== false ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
                    <div className="app-surface-soft rounded-lg border border-border p-4">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> {t('activeStreams')}</div>
                        <div className="mt-2 text-3xl font-bold">{snapshot.counts.activeStreams}</div>
                    </div>
                    <div className="app-surface-soft rounded-lg border border-border p-4">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground"><ShieldAlert className="h-4 w-4 text-amber-500" /> {t('openPlaybackOrphans')}</div>
                        <div className="mt-2 text-3xl font-bold">{snapshot.counts.openPlaybackOrphans}</div>
                    </div>
                    {snapshot.isValkeyEnabled !== false && (
                        <div className="app-surface-soft rounded-lg border border-border p-4">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground"><AlertTriangle className="h-4 w-4 text-rose-500" /> {t('dbWithoutValkey')}</div>
                            <div className="mt-2 text-3xl font-bold">{snapshot.counts.dbStreamsWithoutValkey}</div>
                        </div>
                    )}
                    <div className="app-surface-soft rounded-lg border border-border p-4">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground"><HeartPulse className="h-4 w-4 text-primary" /> {t('excludedLibraries')}</div>
                        <div className="mt-2 text-3xl font-bold">{snapshot.excludedLibraries.length}</div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
