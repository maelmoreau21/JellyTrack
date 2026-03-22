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
// Keep a typed alias to avoid sprinkling `any` in JSX usage while preserving
// the component reference.
const PieTyped = Pie as unknown as typeof Pie;
import ResponsiveContainer from "./ResponsiveContainerGuard";
// Read chart CSS variables at runtime for theme-aware colors

export interface CompletionData {
    name: string;
    value: number;
}

interface CompletionRatioChartProps {
    data: CompletionData[];
}

/* Active shape — expanded sector with glow + center label */
type ActiveShapeProps = {
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

function renderActiveShape(props: ActiveShapeProps) {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, value, percent } = props;
    const root = typeof window !== 'undefined' ? getComputedStyle(document.documentElement) : null;
    const activeTextColor = root?.getPropertyValue('--chart-item-color')?.trim() || '#e5eefb';
    const secondaryTextColor = root?.getPropertyValue('--chart-label-color')?.trim() || '#94a3b8';
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
            <text x={cx} y={cy - 8} textAnchor="middle" fill={activeTextColor} fontSize={13} fontWeight={600}>
                {payload.name}
            </text>
            <text x={cx} y={cy + 12} textAnchor="middle" fill={secondaryTextColor} fontSize={11}>
                {value} ({((percent ?? 0) * 100).toFixed(0)}%)
            </text>
        </g>
    );
}

export function CompletionRatioChart({ data }: CompletionRatioChartProps) {
    const t = useTranslations('dashboard');
    const [activeIndex, setActiveIndex] = useState<number>(-1);
    const [hidden, setHidden] = useState<Set<string>>(new Set());

    const COLORS: Record<string, string> = {
        [t('completed')]: "#22c55e",
        [t('abandoned')]: "#ef4444",
        [t('partial')]: "#f59e0b",
    };

    const filteredData = data.filter(d => !hidden.has(d.name));
    const total = filteredData.reduce((sum, d) => sum + d.value, 0);

    // Read chart colour variables from CSS
    const root = typeof window !== 'undefined' ? getComputedStyle(document.documentElement) : null;
    const chartTooltipStyle = {
        background: root?.getPropertyValue('--chart-tooltip-bg')?.trim() || 'rgba(8, 12, 18, 0.9)',
        border: root?.getPropertyValue('--chart-tooltip-border')?.trim() || '1px solid rgba(103, 232, 249, 0.18)',
        borderRadius: root?.getPropertyValue('--chart-tooltip-radius')?.trim() || '18px',
        boxShadow: root?.getPropertyValue('--chart-tooltip-box-shadow')?.trim() || '0 20px 60px rgba(0, 0, 0, 0.35)',
        backdropFilter: root?.getPropertyValue('--chart-tooltip-backdrop')?.trim() || 'blur(18px)'
    };
    const chartLabelStyle = { color: root?.getPropertyValue('--chart-label-color')?.trim() || '#a1a1aa' };
    const chartItemStyle = { color: root?.getPropertyValue('--chart-item-color')?.trim() || '#e5eefb' };

    const toggleLegend = (e: { value: string }) => {
        const name = e.value;
        setHidden(prev => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else if (next.size < data.length - 1) next.add(name);
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
        return <span style={{ color: isHidden ? chartLabelStyle.color : chartItemStyle.color, textDecoration: isHidden ? 'line-through' : 'none', cursor: 'pointer' }}>{value}</span>;
    };

    return (
        <div className="flex flex-col h-full">
            {hidden.size > 0 && (
                <div className="mb-1 text-center">
                    <button onClick={() => setHidden(new Set())} className="text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors">
                        Tout afficher
                    </button>
                </div>
            )}
            <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                    <PieTyped
                        data={filteredData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={3}
                        dataKey="value"
                        nameKey="name"
                        strokeWidth={0}
                        animationDuration={1000}
                        animationBegin={0}
                        animationEasing="ease-out"
                        activeShape={renderActiveShape as any}
                        onMouseEnter={(d: { value?: number; name?: string } | undefined, index: number) => setActiveIndex(index)}
                        onMouseLeave={() => setActiveIndex(-1)}
                    >
                        {filteredData.map((entry, index) => (
                            <Cell
                                key={`cell-${index}`}
                                fill={COLORS[entry.name] || "#71717a"}
                                style={{ cursor: "pointer" }}
                            />
                        ))}
                        </PieTyped>
                    <Tooltip
                        contentStyle={chartTooltipStyle}
                        labelStyle={chartLabelStyle}
                        itemStyle={chartItemStyle}
                        formatter={(value: any, name?: any) => [
                            `${value} sessions (${total > 0 ? ((Number(value) / total) * 100).toFixed(0) : 0}%)`,
                            name ?? '',
                        ] as [string, string]}
                        animationDuration={200}
                    />
                    <Legend
                        wrapperStyle={{ fontSize: "12px", color: chartLabelStyle.color, cursor: "pointer" }}
                        iconType="circle"
                        onClick={onLegendClick}
                        formatter={legendFormatter}
                    />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
}
