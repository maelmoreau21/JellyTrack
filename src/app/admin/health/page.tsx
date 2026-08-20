import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/authOptions";
import { getLogHealthSnapshot } from "@/lib/logHealth";
import { AlertTriangle, Clock3, HeartPulse, RadioTower, ShieldAlert, Library, Activity, History } from "lucide-react";
import RecentClosuresClient from "./RecentClosuresClient";
import { HealthAnomalyCharts } from "@/components/admin/HealthAnomalyCharts";
import { getLocale, getTranslations } from "next-intl/server";
import PluginHealthCenterClient from "@/app/admin/plugin-health/PluginHealthCenterClient";
import { getActiveSecurityAnomalies, SecurityAlert } from "@/lib/anomalyDetector";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldAlert as ShieldIcon, AlertOctagon, UserX, FileWarning } from "lucide-react";

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

    const [t, locale, snapshot, securityAlerts] = await Promise.all([
        getTranslations("dashboard"),
        getLocale(),
        getLogHealthSnapshot(),
        getActiveSecurityAnomalies(),
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

                {/* Real-time Security & Media Anomalies Detection */}
                <section className="space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                            <ShieldIcon className="h-5 w-5 text-amber-400" />
                            <h2 className="text-xl font-semibold">
                                {isFr ? "Détection d'Anomalies & Partage de Compte" : "Security Anomalies & Account Sharing"}
                            </h2>
                        </div>
                        {securityAlerts.length === 0 ? (
                            <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 flex items-center gap-1.5 py-1">
                                <ShieldCheck className="w-3.5 h-3.5" />
                                {isFr ? "Aucune anomalie détectée" : "No anomalies detected"}
                            </Badge>
                        ) : (
                            <Badge variant="destructive" className="flex items-center gap-1.5 py-1">
                                <AlertOctagon className="w-3.5 h-3.5" />
                                {securityAlerts.length} {isFr ? "alerte(s) active(s)" : "active alert(s)"}
                            </Badge>
                        )}
                    </div>

                    {securityAlerts.length === 0 ? (
                        <div className="app-surface-soft border border-emerald-500/20 rounded-2xl p-4 flex items-center gap-3 text-sm text-emerald-300">
                            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                            <span>
                                {isFr
                                    ? "Toutes les lectures récentes sont nominales. Aucun comportement suspect de multi-connexion IP ni fichier corrompu identifié."
                                    : "All recent sessions are operating normally. No suspicious multi-IP logins or corrupted media detected."}
                            </span>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {securityAlerts.map((alert) => (
                                <div
                                    key={alert.id}
                                    className={`app-surface border rounded-2xl p-4 flex items-start gap-3.5 transition-all shadow-sm ${
                                        alert.severity === "critical"
                                            ? "border-red-500/40 bg-red-500/5 hover:border-red-500/60"
                                            : "border-amber-500/40 bg-amber-500/5 hover:border-amber-500/60"
                                    }`}
                                >
                                    <div
                                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                                            alert.severity === "critical"
                                                ? "bg-red-500/15 text-red-400 border border-red-500/25"
                                                : "bg-amber-500/15 text-amber-400 border border-amber-500/25"
                                        }`}
                                    >
                                        {alert.type === "account_sharing" ? (
                                            <UserX className="w-4 h-4" />
                                        ) : (
                                            <FileWarning className="w-4 h-4" />
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <h4
                                                className={`text-sm font-bold truncate ${
                                                    alert.severity === "critical" ? "text-red-400" : "text-amber-400"
                                                }`}
                                            >
                                                {alert.title}
                                            </h4>
                                            <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                                                {new Date(alert.timestamp).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                                            </span>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                                            {alert.description}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <section className="space-y-5">
                    <div className="flex flex-col gap-1">
                        <h2 className="text-xl font-semibold flex items-center gap-2">
                            <Activity className="h-5 w-5 text-cyan-500" />
                            {t("logHealth")}
                        </h2>
                        <p className="text-muted-foreground max-w-2xl">{t("logHealthDesc")}</p>
                    </div>

                    <div className={`grid grid-cols-1 gap-4 md:grid-cols-2 ${snapshot.isValkeyEnabled !== false ? "lg:grid-cols-4" : "lg:grid-cols-2"}`}>
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

                        {snapshot.isValkeyEnabled !== false && (
                            <>
                                <Card className="app-surface border-border">
                                    <CardHeader className="pb-2">
                                        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                            <AlertTriangle className="h-4 w-4 text-red-500" />
                                            {t("dbWithoutValkey")}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-xl font-semibold">{snapshot.counts.dbStreamsWithoutValkey}</div>
                                        <p className="mt-1.5 text-xs text-muted-foreground">{t("dbWithoutValkeyDesc")}</p>
                                    </CardContent>
                                </Card>

                                <Card className="app-surface border-border">
                                    <CardHeader className="pb-2">
                                        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                            <Activity className="h-4 w-4 text-emerald-500" />
                                            {t("valkeyOrphan")}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-xl font-semibold">{snapshot.counts.valkeyOrphans}</div>
                                        <p className="mt-1.5 text-xs text-muted-foreground">{t("valkeyOrphanDesc")}</p>
                                    </CardContent>
                                </Card>
                            </>
                        )}
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
                            <HealthAnomalyCharts timeline={snapshot.anomalyTimeline} />
                        </CardContent>
                    </Card>

                    <div className="grid gap-4 lg:grid-cols-3 items-stretch">
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

                        <Card className="app-surface border-border lg:col-span-1 h-full">
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <History className="h-5 w-5 text-cyan-400" />
                                    {t("recentClosuresTitle")}
                                </CardTitle>
                                <CardDescription>{t("recentClosuresDesc")}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3 flex flex-col h-full">
                                <RecentClosuresClient events={snapshot.recentEvents} defaultCount={5} />
                            </CardContent>
                        </Card>

                        <div className="space-y-6">
                            <Card className="app-surface border-border">
                                <CardHeader>
                                    <CardTitle className="text-lg flex items-center gap-2">
                                        <Library className="h-5 w-5 text-muted-foreground" />
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

                            {/* 'Statut de traitement' removed as requested */}
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
