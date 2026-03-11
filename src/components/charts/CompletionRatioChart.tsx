"use client";

import { useState } from "react";
import { useTranslations } from 'next-intl';
import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    Tooltip,
    Legend,
    Sector,
} from "recharts";
import { chartItemStyle, chartLabelStyle, chartTooltipStyle } from "@/lib/chartTheme";

export interface CompletionData {
    name: string;
    value: number;
}

interface CompletionRatioChartProps {
    data: CompletionData[];
}

/* Active shape â€” expanded sector with glow + center label */
function renderActiveShape(props: any) {
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
                {value} ({(percent * 100).toFixed(0)}%)
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

    const toggleLegend = (e: any) => {
        const name = e.value;
        setHidden(prev => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else if (next.size < data.length - 1) next.add(name);
            return next;
        });
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
                        Tout afficher
                    </button>
                </div>
            )}
            <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                    <Pie
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
                        {...{
                            activeIndex: activeIndex >= 0 ? activeIndex : undefined,
                            activeShape: renderActiveShape,
                            onMouseEnter: (_: any, index: number) => setActiveIndex(index),
                            onMouseLeave: () => setActiveIndex(-1),
                        } as any}
                    >
                        {filteredData.map((entry, index) => (
                            <Cell
                                key={`cell-${index}`}
                                fill={COLORS[entry.name] || "#71717a"}
                                style={{ cursor: "pointer" }}
                            />
                        ))}
                    </Pie>
                    <Tooltip
                        contentStyle={chartTooltipStyle}
                        labelStyle={chartLabelStyle}
                        itemStyle={chartItemStyle}
                        formatter={(value: any, name: any) => [
                            `${value} sessions (${total > 0 ? ((value / total) * 100).toFixed(0) : 0}%)`,
                            name,
                        ]}
                        animationDuration={200}
                    />
                    <Legend
                        wrapperStyle={{ fontSize: "12px", color: "#a1a1aa", cursor: "pointer" }}
                        iconType="circle"
                        onClick={toggleLegend}
                        formatter={legendFormatter}
                    />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
}
