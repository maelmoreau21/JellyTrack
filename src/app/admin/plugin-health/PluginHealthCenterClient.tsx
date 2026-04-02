"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Download, HeartPulse, RefreshCw, Send, ShieldCheck, Timer } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocale } from "next-intl";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

type HealthSnapshot = {
    generatedAt: string;
    plugin: {
        connected: boolean;
        lastSeen: string | null;
        version: string | null;
        serverName: string | null;
        hasApiKey: boolean;
        endpoint: string;
    };
    heartbeat: {
        count24h: number;
        gapSec: number | null;
        intervalP50Sec: number | null;
        intervalP95Sec: number | null;
        jitterP95Sec: number | null;
    };
    ingestion: {
        successEstimate24h: number;
        failureCount24h: number;
        unauthorized24h: number;
        rateLimited24h: number;
        invalidPayload24h: number;
        monitorErrors24h: number;
        successRate24h: number | null;
    };
    streams: {
        active: number;
        transcodes: number;
        stale: number;
        avgBitrateKbps: number | null;
    };
    pluginReportedMetrics: {
        queueDepth: number | null;
        retries: number | null;
        lastHttpCode: number | null;
        note: string;
    };
    recentFailures: Array<{
        id: string;
        action: string;
        ipAddress: string | null;
        createdAt: string;
        details: Record<string, unknown> | null;
    }>;
};

