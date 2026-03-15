"use client";

import React, { useMemo } from 'react';
import {
    ScatterChart,
    Scatter,
    XAxis,
    YAxis,
    ZAxis,
    Tooltip,
    ResponsiveContainer,
    Cell
} from 'recharts';
import { useTranslations } from 'next-intl';

interface HeatmapCell {
    day: number;
    hour: number;
    value: number;
}

interface AttendanceHeatmapProps {
    data: HeatmapCell[];
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function AttendanceHeatmap({ data }: AttendanceHeatmapProps) {
    const t = useTranslations('charts');
    const dayNames = t('dayNamesShort').split(',');

    const maxVal = useMemo(() => Math.max(...data.map(d => d.value), 1), [data]);

    const getColor = (value: number) => {
        if (value === 0) return 'transparent';
        const opacity = Math.max(0.1, value / maxVal);
        return `rgba(99, 102, 241, ${opacity})`; // Indigo-500 equivalent
    };

    const formatTooltip = (value: any, name: string | undefined, props: any) => {
        const { payload } = props;
        return [
            `${payload.value} ${t('sessions')}`,
            `${dayNames[payload.day]} @ ${payload.hour}h`
        ];
    };

    return (
        <div className="w-full h-[350px] mt-4">
            <ResponsiveContainer width="100%" height="100%">
                <ScatterChart
                    margin={{ top: 20, right: 20, bottom: 20, left: 40 }}
                >
                    <XAxis
                        type="number"
                        dataKey="hour"
                        name="Hour"
                        domain={[0, 23]}
                        tickCount={24}
                        interval={0}
                        tick={{ fontSize: 10, fill: '#71717a' }}
                        axisLine={false}
                        tickLine={false}
                        unit="h"
                    />
                    <YAxis
                        type="number"
                        dataKey="day"
                        name="Day"
                        domain={[0, 6]}
                        tickCount={7}
                        interval={0}
                        tickFormatter={(val) => dayNames[val] || ''}
                        tick={{ fontSize: 10, fill: '#71717a' }}
                        axisLine={false}
                        tickLine={false}
                        reversed
                    />
                    <ZAxis type="number" dataKey="value" range={[50, 400]} />
                    <Tooltip
                        cursor={{ strokeDasharray: '3 3' }}
                        contentStyle={{
                            backgroundColor: '#18181b',
                            border: '1px solid #27272a',
                            borderRadius: '8px',
                            color: '#f4f4f5',
                            fontSize: '12px'
                        }}
                        formatter={formatTooltip}
                    />
                    <Scatter data={data} shape="square">
                        {data.map((entry, index) => (
                            <Cell 
                                key={`cell-${index}`} 
                                fill={getColor(entry.value)} 
                                stroke={entry.value > 0 ? 'rgba(99, 102, 241, 0.2)' : 'transparent'}
                            />
                        ))}
                    </Scatter>
                </ScatterChart>
            </ResponsiveContainer>
        </div>
    );
}
