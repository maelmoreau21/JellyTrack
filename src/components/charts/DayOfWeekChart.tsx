"use client";

import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";
import ResponsiveContainer from "./ResponsiveContainerGuard";
import { chartAxisColor, chartGridColor, chartItemStyle, chartLabelStyle, chartTooltipStyle } from "@/lib/chartTheme";

export interface DayOfWeekData {
    day: string;
    count: number;
    dayIndex?: number;
}

interface DayOfWeekChartProps {
    data: DayOfWeekData[];
}

export function DayOfWeekChart({ data }: DayOfWeekChartProps) {
    const normalizedData = useMemo(
        () =>
            data.map((entry, index) => {
                const numericCount = Number(entry.count ?? 0);
                return {
                    day: String(entry.day ?? index),
                    count: Number.isFinite(numericCount) ? numericCount : 0,
                    dayIndex: entry.dayIndex,
                };
            }),
        [data]
    );
    const maxCount = normalizedData.length > 0 ? Math.max(...normalizedData.map((d) => d.count)) : 0;

    return (
        <ResponsiveContainer width="100%" height={220} minHeight={220}>
            <BarChart
                data={normalizedData}
                margin={{ top: 10, right: 10, left: -20, bottom: 18 }}
            >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartGridColor} />
                <XAxis
                    dataKey="day"
                    stroke={chartAxisColor}
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
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
                    cursor={{ fill: 'rgba(16, 185, 129, 0.06)', radius: 4 }}
                    formatter={(value: number | string | null | undefined) => [String(value ?? 0), "Sessions"]}
                    animationDuration={0}
                />
                <Bar
                    dataKey="count"
                    radius={[4, 4, 0, 0]}
                    minPointSize={2}
                    animationDuration={0}
                    animationEasing="linear"
                >
                    {normalizedData.map((entry, index) => (
                        <Cell
                            key={`cell-${index}`}
                            fill={entry.count === maxCount && maxCount > 0 ? "#ea580c" : "#059669"}
                        />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}
