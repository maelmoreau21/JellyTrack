"use client";

import { ResponsiveContainer, BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend, PieChart, Pie, Cell } from "recharts";
import { chartAxisColor, chartGridColor, chartItemStyle, chartLabelStyle, chartPalette, chartTooltipStyle } from "@/lib/chartTheme";

const COLORS = chartPalette;

interface BarChartProps {
    data: any[];
    dataKey: string;
    fill: string;
    name: string;
    horizontal?: boolean;
    xAxisKey?: string;
}

export function StandardBarChart({ data, dataKey, fill, name, horizontal, xAxisKey = "time" }: BarChartProps) {
    if (horizontal) {
        return (
            <ResponsiveContainer width="100%" height={300} minHeight={300}>
                <BarChart data={data} layout="vertical" margin={{ top: 20, right: 20, left: 40, bottom: 0 }}>
                    <defs>
                        <linearGradient id="standardBarGradientHorizontal" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor={fill} stopOpacity={0.95} />
                            <stop offset="100%" stopColor="#e879f9" stopOpacity={0.88} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 7" horizontal={false} stroke={chartGridColor} />
                    <XAxis type="number" stroke={chartAxisColor} fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis dataKey={xAxisKey} type="category" stroke={chartAxisColor} fontSize={12} tickLine={false} axisLine={false} width={100} />
                    <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartLabelStyle} itemStyle={chartItemStyle} />
                    <Bar dataKey={dataKey} fill="url(#standardBarGradientHorizontal)" radius={[0, 10, 10, 0]} name={name} />
                </BarChart>
            </ResponsiveContainer>
        );
    }

    return (
        <ResponsiveContainer width="100%" height={300} minHeight={300}>
            <BarChart data={data} margin={{ top: 20, right: 20, left: -20, bottom: 0 }}>
                <defs>
                    <linearGradient id="standardBarGradientVertical" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={fill} stopOpacity={0.95} />
                        <stop offset="100%" stopColor="#0f172a" stopOpacity={0.4} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 7" vertical={false} stroke={chartGridColor} />
                <XAxis dataKey={xAxisKey} stroke={chartAxisColor} fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke={chartAxisColor} fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartLabelStyle} itemStyle={chartItemStyle} />
                <Bar dataKey={dataKey} fill="url(#standardBarGradientVertical)" radius={[10, 10, 0, 0]} name={name} />
            </BarChart>
        </ResponsiveContainer>
    );
}

export function StandardAreaChart({ data, dataKey, stroke, name }: { data: any[], dataKey: string, stroke: string, name: string }) {
    return (
        <ResponsiveContainer width="100%" height={300} minHeight={300}>
            <AreaChart data={data} margin={{ top: 20, right: 20, left: -20, bottom: 0 }}>
                <defs>
                    <linearGradient id="standardAreaGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={stroke} stopOpacity={0.55} />
                        <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 7" vertical={false} stroke={chartGridColor} />
                <XAxis dataKey="time" stroke={chartAxisColor} fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke={chartAxisColor} fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartLabelStyle} itemStyle={chartItemStyle} />
                <Area type="monotone" dataKey={dataKey} stroke={stroke} strokeWidth={2.4} fill="url(#standardAreaGradient)" name={name} />
            </AreaChart>
        </ResponsiveContainer>
    );
}

export function StandardPieChart({ data, nameKey, dataKey }: { data: any[], nameKey: string, dataKey: string }) {
    return (
        <ResponsiveContainer width="100%" height={300} minHeight={300}>
            <PieChart>
                <Pie
                    data={data}
                    cx="50%"
                    cy="45%"
                    innerRadius={50}
                    outerRadius={80}
                    fill="#8884d8"
                    paddingAngle={2}
                    dataKey={dataKey}
                    nameKey={nameKey}
                    stroke="none"
                    label={({ name, percent }) => {
                        const truncated = name && name.length > 12 ? name.substring(0, 12) + 'â€¦' : name;
                        return `${truncated} ${((percent || 0) * 100).toFixed(0)}%`;
                    }}
                    labelLine={false}
                    fontSize={11}
                >
                    {data.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                </Pie>
                <Tooltip
                    contentStyle={chartTooltipStyle}
                    labelStyle={chartLabelStyle}
                    itemStyle={chartItemStyle}
                />
                <Legend
                    wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                    formatter={(value: string) => <span className="text-zinc-300">{value}</span>}
                />
            </PieChart>
        </ResponsiveContainer>
    );
}
