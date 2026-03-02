"use client";

import { useTranslations } from 'next-intl';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, LabelList } from "recharts";

interface DropoffData {
    range: string;
    count: number;
    label?: string;
}

const BUCKET_KEYS = [
    "dropoff0", // 0-10%
    "dropoff1", // 10-20%
    "dropoff2", // 20-30%
    "dropoff3", // 30-40%
    "dropoff4", // 40-50%
    "dropoff5", // 50-60%
    "dropoff6", // 60-70%
    "dropoff7", // 70-80%
    "dropoff8", // 80-90%
    "dropoff9", // 90-100%
];

export default function MediaDropoffChart({ data }: { data: DropoffData[] }) {
    const t = useTranslations('mediaProfile');
    const totalSessions = data.reduce((sum, d) => sum + d.count, 0);

    const enrichedData = data.map((d, i) => ({
        ...d,
        label: BUCKET_KEYS[i] ? t(BUCKET_KEYS[i] as any) : d.range,
        pct: totalSessions > 0 ? Math.round((d.count / totalSessions) * 100) : 0,
    }));

    return (
        <ResponsiveContainer width="100%" height="100%">
            <BarChart data={enrichedData} margin={{ top: 20, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis
                    dataKey="label"
                    tick={{ fill: '#a1a1aa', fontSize: 10 }}
                    angle={-30}
                    textAnchor="end"
                    height={60}
                />
                <YAxis tick={{ fill: '#a1a1aa', fontSize: 12 }} allowDecimals={false} />
                <Tooltip
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px', color: '#f4f4f5' }}
                    labelStyle={{ color: '#e4e4e7' }}
                    itemStyle={{ color: '#e4e4e7' }}
                    formatter={(value: any, name: any, props: any) => [
                        `${value} session${value > 1 ? 's' : ''} (${props.payload.pct}%)`,
                        t('stoppedAt', { range: props.payload.range })
                    ]}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    <LabelList
                        dataKey="pct"
                        position="top"
                        formatter={(v: number) => v > 0 ? `${v}%` : ''}
                        style={{ fill: '#a1a1aa', fontSize: 10 }}
                    />
                    {enrichedData.map((_, index) => {
                        // Gradient: rouge (arrêt tôt) → vert (terminé)
                        const ratio = index / Math.max(enrichedData.length - 1, 1);
                        const r = Math.round(239 + (34 - 239) * ratio);
                        const g = Math.round(68 + (197 - 68) * ratio);
                        const b = Math.round(68 + (94 - 68) * ratio);
                        return <Cell key={index} fill={`rgb(${r},${g},${b})`} />;
                    })}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}
