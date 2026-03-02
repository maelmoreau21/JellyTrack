"use client";

import { useTranslations } from 'next-intl';
import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    Tooltip,
    Legend
} from "recharts";

export interface PlatformData {
    name: string;
    value: number;
}

interface PlatformDistributionChartProps {
    data: PlatformData[];
}

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#10b981', '#0ea5e9'];

export function PlatformDistributionChart({ data }: PlatformDistributionChartProps) {
    const t = useTranslations('charts');

    if (!data || data.length === 0) {
        return (
            <div className="flex h-[300px] w-full items-center justify-center text-sm text-muted-foreground">
                {t('noPlatformData')}
            </div>
        );
    }

    return (
        <ResponsiveContainer width="100%" height={300} minHeight={300}>
            <PieChart>
                <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                >
                    {data.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                </Pie>
                <Tooltip
                    contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px", color: "#f4f4f5" }}
                    labelStyle={{ color: "#a1a1aa" }}
                    itemStyle={{ color: "#e4e4e7" }}
                />
                <Legend
                    verticalAlign="bottom"
                    height={36}
                    iconType="circle"
                    wrapperStyle={{ fontSize: '12px' }}
                />
            </PieChart>
        </ResponsiveContainer>
    );
}
