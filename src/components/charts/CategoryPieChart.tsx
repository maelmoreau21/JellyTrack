"use client";

import { useTranslations } from 'next-intl';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';

interface CategoryData {
    name: string;
    value: number; // in hours
}

const COLORS = ['#3b82f6', '#22c55e', '#eab308', '#a855f7', '#64748b'];

export function CategoryPieChart({ data }: { data: CategoryData[] }) {
    const t = useTranslations('charts');

    const formatTooltipValue = (value: any) => {
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
                    contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px', color: '#f4f4f5' }}
                    labelStyle={{ color: '#a1a1aa' }}
                    itemStyle={{ color: '#e4e4e7' }}
                    formatter={formatTooltipValue}
                />
                <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '12px' }} />
            </PieChart>
        </ResponsiveContainer>
    );
}
