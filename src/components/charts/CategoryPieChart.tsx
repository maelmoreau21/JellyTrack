"use client";

import { useTranslations } from 'next-intl';
import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import ResponsiveContainer from "./ResponsiveContainerGuard";
import { chartItemStyle, chartLabelStyle, chartPalette, chartTooltipStyle } from '@/lib/chartTheme';

interface CategoryData {
    name: string;
    value: number; // in hours
}

const COLORS = chartPalette;

export function CategoryPieChart({ data }: { data: CategoryData[] }) {
    const t = useTranslations('charts');

    const formatTooltipValue = (value: any, name?: any) => {
        return [`${Number(value).toFixed(1)}h`, t('playbackVolume')];
    };

    return (
        <ResponsiveContainer width="100%" height={300} minHeight={300}>
            <PieChart>
                <Pie
                    data={data}
                    cx="50%"
                    cy="45%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                >
                    {data.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                </Pie>
                <Tooltip
                    contentStyle={chartTooltipStyle}
                    labelStyle={chartLabelStyle}
                    itemStyle={chartItemStyle}
                    formatter={formatTooltipValue as any}
                />
                <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '12px' }} />
            </PieChart>
        </ResponsiveContainer>
    );
}
