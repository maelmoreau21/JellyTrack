import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/authOptions";
import { getLogHealthSnapshot } from "@/lib/logHealth";
import { AlertTriangle, CheckCircle2, Clock3, HeartPulse, RadioTower, RefreshCw, ShieldAlert, Library, Activity, History } from "lucide-react";
import { HealthEvent } from "@/lib/systemHealth";
import RecentClosuresClient from "./RecentClosuresClient";
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

    function formatSectionStatus(status: string | null | undefined) {
        const normalized = (status || "idle").toLowerCase();
        if (normalized === "error") return t("monitorStatusError");
        if (normalized === "ok") return t("monitorStatusOk");
        if (normalized === "running") return t("running");
        return normalized;
    }

    function sectionStatusClass(status: string | null | undefined) {
        const normalized = (status || "idle").toLowerCase();
        if (normalized === "error") return "border-red-500/35 bg-red-500/10 text-red-600 dark:text-red-300";
        if (normalized === "running") return "border-amber-500/35 bg-amber-500/10 text-amber-600 dark:text-amber-300";
        if (normalized === "ok") return "border-emerald-500/35 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300";
        return "border-zinc-500/25 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300";
    }

    return (
        <div className="flex-col md:flex">
            <div className="mx-auto w-full max-w-7xl flex-1 space-y-8 p-4 pt-4 md:p-8 md:pt-6">
                <header className="space-y-2">
                    <div className="flex items-center gap-2">
                        <HeartPulse className="h-6 w-6 text-primary" />
                        <h1 className="text-3xl font-bold tracking-tight">{isFr ? "Sante" : "Health"}</h1>
                    </div>
                    {/* description removed per request */}
                </header>

                <section className="space-y-3">
                    <div className="flex items-center gap-2">
                        <HeartPulse className="h-5 w-5 text-primary" />
                        <h2 className="text-xl font-semibold">{isFr ? "Sante du plugin" : "Plugin Health"}</h2>
                    </div>
                    <PluginHealthCenterClient embedded />
                </section>

                <section className="space-y-5">
                    <div className="flex flex-col gap-1">
                        <h2 className="text-xl font-semibold flex items-center gap-2">
                            <Activity className="h-5 w-5 text-cyan-500" />
                            {t("logHealth")}
                        </h2>
                        <p className="text-muted-foreground max-w-2xl">{t("logHealthDesc")}</p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <Card className="app-surface border-border">
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                    <RadioTower className="h-4 w-4 text-cyan-500" />
                                    {t("monitor")}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-xl font-semibold">{formatSectionStatus(snapshot.status.monitor.status)}</div>
                                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <Clock3 className="h-3 w-3" />
                                    {t("lastPoll")}: {formatDate(snapshot.status.monitor.lastPollAt)}
                                </p>
                            </CardContent>
                        </Card>

                        <Card className="app-surface border-border">
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                    <ShieldAlert className="h-4 w-4 text-orange-500" />
                                    {t("openPlaybackOrphans")}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-xl font-semibold">{snapshot.counts.openPlaybackOrphans}</div>
                                <p className="mt-1.5 text-xs text-muted-foreground">{t("playbackHistoryNote")}</p>
                            </CardContent>
                        </Card>

                        <Card className="app-surface border-border">
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                    <AlertTriangle className="h-4 w-4 text-red-500" />
                                    {t("dbWithoutRedis")}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-xl font-semibold">{snapshot.counts.dbStreamsWithoutRedis}</div>
                                <p className="mt-1.5 text-xs text-muted-foreground">{t("dbWithoutRedisDesc")}</p>
                            </CardContent>
                        </Card>

                        <Card className="app-surface border-border">
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                    <Activity className="h-4 w-4 text-emerald-500" />
                                    {t("redisOrphan")}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-xl font-semibold">{snapshot.counts.redisOrphans}</div>
                                <p className="mt-1.5 text-xs text-muted-foreground">{t("redisOrphanDesc")}</p>
                            </CardContent>
                        </Card>
                    </div>

                    <Card className="app-surface border-border">
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

                    <div className="grid gap-4 lg:grid-cols-3">
                        <Card className="app-surface border-border lg:col-span-1">
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <ShieldAlert className="h-5 w-5 text-orange-400" />
                                    {t("orphanPlaybacksTitle")}
                                </CardTitle>
                                <CardDescription>{t("orphanPlaybacksDesc")}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {snapshot.orphanPlaybacks.length === 0 && (
                                    <div className="app-surface-soft rounded-lg border border-dashed border-border py-8 text-center text-sm italic text-muted-foreground">
                                        {t("noOrphanPlaybacks")}
                                    </div>
                                )}
                                <div className="max-h-[400px] space-y-2 overflow-y-auto pr-1">
                                    {snapshot.orphanPlaybacks.map((entry: OrphanPlayback) => (
                                        <div key={entry.id} className="app-surface-soft rounded-lg border border-border p-3">
                                            <div className="font-semibold text-foreground truncate">{entry.mediaTitle}</div>
                                            <div className="mt-1 text-xs font-medium text-muted-foreground">{entry.username} · {entry.library}</div>
                                            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                                                <History className="h-3 w-3" />
                                                {formatDate(entry.startedAt)} · {Math.floor((entry.durationWatched ?? 0) / 60)} min
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="app-surface border-border lg:col-span-1">
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <History className="h-5 w-5 text-cyan-400" />
                                    {t("recentClosuresTitle")}
                                </CardTitle>
                                <CardDescription>{t("recentClosuresDesc")}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <RecentClosuresClient events={snapshot.recentEvents} defaultCount={5} />
                            </CardContent>
                        </Card>

                        <div className="space-y-6">
                            <Card className="app-surface border-border">
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

                            <Card className="app-surface overflow-hidden border-border">
                                <CardHeader className="app-surface-soft border-b border-border">
                                    <CardTitle className="text-lg">{t("processingStatusTitle")}</CardTitle>
                                    <CardDescription>{t("processingStatusDesc")}</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <div className="app-surface-soft p-3 rounded-lg border">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><RadioTower className="h-4 w-4 text-cyan-500" /> {t("monitor")}</div>
                                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${sectionStatusClass(snapshot.status.monitor.status)}`}>
                                                    {formatSectionStatus(snapshot.status.monitor.status)}
                                                </span>
                                            </div>
                                            <div className="mt-2 text-xs text-muted-foreground">{t("lastPoll")}</div>
                                            <div className="mt-1 text-sm font-medium">{formatDate(snapshot.status.monitor.lastPollAt)}</div>
                                            <div className="mt-2 text-xs text-muted-foreground">{t("lastSuccess")}</div>
                                            <div className="mt-1 text-sm font-medium">{formatDate(snapshot.status.monitor.lastSuccessAt)}</div>
                                            {snapshot.status.monitor.lastError && (
                                                <div className="mt-2 text-xs text-red-500/90">{t("lastError")}: {snapshot.status.monitor.lastError}</div>
                                            )}
                                        </div>

                                        <div className="app-surface-soft p-3 rounded-lg border">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><RefreshCw className="h-4 w-4 text-amber-500" /> {t("sync")}</div>
                                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${sectionStatusClass(snapshot.status.sync.status)}`}>
                                                    {formatSectionStatus(snapshot.status.sync.status)}
                                                </span>
                                            </div>
                                            {snapshot.status.sync.mode && (
                                                <div className="mt-2 text-xs text-muted-foreground">{t("mode")}: <span className="font-medium text-foreground">{snapshot.status.sync.mode}</span></div>
                                            )}
                                            <div className="mt-2 text-xs text-muted-foreground">{t("lastSuccess")}</div>
                                            <div className="mt-1 text-sm font-medium">{formatDate(snapshot.status.sync.lastSuccessAt)}</div>
                                            {snapshot.status.sync.lastError && (
                                                <div className="mt-2 text-xs text-red-500/90">{t("lastError")}: {snapshot.status.sync.lastError}</div>
                                            )}
                                        </div>

                                        <div className="app-surface-soft p-3 rounded-lg border">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><Clock3 className="h-4 w-4 text-emerald-500" /> {t("backup")}</div>
                                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${sectionStatusClass(snapshot.status.backup.status)}`}>
                                                    {formatSectionStatus(snapshot.status.backup.status)}
                                                </span>
                                            </div>
                                            <div className="mt-2 text-xs text-muted-foreground">{t("lastSuccess")}</div>
                                            <div className="mt-1 text-sm font-medium">{formatDate(snapshot.status.backup.lastSuccessAt)}</div>
                                            {snapshot.status.backup.lastError && (
                                                <div className="mt-2 text-xs text-red-500/90">{t("lastError")}: {snapshot.status.backup.lastError}</div>
                                            )}
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
