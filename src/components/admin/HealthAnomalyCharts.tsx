"use client";

import {
    ResponsiveContainer,
    AreaChart,
    Area,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    Cell,
} from "recharts";
import { chartAxisColor, chartGridColor, chartItemStyle, chartLabelStyle, chartPalette, chartTooltipStyle } from "@/lib/chartTheme";

type TimelinePoint = {
    day: string;
    monitorErrors: number;
    syncErrors: number;
    backupErrors: number;
    cleanupOps: number;
};

type BreakdownPoint = {
    source: string;
    value: number;
};

export function HealthAnomalyCharts({ timeline, breakdown }: { timeline: TimelinePoint[]; breakdown: BreakdownPoint[] }) {
    return (
        <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 h-[320px] min-h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={timeline} margin={{ top: 18, right: 20, left: -10, bottom: 4 }}>
                        <defs>
                            <linearGradient id="monitorErrorsGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.55} />
                                <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="syncErrorsGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.45} />
                                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="backupErrorsGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.45} />
                                <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="cleanupOpsGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.45} />
                                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 7" vertical={false} stroke={chartGridColor} />
                        <XAxis dataKey="day" stroke={chartAxisColor} fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke={chartAxisColor} fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartLabelStyle} itemStyle={chartItemStyle} />
                        <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }} />
                        <Area type="monotone" dataKey="cleanupOps" name="Nettoyages" stroke="#22c55e" fill="url(#cleanupOpsGradient)" strokeWidth={2.4} />
                        <Area type="monotone" dataKey="monitorErrors" name="Erreurs monitor" stroke="#38bdf8" fill="url(#monitorErrorsGradient)" strokeWidth={2.4} />
                        <Area type="monotone" dataKey="syncErrors" name="Erreurs sync" stroke="#f59e0b" fill="url(#syncErrorsGradient)" strokeWidth={2.4} />
                        <Area type="monotone" dataKey="backupErrors" name="Erreurs backup" stroke="#f43f5e" fill="url(#backupErrorsGradient)" strokeWidth={2.4} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            <div className="h-[320px] min-h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={breakdown} margin={{ top: 18, right: 8, left: -18, bottom: 4 }}>
                        <defs>
                            <linearGradient id="sourceBreakdownGradient" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.95} />
                                <stop offset="100%" stopColor="#a855f7" stopOpacity={0.95} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 7" vertical={false} stroke={chartGridColor} />
                        <XAxis dataKey="source" stroke={chartAxisColor} fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke={chartAxisColor} fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartLabelStyle} itemStyle={chartItemStyle} />
                        <Bar dataKey="value" name="Impact cumulÃ©" radius={[10, 10, 0, 0]} fill="url(#sourceBreakdownGradient)">
                            {breakdown.map((entry, index) => (
                                <Cell key={`${entry.source}-${index}`} fill={chartPalette[index % chartPalette.length]} fillOpacity={0.92} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
