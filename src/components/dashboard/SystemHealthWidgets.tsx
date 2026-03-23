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
    excludedLibraries: string[];
    counts: {
        activeStreams: number;
        openPlaybackOrphans: number;
        dbStreamsWithoutRedis: number;
        redisOrphans: number;
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
        ? 'text-red-300 bg-red-500/10 border-red-500/20'
        : 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20';

    return (
        <div className="space-y-4">
            <div className="dashboard-banner flex flex-wrap items-center gap-2 rounded-2xl px-4 py-3 md:gap-3">
                <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] ${monitorTone}`}>
                    <Activity className="h-3.5 w-3.5" />
                    {t('monitor')} {snapshot.status.monitor.status === 'error' ? t('monitorStatusError') : t('monitorStatusActive')}
                </div>
                <div className="dashboard-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-muted-foreground">
                    <Clock3 className="h-3.5 w-3.5 text-primary" />
                    {t('lastPoll')}: {formatRelative(snapshot.status.monitor.lastPollAt as string | null)}
                </div>
                <div className="dashboard-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-muted-foreground">
                    <RefreshCw className="h-3.5 w-3.5 text-amber-500" />
                    {t('lastSync')}: {formatRelative(snapshot.status.sync.lastSuccessAt as string | null)}
                </div>
                <div className="dashboard-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-muted-foreground">
                    <DatabaseBackup className="h-3.5 w-3.5 text-emerald-500" />
                    {t('lastBackup')}: {formatRelative(snapshot.status.backup.lastSuccessAt as string | null)}
                </div>
                <Link href="/admin/log-health" className="ml-auto inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-700 dark:text-cyan-200 hover:bg-cyan-500/15">
                    <HeartPulse className="h-3.5 w-3.5" />
                    {t('logHealth')}
                </Link>
            </div>

            <Card className="app-surface-soft border-border shadow-md">
                <CardContent className="grid gap-4 p-5 md:grid-cols-4">
                    <div className="rounded-2xl border border-border bg-card/40 p-4">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> {t('activeStreams')}</div>
                        <div className="mt-2 text-3xl font-bold">{snapshot.counts.activeStreams}</div>
                    </div>
                    <div className="rounded-2xl border border-border bg-card/40 p-4">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground"><ShieldAlert className="h-4 w-4 text-amber-500" /> {t('openPlaybackOrphans')}</div>
                        <div className="mt-2 text-3xl font-bold">{snapshot.counts.openPlaybackOrphans}</div>
                    </div>
                    <div className="rounded-2xl border border-border bg-card/40 p-4">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground"><AlertTriangle className="h-4 w-4 text-rose-500" /> {t('dbWithoutRedis')}</div>
                        <div className="mt-2 text-3xl font-bold">{snapshot.counts.dbStreamsWithoutRedis}</div>
                    </div>
                    <div className="rounded-2xl border border-border bg-card/40 p-4">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground"><HeartPulse className="h-4 w-4 text-primary" /> {t('excludedLibraries')}</div>
                        <div className="mt-2 text-3xl font-bold">{snapshot.excludedLibraries.length}</div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
