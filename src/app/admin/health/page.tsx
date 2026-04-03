import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getLogHealthSnapshot } from "@/lib/logHealth";
import { AlertTriangle, CheckCircle2, Clock3, HeartPulse, RadioTower, RefreshCw, ShieldAlert, Library, Activity, History } from "lucide-react";
import { HealthEvent } from "@/lib/systemHealth";
import { HealthAnomalyCharts } from "@/components/admin/HealthAnomalyCharts";
import { getLocale, getTranslations } from "next-intl/server";
import PluginHealthCenterClient from "@/app/admin/plugin-health/PluginHealthCenterClient";

interface OrphanPlayback {
    id: string;
    mediaTitle: string;
    username: string;
    library: string;
    startedAt: string;
    durationWatched: number;
}

export const dynamic = "force-dynamic";

export default async function HealthPage() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.isAdmin) {
        const uid = (session?.user as unknown as { jellyfinUserId?: string })?.jellyfinUserId;
        redirect(uid ? `/users/${uid}` : "/login");
    }

    const [t, locale, snapshot] = await Promise.all([
        getTranslations("dashboard"),
        getLocale(),
        getLogHealthSnapshot(),
    ]);

    const isFr = locale.toLowerCase().startsWith("fr");

    function formatDate(dateString: string | null | undefined) {
        if (!dateString) return t("never");
        return new Date(dateString).toLocaleString(locale);
    }

    return (
        <div className="flex-col md:flex">
            <div className="flex-1 space-y-10 p-4 md:p-8 pt-4 md:pt-6 max-w-7xl mx-auto w-full">
                <header className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
                            <HeartPulse className="h-6 w-6" />
                        </div>
                        <h1 className="text-3xl font-bold tracking-tight">{isFr ? "Sante" : "Health"}</h1>
                    </div>
                    <p className="text-muted-foreground max-w-3xl">
                        {isFr
                            ? "Vue unifiee de la sante du plugin et de la sante des logs."
                            : "Unified view of plugin health and log health."}
                    </p>
                </header>

                <section className="space-y-4">
                    <div className="flex items-center gap-2">
                        <HeartPulse className="h-5 w-5 text-primary" />
                        <h2 className="text-xl font-semibold">{isFr ? "Sante du plugin" : "Plugin Health"}</h2>
                    </div>
                    <PluginHealthCenterClient embedded />
                </section>

                <section className="space-y-6">
                    <div className="flex flex-col gap-1">
                        <h2 className="text-xl font-semibold flex items-center gap-2">
                            <Activity className="h-5 w-5 text-cyan-500" />
                            {t("logHealth")}
                        </h2>
                        <p className="text-muted-foreground max-w-2xl">{t("logHealthDesc")}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
                        <Card className="app-surface-soft border-border">
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                                    <RadioTower className="h-4 w-4 text-cyan-500" />
                                    {t("monitor")}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{snapshot.status.monitor.status === "error" ? t("monitorStatusError") : t("monitorStatusOk")}</div>
                                <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1.5">
                                    <Clock3 className="h-3 w-3" />
                                    {t("lastPoll")}: {formatDate(snapshot.status.monitor.lastPollAt)}
                                </p>
                            </CardContent>
                        </Card>

                        <Card className="app-surface-soft border-zinc-200/60 dark:border-zinc-800/50 shadow-sm">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                                    <ShieldAlert className="h-4 w-4 text-orange-500" />
                                    {t("openPlaybackOrphans")}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{snapshot.counts.openPlaybackOrphans}</div>
                                <p className="text-xs text-muted-foreground mt-1.5">{t("playbackHistoryNote")}</p>
                            </CardContent>
                        </Card>

                        <Card className="app-surface-soft border-zinc-200/60 dark:border-zinc-800/50 shadow-sm">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                                    <AlertTriangle className="h-4 w-4 text-red-500" />
                                    {t("dbWithoutRedis")}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{snapshot.counts.dbStreamsWithoutRedis}</div>
                                <p className="text-xs text-muted-foreground mt-1.5">{t("dbWithoutRedisDesc")}</p>
                            </CardContent>
                        </Card>

                        <Card className="app-surface-soft border-zinc-200/60 dark:border-zinc-800/50 shadow-sm">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                                    <Activity className="h-4 w-4 text-emerald-500" />
                                    {t("redisOrphan")}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{snapshot.counts.redisOrphans}</div>
                                <p className="text-xs text-muted-foreground mt-1.5">{t("redisOrphanDesc")}</p>
                            </CardContent>
                        </Card>
                    </div>

                    <Card className="app-surface border-zinc-200/60 dark:border-zinc-800/50 shadow-md">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-xl">
                                <Activity className="h-5 w-5 text-cyan-500" />
                                {t("anomalyChartsTitle")}
                            </CardTitle>
                            <CardDescription>{t("anomalyChartsDesc")}</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-2">
                            <HealthAnomalyCharts timeline={snapshot.anomalyTimeline} breakdown={snapshot.anomalyBreakdown} />
                        </CardContent>
                    </Card>

                    <div className="grid gap-6 lg:grid-cols-3">
                        <Card className="app-surface border-zinc-200/60 dark:border-zinc-800/50 lg:col-span-1">
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <ShieldAlert className="h-5 w-5 text-orange-400" />
                                    {t("orphanPlaybacksTitle")}
                                </CardTitle>
                                <CardDescription>{t("orphanPlaybacksDesc")}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {snapshot.orphanPlaybacks.length === 0 && (
                                    <div className="py-8 text-center text-sm text-muted-foreground italic app-surface-soft rounded-xl border border-dashed border-border/50">
                                        {t("noOrphanPlaybacks")}
                                    </div>
                                )}
                                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                    {snapshot.orphanPlaybacks.map((entry: OrphanPlayback) => (
                                        <div key={entry.id} className="rounded-xl border border-border/50 app-surface-soft/40 p-3 hover:shadow-sm transition-shadow">
                                            <div className="font-semibold text-foreground truncate">{entry.mediaTitle}</div>
                                            <div className="mt-1 text-xs text-muted-foreground font-medium">{entry.username} · {entry.library}</div>
                                            <div className="mt-2 text-xs text-muted-foreground/80 flex items-center gap-1.5">
                                                <History className="h-3 w-3" />
                                                {formatDate(entry.startedAt)} · {Math.floor((entry.durationWatched ?? 0) / 60)} min
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="app-surface border-zinc-200/60 dark:border-zinc-800/50 lg:col-span-1">
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <History className="h-5 w-5 text-cyan-400" />
                                    {t("recentClosuresTitle")}
                                </CardTitle>
                                <CardDescription>{t("recentClosuresDesc")}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {snapshot.recentEvents.length === 0 && (
                                    <div className="py-8 text-center text-sm text-muted-foreground italic app-surface-soft rounded-xl border border-dashed border-border/50">
                                        {t("noRecentEvents")}
                                    </div>
                                )}
                                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                    {snapshot.recentEvents.map((event: HealthEvent) => (
                                        <div key={event.id} className="rounded-xl border border-border/50 app-surface-soft/40 p-3 hover:shadow-sm transition-shadow">
                                            <div className="flex items-start gap-3 text-sm font-medium text-foreground">
                                                {String(event.kind || "").includes("error")
                                                    ? <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5" />
                                                    : <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5" />}
                                                <div className="flex-1 leading-relaxed">{event.message}</div>
                                            </div>
                                            <div className="mt-2 text-[10px] text-muted-foreground/80 font-mono text-right">{formatDate(event.createdAt)}</div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        <div className="space-y-6">
                            <Card className="app-surface border-zinc-200/60 dark:border-zinc-800/50 shadow-sm">
                                <CardHeader>
                                    <CardTitle className="text-lg flex items-center gap-2">
                                        <Library className="h-5 w-5 text-zinc-400" />
                                        {t("excludedLibrariesTitle")}
                                    </CardTitle>
                                    <CardDescription>{t("excludedLibrariesDesc")}</CardDescription>
                                </CardHeader>
                                <CardContent className="flex flex-wrap gap-2">
                                    {snapshot.excludedLibraries.length === 0 && <span className="text-sm text-zinc-500 italic">{t("noExcludedLibraries")}</span>}
                                    {snapshot.excludedLibraries.map((library: string) => (
                                        <span key={library} className="rounded-lg border border-red-500/20 bg-red-500/5 px-2.5 py-1 text-xs font-semibold text-red-600 dark:text-red-400">{library}</span>
                                    ))}
                                </CardContent>
                            </Card>

                            <Card className="app-surface border-zinc-200/60 dark:border-zinc-800/50 shadow-sm overflow-hidden">
                                <CardHeader className="app-surface-soft border-b border-zinc-200/50 dark:border-zinc-800/50">
                                    <CardTitle className="text-lg">{t("processingStatusTitle")}</CardTitle>
                                    <CardDescription>{t("processingStatusDesc")}</CardDescription>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                                        <div className="p-4 hover:bg-zinc-500/5 dark:hover:bg-white/5 transition-colors">
                                            <div className="flex items-center justify-between mb-1">
                                                <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><RadioTower className="h-4 w-4 text-cyan-500" /> {t("monitor")}</div>
                                                <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{t("lastSuccess")}</div>
                                            </div>
                                            <div className="text-xs text-muted-foreground ml-6">{formatDate(snapshot.status.monitor.lastSuccessAt)}</div>
                                        </div>

                                        <div className="p-4 hover:bg-zinc-500/5 dark:hover:bg-white/5 transition-colors">
                                            <div className="flex items-center justify-between mb-1">
                                                <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><RefreshCw className="h-4 w-4 text-amber-500" /> {t("sync")}</div>
                                                <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{t("lastSuccess")}</div>
                                            </div>
                                            <div className="text-xs text-muted-foreground ml-6">{formatDate(snapshot.status.sync.lastSuccessAt)} ({snapshot.status.sync.mode || "-"})</div>
                                        </div>

                                        <div className="p-4 hover:bg-zinc-500/5 dark:hover:bg-white/5 transition-colors">
                                            <div className="flex items-center justify-between mb-1">
                                                <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><Clock3 className="h-4 w-4 text-emerald-500" /> {t("backup")}</div>
                                                <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{t("lastSuccess")}</div>
                                            </div>
                                            <div className="text-xs text-muted-foreground ml-6">{formatDate(snapshot.status.backup.lastSuccessAt)}</div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
