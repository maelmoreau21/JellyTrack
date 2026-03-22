"use client";

import { useState } from 'react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
} from 'recharts';
import ResponsiveContainer from "./ResponsiveContainerGuard";

interface HourlyMethodData {
    time: string;
    DirectPlay: number;
    Transcode: number;
    DirectStream: number;
}

export function TranscodeHourlyChart({ data }: { data: HourlyMethodData[] }) {
    const [hidden, setHidden] = useState<Set<string>>(new Set());

    const toggleLegend = (e: { dataKey?: string }) => {
        const dataKey = e.dataKey ?? "";
        setHidden(prev => {
            const next = new Set(prev);
            if (next.has(dataKey)) next.delete(dataKey);
            else next.add(dataKey);
            return next;
        });
    };

    return (
        <ResponsiveContainer width="100%" height={300} minHeight={300}>
            <AreaChart data={data} margin={{ top: 20, right: 20, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                <XAxis dataKey="time" stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                    contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px', color: '#f4f4f5' }}
                    labelStyle={{ color: '#a1a1aa' }}
                    itemStyle={{ color: '#e4e4e7' }}
                    formatter={(value: number | string | null | undefined, name?: string) => [`${value} sessions`, name]}
                />
                <Legend onClick={toggleLegend} wrapperStyle={{ fontSize: '12px', paddingTop: '10px', cursor: 'pointer' }} />
                <Area
                    hide={hidden.has("DirectPlay")}
                    type="monotone"
                    dataKey="DirectPlay"
                    stackId="1"
                    stroke="#22c55e"
                    fill="#22c55e"
                    fillOpacity={0.6}
                    name="DirectPlay"
                />
                <Area
                    hide={hidden.has("DirectStream")}
                    type="monotone"
                    dataKey="DirectStream"
                    stackId="1"
                    stroke="#3b82f6"
                    fill="#3b82f6"
                    fillOpacity={0.6}
                    name="DirectStream"
                />
                <Area
                    hide={hidden.has("Transcode")}
                    type="monotone"
                    dataKey="Transcode"
                    stackId="1"
                    stroke="#f97316"
                    fill="#f97316"
                    fillOpacity={0.6}
                    name="Transcode"
                />
            </AreaChart>
        </ResponsiveContainer>
    );
}