function formatGap(seconds: number | null): string {
    if (seconds === null) return "-";
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h`;
}

function formatSeconds(value: number | null): string {
    if (value === null || !Number.isFinite(value)) return "-";
    const rounded = Math.round(value * 100) / 100;
    return `${rounded}s`;
}

function formatPercent(value: number | null): string {
    if (value === null || !Number.isFinite(value)) return "-";
    const rounded = Math.round(value * 100) / 100;
    return `${rounded}%`;
}

function formatBitrateKbps(value: number | null): string {
    if (value === null || !Number.isFinite(value)) return "-";
    if (value >= 1000) return `${(value / 1000).toFixed(1)} Mbps`;
    return `${Math.round(value)} kbps`;
}

export default function PluginHealthCenterClient() {
    const locale = useLocale();
    const isFr = locale.toLowerCase().startsWith("fr");
    const tr = (en: string, fr: string) => (isFr ? fr : en);

    const [snapshot, setSnapshot] = useState<HealthSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<"test_connection" | "force_heartbeat" | null>(null);
    const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const loadSnapshot = useCallback(async () => {
        setLoading(true);
        setNotice(null);
        try {
            const res = await fetch("/api/admin/plugin/health", { cache: "no-store" });
            if (!res.ok) {
                throw new Error(`Health endpoint failed (${res.status})`);
            }
            const data = (await res.json()) as HealthSnapshot;
            setSnapshot(data);
        } catch (error) {
            const message = error instanceof Error
                ? error.message
                : tr("Failed to load plugin health.", "Impossible de charger l'etat du plugin.");
            setNotice({ type: "error", text: message });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadSnapshot();
    }, [loadSnapshot]);

    const runAction = useCallback(async (action: "test_connection" | "force_heartbeat") => {
        setActionLoading(action);
        setNotice(null);
        try {
            const res = await fetch("/api/admin/plugin/health", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ action }),
            });

            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error((body as { error?: string }).error || `Action failed (${res.status})`);
            }

            const latency = typeof (body as { latencyMs?: number }).latencyMs === "number"
                ? `${(body as { latencyMs: number }).latencyMs}ms`
                : "n/a";

            setNotice({
                type: "success",
                text: action === "test_connection"
                    ? tr(`Connection test completed (latency ${latency}).`, `Test de connexion termine (latence ${latency}).`)
                    : tr(`Manual heartbeat sent (latency ${latency}).`, `Heartbeat manuel envoye (latence ${latency}).`),
            });

            await loadSnapshot();
        } catch (error) {
            const message = error instanceof Error ? error.message : tr("Action failed.", "Action echouee.");
            setNotice({ type: "error", text: message });
        } finally {
            setActionLoading(null);
        }
    }, [loadSnapshot]);

    const connectionBadge = useMemo(() => {
        if (!snapshot?.plugin.connected) {
            return <Badge className="bg-red-500/15 text-red-400 border-red-500/30">{tr("offline", "hors ligne")}</Badge>;
        }
        return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">{tr("online", "en ligne")}</Badge>;
    }, [snapshot?.plugin.connected, isFr]);

    return (
        <div className="flex-col md:flex">
            <div className="flex-1 space-y-6 p-4 md:p-8 pt-4 md:pt-6 max-w-[1400px] mx-auto w-full">
                <header className="flex flex-col gap-3">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                            <HeartPulse className="w-7 h-7 text-primary" />
                            {tr("Plugin Health Center", "Centre de Sante du Plugin")}
                        </h1>
                        <p className="text-sm text-muted-foreground mt-2 max-w-3xl">
                            {tr(
                                "Centralized diagnostics for heartbeat stability, ingestion reliability, and stream health.",
                                "Diagnostic centralise pour la stabilite des heartbeats, la fiabilite d'ingestion et la sante des flux."
                            )}
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => void loadSnapshot()} disabled={loading}>
                            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                            {tr("Refresh", "Rafraichir")}
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => void runAction("test_connection")}
                            disabled={actionLoading !== null}
                        >
                            <ShieldCheck className="w-4 h-4" />
                            {actionLoading === "test_connection"
                                ? tr("Testing...", "Test en cours...")
                                : tr("Test Connection", "Tester la connexion")}
                        </Button>
                        <Button
                            onClick={() => void runAction("force_heartbeat")}
                            disabled={actionLoading !== null}
                        >
                            <Send className="w-4 h-4" />
                            {actionLoading === "force_heartbeat"
                                ? tr("Sending...", "Envoi en cours...")
                                : tr("Force Heartbeat", "Forcer un heartbeat")}
                        </Button>
                        <Button asChild variant="secondary">
                            <a href="/api/admin/plugin/health?export=1">
                                <Download className="w-4 h-4" />
                                {tr("Export Diagnostic JSON", "Exporter le JSON de diagnostic")}
                            </a>
                        </Button>
                    </div>
                </header>

                {notice && (
                    <div className={`rounded-md border px-3 py-2 text-sm ${notice.type === "success"
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                            : "border-red-500/40 bg-red-500/10 text-red-400"
                        }`}>
                        {notice.text}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    <Card className="app-surface-soft border-border/60">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm text-muted-foreground">{tr("Connection", "Connexion")}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-1.5 text-sm">
                            <div className="flex items-center justify-between">
                                <span>{tr("Status", "Statut")}</span>
                                {connectionBadge}
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <span>{tr("Last seen", "Derniere activite")}</span>
                                <span className="font-medium">{snapshot?.plugin.lastSeen ? new Date(snapshot.plugin.lastSeen).toLocaleString() : "-"}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <span>{tr("Server", "Serveur")}</span>
                                <span className="font-medium truncate">{snapshot?.plugin.serverName || "-"}</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="app-surface-soft border-border/60">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm text-muted-foreground">{tr("Heartbeat jitter", "Jitter heartbeat")}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-1.5 text-sm">
                            <div className="flex items-center justify-between">
                                <span>{tr("P50 interval", "Intervalle P50")}</span>
                                <span className="font-semibold">{formatSeconds(snapshot?.heartbeat.intervalP50Sec ?? null)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span>{tr("P95 interval", "Intervalle P95")}</span>
                                <span className="font-semibold">{formatSeconds(snapshot?.heartbeat.intervalP95Sec ?? null)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span>{tr("P95 jitter", "Jitter P95")}</span>
                                <span className="font-semibold">{formatSeconds(snapshot?.heartbeat.jitterP95Sec ?? null)}</span>
                            </div>
                            <div className="flex items-center justify-between text-muted-foreground">
                                <span>{tr("Gap now", "Ecart actuel")}</span>
                                <span>{formatGap(snapshot?.heartbeat.gapSec ?? null)}</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="app-surface-soft border-border/60">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm text-muted-foreground">{tr("Ingestion reliability", "Fiabilite d'ingestion")}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-1.5 text-sm">
                            <div className="flex items-center justify-between">
                                <span>{tr("Success rate (24h)", "Taux de succes (24h)")}</span>
                                <span className="font-semibold">{formatPercent(snapshot?.ingestion.successRate24h ?? null)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span>{tr("Failures (24h)", "Echecs (24h)")}</span>
                                <span className="font-semibold">{snapshot?.ingestion.failureCount24h ?? 0}</span>
                            </div>
                            <div className="flex items-center justify-between text-muted-foreground">
                                <span>{tr("Unauthorized", "Non autorise")}</span>
                                <span>{snapshot?.ingestion.unauthorized24h ?? 0}</span>
                            </div>
                            <div className="flex items-center justify-between text-muted-foreground">
                                <span>{tr("Rate limited", "Limite de debit")}</span>
                                <span>{snapshot?.ingestion.rateLimited24h ?? 0}</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="app-surface-soft border-border/60">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm text-muted-foreground">{tr("Live stream health", "Sante des flux en direct")}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-1.5 text-sm">
                            <div className="flex items-center justify-between">
                                <span>{tr("Active streams", "Flux actifs")}</span>
                                <span className="font-semibold">{snapshot?.streams.active ?? 0}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span>{tr("Transcodes", "Transcodages")}</span>
                                <span className="font-semibold">{snapshot?.streams.transcodes ?? 0}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span>{tr("Stale streams", "Flux inactifs")}</span>
                                <span className="font-semibold">{snapshot?.streams.stale ?? 0}</span>
                            </div>
                            <div className="flex items-center justify-between text-muted-foreground">
                                <span>{tr("Avg bitrate", "Debit moyen")}</span>
                                <span>{formatBitrateKbps(snapshot?.streams.avgBitrateKbps ?? null)}</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <Card className="app-surface border-border/60 lg:col-span-2">
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-amber-400" />
                                {tr("Recent ingest failures", "Derniers echecs d'ingestion")}
                            </CardTitle>
                            <CardDescription>
                                {tr(
                                    "Latest plugin validation/security failures recorded by the server.",
                                    "Derniers echecs de validation/securite du plugin enregistres par le serveur."
                                )}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>{tr("When", "Quand")}</TableHead>
                                        <TableHead>{tr("Action", "Action")}</TableHead>
                                        <TableHead>IP</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(snapshot?.recentFailures || []).map((entry) => (
                                        <TableRow key={entry.id}>
                                            <TableCell>{new Date(entry.createdAt).toLocaleString()}</TableCell>
                                            <TableCell>{entry.action}</TableCell>
                                            <TableCell>{entry.ipAddress || "-"}</TableCell>
                                        </TableRow>
                                    ))}
                                    {(snapshot?.recentFailures || []).length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-center text-muted-foreground">
                                                {tr("No recent failures detected.", "Aucun echec recent detecte.")}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    <Card className="app-surface border-border/60">
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Timer className="w-4 h-4 text-cyan-400" />
                                {tr("Plugin-reported metrics", "Metriques remontees par le plugin")}
                            </CardTitle>
                            <CardDescription>
                                {tr("Metrics expected from plugin queue telemetry.", "Metriques attendues via la telemetrie de file du plugin.")}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                            <div className="flex items-center justify-between">
                                <span>{tr("Queue depth", "Profondeur de file")}</span>
                                <span className="font-medium">{snapshot?.pluginReportedMetrics.queueDepth ?? "-"}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span>{tr("Retries", "Tentatives")}</span>
                                <span className="font-medium">{snapshot?.pluginReportedMetrics.retries ?? "-"}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span>{tr("Last HTTP code", "Dernier code HTTP")}</span>
                                <span className="font-medium">{snapshot?.pluginReportedMetrics.lastHttpCode ?? "-"}</span>
                            </div>
                            <p className="text-xs text-muted-foreground pt-2 border-t border-border/60">
                                {snapshot?.pluginReportedMetrics.note || "-"}
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
