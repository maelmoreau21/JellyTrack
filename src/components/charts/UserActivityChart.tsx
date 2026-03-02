"use client";

import { useTranslations } from 'next-intl';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";

export type ActivityData = {
    date: string;
    hours: number;
};

export function UserActivityChart({ data }: { data: ActivityData[] }) {
    const t = useTranslations('charts');

    return (
        <ResponsiveContainer width="100%" height={300} minHeight={300}>
            <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                <XAxis
                    dataKey="date"
                    stroke="#52525b"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value, index) => index % 5 === 0 ? value : ''}
                />
                <YAxis
                    stroke="#52525b"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${value}h`}
                />
                <Tooltip
                    contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px', color: '#f4f4f5' }}
                    labelStyle={{ color: '#a1a1aa' }}
                    itemStyle={{ color: '#e4e4e7' }}
                    cursor={{ fill: '#27272a', opacity: 0.4 }}
                />
                <Bar dataKey="hours" fill="#0ea5e9" radius={[4, 4, 0, 0]} name={t('hours')} />
            </BarChart>
        </ResponsiveContainer>
    );
}
