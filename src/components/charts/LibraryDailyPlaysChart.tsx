"use client";

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from 'recharts';

interface LibraryPlaysData {
    time: string;
    moviePlays: number;
    seriesPlays: number;
    musicPlays: number;
    booksPlays: number;
    totalViews: number;
}

const LIBRARY_SERIES_KEYS = [
    { key: 'moviePlays', nameKey: 'movies', color: '#3b82f6' },
    { key: 'seriesPlays', nameKey: 'series', color: '#22c55e' },
    { key: 'musicPlays', nameKey: 'music', color: '#eab308' },
    { key: 'booksPlays', nameKey: 'books', color: '#a855f7' },
    { key: 'totalViews', nameKey: 'total', color: '#71717a' },
];

export function LibraryDailyPlaysChart({ data }: { data: LibraryPlaysData[] }) {
    const t = useTranslations('charts');
    const [hidden, setHidden] = useState<Set<string>>(new Set());

    const formatTooltipValue = (value: any, name: any) => {
        return [t('playsCount', { count: value }), name];
    };

    // Auto-hide libraries that have 0 plays across entire dataset
    const hasData = new Map<string, boolean>();
    for (const series of LIBRARY_SERIES_KEYS) {
        hasData.set(series.key, data.some((d: any) => (d[series.key] || 0) > 0));
    }

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
        <ResponsiveContainer width="100%" height={300} minHeight={300}>
            <LineChart
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
                    stroke="#52525b"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                />
                <Tooltip
                    contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px', color: '#f4f4f5' }}
                    labelStyle={{ color: '#a1a1aa' }}
                    itemStyle={{ color: '#e4e4e7' }}
                    formatter={formatTooltipValue}
                />
                <Legend
                    onClick={toggleLegend}
                    wrapperStyle={{ fontSize: '12px', paddingTop: '10px', cursor: 'pointer' }}
                />
                {LIBRARY_SERIES_KEYS.map((s) => (
                    hasData.get(s.key) ? (
                        <Line
                            key={s.key}
                            hide={hidden.has(s.key)}
                            type="monotone"
                            dataKey={s.key}
                            stroke={s.color}
                            strokeWidth={2}
                            dot={false}
                            name={t(s.nameKey)}
                            connectNulls
                        />
                    ) : null
                ))}
            </LineChart>
        </ResponsiveContainer>
    );
}
