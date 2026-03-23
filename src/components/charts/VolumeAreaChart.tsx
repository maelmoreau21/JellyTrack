"use client";

import { useTranslations } from 'next-intl';
import { Area, AreaChart, Tooltip, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import ResponsiveContainer from "./ResponsiveContainerGuard";
import { chartAxisColor, chartGridColor, chartItemStyle, chartLabelStyle, chartTooltipStyle } from "@/lib/chartTheme";

export type VolumeHourData = {
    name: string;
    Movies: number;
    Series: number;
    Music: number;
    Other: number;
};

export function VolumeAreaChart({ data }: { data: VolumeHourData[] }) {
    const t = useTranslations('charts');

    return (
        <ResponsiveContainer width="100%" height={300} minHeight={300}>
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                    <linearGradient id="colorMovies" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorSeries" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorMusic" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#eab308" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorOther" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartGridColor} />
                <XAxis
                    dataKey="name"
                    stroke={chartAxisColor}
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => value}
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
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />

                <Area type="monotone" dataKey="Other" stackId="1" stroke="#a855f7" fill="url(#colorOther)" name={t('otherBooks')} />
                <Area type="monotone" dataKey="Music" stackId="1" stroke="#eab308" fill="url(#colorMusic)" name={t('music')} />
                <Area type="monotone" dataKey="Series" stackId="1" stroke="#10b981" fill="url(#colorSeries)" name={t('series')} />
                <Area type="monotone" dataKey="Movies" stackId="1" stroke="#3b82f6" fill="url(#colorMovies)" name={t('movies')} />
            </AreaChart>
        </ResponsiveContainer>
    );
}
