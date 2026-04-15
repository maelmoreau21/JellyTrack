"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StandardAreaChart, StandardBarChart, StandardPieChart } from "@/components/charts/StandardMetricsCharts";
import { StackedBarChart } from "@/components/charts/StackedMetricsCharts";
import { AttendanceHeatmap } from "@/components/charts/AttendanceHeatmap";
import { useRouter } from "next/navigation";

type GranularData = {
    dailyData: Record<string, string | number>[];
    hourlyData: { time: string; plays: number; duration: number }[];
    collections: string[];
    dropOffData: { time: string; completion: number }[];
    dropSegments: { name: string; value: number; fill: string }[];
    topAbandoned: { title: string; fullTitle: string; mediaId: string; completion: number; count: number }[];
    audioData: { name: string; value: number }[];
    subtitleData: { name: string; value: number }[];
    heatmapData: { day: number; hour: number; value: number }[];
};

type GranularAnalysisClientProps = {
    data: GranularData;
    normalizedDailyData: any[];
    normalizedKeys: string[];
    normalizedDropOffData: any[];
    labelMap: Record<string, string>;
    localizedSubtitleData: any[];
    localizedDropSegments: any[];
    translations: {
        playsPerDay: string;
        playsPerDayDesc: string;
        durationPerDay: string;
        durationPerDayDesc: string;
        playsByLibTitle: string;
        playsByLibDesc: string;
        durationByLibTitle: string;
        durationByLibDesc: string;
        playsHourlyAvg: string;
        playsHourlyAvgDesc: string;
        durationHourlyAvg: string;
        durationHourlyAvgDesc: string;
        attendanceHeatmap: string;
        attendanceHeatmapDesc: string;
        avgCompletionByLib: string;
        avgCompletionByLibDesc: string;
        completionPct: string;
        abandonSegments: string;
        abandonSegmentsDesc: string;
        worstCompletion: string;
        worstCompletionDesc: string;
        audioBreakdown: string;
        audioBreakdownDesc: string;
        subtitles: string;
        subtitlesDesc: string;
        noData: string;
    };
};

