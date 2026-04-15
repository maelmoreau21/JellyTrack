"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertCircle, KeyRound, RefreshCw, ShieldCheck, ShieldAlert, Copy } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

type OverviewEvent = {
    id: string;
    action: string;
    actorUsername: string | null;
    ipAddress: string | null;
    createdAt: string;
    details: Record<string, unknown> | null;
};

type SecurityOverview = {
    plugin: {
        serverName: string | null;
        version: string | null;
        lastSeen: string | null;
        connected: boolean;
    };
    key: {
        hasApiKey: boolean;
        createdAt: string | null;
        expiresAt: string | null;
        expiresInDays: number | null;
        expired: boolean;
        expiringSoon: boolean;
        autoRotateEnabled: boolean;
        rotationDays: number;
        rotationGraceHours: number;
        previousKeyActive: boolean;
        previousKeyGraceUntil: string | null;
    };
    metrics: {
        totalAudit24h: number;
        unauthorized24h: number;
        rateLimited24h: number;
        previousKeyUsed24h: number;
        keyActions30d: number;
        revocations30d: number;
        policyChanges30d: number;
    };
    recentSecurityEvents: OverviewEvent[];
};

type AuditRow = {
    id: string;
    action: string;
    actorUserId: string | null;
    actorUsername: string | null;
    target: string | null;
    ipAddress: string | null;
    details: Record<string, unknown> | null;
    createdAt: string;
    anomalyFlags?: string[];
    ipAttemptCount24h?: number | null;
    newCountryCount24h?: number | null;
};

type AuditAnomalies = {
    ipAttemptThreshold: number;
    ipWindowMinutes?: number;
    newCountryGraceMinutes?: number;
    hotIp24h: Array<{ ipAddress: string; attempts: number }>;
    newCountrySuccess24h: {
        count: number;
        countries: string[];
        ips: Array<{ ipAddress: string; count: number }>;
    };
};

type SmartSecurityThresholds = {
    ipAttemptThreshold: number;
    ipWindowMinutes: number;
    newCountryGraceMinutes: number;
};

type AuditResponse = {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    smart?: string;
    anomalies?: AuditAnomalies;
    rows: AuditRow[];
};

function formatDateTime(value: string | null, locale: string): string {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString(locale);
}

function serializeDetails(details: Record<string, unknown> | null): string {
    if (!details) return "-";
    try {
        return JSON.stringify(details);
    } catch {
        return "-";
    }
}

