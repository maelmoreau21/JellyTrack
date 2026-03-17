import prisma from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { unstable_cache } from "next/cache";
import { format } from "date-fns";
import { StandardAreaChart, StandardBarChart, StandardPieChart } from "@/components/charts/StandardMetricsCharts";
import { StackedBarChart, StackedAreaChart } from "@/components/charts/StackedMetricsCharts";
import { AttendanceHeatmap } from "@/components/charts/AttendanceHeatmap";
import { getTranslations, getLocale } from 'next-intl/server';
import { formatHour } from "@/lib/utils";
import { getCompletionMetrics } from "@/lib/mediaPolicy";
import { loadLibraryRules } from "@/lib/libraryRules";

function isValidLang(lang: string | null | undefined): boolean {
    if (!lang) return false;
    const l = lang.toLowerCase().trim();
    if (l === 'und' || l === 'undefined' || l === 'null' || l === 'none' || l === '' || l === 'unknown') return false;
    // Allow ISO codes (2-3 chars) and common full names (up to 20 chars)
    return l.length >= 2 && l.length <= 20;
}

const getGranularData = unstable_cache(
    async (type: string | undefined, timeRange: string, excludedLibraries: string[], locale: string, libraryRulesJson: string) => {
        const libraryRules = JSON.parse(libraryRulesJson || '{}');
        let currentStartDate = new Date();
        if (timeRange === "24h") currentStartDate.setDate(currentStartDate.getDate() - 1);
        else if (timeRange === "7d") currentStartDate.setDate(currentStartDate.getDate() - 7);
        else if (timeRange === "30d") currentStartDate.setDate(currentStartDate.getDate() - 30);
        else currentStartDate = new Date(0);

        let mediaTypeFilter: any = {};
        if (type === 'movie') mediaTypeFilter = { type: 'Movie' };
        else if (type === 'series') mediaTypeFilter = { type: { in: ['Series', 'Episode'] } };
        else if (type === 'music') mediaTypeFilter = { type: { in: ['Audio', 'Track', 'MusicAlbum'] } };
        else if (type === 'book') mediaTypeFilter = { type: { in: ['Book', 'AudioBook'] } };

        const history = await prisma.playbackHistory.findMany({
            where: {
                startedAt: { gte: currentStartDate },
                media: mediaTypeFilter,
            },
            select: {
                startedAt: true,
                durationWatched: true,
                audioLanguage: true,
                subtitleLanguage: true,
                media: { select: { collectionType: true, type: true, durationMs: true, title: true, jellyfinMediaId: true } }
            },
            orderBy: { startedAt: 'asc' }
        });

        const dailyMap = new Map<string, any>();
        const hourlyMap = new Map<string, any>();
        const collections = new Set<string>();
        const completionMap = new Map<string, { totalCompletion: number, sessions: number }>();
        const mediaDropMap = new Map<string, { title: string, mediaId: string, completion: number, count: number }>();
        const audioMap = new Map<string, number>();
        const subMap = new Map<string, number>();
        let dropSkipped = 0;
        let dropAbandoned = 0;
        let dropAlmost = 0;
        let dropFinished = 0;

        // Heatmap Data (Day of Week vs Hour)
        // Array of 7 days, each having 24 hours
        const heatmapData: any[] = [];
        for (let d = 0; d < 7; d++) {
            for (let h = 0; h < 24; h++) {
                heatmapData.push({ day: d, hour: h, value: 0 });
            }
        }

        history.forEach(h => {
            if (!h.media) return;
            const lib = h.media.collectionType || h.media.type || "?";
            if (excludedLibraries.includes(lib)) return;

            collections.add(lib);
            const date = new Date(h.startedAt);
            const dayKey = format(date, "dd MMM");
            const dayOfWeek = date.getDay(); // 0 (Sun) - 6 (Sat)
            const hour = date.getHours();
            const hourKey = formatHour(hour, locale);
            const durationH = h.durationWatched / 3600;

            // Heatmap aggregation
            const heatIdx = dayOfWeek * 24 + hour;
            if (heatmapData[heatIdx]) {
                heatmapData[heatIdx].value += 1;
            }

            // Daily Aggregation
            if (!dailyMap.has(dayKey)) dailyMap.set(dayKey, { time: dayKey, totalPlays: 0, totalDuration: 0 });
            const dayEntry = dailyMap.get(dayKey);
            dayEntry.totalPlays += 1;
            dayEntry.totalDuration += durationH;
            dayEntry[`${lib}_plays`] = (dayEntry[`${lib}_plays`] || 0) + 1;
            dayEntry[`${lib}_duration`] = (dayEntry[`${lib}_duration`] || 0) + durationH;

            // Hourly Aggregation
            if (!hourlyMap.has(hourKey)) {
                hourlyMap.set(hourKey, { time: hourKey, plays: 0, duration: 0 });
            }
            const hourEntry = hourlyMap.get(hourKey)!;
            hourEntry.plays += 1;
            hourEntry.duration += durationH;

            // Completion Rate Aggregation
            if (h.media.durationMs) {
                const completion = getCompletionMetrics(h.media, h.durationWatched, libraryRules);
                if (!completionMap.has(lib)) {
                    completionMap.set(lib, { totalCompletion: 0, sessions: 0 });
                }
                const compEntry = completionMap.get(lib)!;
                compEntry.totalCompletion += completion.percent;
                compEntry.sessions += 1;

                if (completion.bucket === 'skipped') dropSkipped++;
                else if (completion.bucket === 'abandoned') dropAbandoned++;
                else if (completion.bucket === 'partial') dropAlmost++;
                else dropFinished++;

                if (completion.bucket !== 'completed' && completion.bucket !== 'skipped') {
                    const mKey = h.media.title;
                    if (!mediaDropMap.has(mKey)) mediaDropMap.set(mKey, { title: mKey, mediaId: h.media.jellyfinMediaId || '', completion: 0, count: 0 });
                    const mEntry = mediaDropMap.get(mKey)!;
                    mEntry.completion += completion.percent;
                    mEntry.count++;
                }
            }

            // Languages
            if (h.audioLanguage) {
                // Normalize language strings: strip codec parentheses, commas/slashes, and noise
                let aKey = String(h.audioLanguage).toUpperCase().trim();
                aKey = aKey.replace(/\(.*\)/, '').trim(); // remove '(aac)', etc.
                aKey = aKey.split(/[\/\\,;]/)[0].trim(); // take first token before separators
                aKey = aKey.replace(/[^A-Z0-9\- ]+/g, '').trim();

                // Quick mapping for common 3-letter codes returned by some Jellyfin instances
                const quickMap: Record<string, string> = { 'FRE': 'FR', 'ENG': 'EN', 'SPA': 'ES', 'POR': 'PT', 'DEU': 'DE', 'GER': 'DE', 'ITA': 'IT', 'NLD': 'NL', 'ZHO': 'ZH', 'CHI': 'ZH' };
                if (!isValidLang(aKey) && quickMap[aKey]) aKey = quickMap[aKey];

                if (isValidLang(aKey)) {
                    audioMap.set(aKey, (audioMap.get(aKey) || 0) + 1);
                }
            }

            // For subtitles, we count "None" if null/undefined, otherwise the language
            const sKey = h.subtitleLanguage ? h.subtitleLanguage.toUpperCase() : "OFF";
            subMap.set(sKey, (subMap.get(sKey) || 0) + 1);
        });

        const dailyData = Array.from(dailyMap.values()).map(d => {
            // Round durations
            d.totalDuration = parseFloat(d.totalDuration.toFixed(2));
            Array.from(collections).forEach(c => {
                if (d[`${c}_duration`]) d[`${c}_duration`] = parseFloat(d[`${c}_duration`].toFixed(2));
            });
            return d;
        });

        const hourlyData = Array.from(hourlyMap.values()).map(h => ({
            time: h.time,
            plays: h.plays,
            duration: parseFloat(h.duration.toFixed(2))
        }));

        const dropOffData = Array.from(completionMap.entries()).map(([lib, data]) => ({
            time: lib,
            completion: Math.round(data.totalCompletion / data.sessions)
        })).sort((a, b) => b.completion - a.completion);

        // Finalize Segment Data — 4 clear categories with distinct colors
        const dropSegments = [
            { name: "skipped", value: dropSkipped, fill: "#ef4444" },
            { name: "abandoned", value: dropAbandoned, fill: "#f97316" },
            { name: "almost", value: dropAlmost, fill: "#eab308" },
            { name: "finished", value: dropFinished, fill: "#22c55e" },
        ];

        // Finalize Top 5 Abandonnés — include mediaId for links
        const topAbandoned = Array.from(mediaDropMap.values())
            .filter(m => m.count >= 1) // Lowered from 2 to 1 to show more data
            .map(m => ({
                title: m.title.length > 25 ? m.title.substring(0, 25) + '…' : m.title,
                fullTitle: m.title,
                mediaId: m.mediaId,
                completion: Math.round(m.completion / m.count),
                count: m.count
            }))
            .sort((a, b) => a.completion - b.completion) // Lowest completion first
            .slice(0, 5);

        // Finalize Languages (top 5 max for pies)
        const audioData = Array.from(audioMap.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value).slice(0, 6);

        const subtitleData = Array.from(subMap.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value).slice(0, 6);

        return {
            dailyData, hourlyData, collections: Array.from(collections),
            dropOffData, dropSegments, topAbandoned, audioData, subtitleData,
            heatmapData
        };
    },
    ['JellyTrack-granular-analysis-v3'],
    { revalidate: 300 }
);

