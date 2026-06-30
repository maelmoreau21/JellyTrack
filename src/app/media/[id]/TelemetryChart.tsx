"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import ResponsiveContainer from "../../../components/charts/ResponsiveContainerGuard";
import { chartGridColor, chartItemStyle, chartLabelStyle, chartTooltipStyle } from "@/lib/chartTheme";

interface TelemetryData {
    date: string;
    audioChanges: number;
    subtitleChanges: number;
    pauses: number;
}

export default function TelemetryChart({ data }: { data: TelemetryData[] }) {
    if (data.length === 0) return null;

    return (
        <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                <XAxis dataKey="date" tick={{ fill: 'var(--chart-axis-color)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--chart-axis-color)', fontSize: 12 }} allowDecimals={false} />
                <Tooltip
                    contentStyle={chartTooltipStyle}
                    labelStyle={chartLabelStyle}
                    itemStyle={chartItemStyle}
                />
                <Legend
                    wrapperStyle={{ fontSize: '12px', color: 'var(--chart-label-color)' }}
                />
                <Bar dataKey="pauses" name="Pauses" fill="var(--chart-soft-6)" radius={[2, 2, 0, 0]} stackId="a" />
                <Bar dataKey="audioChanges" name="Changements Audio" fill="var(--chart-soft-2)" radius={[0, 0, 0, 0]} stackId="a" />
                <Bar dataKey="subtitleChanges" name="Changements Sous-titres" fill="var(--chart-soft-1)" radius={[4, 4, 0, 0]} stackId="a" />
            </BarChart>
        </ResponsiveContainer>
    );
}
