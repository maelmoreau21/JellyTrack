"use client";

import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import ResponsiveContainer from "./ResponsiveContainerGuard";
import { chartAxisColor, chartGridColor, chartItemStyle, chartLabelStyle, chartPalette, chartTooltipStyle } from "@/lib/chartTheme";

const COLORS = chartPalette;

export function StackedBarChart({ data, keys, suffix }: { data: Record<string, number | undefined>[], keys: string[], suffix: string }) {
    return (
        <ResponsiveContainer width="100%" height={300} minHeight={300}>
            <BarChart data={data} margin={{ top: 20, right: 20, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 7" vertical={false} stroke={chartGridColor} />
                <XAxis dataKey="time" stroke={chartAxisColor} fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke={chartAxisColor} fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartLabelStyle} itemStyle={chartItemStyle} />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                {keys.map((k, i) => (
                    <Bar key={k} dataKey={(entry: Record<string, number | undefined>) => entry?.[`${k}${suffix}`] || 0} name={k} stackId="a" fill={COLORS[i % COLORS.length]} radius={i === keys.length - 1 ? [8, 8, 0, 0] : [0, 0, 0, 0]} />
                ))}
            </BarChart>
        </ResponsiveContainer>
    );
}

export function StackedAreaChart({ data, keys, suffix }: { data: Record<string, number | undefined>[], keys: string[], suffix: string }) {
    return (
        <ResponsiveContainer width="100%" height={300} minHeight={300}>
            <AreaChart data={data} margin={{ top: 20, right: 20, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 7" vertical={false} stroke={chartGridColor} />
                <XAxis dataKey="time" stroke={chartAxisColor} fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke={chartAxisColor} fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartLabelStyle} itemStyle={chartItemStyle} />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                {keys.map((k, i) => (
                    <Area key={k} type="monotone" dataKey={(entry: Record<string, number | undefined>) => entry?.[`${k}${suffix}`] || 0} name={k} stackId="1" stroke={COLORS[i % COLORS.length]} strokeWidth={2.2} fill={COLORS[i % COLORS.length]} fillOpacity={0.22} />
                ))}
            </AreaChart>
        </ResponsiveContainer>
    );
}
