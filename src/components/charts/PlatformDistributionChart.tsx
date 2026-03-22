"use client";

import { useState } from "react";
import { useTranslations } from 'next-intl';
import {
    PieChart,
    Pie,
    Cell,
    Tooltip,
    Legend,
    Sector,
} from "recharts";
const PieTyped = Pie as unknown as typeof Pie;
import ResponsiveContainer from "./ResponsiveContainerGuard";
import { chartItemStyle, chartLabelStyle, chartPalette, chartTooltipStyle } from "@/lib/chartTheme";

export interface PlatformData {
    name: string;
    value: number;
}

interface PlatformDistributionChartProps {
    data: PlatformData[];
}

const COLORS = chartPalette;

/* Animated active shape — sector expands + center label */
type PlatformActiveShapeProps = {
    cx: number;
    cy: number;
    innerRadius: number;
    outerRadius: number;
    startAngle: number;
    endAngle: number;
    fill?: string;
    payload: { name: string; value?: number };
    value?: number;
    percent?: number;
};

    function renderActiveShape(props: PlatformActiveShapeProps) {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, value, percent } = props;
    return (
        <g>
            <Sector
                cx={cx} cy={cy}
                innerRadius={innerRadius - 2}
                outerRadius={outerRadius + 8}
                startAngle={startAngle} endAngle={endAngle}
                fill={fill}
                style={{ filter: "drop-shadow(0 0 8px rgba(56, 189, 248, 0.4))", transition: "all 200ms ease" }}
            />
            <text x={cx} y={cy - 8} textAnchor="middle" fill="#e5eefb" fontSize={13} fontWeight={600}>
                {payload.name}
            </text>
            <text x={cx} y={cy + 12} textAnchor="middle" fill="#94a3b8" fontSize={11}>
                {value} ({((percent ?? 0) * 100).toFixed(0)}%)
            </text>
        </g>
    );
}

export function PlatformDistributionChart({ data }: PlatformDistributionChartProps) {
    const t = useTranslations('charts');
    const td = useTranslations('dashboard');
    const [activeIndex, setActiveIndex] = useState<number>(-1);
    const [hidden, setHidden] = useState<Set<string>>(new Set());

    if (!data || data.length === 0) {
        return (
            <div className="flex h-[300px] w-full items-center justify-center text-sm text-muted-foreground">
                {t('noPlatformData')}
            </div>
        );
    }

    const filteredData = data.filter(d => !hidden.has(d.name));
    const total = filteredData.reduce((sum, d) => sum + d.value, 0);

    const toggleLegend = (e: { value: string }) => {
        const name = e.value;
        setHidden(prev => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else if (next.size < data.length - 1) next.add(name); // keep at least 1
            return next;
        });
    };

    const onLegendClick = (payload: unknown) => {
        if (payload && typeof payload === 'object' && 'value' in payload) {
            const p = payload as { value?: string };
            if (p.value) toggleLegend({ value: p.value });
        }
    };

    const legendFormatter = (value: string) => {
        const isHidden = hidden.has(value);
        return <span style={{ color: isHidden ? '#52525b' : '#e5eefb', textDecoration: isHidden ? 'line-through' : 'none', cursor: 'pointer' }}>{value}</span>;
    };

    return (
        <div className="flex flex-col h-full">
            {hidden.size > 0 && (
                <div className="mb-1 text-center">
                    <button onClick={() => setHidden(new Set())} className="text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors">
                        {td('showAll')}
                    </button>
                </div>
            )}
            <ResponsiveContainer width="100%" height={300} minHeight={300}>
                <PieChart>
                    <PieTyped
                        data={filteredData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={5}
                        dataKey="value"
                        stroke="none"
                        animationDuration={1000}
                        animationBegin={0}
                        animationEasing="ease-out"
                        activeShape={renderActiveShape as any}
                        onMouseEnter={(d: { value?: number; name?: string }, index: number) => setActiveIndex(index)}
                        onMouseLeave={() => setActiveIndex(-1)}
                    >
                        {filteredData.map((entry, index) => {
                            const originalIdx = data.findIndex(d => d.name === entry.name);
                            return (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={COLORS[originalIdx % COLORS.length]}
                                    style={{ cursor: "pointer" }}
                                />
                            );
                        })}
                    </PieTyped>
                    <Tooltip
                        contentStyle={chartTooltipStyle}
                        labelStyle={chartLabelStyle}
                        itemStyle={chartItemStyle}
                        cursor={{ fill: 'rgba(56, 189, 248, 0.06)', radius: 4 }}
                        formatter={(value: any) => [`${value ?? 0} ${t('sessions')}`, t('activity')]}
                        animationDuration={200}
                    />
                    <Legend
                        verticalAlign="bottom"
                        height={36}
                        iconType="circle"
                        wrapperStyle={{ fontSize: '12px', cursor: 'pointer' }}
                        onClick={onLegendClick}
                        formatter={legendFormatter}
                    />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
}
