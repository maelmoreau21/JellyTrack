"use client";

import { useTranslations } from 'next-intl';
import { Bar, BarChart, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import ResponsiveContainer from "./ResponsiveContainerGuard";
import { chartAxisColor, chartGridColor, chartItemStyle, chartLabelStyle, chartTooltipStyle } from "@/lib/chartTheme";

export type ActivityData = {
    date: string;
    hours: number;
};

export function UserActivityChart({ data }: { data: ActivityData[] }) {
    const t = useTranslations('charts');

    return (
        <ResponsiveContainer width="100%" height={300} minHeight={300}>
            <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartGridColor} />
                <XAxis
                    dataKey="date"
                    stroke={chartAxisColor}
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value, index) => index % 5 === 0 ? value : ''}
                />
                <YAxis
                    stroke={chartAxisColor}
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${value}h`}
                />
                <Tooltip
                    contentStyle={chartTooltipStyle}
                    labelStyle={chartLabelStyle}
                    itemStyle={chartItemStyle}
                    cursor={{ fill: 'var(--chart-grid-color)', opacity: 0.4 }}
                />
                <Bar dataKey="hours" fill="#0ea5e9" radius={[4, 4, 0, 0]} name={t('hours')} />
            </BarChart>
        </ResponsiveContainer>
    );
}
