"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";
import type { BarProps } from 'recharts';
import ResponsiveContainer from "./ResponsiveContainerGuard";
import { chartAxisColor, chartGridColor, chartItemStyle, chartLabelStyle, chartTooltipStyle } from "@/lib/chartTheme";

export interface DayOfWeekData {
    day: string;
    count: number;
}

interface DayOfWeekChartProps {
    data: DayOfWeekData[];
}

function GlowBar(props: BarProps) {
    const { fill, x, y, width, height } = props as unknown as { fill?: string; x?: number; y?: number; width?: number; height?: number };
    return (
        <g>
            <rect x={x} y={y} width={width} height={height} rx={4} ry={4}
                  fill={fill} filter="url(#dowGlow)" fillOpacity={1} />
        </g>
    );
}

export function DayOfWeekChart({ data }: DayOfWeekChartProps) {
    const maxCount = Math.max(...data.map(d => d.count), 0);

    return (
        <ResponsiveContainer width="100%" height={300} minHeight={300}>
            <BarChart
                data={data}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
                <defs>
                    <filter id="dowGlow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="4" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartGridColor} />
                <XAxis
                    dataKey="day"
                    stroke={chartAxisColor}
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
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
                    formatter={((value: any) => [value, "Sessions"]) as any}
                    animationDuration={200}
                />
                <Bar
                    dataKey="count"
                    radius={[4, 4, 0, 0]}
                    animationDuration={800}
                    animationEasing="ease-out"
                    activeBar={<GlowBar />}
                >
                    {data.map((entry, index) => (
                        <Cell
                            key={`cell-${index}`}
                            fill={entry.count === maxCount && maxCount > 0 ? "#f97316" : "#10b981"}
                            className="transition-all duration-200"
                        />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}