export async function GranularAnalysis({ type, timeRange, excludedLibraries }: { type?: string, timeRange: string, excludedLibraries: string[] }) {
    const locale = await getLocale();
    const rules = await loadLibraryRules();
    const data = await getGranularData(type, timeRange, excludedLibraries, locale, JSON.stringify(rules));
    const t = await getTranslations('granular');

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
                <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50 backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle>{t('playsPerDay')}</CardTitle>
                        <CardDescription>{t('playsPerDayDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <StandardBarChart data={data.dailyData} dataKey="totalPlays" fill="#3b82f6" name={t('playsPerDay')} />
                    </CardContent>
                </Card>

                <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50 backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle>{t('playsByLibrary')}</CardTitle>
                        <CardDescription>{t('playsByLibraryDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <StackedBarChart data={data.dailyData} keys={data.collections} suffix="_plays" />
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50 backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle>{t('durationPerDay')}</CardTitle>
                        <CardDescription>{t('durationPerDayDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <StandardAreaChart data={data.dailyData} dataKey="totalDuration" stroke="#a855f7" name={t('durationPerDay')} />
                    </CardContent>
                </Card>

                <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50 backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle>{t('durationByLibrary')}</CardTitle>
                        <CardDescription>{t('durationByLibraryDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <StackedAreaChart data={data.dailyData} keys={data.collections} suffix="_duration" />
                    </CardContent>
                </Card>
            </div>

            <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50 backdrop-blur-sm">
                <CardHeader>
                    <CardTitle>{t('attendanceHeatmap')}</CardTitle>
                    <CardDescription>{t('attendanceHeatmapDesc')}</CardDescription>
                </CardHeader>
                <CardContent>
                    <AttendanceHeatmap data={data.heatmapData} />
                </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
                <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50 backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle>{t('playsHourlyAvg')}</CardTitle>
                        <CardDescription>{t('playsHourlyAvgDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <StandardBarChart data={data.hourlyData} dataKey="plays" fill="#eab308" name={t('playsHourlyAvg')} />
                    </CardContent>
                </Card>

                <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50 backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle>{t('durationHourlyAvg')}</CardTitle>
                        <CardDescription>{t('durationHourlyAvgDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <StandardAreaChart data={data.hourlyData} dataKey="duration" stroke="#22c55e" name={t('durationHourlyAvg')} />
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50 backdrop-blur-sm lg:col-span-1">
                    <CardHeader>
                        <CardTitle>{t('abandonSegments')}</CardTitle>
                        <CardDescription>{t('abandonSegmentsDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {data.dropSegments.map((s: any) => {
                                const total = data.dropSegments.reduce((sum: number, seg: any) => sum + seg.value, 0);
                                const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
                                return (
                                    <div key={s.name} className="space-y-1">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-zinc-300">{t(s.name)}</span>
                                            <span className="text-zinc-400 font-mono">{s.value} ({pct}%)</span>
                                        </div>
                                        <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                                            <div
                                                className="h-full rounded-full transition-all duration-500"
                                                style={{ width: `${pct}%`, backgroundColor: s.fill }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50 backdrop-blur-sm lg:col-span-2">
                    <CardHeader>
                        <CardTitle>{t('avgCompletionByLib')}</CardTitle>
                        <CardDescription>{t('avgCompletionByLibDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <StandardBarChart data={data.dropOffData} dataKey="completion" fill="#8b5cf6" name="% Moyen" />
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50 backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle>{t('worstCompletion')}</CardTitle>
                        <CardDescription>{t('worstCompletionDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {data.topAbandoned.length === 0 ? (
                                <p className="text-sm text-zinc-500 text-center py-6">—</p>
                            ) : data.topAbandoned.map((m: any, i: number) => (
                                <a
                                    key={i}
                                    href={m.mediaId ? `/media/${m.mediaId}` : '#'}
                                    className="block group"
                                >
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-zinc-300 group-hover:text-indigo-400 transition-colors truncate max-w-[180px]" title={m.fullTitle || m.title}>
                                            {m.title}
                                        </span>
                                        <span className="text-zinc-500 font-mono text-xs">{m.completion}% · {m.count}×</span>
                                    </div>
                                    <div className="h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden mt-1">
                                        <div
                                            className="h-full rounded-full transition-all duration-300"
                                            style={{
                                                width: `${m.completion}%`,
                                                backgroundColor: m.completion < 10 ? '#ef4444' : m.completion < 50 ? '#f97316' : '#eab308'
                                            }}
                                        />
                                    </div>
                                </a>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50 backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle>{t('audioBreakdown')}</CardTitle>
                        <CardDescription>{t('audioBreakdownDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px] flex items-center justify-center">
                        <StandardPieChart data={data.audioData} nameKey="name" dataKey="value" />
                    </CardContent>
                </Card>

                <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50 backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle>{t('subtitles')}</CardTitle>
                        <CardDescription>{t('subtitlesDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px] flex items-center justify-center">
                        <StandardPieChart data={data.subtitleData} nameKey="name" dataKey="value" />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
