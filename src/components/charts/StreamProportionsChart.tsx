"use client";

import { useTranslations } from "next-intl";
import { PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { useRouter } from "next/navigation";
import ResponsiveContainer from "./ResponsiveContainerGuard";
import { chartItemStyle, chartLabelStyle, chartTooltipStyle } from "@/lib/chartTheme";

const COLORS: Record<string, string> = {
    "DirectPlay": "var(--chart-soft-4)",
    "Transcode": "var(--chart-soft-6)",
    "DirectStream": "var(--chart-soft-5)",
};

const DEFAULT_COLOR = "var(--chart-label-color)";

export function StreamProportionsChart({ data }: { data: { name: string, value: number }[] }) {
    const t = useTranslations('charts');
    const tc = useTranslations('common');
    const router = useRouter();

    const handleSliceClick = (entry: any) => {
        if (entry && entry.name) {
            router.push(`/logs?playMethod=${encodeURIComponent(entry.name)}`);
        }
    };

    const localizedData = data.map(d => {
        const key = d.name.toLowerCase();
        let translated = d.name;
        if (key.includes('directplay')) translated = tc('directPlay');
        else if (key.includes('transcode')) translated = tc('transcode');
        else if (key.includes('directstream')) translated = tc('directStream');
        return { ...d, displayName: translated };
    });

    return (
        <ResponsiveContainer width="100%" height={250} minHeight={250}>
            <PieChart>
                <Pie
                    data={localizedData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    nameKey="displayName"
                    stroke="none"
                    onClick={(_, index) => handleSliceClick(data[index])}
                    style={{ cursor: "pointer" }}
                >
                    {localizedData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[data[index].name] || DEFAULT_COLOR} opacity={0.8} />
                    ))}
                </Pie>
                <Tooltip
                    contentStyle={chartTooltipStyle}
                    labelStyle={chartLabelStyle}
                    itemStyle={chartItemStyle}
                    formatter={(value: any, name: any) => [`${value ?? 0} ${t('sessions')}`, name ?? t('total')] as [string, string]}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
            </PieChart>
        </ResponsiveContainer>
    );
}
