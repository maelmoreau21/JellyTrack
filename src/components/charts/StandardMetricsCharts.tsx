"use client";

import { useCallback, useMemo } from "react";
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend, PieChart, Pie, Cell } from "recharts";
import ResponsiveContainer from "./ResponsiveContainerGuard";
import { chartAxisColor, chartGridColor, chartItemStyle, chartLabelStyle, chartPalette, chartTooltipStyle } from "@/lib/chartTheme";

const COLORS = chartPalette;

interface BarChartProps {
    data: Record<string, number | string | undefined>[];
    dataKey: string;
    fill: string;
    name: string;
    horizontal?: boolean;
    xAxisKey?: string;
    onClick?: (data: any) => void;
}

export function StandardBarChart({ data, dataKey, fill, name, horizontal, xAxisKey = "time", onClick }: BarChartProps) {
    if (horizontal) {
        return (
            <ResponsiveContainer width="100%" height={300} minHeight={300}>
                <BarChart data={data} layout="vertical" margin={{ top: 20, right: 20, left: 40, bottom: 0 }} onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
                    <CartesianGrid strokeDasharray="3 7" horizontal={false} stroke={chartGridColor} />
                    <XAxis type="number" stroke={chartAxisColor} fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis dataKey={xAxisKey} type="category" stroke={chartAxisColor} fontSize={12} tickLine={false} axisLine={false} width={100} />
                    <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartLabelStyle} itemStyle={chartItemStyle} />
                    <Bar dataKey={dataKey} fill={fill} fillOpacity={0.9} radius={[0, 10, 10, 0]} name={name} />
                </BarChart>
            </ResponsiveContainer>
        );
    }

    return (
        <ResponsiveContainer width="100%" height={300} minHeight={300}>
            <BarChart data={data} margin={{ top: 20, right: 20, left: -20, bottom: 0 }} onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
                <CartesianGrid strokeDasharray="3 7" vertical={false} stroke={chartGridColor} />
                <XAxis dataKey={xAxisKey} stroke={chartAxisColor} fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke={chartAxisColor} fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartLabelStyle} itemStyle={chartItemStyle} />
                <Bar dataKey={dataKey} fill={fill} fillOpacity={0.9} radius={[10, 10, 0, 0]} name={name} />
            </BarChart>
        </ResponsiveContainer>
    );
}

export function StandardAreaChart({ data, dataKey, stroke, name, onClick }: { data: Record<string, number | string | undefined>[], dataKey: string, stroke: string, name: string, onClick?: (data: any) => void }) {
    return (
        <ResponsiveContainer width="100%" height={300} minHeight={300}>
            <AreaChart data={data} margin={{ top: 20, right: 20, left: -20, bottom: 0 }} onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
                <CartesianGrid strokeDasharray="3 7" vertical={false} stroke={chartGridColor} />
                <XAxis dataKey="time" stroke={chartAxisColor} fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke={chartAxisColor} fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartLabelStyle} itemStyle={chartItemStyle} />
                <Area type="monotone" dataKey={dataKey} stroke={stroke} strokeWidth={2.4} fill={stroke} fillOpacity={0.16} name={name} />
            </AreaChart>
        </ResponsiveContainer>
    );
}

export function StandardPieChart({ data, nameKey, dataKey, onClick }: { data: Record<string, number | string | undefined>[], nameKey: string, dataKey: string, onClick?: (data: any) => void }) {
    const filteredData = useMemo(
        () => data.filter(item => (Number(item[dataKey]) || 0) > 0),
        [data, dataKey]
    );

    const renderPieLabel = useCallback(({ name, percent }: { name?: string; percent?: number }) => {
        const limit = 10;
        const rawName = String(name || '');
        const truncated = rawName.length > limit ? `${rawName.substring(0, limit)}…` : rawName;
        const p = Number(percent || 0);
        return p > 0.05 ? `${truncated} ${(p * 100).toFixed(0)}%` : '';
    }, []);
    
    return (
        <ResponsiveContainer width="100%" height={300} minHeight={300}>
            <PieChart>
                <Pie
                    data={filteredData}
                    cx="50%"
                    cy="45%"
                    innerRadius={60}
                    outerRadius={85}
                    fill="#8884d8"
                    paddingAngle={2}
                    dataKey={dataKey}
                    nameKey={nameKey}
                    stroke="none"
                    label={renderPieLabel}
                    labelLine={true}
                    fontSize={10}
                    onClick={onClick}
                    style={onClick ? { cursor: 'pointer' } : undefined}
                >
                    {filteredData.map((entry, index) => (
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
