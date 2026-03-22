import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getLogHealthSnapshot } from "@/lib/logHealth";
import { AlertTriangle, CheckCircle2, Clock3, HeartPulse, RadioTower, RefreshCw, ShieldAlert } from "lucide-react";
import { HealthAnomalyCharts } from "@/components/admin/HealthAnomalyCharts";
import { getTranslations } from 'next-intl/server';

export default async function LogHealthPage() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.isAdmin) {
        const uid = (session?.user as unknown as { jellyfinUserId?: string })?.jellyfinUserId;
        redirect(uid ? `/users/${uid}` : '/login');
    }
    const t = await getTranslations('dashboard');

    const snapshot = await getLogHealthSnapshot();

    function formatDate(dateString: string | null | undefined) {
        if (!dateString) return t('never');
        return new Date(dateString).toLocaleString();
    }

    return (
        <div className="flex-col md:flex">
            <div className="flex-1 space-y-4 md:space-y-6 p-4 md:p-8 pt-4 md:pt-6 max-w-7xl mx-auto w-full">
                <div>
                    <h2 className="text-2xl md:text-3xl font-bold tracking-tight">{t('logHealth')}</h2>
                    <p className="mt-2 text-sm text-zinc-400">{t('logHealthDesc')}</p>
                </div>

                <div className="grid gap-4 md:grid-cols-4">
                    <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50"><CardHeader><CardTitle className="text-sm text-zinc-400 flex items-center gap-2"><RadioTower className="h-4 w-4 text-cyan-400" /> {t('monitor')}</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{snapshot.status.monitor.status === 'error' ? t('monitorStatusError') : t('monitorStatusOk')}</div><p className="text-xs text-zinc-500 mt-1">{t('lastPoll')}: {formatDate(snapshot.status.monitor.lastPollAt)}</p></CardContent></Card>
                    <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50"><CardHeader><CardTitle className="text-sm text-zinc-400 flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-orange-400" /> {t('openPlaybackOrphans')}</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{snapshot.counts.openPlaybackOrphans}</div><p className="text-xs text-zinc-500 mt-1">{t('playbackHistoryNote')}</p></CardContent></Card>
                    <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50"><CardHeader><CardTitle className="text-sm text-zinc-400 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-400" /> {t('dbWithoutRedis')}</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{snapshot.counts.dbStreamsWithoutRedis}</div><p className="text-xs text-zinc-500 mt-1">{t('dbWithoutRedisDesc')}</p></CardContent></Card>
                    <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50"><CardHeader><CardTitle className="text-sm text-zinc-400 flex items-center gap-2"><HeartPulse className="h-4 w-4 text-emerald-400" /> {t('redisOrphan')}</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{snapshot.counts.redisOrphans}</div><p className="text-xs text-zinc-500 mt-1">{t('redisOrphanDesc')}</p></CardContent></Card>
                </div>

                <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50">
                    <CardHeader>
                        <CardTitle>{t('anomalyChartsTitle')}</CardTitle>
                        <CardDescription>{t('anomalyChartsDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-2">
                        <HealthAnomalyCharts timeline={snapshot.anomalyTimeline} breakdown={snapshot.anomalyBreakdown} />
                    </CardContent>
                </Card>

                <div className="grid gap-4 lg:grid-cols-2">
                    <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50">
                        <CardHeader>
                            <CardTitle>{t('orphanPlaybacksTitle')}</CardTitle>
                            <CardDescription>{t('orphanPlaybacksDesc')}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {snapshot.orphanPlaybacks.length === 0 && <div className="text-sm text-zinc-500">{t('noOrphanPlaybacks')}</div>}
                            {snapshot.orphanPlaybacks.map((entry: { id: string; mediaTitle?: string; username?: string; library?: string; startedAt?: string | null; durationWatched?: number }) => (
                                <div key={entry.id} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-black/20 p-3">
                                    <div className="font-medium text-zinc-100">{entry.mediaTitle}</div>
                                    <div className="mt-1 text-xs text-zinc-400">{entry.username} · {entry.library}</div>
                                    <div className="mt-2 text-xs text-zinc-500">{t('openedOn')} {formatDate(entry.startedAt)} · {Math.floor((entry.durationWatched ?? 0) / 60)} min</div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50">
                        <CardHeader>
                            <CardTitle>{t('recentClosuresTitle')}</CardTitle>
                            <CardDescription>{t('recentClosuresDesc')}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {snapshot.recentEvents.length === 0 && <div className="text-sm text-zinc-500">{t('noRecentEvents')}</div>}
                            {snapshot.recentEvents.map((event: { id: string; kind?: string; message?: string; createdAt?: string | null }) => (
                                <div key={event.id} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-black/20 p-3">
                                    <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                                        {String(event.kind || '').includes('error') ? <AlertTriangle className="h-4 w-4 text-red-400" /> : <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                                        {event.message}
                                    </div>
                                    <div className="mt-2 text-xs text-zinc-500">{formatDate(event.createdAt)}</div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                    <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50">
                        <CardHeader>
                            <CardTitle>{t('excludedLibrariesTitle')}</CardTitle>
                            <CardDescription>{t('excludedLibrariesDesc')}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-wrap gap-2">
                            {snapshot.excludedLibraries.length === 0 && <span className="text-sm text-zinc-500">{t('noExcludedLibraries')}</span>}
                            {snapshot.excludedLibraries.map((library: string) => (
                                <span key={library} className="rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-200">{library}</span>
                            ))}
                        </CardContent>
                    </Card>

                    <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50">
                        <CardHeader>
                            <CardTitle>{t('rulesTitle')}</CardTitle>
                            <CardDescription>{t('libraryRulesDesc')}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {Object.entries(snapshot.libraryRules).map(([library, rule]: [string, { completionEnabled?: boolean; abandonedThreshold?: number; partialThreshold?: number; completedThreshold?: number }]) => (
                                <div key={library} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-black/20 p-3">
                                    <div className="font-medium text-zinc-100">{library}</div>
                                    <div className="mt-1 text-xs text-zinc-400">
                                        {rule.completionEnabled
                                            ? `${t('abandoned')}: ${rule.abandonedThreshold}% · ${t('partial')}: ${rule.partialThreshold}% · ${t('completed')}: ${rule.completedThreshold}%`
                                            : t('completionDisabled')
                                        }
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>

                <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50">
                    <CardHeader>
                        <CardTitle>{t('processingStatusTitle')}</CardTitle>
                        <CardDescription>{t('processingStatusDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-3">
                        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-black/20 p-4">
                            <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300"><RadioTower className="h-4 w-4 text-cyan-400" /> {t('monitor')}</div>
                            <div className="mt-2 text-sm text-zinc-500">{t('lastSuccess')}: {formatDate(snapshot.status.monitor.lastSuccessAt)}</div>
                            <div className="mt-1 text-sm text-zinc-500">{t('lastError')}: {snapshot.status.monitor.lastError || t('none')}</div>
                        </div>
                        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-black/20 p-4">
                            <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300"><RefreshCw className="h-4 w-4 text-amber-400" /> {t('sync')}</div>
                            <div className="mt-2 text-sm text-zinc-500">{t('lastSuccess')}: {formatDate(snapshot.status.sync.lastSuccessAt)}</div>
                            <div className="mt-1 text-sm text-zinc-500">{t('mode')}: {snapshot.status.sync.mode || '—'}</div>
                        </div>
                        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-black/20 p-4">
                            <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300"><Clock3 className="h-4 w-4 text-emerald-400" /> {t('backup')}</div>
                            <div className="mt-2 text-sm text-zinc-500">{t('lastSuccess')}: {formatDate(snapshot.status.backup.lastSuccessAt)}</div>
                            <div className="mt-1 text-sm text-zinc-500">{t('file')}: {snapshot.status.backup.lastFileName || '—'}</div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
