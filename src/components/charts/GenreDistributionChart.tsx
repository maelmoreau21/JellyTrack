"use client";

import { useTranslations } from 'next-intl';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Cell
} from "recharts";
import { useRouter } from "next/navigation";
import ResponsiveContainer from "./ResponsiveContainerGuard";
import { chartAxisColor, chartGridColor, chartItemStyle, chartLabelStyle, chartPalette, chartTooltipStyle } from "@/lib/chartTheme";

export interface GenreData {
    name: string;
    count: number;
}

interface GenreDistributionChartProps {
    data: GenreData[];
}

const COLORS = chartPalette;

export function GenreDistributionChart({ data }: GenreDistributionChartProps) {
    const t = useTranslations('charts');
    const router = useRouter();

    if (!data || data.length === 0) {
        return (
            <div className="flex h-[300px] w-full items-center justify-center text-sm text-muted-foreground">
                {t('noGenreData')}
            </div>
        );
    }

    const handleBarClick = (data: any) => {
        if (data && data.name) {
            router.push(`/media/all?genre=${encodeURIComponent(data.name)}`);
        }
    };

    return (
        <ResponsiveContainer width="100%" height={300} minHeight={300}>
            <BarChart
                data={data}
                layout="vertical"
                margin={{ top: 0, right: 30, left: 40, bottom: 0 }}
                onClick={handleBarClick}
                style={{ cursor: "pointer" }}
            >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={chartGridColor} />
                <XAxis type="number" stroke={chartAxisColor} fontSize={10} tickLine={false} axisLine={false} />
                <YAxis
                    dataKey="name"
                    type="category"
                    stroke={chartAxisColor}
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                />
                <Tooltip
                    contentStyle={chartTooltipStyle}
                    labelStyle={chartLabelStyle}
                    itemStyle={chartItemStyle}
                    cursor={{ fill: 'rgba(34, 211, 238, 0.08)' }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
                    {data.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}
