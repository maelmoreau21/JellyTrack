"use client";

import React, { useId } from "react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell } from "recharts";
import { useTranslations } from "next-intl";
import ResponsiveContainer from "../charts/ResponsiveContainerGuard";
import { chartAxisColor, chartGridColor, chartItemStyle, chartLabelStyle, chartPalette, chartTooltipStyle } from "@/lib/chartTheme";

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
    const uid = useId();
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
    const timelineHasValues = safeTimeline.some(pt => (pt.monitorErrors || pt.syncErrors || pt.backupErrors || pt.cleanupOps) > 0);
    const breakdownHasValues = safeBreakdown.some(b => (b.value || 0) > 0);

    const monitorId = `monitorErrorsGradient-${uid}`;
    const syncId = `syncErrorsGradient-${uid}`;
    const backupId = `backupErrorsGradient-${uid}`;
    const cleanupId = `cleanupOpsGradient-${uid}`;
    const syncSuccessId = `syncSuccessGradient-${uid}`;
    const sourceGradientId = `sourceBreakdownGradient-${uid}`;
    const noValues = !timelineHasValues && !breakdownHasValues;

    return (
        <>
            {noValues && <div className="text-sm text-zinc-400 mb-2">{t('anomalyDetectedNone')}</div>}
            <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 w-full min-w-0 h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={safeTimeline} margin={{ top: 18, right: 20, left: -10, bottom: 4 }}>
                        <defs>
                            <linearGradient id={monitorId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.55} />
                                <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id={syncId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.45} />
                                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id={backupId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.45} />
                                <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id={cleanupId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.45} />
                                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id={syncSuccessId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.35} />
                                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 7" vertical={false} stroke={chartGridColor} />
                        <XAxis dataKey="day" stroke={chartAxisColor} fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke={chartAxisColor} fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartLabelStyle} itemStyle={chartItemStyle} />
                        <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }} />
                        <Area type="monotone" dataKey="cleanupOps" name={t('anomalyCleanupOps')} stroke="#22c55e" fill={`url(#${cleanupId})`} strokeWidth={2} />
                        <Area type="monotone" dataKey="syncSuccesses" name={t('anomalySyncSuccess')} stroke="#8b5cf6" fill={`url(#${syncSuccessId})`} strokeWidth={2} />
                        <Area type="monotone" dataKey="monitorErrors" name={t('anomalyMonitorErrors')} stroke="#38bdf8" fill={`url(#${monitorId})`} strokeWidth={2} />
                        <Area type="monotone" dataKey="syncErrors" name={t('anomalySyncErrors')} stroke="#f59e0b" fill={`url(#${syncId})`} strokeWidth={2} />
                        <Area type="monotone" dataKey="backupErrors" name={t('anomalyBackupErrors')} stroke="#f43f5e" fill={`url(#${backupId})`} strokeWidth={2} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            <div className="w-full min-w-0 h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={safeBreakdown} margin={{ top: 18, right: 8, left: -18, bottom: 4 }}>
                        <defs>
                            <linearGradient id={sourceGradientId} x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.95} />
                                <stop offset="100%" stopColor="#a855f7" stopOpacity={0.95} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 7" vertical={false} stroke={chartGridColor} />
                        <XAxis dataKey="source" stroke={chartAxisColor} fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke={chartAxisColor} fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartLabelStyle} itemStyle={chartItemStyle} />
                        <Bar dataKey="value" name={t('anomalyCumulativeImpact')} radius={[10, 10, 0, 0]} fill={`url(#${sourceGradientId})`}>
                            {safeBreakdown.map((entry, index) => (
                                <Cell key={`${entry.source}-${index}`} fill={chartPalette[index % chartPalette.length]} fillOpacity={0.92} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
        </>
    );
}
