"use client";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell } from "recharts";
import { useTranslations } from "next-intl";
import ResponsiveContainer from "../charts/ResponsiveContainerGuard";
import { chartAxisColor, chartGridColor, chartItemStyle, chartLabelStyle, chartPalette, chartTooltipStyle } from "@/lib/chartTheme";
import { CheckCircle2 } from "lucide-react";

type TimelinePoint = {
    day: string;
    monitorErrors: number;
    syncErrors: number;
    backupErrors: number;
    cleanupOps: number;
    syncSuccesses: number;
};

type BreakdownPoint = {
    source: string;
    value: number;
};

export function HealthAnomalyCharts({ timeline, breakdown }: { timeline: TimelinePoint[]; breakdown: BreakdownPoint[] }) {
    const t = useTranslations('dashboard');

    const safeTimeline: TimelinePoint[] = (timeline || []).map((pt) => ({
        day: pt?.day ?? "",
        monitorErrors: typeof pt?.monitorErrors === "number" && Number.isFinite(pt.monitorErrors) ? pt.monitorErrors : 0,
        syncErrors: typeof pt?.syncErrors === "number" && Number.isFinite(pt.syncErrors) ? pt.syncErrors : 0,
        backupErrors: typeof pt?.backupErrors === "number" && Number.isFinite(pt.backupErrors) ? pt.backupErrors : 0,
        cleanupOps: typeof pt?.cleanupOps === "number" && Number.isFinite(pt.cleanupOps) ? pt.cleanupOps : 0,
        syncSuccesses: typeof pt?.syncSuccesses === "number" && Number.isFinite(pt.syncSuccesses) ? pt.syncSuccesses : 0,
    }));

    const safeBreakdown: BreakdownPoint[] = (breakdown || []).map((b) => ({
        source: (b?.source ?? "unknown").toLowerCase().trim() || "unknown",
        value: typeof b?.value === "number" && Number.isFinite(b.value) ? b.value : 0,
    }));

    const breakdownData = safeBreakdown
        .filter((entry) => entry.value > 0)
        .sort((a, b) => b.value - a.value);

    const sourceColorMap: Record<string, string> = {
        monitor: "#0ea5e9",
        sync: "#f59e0b",
        backup: "#ef4444",
        restore: "#8b5cf6",
        unknown: "#94a3b8",
    };

    const formatSourceLabel = (source: string) => {
        const key = String(source || "unknown").toLowerCase();
        if (key === "monitor") return t('monitor');
        if (key === "sync") return t('sync');
        if (key === "backup") return t('backup');
        if (key === "restore") return t('restore');
        return source || "unknown";
    };

    // Detect whether there are any non-zero anomaly values
    const hasTimelineValues = safeTimeline.some(pt => (pt.monitorErrors || pt.syncErrors || pt.backupErrors || pt.cleanupOps || pt.syncSuccesses) > 0);
    const hasBreakdownValues = breakdownData.length > 0;

    if (!hasTimelineValues && !hasBreakdownValues) {
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
        <div className="space-y-5">
            <div className="grid items-start gap-5 lg:grid-cols-3">
                {/* Timeline Chart */}
                <div className="space-y-3 lg:col-span-2">
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
                                <Area type="monotone" dataKey="syncSuccesses" name={t('anomalySyncSuccess')} stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.16} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                                <Area type="monotone" dataKey="cleanupOps" name={t('anomalyCleanupOps')} stroke="#10b981" fill="#10b981" fillOpacity={0.16} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                                <Area type="monotone" dataKey="monitorErrors" name={t('anomalyMonitorErrors')} stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.16} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                                <Area type="monotone" dataKey="syncErrors" name={t('anomalySyncErrors')} stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.16} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                                <Area type="monotone" dataKey="backupErrors" name={t('anomalyBackupErrors')} stroke="#ef4444" fill="#ef4444" fillOpacity={0.16} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Breakdown Chart */}
                <div className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('anomalyBreakdownTitle')}</h4>
                    <div className="app-surface min-w-0 rounded-lg border border-border p-2">
                        {breakdownData.length === 0 ? (
                            <div className="flex h-[320px] items-center justify-center px-4 text-center text-sm text-muted-foreground">
                                {t('anomalyDetectedNone')}
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={320} minHeight={200}>
                                <BarChart data={breakdownData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={chartGridColor} opacity={0.5} />
                                    <XAxis type="number" hide />
                                    <YAxis
                                        dataKey="source"
                                        type="category"
                                        stroke={chartAxisColor}
                                        fontSize={11}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(val) => formatSourceLabel(String(val))}
                                        width={110}
                                    />
                                    <Tooltip
                                        cursor={{ fill: 'transparent' }}
                                        contentStyle={{ ...chartTooltipStyle, borderRadius: '10px' }}
                                        formatter={(val: number) => [val, t('anomalyCumulativeImpact')]}
                                        labelFormatter={(label) => formatSourceLabel(String(label))}
                                    />
                                    <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={24}>
                                        {breakdownData.map((entry, index) => (
                                            <Cell
                                                key={`cell-${index}`}
                                                fill={sourceColorMap[entry.source] || chartPalette[index % chartPalette.length]}
                                                fillOpacity={0.85}
                                            />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
