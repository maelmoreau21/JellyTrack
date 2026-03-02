"use client";

import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell
} from "recharts";

export interface DayOfWeekData {
    day: string;
    count: number;
}

interface DayOfWeekChartProps {
    data: DayOfWeekData[];
}

export function DayOfWeekChart({ data }: DayOfWeekChartProps) {
    const maxCount = Math.max(...data.map(d => d.count), 0);

    return (
        <ResponsiveContainer width="100%" height={300} minHeight={300}>
            <BarChart
                data={data}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
                <XAxis
                    dataKey="day"
                    stroke="#888888"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                />
                <YAxis
                    stroke="#888888"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                />
                <Tooltip
                    contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px", color: "#f4f4f5" }}
                    labelStyle={{ color: "#a1a1aa" }}
                    itemStyle={{ color: "#e4e4e7" }}
                    cursor={{ fill: '#27272a' }}
                    formatter={(value: number) => [value, "Sessions"]}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {data.map((entry, index) => (
                        <Cell
                            key={`cell-${index}`}
                            fill={entry.count === maxCount && maxCount > 0 ? "#f97316" : "#10b981"}
                            className="transition-all duration-300"
                        />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}
