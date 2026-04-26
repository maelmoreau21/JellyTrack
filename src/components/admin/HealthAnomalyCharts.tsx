"use client";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { useTranslations } from "next-intl";
import ResponsiveContainer from "../charts/ResponsiveContainerGuard";
import { chartAxisColor, chartGridColor, chartItemStyle, chartLabelStyle, chartTooltipStyle } from "@/lib/chartTheme";
import { CheckCircle2 } from "lucide-react";

type TimelinePoint = {
    day: string;
    monitorErrors: number;
    syncErrors: number;
    backupErrors: number;
    cleanupOps: number;
    syncSuccesses: number;
};

export function HealthAnomalyCharts({ timeline }: { timeline: TimelinePoint[] }) {
    const t = useTranslations('dashboard');

    const safeTimeline: TimelinePoint[] = (timeline || []).map((pt) => ({
        day: pt?.day ?? "",
        monitorErrors: typeof pt?.monitorErrors === "number" && Number.isFinite(pt.monitorErrors) ? pt.monitorErrors : 0,
        syncErrors: typeof pt?.syncErrors === "number" && Number.isFinite(pt.syncErrors) ? pt.syncErrors : 0,
        backupErrors: typeof pt?.backupErrors === "number" && Number.isFinite(pt.backupErrors) ? pt.backupErrors : 0,
        cleanupOps: typeof pt?.cleanupOps === "number" && Number.isFinite(pt.cleanupOps) ? pt.cleanupOps : 0,
        syncSuccesses: typeof pt?.syncSuccesses === "number" && Number.isFinite(pt.syncSuccesses) ? pt.syncSuccesses : 0,
    }));

    // Detect whether there are any non-zero anomaly values
    const hasTimelineValues = safeTimeline.some(pt => (pt.monitorErrors || pt.syncErrors || pt.backupErrors || pt.cleanupOps) > 0);

    if (!hasTimelineValues) {
        return (
            <div className="app-surface-soft rounded-lg border border-dashed border-border px-4 py-12 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                    <CheckCircle2 className="h-8 w-8" />
                </div>
                <h3 className="text-lg font-bold text-foreground">{t('anomalyDetectedNone') || "Santé parfaite détectée"}</h3>
                <p className="text-sm text-muted-foreground max-w-sm mt-1">
                    {t('noRecentEvents') || "Aucun événement critique ou anomalie n'a été enregistré au cours des 14 derniers jours."}
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('anomalyTimelineTitle')}</h4>
            <div className="app-surface min-w-0 rounded-lg border border-border p-2">
                <ResponsiveContainer width="100%" height={320} minHeight={200}>
                    <AreaChart data={safeTimeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartGridColor} opacity={0.5} />
                        <XAxis
                            dataKey="day"
                            stroke={chartAxisColor}
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                            dy={10}
                        />
                        <YAxis
                            stroke={chartAxisColor}
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                            allowDecimals={false}
                        />
                        <Tooltip
                            contentStyle={{ ...chartTooltipStyle, borderRadius: '10px' }}
                            labelStyle={chartLabelStyle}
                            itemStyle={chartItemStyle}
                        />
                        <Legend
                            verticalAlign="top"
                            align="right"
                            iconType="circle"
                            wrapperStyle={{ fontSize: "11px", fontWeight: 600, paddingBottom: "16px" }}
                        />
                        <Area type="monotone" dataKey="cleanupOps" name={t('anomalyCleanupOps')} stroke="#10b981" fill="#10b981" fillOpacity={0.16} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                        <Area type="monotone" dataKey="monitorErrors" name={t('anomalyMonitorErrors')} stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.16} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                        <Area type="monotone" dataKey="syncErrors" name={t('anomalySyncErrors')} stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.16} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                        <Area type="monotone" dataKey="backupErrors" name={t('anomalyBackupErrors')} stroke="#ef4444" fill="#ef4444" fillOpacity={0.16} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
