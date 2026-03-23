"use client";

import { useState, useMemo } from "react";
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Cell,
} from "recharts";
import ResponsiveContainer from "./ResponsiveContainerGuard";
import { chartAxisColor, chartGridColor, chartItemStyle, chartLabelStyle, chartTooltipStyle } from "@/lib/chartTheme";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

export interface MonthlyWatchData {
    month: string; // "2026_0" = year_monthIndex
    hours: number;
}

interface MonthlyWatchTimeChartProps {
    data: MonthlyWatchData[];
    monthNames: string[];
}

type GlowBarProps = { fill?: string; x?: number; y?: number; width?: number; height?: number };

function GlowBar({ fill, x, y, width, height }: GlowBarProps) {
    return (
        <g>
            <rect x={x} y={y} width={width} height={height} rx={4} ry={4}
                  fill={fill} filter="url(#monthGlow)" fillOpacity={1} />
        </g>
    );
}

export function MonthlyWatchTimeChart({ data, monthNames }: MonthlyWatchTimeChartProps) {
    const t = useTranslations('charts');
    const router = useRouter();

    const availableYears = useMemo(() => {
        const years = new Set<number>();
        data.forEach(d => {
            const year = parseInt(d.month.split('_')[0]);
            if (!isNaN(year)) years.add(year);
        });
        if (years.size === 0) years.add(new Date().getFullYear());
        return Array.from(years).sort();
    }, [data]);

    const [selectedYear, setSelectedYear] = useState(() => {
        return availableYears[availableYears.length - 1] || new Date().getFullYear();
    });

    const yearIndex = availableYears.indexOf(selectedYear);
    const canGoBack = yearIndex > 0;
    const canGoForward = yearIndex < availableYears.length - 1;

    const chartData = useMemo(() => {
        const dataMap = new Map<string, number>();
        data.forEach(d => {
            dataMap.set(d.month, d.hours);
        });

        return Array.from({ length: 12 }, (_, i) => {
            const key = `${selectedYear}_${i}`;
            return {
                month: monthNames[i] || `M${i + 1}`,
                hours: dataMap.get(key) || 0,
                monthIndex: i,
            };
        });
    }, [data, selectedYear, monthNames]);

    const maxHours = Math.max(...chartData.map((d) => d.hours), 1);

    const formatTooltip = (value?: ValueType, name?: NameType) => {
        const h = Number(value ?? 0);
        const hours = Math.floor(h);
        const mins = Math.round((h - hours) * 60);
        return [`${hours}h ${mins}min`, t('watchTime')] as [string, string];
    };

    const handleBarClick = (payload: any) => {
        const monthIndex = payload.monthIndex;
        if (monthIndex === undefined) return;

        const firstDay = new Date(selectedYear, monthIndex, 1);
        const lastDay = new Date(selectedYear, monthIndex + 1, 0);

        const from = firstDay.toISOString().split('T')[0];
        const to = lastDay.toISOString().split('T')[0];

        router.push(`/logs?dateFrom=${from}&dateTo=${to}`);
    };

    return (
        <div className="flex flex-col h-full">
            {/* Year navigation */}
            <div className="flex items-center justify-center gap-3 mb-2">
                <button
                    onClick={() => canGoBack && setSelectedYear(availableYears[yearIndex - 1])}
                    disabled={!canGoBack}
                    className="p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-700/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                    <ChevronLeft className="w-4 h-4 text-zinc-300" />
                </button>
                <span className="text-sm font-semibold text-zinc-200 min-w-[4rem] text-center">
                    {selectedYear}
                </span>
                <button
                    onClick={() => canGoForward && setSelectedYear(availableYears[yearIndex + 1])}
                    disabled={!canGoForward}
                    className="p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-700/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                    <ChevronRight className="w-4 h-4 text-zinc-300" />
                </button>
            </div>

            <ResponsiveContainer width="100%" height={260} minHeight={260}>
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                        <linearGradient id="monthlyWatchGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.95} />
                            <stop offset="100%" stopColor="#a855f7" stopOpacity={0.7} />
                        </linearGradient>
                        <filter id="monthGlow" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur stdDeviation="4" result="blur" />
                            <feMerge>
                                <feMergeNode in="blur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>
                    <CartesianGrid strokeDasharray="3 7" vertical={false} stroke={chartGridColor} />
                    <XAxis
                        dataKey="month"
                        stroke={chartAxisColor}
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                    />
                    <YAxis
                        stroke={chartAxisColor}
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                        tickFormatter={(v) => `${v}h`}
                    />
                    <Tooltip
                        contentStyle={chartTooltipStyle}
                        formatter={formatTooltip}
                        labelStyle={chartLabelStyle}
                        itemStyle={chartItemStyle}
                        cursor={{ fill: 'rgba(56, 189, 248, 0.06)', radius: 4 }}
                        animationDuration={200}
                    />
                    <Bar
                        dataKey="hours"
                        radius={[4, 4, 0, 0]}
                        animationDuration={800}
                        animationEasing="ease-out"
                        activeBar={<GlowBar />}
                        onClick={handleBarClick}
                    >
                        {chartData.map((entry, index) => (
                            <Cell
                                key={`cell-${index}`}
                                fill={entry.hours === maxHours && maxHours > 0 ? "#f97316" : "url(#monthlyWatchGradient)"}
                                fillOpacity={maxHours > 0 ? 0.6 + (entry.hours / maxHours) * 0.4 : 0.3}
                                style={{ cursor: "pointer" }}
                            />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
