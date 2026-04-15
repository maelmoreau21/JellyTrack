"use client";

import { useTranslations } from 'next-intl';
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, LabelList, ReferenceLine } from "recharts";
import ResponsiveContainer from "../../../components/charts/ResponsiveContainerGuard";

interface DropoffData {
    range: string;
    count: number;
    label?: string;
}

interface DropoffMarker {
    key: string;
    percent: number;
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

const MARKER_META: Record<string, { color: string; labelKey: string }> = {
    introStart: { color: "#38bdf8", labelKey: "markerIntroStart" },
    introEnd: { color: "#0ea5e9", labelKey: "markerIntroEnd" },
    creditsStart: { color: "#f97316", labelKey: "markerCreditsStart" },
};

export default function MediaDropoffChart({ data, markers = [] }: { data: DropoffData[]; markers?: DropoffMarker[] }) {
    const t = useTranslations('mediaProfile');
    const totalSessions = data.reduce((sum, d) => sum + d.count, 0);

    const enrichedData = data.map((d, i) => ({
        ...d,
        label: BUCKET_KEYS[i] ? t(BUCKET_KEYS[i]) : d.range,
        pct: totalSessions > 0 ? Math.round((d.count / totalSessions) * 100) : 0,
    }));

    const markerLines = markers
        .map((marker) => {
            const safePercent = Math.max(0, Math.min(100, Number(marker.percent) || 0));
            const bucketIndex = Math.min(Math.floor(safePercent / 10), Math.max(enrichedData.length - 1, 0));
            const meta = MARKER_META[marker.key] || { color: "#a1a1aa", labelKey: "markerCustom" };
            return {
                ...marker,
                safePercent,
                bucketLabel: enrichedData[bucketIndex]?.label,
                color: meta.color,
                label: t(meta.labelKey),
            };
        })
        .filter((marker) => Boolean(marker.bucketLabel));

    return (
        <div className="relative h-full w-full">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={enrichedData} margin={{ top: 26, right: 20, bottom: 5, left: 0 }}>
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
                        formatter={(value: number, _name: string, props?: { payload?: { pct?: number; range?: string } }) => [
                            `${value} session${value > 1 ? 's' : ''} (${props?.payload?.pct ?? 0}%)`,
                            t('stoppedAt', { range: props?.payload?.range ?? '' })
                        ]}
                    />
                    {markerLines.map((marker) => (
                        <ReferenceLine
                            key={`${marker.key}-${marker.bucketLabel}`}
                            x={marker.bucketLabel}
                            stroke={marker.color}
                            strokeWidth={1.5}
                            strokeDasharray="4 4"
                            ifOverflow="extendDomain"
                        />
                    ))}
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        <LabelList
                            dataKey="pct"
                            position="top"
                            formatter={(v?: number) => (v && v > 0 ? `${v}%` : '')}
                            style={{ fill: '#a1a1aa', fontSize: 10 }}
                        />
                        {enrichedData.map((_, index) => {
                            // Gradient: red (early stop) to green (completed)
                            const ratio = index / Math.max(enrichedData.length - 1, 1);
                            const r = Math.round(239 + (34 - 239) * ratio);
                            const g = Math.round(68 + (197 - 68) * ratio);
                            const b = Math.round(68 + (94 - 68) * ratio);
                            return <Cell key={index} fill={`rgb(${r},${g},${b})`} />;
                        })}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>

            {markerLines.length > 0 && (
                <div className="absolute right-2 top-2 flex flex-col gap-1 pointer-events-none">
                    {markerLines.map((marker) => (
                        <div
                            key={`legend-${marker.key}`}
                            className="inline-flex items-center gap-2 rounded-md border border-zinc-700/60 bg-zinc-950/80 px-2 py-1 text-[10px] text-zinc-100"
                        >
                            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: marker.color }} />
                            <span>{marker.label}</span>
                            <span className="text-zinc-400">{Math.round(marker.safePercent)}%</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
