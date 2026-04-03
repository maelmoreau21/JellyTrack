"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Download, HeartPulse, RefreshCw, Send, ShieldCheck, Timer } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocale, useTranslations } from "next-intl";
import ResponsiveContainer from "@/components/charts/ResponsiveContainerGuard";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
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
        intervalSeries24h: Array<{
            timestamp: string;
            intervalSec: number;
            jitterSec: number | null;
        }>;
    };
    thresholdDefaults: {
        gapWarningSec: number;
        gapCriticalSec: number;
        jitterWarningSec: number;
        jitterCriticalSec: number;
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

type HeartbeatThresholds = {
    gapWarningSec: number;
    gapCriticalSec: number;
    jitterWarningSec: number;
    jitterCriticalSec: number;
};

type Severity = "ok" | "warning" | "critical" | "na";

const THRESHOLDS_STORAGE_KEY = "plugin-health-thresholds-v1";
const FALLBACK_THRESHOLDS: HeartbeatThresholds = {
    gapWarningSec: 90,
    gapCriticalSec: 180,
    jitterWarningSec: 15,
    jitterCriticalSec: 30,
};

function parsePositive(value: unknown, fallback: number): number {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
    if (typeof value === "string") {
        const parsed = Number(value.trim());
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return fallback;
}

function normalizeThresholds(raw: Partial<HeartbeatThresholds> | null | undefined, defaults: HeartbeatThresholds): HeartbeatThresholds {
    const gapWarningSec = parsePositive(raw?.gapWarningSec, defaults.gapWarningSec);
    const gapCriticalSec = Math.max(parsePositive(raw?.gapCriticalSec, defaults.gapCriticalSec), gapWarningSec + 1);
    const jitterWarningSec = parsePositive(raw?.jitterWarningSec, defaults.jitterWarningSec);
    const jitterCriticalSec = Math.max(parsePositive(raw?.jitterCriticalSec, defaults.jitterCriticalSec), jitterWarningSec + 0.1);

    return {
        gapWarningSec,
        gapCriticalSec,
        jitterWarningSec,
        jitterCriticalSec,
    };
}

function resolveSeverity(value: number | null, warning: number, critical: number): Severity {
    if (value === null || !Number.isFinite(value)) return "na";
    if (value >= critical) return "critical";
    if (value >= warning) return "warning";
    return "ok";
}

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

export default function PluginHealthCenterClient({ embedded = false }: { embedded?: boolean }) {
    const locale = useLocale();
    const t = useTranslations("pluginHealth");

    const [snapshot, setSnapshot] = useState<HealthSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<"test_connection" | "force_heartbeat" | null>(null);
    const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [thresholds, setThresholds] = useState<HeartbeatThresholds>(FALLBACK_THRESHOLDS);

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
                : t("failedLoad");
            setNotice({ type: "error", text: message });
        } finally {
            setLoading(false);
        }
    }, [t]);

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
                    ? t("connectionTestCompleted", { latency })
                    : t("manualHeartbeatSent", { latency }),
            });

            await loadSnapshot();
        } catch (error) {
            const message = error instanceof Error ? error.message : t("actionFailed");
            setNotice({ type: "error", text: message });
        } finally {
            setActionLoading(null);
        }
    }, [loadSnapshot, t]);

    const connectionBadge = useMemo(() => {
        if (!snapshot?.plugin.connected) {
            return <Badge className="bg-red-500/15 text-red-400 border-red-500/30">{t("offline")}</Badge>;
        }
        return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">{t("online")}</Badge>;
    }, [snapshot?.plugin.connected, t]);

    const pluginMetricsNote = useMemo(() => {
        const raw = snapshot?.pluginReportedMetrics.note;
        if (!raw) return "-";
        if (raw === "Live plugin telemetry from latest heartbeat.") {
            return t("pluginMetricsLive");
        }
        if (raw === "Current plugin payload version does not include queue depth/retry/http diagnostics.") {
            return t("pluginMetricsUnavailable");
        }
        return raw;
    }, [snapshot?.pluginReportedMetrics.note, t]);

    const thresholdDefaults = useMemo<HeartbeatThresholds>(() => {
        if (!snapshot?.thresholdDefaults) return FALLBACK_THRESHOLDS;
        return normalizeThresholds(snapshot.thresholdDefaults, FALLBACK_THRESHOLDS);
    }, [snapshot?.thresholdDefaults]);

    useEffect(() => {
        let persistedRaw: Partial<HeartbeatThresholds> | null = null;

        if (typeof window !== "undefined") {
            try {
                const saved = window.localStorage.getItem(THRESHOLDS_STORAGE_KEY);
                if (saved) {
                    persistedRaw = JSON.parse(saved) as Partial<HeartbeatThresholds>;
                }
            } catch {
                persistedRaw = null;
            }
        }

        setThresholds(normalizeThresholds(persistedRaw ?? thresholdDefaults, thresholdDefaults));
    }, [thresholdDefaults]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            window.localStorage.setItem(THRESHOLDS_STORAGE_KEY, JSON.stringify(thresholds));
        } catch {
            // Ignore local storage write failures.
        }
    }, [thresholds]);

    const updateThreshold = useCallback((key: keyof HeartbeatThresholds, value: string) => {
        setThresholds((current) => normalizeThresholds({ ...current, [key]: value }, thresholdDefaults));
    }, [thresholdDefaults]);

    const gapSeverity = useMemo(
        () => resolveSeverity(snapshot?.heartbeat.gapSec ?? null, thresholds.gapWarningSec, thresholds.gapCriticalSec),
        [snapshot?.heartbeat.gapSec, thresholds],
    );

    const jitterSeverity = useMemo(
        () => resolveSeverity(snapshot?.heartbeat.jitterP95Sec ?? null, thresholds.jitterWarningSec, thresholds.jitterCriticalSec),
        [snapshot?.heartbeat.jitterP95Sec, thresholds],
    );

    const renderSeverityBadge = useCallback((severity: Severity) => {
        if (severity === "critical") {
            return <Badge className="bg-red-500/15 text-red-400 border-red-500/30">{t("stateCritical")}</Badge>;
        }
        if (severity === "warning") {
            return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30">{t("stateWarning")}</Badge>;
        }
        if (severity === "ok") {
            return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">{t("stateOk")}</Badge>;
        }
        return <Badge className="bg-zinc-500/15 text-zinc-300 border-zinc-500/30">{t("stateUnknown")}</Badge>;
    }, [t]);

    const heartbeatSeries = snapshot?.heartbeat.intervalSeries24h || [];

    return (
        <div className={embedded ? "space-y-6" : "flex-col md:flex"}>
            <div className={embedded ? "space-y-6" : "flex-1 space-y-6 p-4 md:p-8 pt-4 md:pt-6 max-w-[1400px] mx-auto w-full"}>
                <header className="flex flex-col gap-3">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                            <HeartPulse className="w-7 h-7 text-primary" />
                            {t("title")}
                        </h1>
                        <p className="text-sm text-muted-foreground mt-2 max-w-3xl">
                            {t("description")}
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => void loadSnapshot()} disabled={loading}>
                            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                            {t("refresh")}
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => void runAction("test_connection")}
                            disabled={actionLoading !== null}
                        >
                            <ShieldCheck className="w-4 h-4" />
                            {actionLoading === "test_connection"
                                ? t("testing")
                                : t("testConnection")}
                        </Button>
                        <Button
                            onClick={() => void runAction("force_heartbeat")}
                            disabled={actionLoading !== null}
                        >
                            <Send className="w-4 h-4" />
                            {actionLoading === "force_heartbeat"
                                ? t("sending")
                                : t("forceHeartbeat")}
                        </Button>
                        <Button asChild variant="secondary">
                            <a href="/api/admin/plugin/health?export=1">
                                <Download className="w-4 h-4" />
                                {t("exportDiagnosticJson")}
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
                            <CardTitle className="text-sm text-muted-foreground">{t("connection")}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-1.5 text-sm">
                            <div className="flex items-center justify-between">
                                <span>{t("status")}</span>
                                {connectionBadge}
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <span>{t("lastSeen")}</span>
                                <span className="font-medium">{snapshot?.plugin.lastSeen ? new Date(snapshot.plugin.lastSeen).toLocaleString(locale) : "-"}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <span>{t("server")}</span>
                                <span className="font-medium truncate">{snapshot?.plugin.serverName || "-"}</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="app-surface-soft border-border/60">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm text-muted-foreground">{t("heartbeatJitter")}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-1.5 text-sm">
                            <div className="flex items-center justify-between">
                                <span>{t("p50Interval")}</span>
                                <span className="font-semibold">{formatSeconds(snapshot?.heartbeat.intervalP50Sec ?? null)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span>{t("p95Interval")}</span>
                                <span className="font-semibold">{formatSeconds(snapshot?.heartbeat.intervalP95Sec ?? null)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span>{t("p95Jitter")}</span>
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold">{formatSeconds(snapshot?.heartbeat.jitterP95Sec ?? null)}</span>
                                    {renderSeverityBadge(jitterSeverity)}
                                </div>
                            </div>
                            <div className="flex items-center justify-between text-muted-foreground">
                                <span>{t("gapNow")}</span>
                                <div className="flex items-center gap-2">
                                    <span>{formatGap(snapshot?.heartbeat.gapSec ?? null)}</span>
                                    {renderSeverityBadge(gapSeverity)}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="app-surface-soft border-border/60">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm text-muted-foreground">{t("ingestionReliability")}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-1.5 text-sm">
                            <div className="flex items-center justify-between">
                                <span>{t("successRate24h")}</span>
                                <span className="font-semibold">{formatPercent(snapshot?.ingestion.successRate24h ?? null)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span>{t("failures24h")}</span>
                                <span className="font-semibold">{snapshot?.ingestion.failureCount24h ?? 0}</span>
                            </div>
                            <div className="flex items-center justify-between text-muted-foreground">
                                <span>{t("unauthorized")}</span>
                                <span>{snapshot?.ingestion.unauthorized24h ?? 0}</span>
                            </div>
                            <div className="flex items-center justify-between text-muted-foreground">
                                <span>{t("rateLimited")}</span>
                                <span>{snapshot?.ingestion.rateLimited24h ?? 0}</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="app-surface-soft border-border/60">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm text-muted-foreground">{t("liveStreamHealth")}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-1.5 text-sm">
                            <div className="flex items-center justify-between">
                                <span>{t("activeStreams")}</span>
                                <span className="font-semibold">{snapshot?.streams.active ?? 0}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span>{t("transcodes")}</span>
                                <span className="font-semibold">{snapshot?.streams.transcodes ?? 0}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span>{t("staleStreams")}</span>
                                <span className="font-semibold">{snapshot?.streams.stale ?? 0}</span>
                            </div>
                            <div className="flex items-center justify-between text-muted-foreground">
                                <span>{t("avgBitrate")}</span>
                                <span>{formatBitrateKbps(snapshot?.streams.avgBitrateKbps ?? null)}</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    <Card className="app-surface border-border/60 xl:col-span-2">
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Activity className="w-4 h-4 text-primary" />
                                {t("heartbeatIntervals24h")}
                            </CardTitle>
                            <CardDescription>{t("heartbeatIntervals24hDesc")}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {heartbeatSeries.length > 0 ? (
                                <ResponsiveContainer width="100%" height={260} minHeight={220}>
                                    <LineChart data={heartbeatSeries} margin={{ top: 10, right: 10, left: -12, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                                        <XAxis
                                            dataKey="timestamp"
                                            tickFormatter={(value) => new Date(String(value)).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                                            minTickGap={28}
                                        />
                                        <YAxis unit="s" allowDecimals={false} />
                                        <Tooltip
                                            formatter={(value: number | string, name: string) => {
                                                const numeric = typeof value === "number" ? value : Number(value);
                                                const pretty = Number.isFinite(numeric) ? `${Math.round(numeric * 100) / 100}s` : "-";
                                                return [pretty, name === "intervalSec" ? t("intervalSeries") : t("jitterSeries")];
                                            }}
                                            labelFormatter={(value) => new Date(String(value)).toLocaleString(locale)}
                                        />
                                        <Legend
                                            formatter={(name) => name === "intervalSec" ? t("intervalSeries") : t("jitterSeries")}
                                        />
                                        <ReferenceLine y={thresholds.jitterWarningSec} stroke="#f59e0b" strokeDasharray="4 4" />
                                        <ReferenceLine y={thresholds.jitterCriticalSec} stroke="#ef4444" strokeDasharray="4 4" />
                                        <Line type="monotone" dataKey="intervalSec" stroke="var(--primary)" strokeWidth={2} dot={false} />
                                        <Line type="monotone" dataKey="jitterSec" stroke="#f59e0b" strokeWidth={1.8} dot={false} connectNulls />
                                    </LineChart>
                                </ResponsiveContainer>
                            ) : (
                                <p className="text-sm text-muted-foreground">{t("noHeartbeatIntervals")}</p>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="app-surface border-border/60">
                        <CardHeader>
                            <CardTitle className="text-base">{t("alertThresholds")}</CardTitle>
                            <CardDescription>{t("alertThresholdsDesc")}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="gap-warning">{t("gapWarningSec")}</Label>
                                <Input
                                    id="gap-warning"
                                    type="number"
                                    min={1}
                                    value={thresholds.gapWarningSec}
                                    onChange={(event) => updateThreshold("gapWarningSec", event.target.value)}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="gap-critical">{t("gapCriticalSec")}</Label>
                                <Input
                                    id="gap-critical"
                                    type="number"
                                    min={1}
                                    value={thresholds.gapCriticalSec}
                                    onChange={(event) => updateThreshold("gapCriticalSec", event.target.value)}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="jitter-warning">{t("jitterWarningSec")}</Label>
                                <Input
                                    id="jitter-warning"
                                    type="number"
                                    min={0.1}
                                    step={0.1}
                                    value={thresholds.jitterWarningSec}
                                    onChange={(event) => updateThreshold("jitterWarningSec", event.target.value)}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="jitter-critical">{t("jitterCriticalSec")}</Label>
                                <Input
                                    id="jitter-critical"
                                    type="number"
                                    min={0.1}
                                    step={0.1}
                                    value={thresholds.jitterCriticalSec}
                                    onChange={(event) => updateThreshold("jitterCriticalSec", event.target.value)}
                                />
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                className="w-full"
                                onClick={() => setThresholds(thresholdDefaults)}
                            >
                                {t("resetThresholds")}
                            </Button>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <Card className="app-surface border-border/60 lg:col-span-2">
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-amber-400" />
                                {t("recentIngestFailures")}
                            </CardTitle>
                            <CardDescription>
                                {t("recentIngestFailuresDesc")}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>{t("when")}</TableHead>
                                        <TableHead>{t("action")}</TableHead>
                                        <TableHead>IP</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(snapshot?.recentFailures || []).map((entry) => (
                                        <TableRow key={entry.id}>
                                            <TableCell>{new Date(entry.createdAt).toLocaleString(locale)}</TableCell>
                                            <TableCell>{entry.action}</TableCell>
                                            <TableCell>{entry.ipAddress || "-"}</TableCell>
                                        </TableRow>
                                    ))}
                                    {(snapshot?.recentFailures || []).length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-center text-muted-foreground">
                                                {t("noRecentFailuresDetected")}
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
                                {t("pluginReportedMetrics")}
                            </CardTitle>
                            <CardDescription>
                                {t("pluginReportedMetricsDesc")}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                            <div className="flex items-center justify-between">
                                <span>{t("queueDepth")}</span>
                                <span className="font-medium">{snapshot?.pluginReportedMetrics.queueDepth ?? "-"}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span>{t("retries")}</span>
                                <span className="font-medium">{snapshot?.pluginReportedMetrics.retries ?? "-"}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span>{t("lastHttpCode")}</span>
                                <span className="font-medium">{snapshot?.pluginReportedMetrics.lastHttpCode ?? "-"}</span>
                            </div>
                            <p className="text-xs text-muted-foreground pt-2 border-t border-border/60">
                                {pluginMetricsNote}
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
