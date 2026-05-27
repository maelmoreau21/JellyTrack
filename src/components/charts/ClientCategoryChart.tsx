"use client";

import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Cell,
} from "recharts";
import ResponsiveContainer from "./ResponsiveContainerGuard";
import { chartAxisColor, chartGridColor, chartItemStyle, chartLabelStyle, chartTooltipStyle } from "@/lib/chartTheme";

export interface ClientCategoryData {
    category: string; // "TV", "Web", "Mobile", "Desktop", "Autre"
    count: number;
}

interface ClientCategoryChartProps {
    data: ClientCategoryData[];
}

const CATEGORY_COLORS: Record<string, string> = {
    TV: "#6366f1",
    Web: "#3b82f6",
    Mobile: "#22c55e",
    Desktop: "#f59e0b",
    Autre: "#71717a",
};

export function ClientCategoryChart({ data }: ClientCategoryChartProps) {
    return (
        <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={chartGridColor} />
                <XAxis type="number" stroke={chartAxisColor} fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis
                    type="category"
                    dataKey="category"
                    stroke="var(--foreground)"
                    tick={{ fill: "var(--foreground)", fontWeight: 600 }}
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    width={70}
                />
                <Tooltip
                    contentStyle={chartTooltipStyle}
                    formatter={(value: unknown) => [`${value ?? 0} sessions`, "Sessions"]}
                    labelStyle={chartLabelStyle}
                    itemStyle={chartItemStyle}
                    cursor={{ fill: 'rgba(99, 102, 241, 0.06)' }}
                    animationDuration={0}
                />
                <Bar
                    dataKey="count"
                    radius={[0, 4, 4, 0]}
                    barSize={24}
                    animationDuration={0}
                    animationEasing="linear"
                >
                    {data.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[entry.category] || "#71717a"} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}

/**
 * Note: categorizeClient() has been moved to @/lib/utils
 * to allow server-side usage. Import it from there.
 */
