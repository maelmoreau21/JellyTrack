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

type GlowBarProps = { fill?: string; x?: number; y?: number; width?: number; height?: number };

function GlowBar({ fill, x, y, width, height }: GlowBarProps) {
    return (
        <g>
            <rect x={x} y={y} width={width} height={height} rx={4} ry={4}
                  fill={fill} filter="url(#catGlow)" fillOpacity={1} />
        </g>
    );
}

export function ClientCategoryChart({ data }: ClientCategoryChartProps) {
    return (
        <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <defs>
                    <filter id="catGlow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="4" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={chartGridColor} />
                <XAxis type="number" stroke={chartAxisColor} fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="category" stroke={chartAxisColor} fontSize={12} tickLine={false} axisLine={false} width={70} />
                <Tooltip
                    contentStyle={chartTooltipStyle}
                    formatter={(value: number) => [`${value} sessions`, "Sessions"]}
                    labelStyle={chartLabelStyle}
                    itemStyle={chartItemStyle}
                    cursor={{ fill: 'rgba(99, 102, 241, 0.06)' }}
                    animationDuration={200}
                />
                <Bar
                    dataKey="count"
                    radius={[0, 4, 4, 0]}
                    barSize={24}
                    animationDuration={800}
                    animationEasing="ease-out"
                    activeBar={<GlowBar />}
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
