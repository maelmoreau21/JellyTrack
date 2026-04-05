"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";
import ResponsiveContainer from "./ResponsiveContainerGuard";
import { chartAxisColor, chartGridColor, chartItemStyle, chartLabelStyle, chartTooltipStyle } from "@/lib/chartTheme";

export interface DayOfWeekData {
    day: string;
    count: number;
}

interface DayOfWeekChartProps {
    data: DayOfWeekData[];
}

export function DayOfWeekChart({ data }: DayOfWeekChartProps) {
    const maxCount = Math.max(...data.map(d => d.count), 0);

    return (
        <ResponsiveContainer width="100%" height="100%" minHeight={180}>
            <BarChart
                data={data}
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
                    animationDuration={0}
                    animationEasing="linear"
                >
                    {data.map((entry, index) => (
                        <Cell
                            key={`cell-${index}`}
                            fill={entry.count === maxCount && maxCount > 0 ? "#f97316" : "#10b981"}
                        />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}