export default function PluginSecurityPage() {
    const locale = useLocale();
    const ts = useTranslations('securitySettings');

    const [overview, setOverview] = useState<SecurityOverview | null>(null);
    const [audit, setAudit] = useState<AuditResponse | null>(null);
    const [auditPage, setAuditPage] = useState(1);
    const [auditSmartFilter, setAuditSmartFilter] = useState<"all" | "new_country_success" | "ip_50_attempts">("all");
    const [loading, setLoading] = useState(false);
    const [savingPolicy, setSavingPolicy] = useState(false);
    const [savingSmartThresholds, setSavingSmartThresholds] = useState(false);
    const [rotating, setRotating] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [freshApiKey, setFreshApiKey] = useState<string | null>(null);

    const [autoRotateEnabled, setAutoRotateEnabled] = useState(false);
    const [rotationDays, setRotationDays] = useState(90);
    const [rotationGraceHours, setRotationGraceHours] = useState(24);
    const [smartThresholds, setSmartThresholds] = useState<SmartSecurityThresholds>({
        ipAttemptThreshold: 50,
        ipWindowMinutes: 24 * 60,
        newCountryGraceMinutes: 5,
    });

    const loadOverview = useCallback(async () => {
        const res = await fetch("/api/admin/security/overview", { cache: "no-store" });
        if (!res.ok) {
            throw new Error("Failed to load security overview");
        }
        const data = (await res.json()) as SecurityOverview;
        setOverview(data);
        setAutoRotateEnabled(data.key.autoRotateEnabled);
        setRotationDays(data.key.rotationDays);
        setRotationGraceHours(data.key.rotationGraceHours);
    }, []);

    const loadAudit = useCallback(async (page: number, smartFilter: "all" | "new_country_success" | "ip_50_attempts") => {
        const params = new URLSearchParams({
            page: String(page),
            pageSize: "25",
        });
        if (smartFilter !== "all") {
            params.set("smart", smartFilter);
        }
        const res = await fetch(`/api/admin/security/audit?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) {
            throw new Error("Failed to load audit logs");
        }
        const data = (await res.json()) as AuditResponse;
        setAudit(data);
    }, []);

    const loadSmartThresholds = useCallback(async () => {
        const res = await fetch('/api/admin/security/smart-settings', { cache: 'no-store' });
        if (!res.ok) {
            throw new Error('Failed to load smart security thresholds');
        }

        const data = (await res.json()) as { thresholds?: SmartSecurityThresholds };
        if (data.thresholds) {
            setSmartThresholds(data.thresholds);
        }
    }, []);

    const refreshAll = useCallback(async () => {
        setLoading(true);
        setMessage(null);
        try {
            await Promise.all([loadOverview(), loadAudit(auditPage, auditSmartFilter), loadSmartThresholds()]);
        } catch {
            setMessage({ type: "error", text: "Impossible de charger le centre securite." });
        } finally {
            setLoading(false);
        }
    }, [auditPage, auditSmartFilter, loadAudit, loadOverview, loadSmartThresholds]);

    useEffect(() => {
        refreshAll();
    }, [refreshAll]);

    const savePolicy = async () => {
        setSavingPolicy(true);
        setMessage(null);
        try {
            const res = await fetch("/api/plugin/api-key", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    autoRotateEnabled,
                    rotationDays,
                    rotationGraceHours,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error((data as { error?: string }).error || "Policy update failed");
            }

            setMessage({ type: "success", text: "Politique de rotation sauvegardee." });
            await refreshAll();
        } catch (error) {
            const text = error instanceof Error ? error.message : "Erreur inconnue";
            setMessage({ type: "error", text });
        } finally {
            setSavingPolicy(false);
        }
    };

    const rotateNow = async () => {
        const ok = window.confirm("Generer une nouvelle cle plugin maintenant ?");
        if (!ok) return;

        setRotating(true);
        setMessage(null);
        try {
            const res = await fetch("/api/plugin/api-key", { method: "POST" });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error((data as { error?: string }).error || "Rotation failed");
            }

            const typed = data as { apiKey?: string };
            setFreshApiKey(typed.apiKey || null);
            setMessage({ type: "success", text: "Nouvelle cle generee. L ancienne reste valide pendant la grace period." });
            await refreshAll();
        } catch (error) {
            const text = error instanceof Error ? error.message : "Erreur inconnue";
            setMessage({ type: "error", text });
        } finally {
            setRotating(false);
        }
    };

    const saveSmartThresholdSettings = async () => {
        setSavingSmartThresholds(true);
        setMessage(null);

        try {
            const payload: SmartSecurityThresholds = {
                ipAttemptThreshold: Math.max(1, Math.floor(Number(smartThresholds.ipAttemptThreshold) || 1)),
                ipWindowMinutes: Math.max(5, Math.floor(Number(smartThresholds.ipWindowMinutes) || 5)),
                newCountryGraceMinutes: Math.max(1, Math.floor(Number(smartThresholds.newCountryGraceMinutes) || 1)),
            };

            const res = await fetch('/api/admin/security/smart-settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ thresholds: payload }),
            });

            const data = await res.json().catch(() => ({})) as { error?: string; thresholds?: SmartSecurityThresholds };
            if (!res.ok) {
                throw new Error(data.error || 'Threshold update failed');
            }

            if (data.thresholds) {
                setSmartThresholds(data.thresholds);
            }
            setMessage({ type: 'success', text: ts('smartThresholdsSaved') });
            await refreshAll();
        } catch (error) {
            const text = error instanceof Error ? error.message : 'Erreur inconnue';
            setMessage({ type: 'error', text });
        } finally {
            setSavingSmartThresholds(false);
        }
    };

    const copyFreshApiKey = async () => {
        if (!freshApiKey) return;
        try {
            await navigator.clipboard.writeText(freshApiKey);
            setMessage({ type: "success", text: "Cle copiee dans le presse-papiers." });
        } catch {
            setMessage({ type: "error", text: "Impossible de copier la cle." });
        }
    };

    const healthBadge = useMemo(() => {
        if (!overview?.plugin.connected) {
            return <Badge className="app-chip border-red-500/35 text-red-600 dark:text-red-300">Offline</Badge>;
        }
        return <Badge className="app-chip-success">Online</Badge>;
    }, [overview?.plugin.connected]);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <ShieldCheck className="w-6 h-6" />
                        Security Center
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Rotation des cles plugin, indicateurs de securite et journal d audit.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button asChild variant="outline">
                        <Link href="/settings/plugin">Retour plugin</Link>
                    </Button>
                    <Button onClick={refreshAll} disabled={loading}>
                        <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                        Rafraichir
                    </Button>
                </div>
            </div>

            {message && (
                <div className={`app-field flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${message.type === "success" ? "border-emerald-500/35 text-emerald-600 dark:text-emerald-300" : "border-red-500/35 text-red-600 dark:text-red-300"}`}>
                    {message.type === "success" ? <ShieldCheck className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    <span>{message.text}</span>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className="app-surface border-border">
                    <CardHeader>
                        <CardTitle className="text-base">Etat plugin</CardTitle>
                        <CardDescription>Connectivite et heartbeat</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                            <span>Statut</span>
                            {healthBadge}
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <span>Serveur</span>
                            <span className="font-medium truncate">{overview?.plugin.serverName || "-"}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <span>Version</span>
                            <span className="font-medium truncate">{overview?.plugin.version || "-"}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <span>Dernier ping</span>
                            <span className="font-medium">{formatDateTime(overview?.plugin.lastSeen || null, locale)}</span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="app-surface border-border">
                    <CardHeader>
                        <CardTitle className="text-base">Etat cle API</CardTitle>
                        <CardDescription>Cycle de vie et fenetre de transition</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                            <span>Cle active</span>
                            <Badge variant={overview?.key.hasApiKey ? "default" : "destructive"}>{overview?.key.hasApiKey ? "Oui" : "Non"}</Badge>
                        </div>
                        <div className="flex items-center justify-between">
                            <span>Expire dans</span>
                            <span className="font-medium">{overview?.key.expiresInDays ?? "-"} jours</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span>Etat expiration</span>
                            <Badge variant={overview?.key.expired ? "destructive" : (overview?.key.expiringSoon ? "secondary" : "outline")}>
                                {overview?.key.expired ? "Expiree" : (overview?.key.expiringSoon ? "Bientot" : "OK")}
                            </Badge>
                        </div>
                        <div className="flex items-center justify-between">
                            <span>Ancienne cle active</span>
                            <span className="font-medium">{overview?.key.previousKeyActive ? "Oui" : "Non"}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <span>Grace jusqu a</span>
                            <span className="font-medium">{formatDateTime(overview?.key.previousKeyGraceUntil || null, locale)}</span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="app-surface border-border">
                    <CardHeader>
                        <CardTitle className="text-base">Alertes recentes</CardTitle>
                        <CardDescription>Fenetre 24h / 30j</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <div className="flex items-center justify-between"><span>Audit 24h</span><span className="font-semibold">{overview?.metrics.totalAudit24h ?? 0}</span></div>
                        <div className="flex items-center justify-between"><span>Unauthorized 24h</span><span className="font-semibold">{overview?.metrics.unauthorized24h ?? 0}</span></div>
                        <div className="flex items-center justify-between"><span>Rate limited 24h</span><span className="font-semibold">{overview?.metrics.rateLimited24h ?? 0}</span></div>
                        <div className="flex items-center justify-between"><span>Old key usage 24h</span><span className="font-semibold">{overview?.metrics.previousKeyUsed24h ?? 0}</span></div>
                        <div className="flex items-center justify-between"><span>Rotations 30j</span><span className="font-semibold">{overview?.metrics.keyActions30d ?? 0}</span></div>
                    </CardContent>
                </Card>
            </div>

            <Card className="app-surface border-border">
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2"><KeyRound className="w-4 h-4" /> Politique de rotation</CardTitle>
                    <CardDescription>
                        Activez la rotation automatique et reglez les intervalles.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="auto-rotate">Rotation auto</Label>
                        <div className="h-10 flex items-center">
                            <Switch id="auto-rotate" checked={autoRotateEnabled} onCheckedChange={setAutoRotateEnabled} />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="rotation-days">Rotation (jours)</Label>
                        <Input
                            id="rotation-days"
                            type="number"
                            min={7}
                            max={365}
                            value={rotationDays}
                            onChange={(e) => setRotationDays(Number(e.target.value))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="rotation-grace-hours">Grace (heures)</Label>
                        <Input
                            id="rotation-grace-hours"
                            type="number"
                            min={1}
                            max={168}
                            value={rotationGraceHours}
                            onChange={(e) => setRotationGraceHours(Number(e.target.value))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Actions</Label>
                        <div className="h-10 flex items-center gap-2">
                            <Button variant="outline" onClick={savePolicy} disabled={savingPolicy}>
                                {savingPolicy ? "Sauvegarde..." : "Sauvegarder"}
                            </Button>
                            <Button onClick={rotateNow} disabled={rotating}>
                                {rotating ? "Rotation..." : "Rotation maintenant"}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="app-surface border-border">
                <CardHeader>
                    <CardTitle className="text-base">{ts('smartThresholdsTitle')}</CardTitle>
                    <CardDescription>
                        {ts('smartThresholdsDesc')}
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="smart-ip-attempt-threshold">{ts('ipAttemptThresholdLabel')}</Label>
                        <Input
                            id="smart-ip-attempt-threshold"
                            type="number"
                            min={1}
                            max={10000}
                            value={smartThresholds.ipAttemptThreshold}
                            onChange={(event) => setSmartThresholds((prev) => ({
                                ...prev,
                                ipAttemptThreshold: Number(event.target.value),
                            }))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="smart-ip-window-minutes">{ts('ipWindowMinutesLabel')}</Label>
                        <Input
                            id="smart-ip-window-minutes"
                            type="number"
                            min={5}
                            max={10080}
                            value={smartThresholds.ipWindowMinutes}
                            onChange={(event) => setSmartThresholds((prev) => ({
                                ...prev,
                                ipWindowMinutes: Number(event.target.value),
                            }))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="smart-new-country-window">{ts('newCountryGraceMinutesLabel')}</Label>
                        <Input
                            id="smart-new-country-window"
                            type="number"
                            min={1}
                            max={1440}
                            value={smartThresholds.newCountryGraceMinutes}
                            onChange={(event) => setSmartThresholds((prev) => ({
                                ...prev,
                                newCountryGraceMinutes: Number(event.target.value),
                            }))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>{ts('actionsLabel')}</Label>
                        <div className="h-10 flex items-center gap-2">
                            <Button variant="outline" onClick={saveSmartThresholdSettings} disabled={savingSmartThresholds}>
                                {savingSmartThresholds ? ts('saving') : ts('save')}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {freshApiKey && (
                <Card className="app-surface border-border">
                    <CardHeader>
                        <CardTitle className="text-base">Nouvelle cle (affichage unique)</CardTitle>
                        <CardDescription>
                            Copiez cette cle maintenant. Elle ne sera plus visible ensuite.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <Input readOnly value={freshApiKey} className="font-mono" />
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={copyFreshApiKey}>
                                <Copy className="w-4 h-4" />
                                Copier
                            </Button>
                            <Button variant="ghost" onClick={() => setFreshApiKey(null)}>
                                Masquer
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            <Card className="app-surface border-border">
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4" />
                        Evenements securite recents
                    </CardTitle>
                    <CardDescription>Top 10 des evenements sensibles detectes par l ingestion plugin.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Action</TableHead>
                                <TableHead>Acteur</TableHead>
                                <TableHead>IP</TableHead>
                                <TableHead>Details</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {(overview?.recentSecurityEvents || []).map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell>{formatDateTime(row.createdAt, locale)}</TableCell>
                                    <TableCell className="font-medium">{row.action}</TableCell>
                                    <TableCell>{row.actorUsername || "-"}</TableCell>
                                    <TableCell>{row.ipAddress || "-"}</TableCell>
                                    <TableCell className="max-w-[420px] truncate">{serializeDetails(row.details)}</TableCell>
                                </TableRow>
                            ))}
                            {(!overview || overview.recentSecurityEvents.length === 0) && (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                                        Aucun evenement recent.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Card className="app-surface border-border">
                <CardHeader>
                    <CardTitle className="text-base">Journal d audit complet</CardTitle>
                    <CardDescription>
                        Historique des actions admin et controles plugin.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-sm text-muted-foreground">{ts('smartFilterLabel')}</div>
                        <select
                            value={auditSmartFilter}
                            onChange={(event) => {
                                setAuditPage(1);
                                setAuditSmartFilter(event.target.value as "all" | "new_country_success" | "ip_50_attempts");
                            }}
                            className="h-9 rounded-md border border-zinc-200 dark:border-zinc-700 bg-background px-3 text-sm"
                        >
                            <option value="all">{ts('filterAllEvents')}</option>
                            <option value="new_country_success">{ts('filterNewCountrySuccess')}</option>
                            <option value="ip_50_attempts">{ts('filterIpBurst', { threshold: audit?.anomalies?.ipAttemptThreshold ?? smartThresholds.ipAttemptThreshold })}</option>
                        </select>
                    </div>

                    {audit?.anomalies && (audit.anomalies.hotIp24h.length > 0 || audit.anomalies.newCountrySuccess24h.count > 0) && (
                        <div className="grid gap-3 md:grid-cols-2">
                            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3">
                                <div className="text-xs text-red-300">IP en rafale (24h)</div>
                                <div className="mt-1 text-lg font-semibold text-red-200">{audit.anomalies.hotIp24h.length}</div>
                                <div className="mt-1 space-y-1">
                                    {audit.anomalies.hotIp24h.slice(0, 3).map((item) => (
                                        <div key={item.ipAddress} className="text-xs text-red-100/90">
                                            {item.ipAddress}: {item.attempts} tentatives
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
                                <div className="text-xs text-amber-300">Connexions depuis nouveau pays (24h)</div>
                                <div className="mt-1 text-lg font-semibold text-amber-200">{audit.anomalies.newCountrySuccess24h.count}</div>
                                <div className="mt-1 text-xs text-amber-100/90">
                                    {(audit.anomalies.newCountrySuccess24h.countries || []).slice(0, 5).join(", ") || "Aucun pays detecte"}
                                </div>
                            </div>
                        </div>
                    )}

                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Action</TableHead>
                                <TableHead>Acteur</TableHead>
                                <TableHead>Cible</TableHead>
                                <TableHead>IP</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {(audit?.rows || []).map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell>{formatDateTime(row.createdAt, locale)}</TableCell>
                                    <TableCell className="font-medium">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span>{row.action}</span>
                                            {(row.anomalyFlags || []).includes("new_country_success") && (
                                                <Badge variant="outline" className="border-amber-500/50 text-amber-300 bg-amber-500/10">
                                                    Nouveau pays
                                                </Badge>
                                            )}
                                            {(row.anomalyFlags || []).includes("ip_50_attempts") && (
                                                <Badge variant="destructive">
                                                    IP rafale
                                                </Badge>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>{row.actorUsername || row.actorUserId || "-"}</TableCell>
                                    <TableCell>{row.target || "-"}</TableCell>
                                    <TableCell>
                                        <div>{row.ipAddress || "-"}</div>
                                        {(row.anomalyFlags || []).includes("ip_50_attempts") && (row.ipAttemptCount24h || 0) > 0 && (
                                            <div className="text-[11px] text-red-400">{row.ipAttemptCount24h} tentatives / 24h</div>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {(!audit || audit.rows.length === 0) && (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                                        Aucun log d audit.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>

                    <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                            Page {audit?.page || 1} / {audit?.totalPages || 1} ({audit?.total || 0} lignes)
                        </p>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                onClick={() => setAuditPage((prev) => Math.max(1, prev - 1))}
                                disabled={!audit || audit.page <= 1 || loading}
                            >
                                Precedent
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => setAuditPage((prev) => Math.min(audit?.totalPages || prev, prev + 1))}
                                disabled={!audit || audit.page >= audit.totalPages || loading}
                            >
                                Suivant
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
