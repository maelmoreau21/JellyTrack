"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertCircle, RefreshCw, ShieldCheck, SlidersHorizontal, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type SecurityOverview = {
    plugin: {
        serverName: string | null;
        version: string | null;
        lastSeen: string | null;
        connected: boolean;
    };
};

type SmartSecurityThresholds = {
    ipAttemptThreshold: number;
    ipWindowMinutes: number;
    newCountryGraceMinutes: number;
};

type PluginTelemetrySettings = {
    precisionProfile: "very_precise" | "balanced" | "minimal";
    playingIntervalSeconds: number;
    pausedIntervalSeconds: number;
    staleSessionTimeoutSeconds: number;
    mergeWindowSeconds: number;
    seekThresholdSeconds: number;
    trackPauseResume: boolean;
    trackSeek: boolean;
    trackAudioSubtitleChanges: boolean;
    trackSessionEnded: boolean;
    retryQueueSize: number;
    retryFlushBatchSize: number;
};

type NumericTelemetryKey = "playingIntervalSeconds" | "pausedIntervalSeconds" | "staleSessionTimeoutSeconds" | "mergeWindowSeconds" | "seekThresholdSeconds" | "retryQueueSize" | "retryFlushBatchSize";

const DEFAULT_TELEMETRY_SETTINGS: PluginTelemetrySettings = {
    precisionProfile: "very_precise",
    playingIntervalSeconds: 5,
    pausedIntervalSeconds: 30,
    staleSessionTimeoutSeconds: 90,
    mergeWindowSeconds: 300,
    seekThresholdSeconds: 20,
    trackPauseResume: true,
    trackSeek: true,
    trackAudioSubtitleChanges: true,
    trackSessionEnded: true,
    retryQueueSize: 500,
    retryFlushBatchSize: 50,
};

function formatDateTime(value: string | null, locale: string): string {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString(locale);
}

