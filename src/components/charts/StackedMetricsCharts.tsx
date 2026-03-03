"use client";

import { ResponsiveContainer, BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";

const COLORS = ["#3b82f6", "#22c55e", "#eab308", "#a855f7", "#f97316", "#06b6d4", "#ec4899", "#8b5cf6"];

export function StackedBarChart({ data, keys, suffix }: { data: any[], keys: string[], suffix: string }) {
    return (
        <ResponsiveContainer width="100%" height={300} minHeight={300}>
            <BarChart data={data} margin={{ top: 20, right: 20, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                <XAxis dataKey="time" stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px', color: '#f4f4f5' }} labelStyle={{ color: '#a1a1aa' }} itemStyle={{ color: '#e4e4e7' }} />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                {keys.map((k, i) => (
                    <Bar key={k} dataKey={(entry: any) => entry?.[`${k}${suffix}`] || 0} name={k} stackId="a" fill={COLORS[i % COLORS.length]} />
                ))}
            </BarChart>
        </ResponsiveContainer>
    );
}

export function StackedAreaChart({ data, keys, suffix }: { data: any[], keys: string[], suffix: string }) {
    return (
        <ResponsiveContainer width="100%" height={300} minHeight={300}>
            <AreaChart data={data} margin={{ top: 20, right: 20, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                <XAxis dataKey="time" stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px', color: '#f4f4f5' }} labelStyle={{ color: '#a1a1aa' }} itemStyle={{ color: '#e4e4e7' }} />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                {keys.map((k, i) => (
                    <Area key={k} type="monotone" dataKey={(entry: any) => entry?.[`${k}${suffix}`] || 0} name={k} stackId="1" stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.6} />
                ))}
            </AreaChart>
        </ResponsiveContainer>
    );
}