export function GranularAnalysisClient({
    data,
    normalizedDailyData,
    normalizedKeys,
    normalizedDropOffData,
    labelMap,
    localizedSubtitleData,
    localizedDropSegments,
    translations: t
}: GranularAnalysisClientProps) {
    const router = useRouter();

    const handleLogDrillDown = (params: Record<string, string>) => {
        const qs = new URLSearchParams(params).toString();
        router.push(`/logs?${qs}`);
    };

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
                <Card className="app-surface-soft border-border">
                    <CardHeader>
                        <CardTitle>{t.playsPerDay}</CardTitle>
                        <CardDescription>{t.playsPerDayDesc}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <StandardBarChart 
                            data={data.dailyData} 
                            dataKey="totalPlays" 
                            fill="#3b82f6" 
                            name={t.playsPerDay} 
                            onClick={(d) => handleLogDrillDown({ dateFrom: d.time, dateTo: d.time })}
                        />
                    </CardContent>
                </Card>

                <Card className="app-surface-soft border-border">
                    <CardHeader>
                        <CardTitle>{t.durationPerDay}</CardTitle>
                        <CardDescription>{t.durationPerDayDesc}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <StandardAreaChart 
                            data={data.dailyData} 
                            dataKey="totalDuration" 
                            stroke="#f59e0b" 
                            name={t.durationPerDay} 
                            onClick={(d) => handleLogDrillDown({ dateFrom: d.time, dateTo: d.time })}
                        />
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card className="app-surface-soft border-border">
                    <CardHeader>
                        <CardTitle className="text-xl font-bold">{t.playsByLibTitle}</CardTitle>
                        <CardDescription>{t.playsByLibDesc}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <StackedBarChart 
                            data={normalizedDailyData} 
                            keys={normalizedKeys} 
                            suffix="_plays" 
                            labelMap={labelMap} 
                            onClick={(lib, d) => handleLogDrillDown({ query: lib, dateFrom: d.time, dateTo: d.time })}
                        />
                    </CardContent>
                </Card>

                <Card className="app-surface-soft border-border">
                    <CardHeader>
                        <CardTitle className="text-xl font-bold">{t.durationByLibTitle}</CardTitle>
                        <CardDescription>{t.durationByLibDesc}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <StackedBarChart 
                            data={normalizedDailyData} 
                            keys={normalizedKeys} 
                            suffix="_duration" 
                            labelMap={labelMap} 
                            onClick={(lib, d) => handleLogDrillDown({ query: lib, dateFrom: d.time, dateTo: d.time })}
                        />
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card className="app-surface-soft border-border">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold">{t.playsHourlyAvg}</CardTitle>
                        <CardDescription>{t.playsHourlyAvgDesc}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <StandardBarChart data={data.hourlyData} xAxisKey="time" dataKey="plays" fill="var(--primary)" name={t.playsHourlyAvg} />
                    </CardContent>
                </Card>

                <Card className="app-surface-soft border-border">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold">{t.durationHourlyAvg}</CardTitle>
                        <CardDescription>{t.durationHourlyAvgDesc}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <StandardAreaChart data={data.hourlyData} dataKey="duration" stroke="var(--primary)" name={t.durationHourlyAvg} />
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card className="app-surface-soft border-border">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold">{t.attendanceHeatmap}</CardTitle>
                        <CardDescription>{t.attendanceHeatmapDesc}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex items-center justify-center p-6">
                        <AttendanceHeatmap data={data.heatmapData} />
                    </CardContent>
                </Card>

                <Card className="app-surface-soft border-border flex flex-col">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold">{t.avgCompletionByLib}</CardTitle>
                        <CardDescription>{t.avgCompletionByLibDesc}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1">
                        <StandardBarChart 
                            data={normalizedDropOffData} 
                            horizontal 
                            xAxisKey="time" 
                            dataKey="completion" 
                            fill="var(--primary)" 
                            name={t.completionPct} 
                            onClick={(d) => handleLogDrillDown({ query: d.time })}
                        />
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card className="app-surface-soft border-border">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold">{t.abandonSegments}</CardTitle>
                        <CardDescription>{t.abandonSegmentsDesc}</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px] flex items-center justify-center">
                        <StandardPieChart 
                            data={localizedDropSegments} 
                            nameKey="name" 
                            dataKey="value" 
                            onClick={(d) => handleLogDrillDown({ query: d.name })}
                        />
                    </CardContent>
                </Card>

                <Card className="app-surface-soft border-border">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold">{t.worstCompletion}</CardTitle>
                        <CardDescription>{t.worstCompletionDesc}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {data.topAbandoned.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-6" aria-live="polite">{t.noData}</p>
                            ) : data.topAbandoned.map((m: any, i: number) => (
                                <a
                                    key={i}
                                    href={`/media?q=${encodeURIComponent(m.fullTitle)}`}
                                    className="block group"
                                >
                                    <div className="flex justify-between items-center text-sm mb-1 font-medium">
                                        <div className="truncate pr-2 group-hover:text-primary transition-colors">
                                            <span className="text-muted-foreground w-5 inline-block">{i + 1}.</span>
                                            {m.title}
                                        </div>
                                        <span className="text-muted-foreground font-mono text-xs">{m.completion}% · {m.count}×</span>
                                    </div>
                                    <div className="h-2 bg-muted rounded-full overflow-hidden mt-1">
                                        <div
                                            className="h-full rounded-full transition-all duration-300"
                                            style={{
                                                width: `${m.completion}%`,
                                                backgroundColor: m.completion < 10 ? 'var(--chart-5)' : m.completion < 50 ? 'var(--chart-4)' : 'var(--chart-3)'
                                            }}
                                        />
                                    </div>
                                </a>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card className="app-surface-soft border-border">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold">{t.audioBreakdown}</CardTitle>
                        <CardDescription>{t.audioBreakdownDesc}</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px] flex items-center justify-center">
                        {data.audioData && data.audioData.length > 0 ? (
                            <StandardPieChart 
                                data={data.audioData} 
                                nameKey="name" 
                                dataKey="value" 
                                onClick={(d) => handleLogDrillDown({ audio: d.name })}
                            />
                        ) : (
                            <p className="text-xs text-muted-foreground">{t.noData}</p>
                        )}
                    </CardContent>
                </Card>

                <Card className="app-surface-soft border-border">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold">{t.subtitles}</CardTitle>
                        <CardDescription>{t.subtitlesDesc}</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px] flex items-center justify-center">
                        {localizedSubtitleData && localizedSubtitleData.length > 0 ? (
                            <StandardPieChart 
                                data={localizedSubtitleData} 
                                nameKey="name" 
                                dataKey="value" 
                                onClick={(d) => handleLogDrillDown({ subtitle: d.name })}
                            />
                        ) : (
                            <p className="text-xs text-muted-foreground">{t.noData}</p>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
