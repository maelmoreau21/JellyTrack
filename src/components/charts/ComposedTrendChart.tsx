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
    ResponsiveContainer,
} from 'recharts';

interface TrendData {
    time: string;
    movieVolume?: number; // in hours
    seriesVolume?: number;
    musicVolume?: number;
    booksVolume?: number;
    peakStreams?: number; // Server load
}

interface ChartSeries {
    key: string;
    name: string;
    color: string;
    type: "area" | "line" | "bar";
    yAxisId?: "left" | "right";
}

export function ComposedTrendChart({ data, series }: { data: TrendData[], series?: ChartSeries[] }) {
    const t = useTranslations('charts');
    const [hidden, setHidden] = useState<Set<string>>(new Set());

    const formatTooltipValue = (value: any, name: any) => {
        if (name === t('server')) return [t('maxActiveStreams', { count: value }), name];
        return [`${Number(value).toFixed(1)}h`, name];
    };

    const toggleLegend = (e: any) => {
        const dataKey = e.dataKey;
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
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />

                <XAxis
                    dataKey="time"
                    stroke="#52525b"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                />

                <YAxis
                    yAxisId="left"
                    stroke="#52525b"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => `${val}h`}
                />
                <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#52525b"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                />

                <Tooltip
                    contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px', color: '#f4f4f5' }}
                    labelStyle={{ color: '#a1a1aa' }}
                    itemStyle={{ color: '#e4e4e7' }}
                    formatter={formatTooltipValue}
                />
                <Legend onClick={toggleLegend} wrapperStyle={{ fontSize: '12px', paddingTop: '10px', cursor: 'pointer' }} />

                {series ? (
                    series.map((s) => {
                        if (s.type === "line") {
                            return <Line key={s.key} hide={hidden.has(s.key)} yAxisId={s.yAxisId || "left"} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} dot={false} name={s.name} />;
                        }
                        if (s.type === "bar") {
                            return <Bar key={s.key} hide={hidden.has(s.key)} yAxisId={s.yAxisId || "left"} dataKey={s.key} barSize={20} fill={s.color} radius={[4, 4, 0, 0]} name={s.name} />;
                        }
                        return <Area key={s.key} hide={hidden.has(s.key)} yAxisId={s.yAxisId || "left"} type="monotone" dataKey={s.key} stackId="1" stroke={s.color} fill={s.color} fillOpacity={0.25} name={s.name} />;
                    })
                ) : (
                    <>
                        {/* Stacked areas with lower opacity for clarity */}
                        <Area hide={hidden.has("movieVolume")} yAxisId="left" type="monotone" dataKey="movieVolume" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.25} name={t('movies')} />
                        <Area hide={hidden.has("seriesVolume")} yAxisId="left" type="monotone" dataKey="seriesVolume" stackId="1" stroke="#22c55e" fill="#22c55e" fillOpacity={0.25} name={t('series')} />
                        <Area hide={hidden.has("musicVolume")} yAxisId="left" type="monotone" dataKey="musicVolume" stackId="1" stroke="#eab308" fill="#eab308" fillOpacity={0.25} name={t('music')} />
                        <Area hide={hidden.has("booksVolume")} yAxisId="left" type="monotone" dataKey="booksVolume" stackId="1" stroke="#a855f7" fill="#a855f7" fillOpacity={0.25} name={t('books')} />
                    </>
                )}

            </ComposedChart>
        </ResponsiveContainer>
    );
}
