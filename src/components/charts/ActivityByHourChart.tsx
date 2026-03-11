"use client";

import { useState } from "react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
    ReferenceLine,
} from "recharts";
import { chartAxisColor, chartGridColor, chartItemStyle, chartLabelStyle, chartTooltipStyle } from "@/lib/chartTheme";

export interface ActivityHourData {
    hour: string; // "00:00", "01:00", etc.
    count: number;
}

interface ActivityByHourChartProps {
    data: ActivityHourData[];
}

/* Custom active bar shape with glow effect */
function GlowBar(props: any) {
    const { fill, x, y, width, height } = props;
    return (
        <g>
            <rect x={x} y={y} width={width} height={height} rx={4} ry={4}
                  fill={fill} filter="url(#barGlow)" fillOpacity={1} />
        </g>
    );
}

export function ActivityByHourChart({ data }: ActivityByHourChartProps) {
    const maxCount = Math.max(...data.map(d => d.count), 0);
    const [selectedHour, setSelectedHour] = useState<string | null>(null);
    const selectedEntry = data.find(d => d.hour === selectedHour);

    const avg = data.length > 0 ? Math.round(data.reduce((sum, d) => sum + d.count, 0) / data.length) : 0;

    return (
        <div className="flex flex-col h-full">
            {/* Info panel when a bar is clicked */}
            {selectedEntry && (
                <div className="mb-2 flex items-center gap-3 px-3 py-2 rounded-lg bg-cyan-500/10 dark:bg-cyan-400/10 border border-cyan-500/20 text-xs animate-in fade-in slide-in-from-top-1 duration-200">
                    <span className="font-semibold text-cyan-600 dark:text-cyan-300">{selectedEntry.hour}</span>
                    <span className="text-zinc-600 dark:text-zinc-300">{selectedEntry.count} sessions</span>
                    <span className="text-zinc-400">
                        ({selectedEntry.count > avg ? '+' : ''}{selectedEntry.count - avg} vs moy.)
                    </span>
                    <button onClick={() => setSelectedHour(null)} className="ml-auto text-zinc-400 hover:text-zinc-200 text-lg leading-none">Ã—</button>
                </div>
            )}

            <ResponsiveContainer width="100%" height={selectedEntry ? 260 : 300} minHeight={260}>
                <BarChart
                    data={data}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    onClick={(e: any) => {
                        if (e?.activeLabel) {
                            setSelectedHour(prev => prev === e.activeLabel ? null : e.activeLabel);
                        }
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
                        formatter={(value: any) => [`${value} sessions`, "ActivitÃ©"]}
                        animationDuration={200}
                    />
                    {/* Average reference line */}
                    <ReferenceLine
                        y={avg}
                        stroke="#94a3b8"
                        strokeDasharray="4 4"
                        strokeOpacity={0.5}
                        label={{ value: `moy: ${avg}`, position: 'right', fill: '#94a3b8', fontSize: 10 }}
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
                                fill={
                                    selectedHour === entry.hour
                                        ? "#22d3ee"
                                        : entry.count === maxCount && maxCount > 0
                                            ? "#f97316"
                                            : "url(#activityByHourGradient)"
                                }
                                fillOpacity={selectedHour && selectedHour !== entry.hour ? 0.3 : 1}
                                className="transition-all duration-200"
                                style={{ cursor: "pointer" }}
                            />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