export default function PluginSecurityPage() {
    const locale = useLocale();
    const ts = useTranslations('securitySettings');
    const tSettings = useTranslations('settings');

    const [overview, setOverview] = useState<SecurityOverview | null>(null);
    const [loading, setLoading] = useState(false);
    const [savingSmartThresholds, setSavingSmartThresholds] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const [telemetrySettings, setTelemetrySettings] = useState<PluginTelemetrySettings>(DEFAULT_TELEMETRY_SETTINGS);
    const [telemetrySaving, setTelemetrySaving] = useState(false);

    const [smartThresholds, setSmartThresholds] = useState<SmartSecurityThresholds>({
        ipAttemptThreshold: 50,
        ipWindowMinutes: 60,
        newCountryGraceMinutes: 120,
    });

    const loadOverview = useCallback(async () => {
        const res = await fetch("/api/admin/security/overview", { cache: "no-store" });
        if (!res.ok) {
            throw new Error("Failed to load security overview");
        }
        const data = (await res.json()) as SecurityOverview;
        setOverview(data);
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

    const loadTelemetrySettings = useCallback(async () => {
        const res = await fetch('/api/settings', { cache: 'no-store' });
        if (res.ok) {
            const data = await res.json().catch(() => ({}));
            if (data.pluginTelemetrySettings) {
                setTelemetrySettings({ ...DEFAULT_TELEMETRY_SETTINGS, ...data.pluginTelemetrySettings });
            }
        }
    }, []);

    const refreshAll = useCallback(async () => {
        setLoading(true);
        setMessage(null);
        try {
            await Promise.all([loadOverview(), loadSmartThresholds(), loadTelemetrySettings()]);
        } catch {
            setMessage({ type: "error", text: ts('securityLoadError') });
        } finally {
            setLoading(false);
        }
    }, [loadOverview, loadSmartThresholds, loadTelemetrySettings, ts]);

    useEffect(() => {
        const timer = setTimeout(() => {
            void refreshAll();
        }, 0);
        return () => clearTimeout(timer);
    }, [refreshAll]);

    const applyTelemetryPreset = (profile: PluginTelemetrySettings["precisionProfile"]) => {
        if (profile === "minimal") {
            setTelemetrySettings({
                ...DEFAULT_TELEMETRY_SETTINGS,
                precisionProfile: "minimal",
                playingIntervalSeconds: 30,
                pausedIntervalSeconds: 120,
                staleSessionTimeoutSeconds: 300,
                retryQueueSize: 250,
                retryFlushBatchSize: 25,
            });
            return;
        }

        if (profile === "balanced") {
            setTelemetrySettings({
                ...DEFAULT_TELEMETRY_SETTINGS,
                precisionProfile: "balanced",
                playingIntervalSeconds: 15,
                pausedIntervalSeconds: 60,
                staleSessionTimeoutSeconds: 180,
            });
            return;
        }

        setTelemetrySettings(DEFAULT_TELEMETRY_SETTINGS);
    };

    const updateTelemetryNumber = (key: NumericTelemetryKey, value: string) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return;
        setTelemetrySettings((prev) => ({ ...prev, [key]: Math.max(0, Math.round(parsed)) }));
    };

    const handleSaveTelemetry = async () => {
        setTelemetrySaving(true);
        setMessage(null);
        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pluginTelemetrySettings: telemetrySettings }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : tSettings('telemetrySaveError'));
            setMessage({ type: 'success', text: tSettings('telemetrySaved') });
        } catch (error) {
            setMessage({ type: 'error', text: error instanceof Error && error.message ? error.message : tSettings('telemetrySaveError') });
        } finally {
            setTelemetrySaving(false);
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
            const text = error instanceof Error ? error.message : ts('unknownError');
            setMessage({ type: 'error', text });
        } finally {
            setSavingSmartThresholds(false);
        }
    };

    const healthBadge = useMemo(() => {
        if (!overview?.plugin.connected) {
            return <Badge className="app-chip border-red-500/35 text-red-600 dark:text-red-300">{ts('offline')}</Badge>;
        }
        return <Badge className="app-chip-success">{ts('online')}</Badge>;
    }, [overview?.plugin.connected, ts]);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <ShieldCheck className="w-6 h-6" />
                        {ts('securityCenterTitle')}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        {ts('securityCenterDesc')}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button asChild variant="outline">
                        <Link href="/settings/plugin">{ts('backToPlugin')}</Link>
                    </Button>
                    <Button onClick={refreshAll} disabled={loading}>
                        <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                        {ts('refresh')}
                    </Button>
                </div>
            </div>

            {message && (
                <div className={`app-field flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${message.type === "success" ? "border-emerald-500/35 text-emerald-600 dark:text-emerald-300" : "border-red-500/35 text-red-600 dark:text-red-300"}`}>
                    {message.type === "success" ? <ShieldCheck className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    <span>{message.text}</span>
                </div>
            )}

            <Card className="app-surface border-border">
                <CardHeader>
                    <CardTitle className="text-base">{ts('pluginStateTitle')}</CardTitle>
                    <CardDescription>{ts('pluginStateDesc')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                        <span>{ts('statusLabel')}</span>
                        {healthBadge}
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <span>{ts('serverLabel')}</span>
                        <span className="font-medium truncate">{overview?.plugin.serverName || "-"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <span>{ts('versionLabel')}</span>
                        <span className="font-medium truncate">{overview?.plugin.version || "-"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <span>{ts('lastPingLabel')}</span>
                        <span className="font-medium">{formatDateTime(overview?.plugin.lastSeen || null, locale)}</span>
                    </div>
                </CardContent>
            </Card>

            {/* Plugin Telemetry Precision Settings */}
            <Card className="app-surface border-border">
                <CardHeader>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-1">
                            <CardTitle className="text-base flex items-center gap-2">
                                <SlidersHorizontal className="w-4 h-4 text-primary" />
                                {tSettings('pluginTelemetryTitle')}
                            </CardTitle>
                            <CardDescription>
                                {tSettings('pluginTelemetryDesc')}
                            </CardDescription>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {([
                                ["very_precise", "telemetryPresetVeryPrecise"],
                                ["balanced", "telemetryPresetBalanced"],
                                ["minimal", "telemetryPresetMinimal"],
                            ] as const).map(([profile, label]) => (
                                <button
                                    key={profile}
                                    type="button"
                                    onClick={() => applyTelemetryPreset(profile)}
                                    className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                                        telemetrySettings.precisionProfile === profile
                                            ? 'border-primary/40 bg-primary/15 text-primary'
                                            : 'border-border hover:bg-muted'
                                    }`}
                                >
                                    {tSettings(label)}
                                </button>
                            ))}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs">{tSettings('telemetryPlayingInterval')}</Label>
                            <Input type="number" min={1} value={telemetrySettings.playingIntervalSeconds} onChange={(e) => updateTelemetryNumber('playingIntervalSeconds', e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs">{tSettings('telemetryPausedInterval')}</Label>
                            <Input type="number" min={5} value={telemetrySettings.pausedIntervalSeconds} onChange={(e) => updateTelemetryNumber('pausedIntervalSeconds', e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs">{tSettings('telemetryStaleSession')}</Label>
                            <Input type="number" min={30} value={telemetrySettings.staleSessionTimeoutSeconds} onChange={(e) => updateTelemetryNumber('staleSessionTimeoutSeconds', e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs">{tSettings('telemetryMergeWindow')}</Label>
                            <Input type="number" min={0} value={telemetrySettings.mergeWindowSeconds} onChange={(e) => updateTelemetryNumber('mergeWindowSeconds', e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs">{tSettings('telemetrySeekThreshold')}</Label>
                            <Input type="number" min={5} value={telemetrySettings.seekThresholdSeconds} onChange={(e) => updateTelemetryNumber('seekThresholdSeconds', e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs">{tSettings('telemetryRetryQueueSize')}</Label>
                            <Input type="number" min={10} value={telemetrySettings.retryQueueSize} onChange={(e) => updateTelemetryNumber('retryQueueSize', e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs">{tSettings('telemetryRetryFlushBatchSize')}</Label>
                            <Input type="number" min={1} value={telemetrySettings.retryFlushBatchSize} onChange={(e) => updateTelemetryNumber('retryFlushBatchSize', e.target.value)} />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                        {([
                            ["trackPauseResume", "telemetryTrackPauseResume"],
                            ["trackSeek", "telemetryTrackSeek"],
                            ["trackAudioSubtitleChanges", "telemetryTrackAudioSubtitleChanges"],
                            ["trackSessionEnded", "telemetryTrackSessionEnded"],
                        ] as const).map(([key, label]) => (
                            <div key={key} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                                <span className="text-xs font-medium">{tSettings(label)}</span>
                                <Switch checked={Boolean(telemetrySettings[key])} onCheckedChange={(checked) => setTelemetrySettings((prev) => ({ ...prev, [key]: Boolean(checked) }))} />
                            </div>
                        ))}
                    </div>

                    <div className="flex justify-end">
                        <Button
                            type="button"
                            onClick={handleSaveTelemetry}
                            disabled={telemetrySaving}
                            variant="outline"
                            className="text-xs"
                        >
                            {telemetrySaving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                            {tSettings('telemetrySave')}
                        </Button>
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
        </div>
    );
}
