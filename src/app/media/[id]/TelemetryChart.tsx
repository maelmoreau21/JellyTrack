"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import ResponsiveContainer from "../../../components/charts/ResponsiveContainerGuard";
import { chartGridColor, chartItemStyle, chartLabelStyle, chartTooltipStyle } from "@/lib/chartTheme";

export interface TelemetryData {
    date: string;
    audioChanges: number;
    subtitleChanges: number;
    pauses: number;
    seeks?: number;
}

export default function TelemetryChart({ data }: { data: TelemetryData[] }) {
    if (data.length === 0) return null;

    return (
        <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} opacity={0.5} />
                <XAxis dataKey="date" tick={{ fill: 'var(--chart-axis-color)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--chart-axis-color)', fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                    contentStyle={chartTooltipStyle}
                    labelStyle={chartLabelStyle}
                    itemStyle={chartItemStyle}
                />
                <Legend
                    wrapperStyle={{ fontSize: '12px', color: 'var(--chart-label-color)', paddingTop: '8px' }}
                />
                <Bar dataKey="pauses" name="Pauses" fill="#eab308" radius={[2, 2, 0, 0]} stackId="a" />
                <Bar dataKey="audioChanges" name="Changements Audio" fill="#a855f7" radius={[0, 0, 0, 0]} stackId="a" />
                <Bar dataKey="subtitleChanges" name="Changements Sous-titres" fill="#06b6d4" radius={[0, 0, 0, 0]} stackId="a" />
                {data.some(d => (d.seeks || 0) > 0) && (
                    <Bar dataKey="seeks" name="Sauts / Relectures" fill="#f97316" radius={[4, 4, 0, 0]} stackId="a" />
                )}
            </BarChart>
        </ResponsiveContainer>
    );
}
