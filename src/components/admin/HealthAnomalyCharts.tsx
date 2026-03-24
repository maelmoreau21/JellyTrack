"use client";

import React, { useId } from "react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell } from "recharts";
import { useTranslations } from "next-intl";
import ResponsiveContainer from "../charts/ResponsiveContainerGuard";
import { chartAxisColor, chartGridColor, chartItemStyle, chartLabelStyle, chartPalette, chartTooltipStyle } from "@/lib/chartTheme";
import { AlertCircle } from "lucide-react";

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
    const rawId = useId().replace(/[:]/g, ""); // Remove colons for SVG ID safety
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
        source: b?.source ?? "unknown",
        value: typeof b?.value === "number" && Number.isFinite(b.value) ? b.value : 0,
    }));

    // Detect whether there are any non-zero anomaly values
    const hasTimelineValues = safeTimeline.some(pt => (pt.monitorErrors || pt.syncErrors || pt.backupErrors || pt.cleanupOps || pt.syncSuccesses) > 0);
    const hasBreakdownValues = safeBreakdown.some(b => (b.value || 0) > 0);

    const monitorId = `monitorG-${rawId}`;
    const syncId = `syncG-${rawId}`;
    const backupId = `backupG-${rawId}`;
    const cleanupId = `cleanupG-${rawId}`;
    const syncSuccessId = `syncSuccG-${rawId}`;

    if (!hasTimelineValues && !hasBreakdownValues) {
        return (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center app-surface-soft rounded-2xl border border-dashed border-border/50">
                <div className="p-3 rounded-full bg-emerald-500/10 text-emerald-500 mb-4">
                    <CheckCircle2 className="h-8 w-8" />
                </div>
                <h3 className="text-lg font-bold text-foreground">{t('anomalyDetectedNone') || "Santé parfaite détectée"}</h3>
                <p className="text-sm text-muted-foreground max-w-sm mt-1">
                    {t('noAnomaliesDesc') || "Aucun événement critique ou anomalie n'a été enregistré au cours des 14 derniers jours."}
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="grid gap-8 lg:grid-cols-3 items-start">
                {/* Timeline Chart */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="flex items-center justify-between">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">{t('anomalyTimelineTitle')}</h4>
                    </div>
                    <div className="w-full min-w-0 h-[340px] app-surface-soft/30 rounded-xl p-2 border border-border/20">
                        <ResponsiveContainer width="100%" height={320} minHeight={200}>
                            <AreaChart data={safeTimeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id={monitorId} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id={syncId} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id={backupId} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id={cleanupId} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id={syncSuccessId} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2} />
                                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
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
                                    contentStyle={{ ...chartTooltipStyle, borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} 
                                    labelStyle={chartLabelStyle} 
                                    itemStyle={chartItemStyle} 
                                />
                                <Legend 
                                    verticalAlign="top" 
                                    align="right" 
                                    iconType="circle"
                                    wrapperStyle={{ fontSize: "11px", fontWeight: 600, paddingBottom: "20px" }} 
                                />
                                <Area type="monotone" dataKey="syncSuccesses" name={t('anomalySyncSuccess')} stroke="#8b5cf6" fill={`url(#${syncSuccessId})`} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                                <Area type="monotone" dataKey="cleanupOps" name={t('anomalyCleanupOps')} stroke="#10b981" fill={`url(#${cleanupId})`} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                                <Area type="monotone" dataKey="monitorErrors" name={t('anomalyMonitorErrors')} stroke="#0ea5e9" fill={`url(#${monitorId})`} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                                <Area type="monotone" dataKey="syncErrors" name={t('anomalySyncErrors')} stroke="#f59e0b" fill={`url(#${syncId})`} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                                <Area type="monotone" dataKey="backupErrors" name={t('anomalyBackupErrors')} stroke="#ef4444" fill={`url(#${backupId})`} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Breakdown Chart */}
                <div className="space-y-4">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">{t('anomalyBreakdownTitle')}</h4>
                    <div className="w-full min-w-0 h-[340px] app-surface-soft/30 rounded-xl p-2 border border-border/20">
                        <ResponsiveContainer width="100%" height={320} minHeight={200}>
                            <BarChart data={safeBreakdown} margin={{ top: 10, right: 10, left: -25, bottom: 0 }} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={chartGridColor} opacity={0.5} />
                                <XAxis type="number" hide />
                                <YAxis 
                                    dataKey="source" 
                                    type="category" 
                                    stroke={chartAxisColor} 
                                    fontSize={11} 
                                    tickLine={false} 
                                    axisLine={false} 
                                    tickFormatter={(val) => {
                                        try { return t(val.toLowerCase()); } catch { return val; }
                                    }}
                                    width={80}
                                />
                                <Tooltip 
                                    cursor={{ fill: 'transparent' }}
                                    contentStyle={{ ...chartTooltipStyle, borderRadius: '12px', border: 'none' }} 
                                    formatter={(val: any) => [val, t('anomalyCumulativeImpact')]} 
                                />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={24}>
                                    {safeBreakdown.map((entry, index) => (
                                        <Cell 
                                            key={`cell-${index}`} 
                                            fill={chartPalette[index % chartPalette.length]} 
                                            fillOpacity={0.8}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
}

const CheckCircle2 = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" /><path d="m9 12 2 2 4-4" /></svg>
);
