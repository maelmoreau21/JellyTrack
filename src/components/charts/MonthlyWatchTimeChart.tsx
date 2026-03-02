"use client";

import { useTranslations } from 'next-intl';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
} from "recharts";

export interface MonthlyWatchData {
    month: string; // "Jan", "Fév", etc.
    hours: number;
}

interface MonthlyWatchTimeChartProps {
    data: MonthlyWatchData[];
}

const COLORS = [
    "#6366f1", "#818cf8", "#a5b4fc", "#c7d2fe",
    "#6366f1", "#818cf8", "#a5b4fc", "#c7d2fe",
    "#6366f1", "#818cf8", "#a5b4fc", "#c7d2fe",
];

export function MonthlyWatchTimeChart({ data }: MonthlyWatchTimeChartProps) {
    const t = useTranslations('charts');
    const maxHours = Math.max(...data.map((d) => d.hours), 1);

    return (
        <ResponsiveContainer width="100%" height={300} minHeight={300}>
            <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
                <XAxis
                    dataKey="month"
                    stroke="#888888"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                />
                <YAxis
                    stroke="#888888"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    tickFormatter={(v) => `${v}h`}
                />
                <Tooltip
                    contentStyle={{
                        backgroundColor: "#18181b",
                        border: "1px solid #27272a",
                        borderRadius: "8px",
                        color: "#f4f4f5",
                    }}
                    formatter={(value: number) => [`${value.toFixed(1)}h`, t('watchTime')]}
                    labelStyle={{ color: "#a1a1aa" }}
                    itemStyle={{ color: "#e4e4e7" }}
                />
                <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
                    {data.map((entry, index) => (
                        <Cell
                            key={`cell-${index}`}
                            fill={entry.hours === maxHours ? "#6366f1" : "#3f3f46"}
                            fillOpacity={0.6 + (entry.hours / maxHours) * 0.4}
                        />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}
