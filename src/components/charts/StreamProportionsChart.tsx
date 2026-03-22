"use client";

import { PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import ResponsiveContainer from "./ResponsiveContainerGuard";

const COLORS: Record<string, string> = {
    "DirectPlay": "#10b981", // Emerald 500
    "Transcode": "#f97316", // Orange 500
    "DirectStream": "#3b82f6", // Blue 500
};

const DEFAULT_COLOR = "#71717a"; // Zinc 500

export function StreamProportionsChart({ data }: { data: { name: string, value: number }[] }) {
    return (
        <ResponsiveContainer width="100%" height={250} minHeight={250}>
            <PieChart>
                <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                >
                    {data.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[entry.name] || DEFAULT_COLOR} opacity={0.8} />
                    ))}
                </Pie>
                <Tooltip
                    contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px', color: '#f4f4f5' }}
                    labelStyle={{ color: '#a1a1aa' }}
                    itemStyle={{ color: '#e4e4e7' }}
                    formatter={(value: number | string) => [`${value} sessions`, 'Total']}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
            </PieChart>
        </ResponsiveContainer>
    );
}
