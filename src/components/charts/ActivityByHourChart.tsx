"use client";

import { useState } from "react";
import { useTranslations } from 'next-intl';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Cell,
    ReferenceLine,
} from "recharts";
import ResponsiveContainer from "./ResponsiveContainerGuard";
// Read colors from CSS variables at runtime so charts follow light/dark theme.

export interface ActivityHourData {
    hour: string; // "00:00", "01:00", etc.
    count?: number;
    value?: number;
}

interface ActivityByHourChartProps {
    data: ActivityHourData[];
}

/* Custom active bar shape with glow effect */
type GlowBarProps = {
    fill?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
};

function GlowBar({ fill, x, y, width, height }: GlowBarProps) {
    return (
        <g>
            <rect x={x} y={y} width={width} height={height} rx={4} ry={4}
                  fill={fill} filter="url(#barGlow)" fillOpacity={1} />
        </g>
    );
}

export function ActivityByHourChart({ data }: ActivityByHourChartProps) {
    const t = useTranslations('charts');
    // Normalize counts to numbers to avoid unexpected NaN or string comparisons
    const numericCounts = data.map(d => {
        const n = Number(d.count ?? d.value ?? 0);
        return Number.isFinite(n) ? n : 0;
    });
    const maxCount = numericCounts.length ? Math.max(...numericCounts) : 0;
    const [selectedHour, setSelectedHour] = useState<string | null>(null);
    const selectedEntry = data.find(d => d.hour === selectedHour);

    // Compute average robustly from numeric values only
    const validCounts = numericCounts.filter(n => Number.isFinite(n));
    const avg = validCounts.length > 0 ? Math.round(validCounts.reduce((s, v) => s + v, 0) / validCounts.length) : NaN;
    const showAvg = Number.isFinite(avg) && validCounts.length > 0 && avg > 0;

    // Read chart-related CSS variables so charts match light/dark theme
    const root = typeof window !== "undefined" ? getComputedStyle(document.documentElement) : null;
    const chartAxisColor = root?.getPropertyValue('--chart-axis-color')?.trim() || '#94a3b8';
    const chartGridColor = root?.getPropertyValue('--chart-grid-color')?.trim() || 'rgba(148, 163, 184, 0.14)';
    const chartTooltipStyle = {
        background: root?.getPropertyValue('--chart-tooltip-bg')?.trim() || 'rgba(8, 12, 18, 0.9)',
        border: root?.getPropertyValue('--chart-tooltip-border')?.trim() || '1px solid rgba(103, 232, 249, 0.18)',
        borderRadius: root?.getPropertyValue('--chart-tooltip-radius')?.trim() || '18px',
        boxShadow: root?.getPropertyValue('--chart-tooltip-box-shadow')?.trim() || '0 20px 60px rgba(0, 0, 0, 0.35)',
        backdropFilter: root?.getPropertyValue('--chart-tooltip-backdrop')?.trim() || 'blur(18px)'
    };
    const chartLabelStyle = { color: root?.getPropertyValue('--chart-label-color')?.trim() || '#94a3b8' };
    const chartItemStyle = { color: root?.getPropertyValue('--chart-item-color')?.trim() || '#e5eefb' };

    return (
        <div className="flex flex-col h-full">
            {/* Info panel when a bar is clicked */}
            {selectedEntry && (
                <div className="mb-2 flex items-center gap-3 px-3 py-2 rounded-lg bg-cyan-500/10 dark:bg-cyan-400/10 border border-cyan-500/20 text-xs animate-in fade-in slide-in-from-top-1 duration-200">
                    <span className="font-semibold text-cyan-600 dark:text-cyan-300">{selectedEntry.hour}</span>
                    <span className="text-zinc-600 dark:text-zinc-300">{(selectedEntry.count ?? selectedEntry.value ?? 0)} {t('sessions')}</span>
                    <span className="text-zinc-400">
                        ({( (selectedEntry.count ?? selectedEntry.value ?? 0) > avg ? '+' : '' )}{(selectedEntry.count ?? selectedEntry.value ?? 0) - avg} {t('vsAverage')})
                    </span>
                    <button onClick={() => setSelectedHour(null)} className="ml-auto text-zinc-400 hover:text-zinc-200 text-lg leading-none">×</button>
                </div>
            )}

            <ResponsiveContainer width="100%" height={selectedEntry ? 260 : 300} minHeight={260}>
                <BarChart
                    data={data}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    onClick={(e: { activeLabel?: unknown } | undefined) => {
                            const label = e?.activeLabel !== undefined ? String((e as { activeLabel?: unknown }).activeLabel) : undefined;
                            if (label !== undefined) setSelectedHour(prev => prev === label ? null : label);
                        }}
                    style={{ cursor: "pointer" }}
                >
                    <defs>
                        <linearGradient id="activityByHourGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.95} />
                            <stop offset="100%" stopColor="#a855f7" stopOpacity={0.72} />
                        </linearGradient>
                        <filter id="barGlow" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur stdDeviation="4" result="blur" />
                            <feMerge>
                                <feMergeNode in="blur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>
                    <CartesianGrid strokeDasharray="3 7" vertical={false} stroke={chartGridColor} />
                    <XAxis
                        dataKey="hour"
                        stroke={chartAxisColor}
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                    />
                    <YAxis
                        stroke={chartAxisColor}
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                    />
                    <Tooltip
                        contentStyle={chartTooltipStyle}
                        labelStyle={chartLabelStyle}
                        itemStyle={chartItemStyle}
                        cursor={{ fill: 'rgba(56, 189, 248, 0.06)', radius: 4 }}
                        formatter={(value: any) => [`${value ?? 0} ${t('sessions')}`, t('activity')]}
                        animationDuration={200}
                    />
                    {/* Average reference line (only when meaningful) */}
                    {showAvg && (
                        <ReferenceLine
                            y={avg}
                            stroke={chartAxisColor}
                            strokeDasharray="3 4"
                            strokeOpacity={0.32}
                            label={{ value: `${t('average')}: ${avg}`, position: 'right', fill: chartLabelStyle.color, fontSize: 10 }}
                        />
                    )}
                    <Bar
                        dataKey="count"
                        radius={[4, 4, 0, 0]}
                        animationDuration={800}
                        animationEasing="ease-out"
                        activeBar={<GlowBar />}
                    >
                        {data.map((entry, index) => {
                            const entryCount = Number(entry.count ?? 0);
                            const isMax = entryCount === maxCount && maxCount > 0;
                            return (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={
                                        selectedHour === entry.hour
                                            ? "#22d3ee"
                                            : isMax
                                                ? "#f97316"
                                                : "url(#activityByHourGradient)"
                                    }
                                    fillOpacity={selectedHour && selectedHour !== entry.hour ? 0.3 : 1}
                                    className="transition-all duration-200"
                                    style={{ cursor: "pointer" }}
                                />
                            );
                        })}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
