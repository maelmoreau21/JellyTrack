"use client";

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import {
    ComposedChart,
    Line,
    Area,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
} from 'recharts';
import ResponsiveContainer from "./ResponsiveContainerGuard";
import { chartAxisColor, chartGridColor, chartItemStyle, chartLabelStyle, chartTooltipStyle } from '@/lib/chartTheme';

interface TrendData {
    time: string;
    movieVolume?: number;
    seriesVolume?: number;
    musicVolume?: number;
    booksVolume?: number;
    peakStreams?: number;
}

interface ChartSeries {
    key: string;
    name: string;
    color: string;
    type: "area" | "line" | "bar";
    yAxisId?: "left" | "right";
}

/* Glowing active dot for lines */
type GlowDotProps = { cx?: number; cy?: number; fill?: string };
function GlowDot({ cx, cy, fill }: GlowDotProps) {
    if (cx == null || cy == null) return null;
    return (
        <g>
            <circle cx={cx} cy={cy} r={8} fill={fill} fillOpacity={0.2} />
            <circle cx={cx} cy={cy} r={5} fill={fill} stroke="#0c0c14" strokeWidth={2} />
        </g>
    );
}

export function ComposedTrendChart({ data, series }: { data: TrendData[], series?: ChartSeries[] }) {
    const t = useTranslations('charts');
    const [hidden, setHidden] = useState<Set<string>>(new Set());

    const formatTooltipValue = (value: number | string, name: string) => {
        if (name === t('server')) return [t('maxActiveStreams', { count: value }), name];
        return [`${Number(value).toFixed(1)}h`, name];
    };

    const toggleLegend = (e: any) => {
        const dataKey = e?.dataKey !== undefined ? String(e.dataKey) : undefined;
        if (!dataKey) return;
        setHidden(prev => {
            const next = new Set(prev);
            if (next.has(dataKey)) next.delete(dataKey);
            else next.add(dataKey);
            return next;
        });
    };

    return (
        <ResponsiveContainer width="100%" height={400} minHeight={400}>
            <ComposedChart
                data={data}
                margin={{ top: 20, right: 30, left: -10, bottom: 5 }}
            >
                <CartesianGrid strokeDasharray="3 7" vertical={false} stroke={chartGridColor} />

                <XAxis
                    dataKey="time"
                    stroke={chartAxisColor}
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                />

                <YAxis
                    yAxisId="left"
                    stroke={chartAxisColor}
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => `${val}h`}
                />
                <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke={chartAxisColor}
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                />

                <Tooltip
                    contentStyle={chartTooltipStyle}
                    labelStyle={chartLabelStyle}
                    itemStyle={chartItemStyle}
                    formatter={formatTooltipValue as any}
                    cursor={{ stroke: 'rgba(56, 189, 248, 0.2)', strokeWidth: 1, strokeDasharray: '4 4' }}
                    animationDuration={200}
                />
                <Legend
                    onClick={toggleLegend as any}
                    wrapperStyle={{ fontSize: '12px', paddingTop: '10px', cursor: 'pointer' }}
                />

                {series ? (
                    series.map((s) => {
                        if (s.type === "line") {
                            return (
                                <Line
                                    key={s.key}
                                    hide={hidden.has(s.key)}
                                    yAxisId={s.yAxisId || "left"}
                                    type="monotone"
                                    dataKey={s.key}
                                    stroke={s.color}
                                    strokeWidth={2}
                                    dot={false}
                                    activeDot={<GlowDot fill={s.color} />}
                                    name={s.name}
                                    animationDuration={1200}
                                    animationEasing="ease-out"
                                />
                            );
                        }
                        if (s.type === "bar") {
                            return (
                                <Bar
                                    key={s.key}
                                    hide={hidden.has(s.key)}
                                    yAxisId={s.yAxisId || "left"}
                                    dataKey={s.key}
                                    barSize={20}
                                    fill={s.color}
                                    radius={[4, 4, 0, 0]}
                                    name={s.name}
                                    animationDuration={800}
                                    animationEasing="ease-out"
                                />
                            );
                        }
                        return (
                            <Area
                                key={s.key}
                                hide={hidden.has(s.key)}
                                yAxisId={s.yAxisId || "left"}
                                type="monotone"
                                dataKey={s.key}
                                stackId="1"
                                stroke={s.color}
                                strokeWidth={2.2}
                                fill={s.color}
                                fillOpacity={0.2}
                                name={s.name}
                                activeDot={<GlowDot fill={s.color} />}
                                animationDuration={1200}
                                animationEasing="ease-out"
                            />
                        );
                    })
                ) : (
                    <>
                        <Area hide={hidden.has("movieVolume")} yAxisId="left" type="monotone" dataKey="movieVolume" stackId="1" stroke="#38bdf8" strokeWidth={2.2} fill="#38bdf8" fillOpacity={0.18} name={t('movies')} activeDot={<GlowDot fill="#38bdf8" />} animationDuration={1200} animationEasing="ease-out" />
                        <Area hide={hidden.has("seriesVolume")} yAxisId="left" type="monotone" dataKey="seriesVolume" stackId="1" stroke="#22c55e" strokeWidth={2.2} fill="#22c55e" fillOpacity={0.18} name={t('series')} activeDot={<GlowDot fill="#22c55e" />} animationDuration={1200} animationEasing="ease-out" />
                        <Area hide={hidden.has("musicVolume")} yAxisId="left" type="monotone" dataKey="musicVolume" stackId="1" stroke="#f59e0b" strokeWidth={2.2} fill="#f59e0b" fillOpacity={0.18} name={t('music')} activeDot={<GlowDot fill="#f59e0b" />} animationDuration={1200} animationEasing="ease-out" />
                        <Area hide={hidden.has("booksVolume")} yAxisId="left" type="monotone" dataKey="booksVolume" stackId="1" stroke="#a855f7" strokeWidth={2.2} fill="#a855f7" fillOpacity={0.18} name={t('books')} activeDot={<GlowDot fill="#a855f7" />} animationDuration={1200} animationEasing="ease-out" />
                    </>
                )}

            </ComposedChart>
        </ResponsiveContainer>
    );
}
