"use client";

import { useEffect, useState } from "react";
import { Save, Clock3 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useTranslations } from "next-intl";
import { DEFAULT_SCHEDULER_INTERVALS, normalizeSchedulerIntervals, type SchedulerIntervals } from "@/lib/schedulerIntervals";

export default function SchedulerSchedulesPage() {
    const t = useTranslations('settings');
    const tc = useTranslations('common');

    const [loading, setLoading] = useState(true);
    const [isSavingCron, setIsSavingCron] = useState(false);
    const [cronMsg, setCronMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [intervals, setIntervals] = useState<SchedulerIntervals>(DEFAULT_SCHEDULER_INTERVALS);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const res = await fetch('/api/settings', { cache: 'no-store' });
                if (!res.ok) return;
                const data = await res.json().catch(() => ({}));
                if (!mounted) return;

                const intervalsRaw = data?.schedulerIntervals
                    ?? (data?.resolutionThresholds && typeof data.resolutionThresholds === 'object'
                        ? (data.resolutionThresholds as Record<string, unknown>).schedulerIntervals
                        : null);
                setIntervals(normalizeSchedulerIntervals(intervalsRaw));
            } catch {
                // Keep defaults.
            } finally {
                if (mounted) setLoading(false);
            }
        })();

        return () => {
            mounted = false;
        };
    }, []);

    const handleSaveCron = async () => {
        setIsSavingCron(true);
        setCronMsg(null);
        try {
            const res = await fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ schedulerIntervals: intervals })
            });
            if (res.ok) {
                setCronMsg({ type: "success", text: t('cronSaved') });
            } else {
                const data = await res.json();
                setCronMsg({ type: "error", text: data.error || tc('saveError') });
            }
        } catch {
            setCronMsg({ type: "error", text: tc('networkError') });
        } finally {
            setIsSavingCron(false);
        }
    };

    const updateInterval = (key: keyof SchedulerIntervals, value: number) => {
        setIntervals((prev) => ({ ...prev, [key]: value }));
    };

    if (loading) {
        return <div className="p-4 text-sm text-muted-foreground">{tc('loading')}</div>;
    }

    return (
        <div className="space-y-4">
            <Card className="app-surface">
                <CardHeader>
                    <CardTitle>{t('saveSchedules')}</CardTitle>
                    <CardDescription>
                        {t('schedulerSchedulesDesc')}
                        {' '}
                        {t('schedulerSchedulesExample')}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {cronMsg && (
                        <div className={`p-4 rounded-md flex items-center gap-3 text-sm ${cronMsg.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
                            {cronMsg.text}
                        </div>
                    )}

                    <div className="space-y-3">
                        <div className="app-surface-soft rounded-lg border p-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                    <div className="text-sm font-medium">{t('recentSync')}</div>
                                    <div className="text-xs text-muted-foreground mt-1">{t('schedulerRecentIntervalHint')}</div>
                                </div>
                                <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                                    <Clock3 className="w-4 h-4 text-sky-400" />
                                    <Input
                                        type="number"
                                        min={1}
                                        max={24}
                                        step={1}
                                        value={intervals.recentSyncEveryHours}
                                        onChange={(e) => updateInterval('recentSyncEveryHours', Math.max(1, Math.min(24, parseInt(e.target.value) || 1)))}
                                        className="w-24 font-mono"
                                    />
                                    <span className="text-sm text-muted-foreground">h</span>
                                </div>
                            </div>
                        </div>

                        <div className="app-surface-soft rounded-lg border p-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                    <div className="text-sm font-medium">{t('fullSync')}</div>
                                    <div className="text-xs text-muted-foreground mt-1">{t('schedulerFullIntervalHint')}</div>
                                </div>
                                <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                                    <Clock3 className="w-4 h-4 text-violet-400" />
                                    <Input
                                        type="number"
                                        min={24}
                                        max={168}
                                        step={24}
                                        value={intervals.fullSyncEveryHours}
                                        onChange={(e) => {
                                            const value = parseInt(e.target.value) || 24;
                                            const bounded = Math.max(24, Math.min(168, value));
                                            const normalized = bounded % 24 === 0 ? bounded : DEFAULT_SCHEDULER_INTERVALS.fullSyncEveryHours;
                                            updateInterval('fullSyncEveryHours', normalized);
                                        }}
                                        className="w-24 font-mono"
                                    />
                                    <span className="text-sm text-muted-foreground">h</span>
                                </div>
                            </div>
                        </div>

                        <div className="app-surface-soft rounded-lg border p-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                    <div className="text-sm font-medium">{t('integrityCheckTask') || "Vérification d'intégrité"}</div>
                                    <div className="text-xs text-muted-foreground mt-1">{t('schedulerIntegrityIntervalHint') || "Intervalle de vérification et fermeture automatique des sessions de lecture orphelines."}</div>
                                </div>
                                <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                                    <Clock3 className="w-4 h-4 text-emerald-400" />
                                    <Input
                                        type="number"
                                        min={1}
                                        max={168}
                                        step={1}
                                        value={intervals.integrityCheckEveryHours ?? 6}
                                        onChange={(e) => updateInterval('integrityCheckEveryHours', Math.max(1, Math.min(168, parseInt(e.target.value) || 1)))}
                                        className="w-24 font-mono"
                                    />
                                    <span className="text-sm text-muted-foreground">h</span>
                                </div>
                            </div>
                        </div>

                        <div className="app-surface-soft rounded-lg border p-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                    <div className="text-sm font-medium">{t('backupTask')}</div>
                                    <div className="text-xs text-muted-foreground mt-1">{t('schedulerBackupIntervalHint')}</div>
                                </div>
                                <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                                    <Clock3 className="w-4 h-4 text-amber-400" />
                                    <Input
                                        type="number"
                                        min={1}
                                        max={168}
                                        step={1}
                                        value={intervals.backupEveryHours}
                                        onChange={(e) => updateInterval('backupEveryHours', Math.max(1, Math.min(168, parseInt(e.target.value) || 1)))}
                                        className="w-24 font-mono"
                                    />
                                    <span className="text-sm text-muted-foreground">h</span>
                                </div>
                            </div>
                        </div>

                        <div className="app-surface-soft rounded-lg border p-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                    <div className="text-sm font-medium">{t('logRetention') || 'Rétention des journaux'}</div>
                                    <div className="text-xs text-muted-foreground mt-1">{t('logRetentionHint') || "Durée de conservation automatique des fichiers de journaux système avant rotation et suppression."}</div>
                                </div>
                                <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                                    <select
                                        value={intervals.logRetentionDays ?? 30}
                                        onChange={(e) => updateInterval('logRetentionDays', parseInt(e.target.value) || 0)}
                                        className="bg-background border border-border rounded-md px-3 py-1.5 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary shadow-sm max-w-[200px]"
                                    >
                                        <option value={7}>7 {tc('days') || 'jours'}</option>
                                        <option value={14}>14 {tc('days') || 'jours'}</option>
                                        <option value={30}>30 {tc('days') || 'jours'}</option>
                                        <option value={60}>60 {tc('days') || 'jours'}</option>
                                        <option value={90}>90 {tc('days') || 'jours'}</option>
                                        <option value={180}>180 {tc('days') || 'jours'}</option>
                                        <option value={365}>365 {tc('days') || 'jours'}</option>
                                        <option value={0}>{t('retentionUnlimited') || 'Conserver indéfiniment'}</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
                <CardFooter>
                    <button onClick={handleSaveCron} disabled={isSavingCron} className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition-colors ${isSavingCron ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}>
                        <Save className={`w-4 h-4 ${isSavingCron ? 'animate-pulse' : ''}`} />
                        {isSavingCron ? tc('saving') : t('saveSchedules')}
                    </button>
                </CardFooter>
            </Card>
        </div>
    );
}
