"use client";

import { useTranslations } from 'next-intl';
import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    Tooltip,
    Legend,
} from "recharts";

export interface CompletionData {
    name: string;
    value: number;
}

interface CompletionRatioChartProps {
    data: CompletionData[];
}

const ORDERED_COLORS = ["#22c55e", "#ef4444", "#f59e0b"]; // completed, abandoned, partial

export function CompletionRatioChart({ data }: CompletionRatioChartProps) {
    const t = useTranslations('dashboard');

    // Build color map from translated labels
    const COLORS: Record<string, string> = {
        [t('completed')]: "#22c55e",
        [t('abandoned')]: "#ef4444",
        [t('partial')]: "#f59e0b",
    };
    return (
        <ResponsiveContainer width="100%" height={280}>
            <PieChart>
                <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    nameKey="name"
                    strokeWidth={0}
                >
                    {data.map((entry, index) => (
                        <Cell
                            key={`cell-${index}`}
                            fill={COLORS[entry.name] || "#71717a"}
                        />
                    ))}
                </Pie>
                <Tooltip
                    contentStyle={{
                        backgroundColor: "#18181b",
                        border: "1px solid #27272a",
                        borderRadius: "8px",
                        color: "#f4f4f5",
                    }}
                    labelStyle={{ color: "#a1a1aa" }}
                    itemStyle={{ color: "#e4e4e7" }}
                    formatter={(value: number, name: string) => [
                        `${value} sessions`,
                        name,
                    ]}
                />
                <Legend
                    wrapperStyle={{ fontSize: "12px", color: "#a1a1aa" }}
                    iconType="circle"
                />
            </PieChart>
        </ResponsiveContainer>
    );
}
