"use client";

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import ResponsiveContainer from "./ResponsiveContainerGuard";
import { chartItemStyle, chartLabelStyle, chartPalette, chartTooltipStyle } from '@/lib/chartTheme';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';

interface CategoryData {
    name: string;
    rawName?: string;
    value: number; // in hours
}

const COLORS = chartPalette;

export function CategoryPieChart({ data }: { data: CategoryData[] }) {
    const t = useTranslations('charts');
    const router = useRouter();

    const formatTooltipValue = (value?: ValueType, name?: NameType) => {
        const n = Number(value ?? 0);
        return [`${n.toFixed(1)}h`, t('playbackVolume')] as [string, string];
    };

    const handleSliceClick = (payload: any) => {
        const rName = payload.rawName || payload.name;
        // Map common dashboard categories to log filters
        const typeMapping: Record<string, string> = {
            'movies': 'Movie',
            'series': 'Episode',
            'music': 'Audio',
            'books': 'AudioBook'
        };
        const logType = typeMapping[rName] || rName;
        router.push(`/logs?type=${logType}`);
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
                    onClick={handleSliceClick}
                >
                    {data.map((entry, index) => (
                        <Cell 
                            key={`cell-${index}`} 
                            fill={COLORS[index % COLORS.length]} 
                            style={{ cursor: 'pointer' }}
                        />
                    ))}
                </Pie>
                <Tooltip
                    contentStyle={chartTooltipStyle}
                    labelStyle={chartLabelStyle}
                    itemStyle={chartItemStyle}
                    formatter={formatTooltipValue}
                />
                <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '12px', cursor: 'pointer' }} />
            </PieChart>
        </ResponsiveContainer>
    );
}
