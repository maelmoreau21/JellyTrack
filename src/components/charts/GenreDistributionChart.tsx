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
    Cell
} from "recharts";

export interface GenreData {
    name: string;
    count: number;
}

interface GenreDistributionChartProps {
    data: GenreData[];
}

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308'];

export function GenreDistributionChart({ data }: GenreDistributionChartProps) {
    const t = useTranslations('charts');

    if (!data || data.length === 0) {
        return (
            <div className="flex h-[300px] w-full items-center justify-center text-sm text-muted-foreground">
                {t('noGenreData')}
            </div>
        );
    }

    return (
        <ResponsiveContainer width="100%" height={300} minHeight={300}>
            <BarChart
                data={data}
                layout="vertical"
                margin={{ top: 0, right: 30, left: 40, bottom: 0 }}
            >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#333" />
                <XAxis type="number" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis
                    dataKey="name"
                    type="category"
                    stroke="#888888"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                />
                <Tooltip
                    contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px", color: "#f4f4f5" }}
                    labelStyle={{ color: "#a1a1aa" }}
                    itemStyle={{ color: "#e4e4e7" }}
                    cursor={{ fill: '#27272a', opacity: 0.5 }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
                    {data.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}
