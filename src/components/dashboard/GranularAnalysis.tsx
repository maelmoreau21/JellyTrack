import prisma from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { unstable_cache } from "next/cache";
import { format } from "date-fns";
import { StandardAreaChart, StandardBarChart, StandardPieChart } from "@/components/charts/StandardMetricsCharts";
import { StackedBarChart, StackedAreaChart } from "@/components/charts/StackedMetricsCharts";
import { AttendanceHeatmap } from "@/components/charts/AttendanceHeatmap";
import { getTranslations, getLocale } from 'next-intl/server';
import { normalizeLibraryKey, getAvailableLibraryKeys } from '@/lib/mediaPolicy';
import { normalizeLanguageTag } from '@/lib/language';
import { formatHour } from "@/lib/utils";
import { getCompletionMetrics } from "@/lib/mediaPolicy";
// No more library rules

function isValidLang(lang: string | null | undefined): boolean {
    if (!lang) return false;
    const l = lang.toLowerCase().trim();
    if (l === 'und' || l === 'undefined' || l === 'null' || l === 'none' || l === '' || l === 'unknown') return false;
    // Allow ISO codes (2-3 chars) and common full names (up to 20 chars)
    return l.length >= 2 && l.length <= 20;
}

const getGranularData = unstable_cache(
    async (type: string | undefined, timeRange: string, excludedLibraries: string[], locale: string) => {
        // Use defaults
        let currentStartDate = new Date();
        if (timeRange === "24h") currentStartDate.setDate(currentStartDate.getDate() - 1);
        else if (timeRange === "7d") currentStartDate.setDate(currentStartDate.getDate() - 7);
        else if (timeRange === "30d") currentStartDate.setDate(currentStartDate.getDate() - 30);
        else currentStartDate = new Date(0);

        let mediaTypeFilter: Record<string, unknown> = {};
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
        const hourlyMap = new Map<string, { time: string; plays: number; duration: number }>();
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
        const heatmapData: { day: number; hour: number; value: number }[] = [];
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
            if (hourEntry) {
                hourEntry.plays += 1;
                hourEntry.duration += durationH;
            }

            // Completion Rate Aggregation
            if (h.media.durationMs) {
                const completion = getCompletionMetrics(h.media, h.durationWatched);
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
                const lang = normalizeLanguageTag(h.audioLanguage);
                if (lang) {
                    audioMap.set(lang, (audioMap.get(lang) || 0) + 1);
                }
            }

            // For subtitles, count disabled as OFF; otherwise normalize language token
            const sNorm = h.subtitleLanguage ? (normalizeLanguageTag(h.subtitleLanguage) || String(h.subtitleLanguage).toUpperCase()) : 'OFF';
            subMap.set(sNorm, (subMap.get(sNorm) || 0) + 1);
        });

        const dailyData = Array.from(dailyMap.values()).map(d => {
            // Round durations
            d.totalDuration = parseFloat(Number(d.totalDuration).toFixed(2));
            Array.from(collections).forEach(c => {
                if (d[`${c}_duration`]) d[`${c}_duration`] = parseFloat(Number(d[`${c}_duration`]).toFixed(2));
            });
            return d;
        });

        const hourlyData = Array.from(hourlyMap.values()).map(h => ({
            time: h.time,
            plays: h?.plays || 0,
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
    // const rules = await loadLibraryRules();
    const data = await getGranularData(type, timeRange, excludedLibraries, locale);
    const t = await getTranslations('granular');
    const tc = await getTranslations('common');

    // Normalize library keys and prepare localized labels for charts
    const rawCollections: string[] = Array.isArray(data.collections) ? data.collections : [];
    const rawToNorm = new Map<string, string>();
    rawCollections.forEach((raw) => {
        const norm = normalizeLibraryKey(raw) || String(raw || 'unknown');
        rawToNorm.set(raw, norm);
    });

    const normalizedDailyData = (data.dailyData || []).map((d: Record<string, unknown>) => {
        const out: Record<string, any> = { ...d };
        for (const [raw, norm] of rawToNorm.entries()) {
            const rawPlays = `${raw}_plays`;
            const rawDur = `${raw}_duration`;
            const normPlays = `${norm}_plays`;
            const normDur = `${norm}_duration`;
            if (Object.prototype.hasOwnProperty.call(out, rawPlays)) {
                out[normPlays] = (out[normPlays] || 0) + (out[rawPlays] || 0);
                delete out[rawPlays];
            }
            if (Object.prototype.hasOwnProperty.call(out, rawDur)) {
                out[normDur] = (out[normDur] || 0) + (out[rawDur] || 0);
                delete out[rawDur];
            }
        }
        return out;
    });

    const normalizedDropOffData = (data.dropOffData || []).map((d: { time: string; completion: number }) => ({ time: rawToNorm.get(d.time) || d.time, completion: d.completion }));

    const normalizedKeys = getAvailableLibraryKeys(Array.from(rawToNorm.values()));
    const labelMap: Record<string, string> = {};

    // Build reverse map: normalized key -> original raw library names
    const normToRaw = new Map<string, string[]>();
    for (const [raw, norm] of rawToNorm.entries()) {
        if (!normToRaw.has(norm)) normToRaw.set(norm, []);
        normToRaw.get(norm)!.push(raw);
    }

    function humanizeLibraryName(value: string) {
        if (!value) return value;
        let s = String(value);
        // replace separators, split camelCase and trim
        s = s.replace(/[_-]+/g, ' ');
        s = s.replace(/([a-z])([A-Z])/g, '$1 $2');
        s = s.trim();
        // Capitalize words
        s = s.split(' ').map(w => w ? (w[0].toUpperCase() + w.slice(1)) : w).join(' ');
        return s;
    }

    normalizedKeys.forEach(k => {
        let label = '';
        try {
            const translated = tc(k);
            // Prefer a real translation when available (and not just the key)
            if (translated && translated !== k && !translated.includes('.')) {
                label = translated;
            }
        } catch (e) {
            // ignore and fallback below
        }

        if (!label) {
            const raws = normToRaw.get(k) || [];
            if (raws.length > 0) {
                label = humanizeLibraryName(raws[0]);
            } else {
                label = humanizeLibraryName(k);
            }
        }

        labelMap[k] = label;
    });
    const tDashboard = await getTranslations('dashboard');

    // Localize subtitle names (e.g. OFF -> Disabled) using the granular scope
    const localizedSubtitleData = (data.subtitleData || []).map((d: { name?: string; value?: number }) => {
        const name = String(d.name || '').toUpperCase();
        if (name === 'OFF' || name === 'NONE' || name === 'UNKNOWN') return { ...d, name: t('disabled') };
        return d;
    });

    // Localize drop segments (data.dropSegments contains bucket keys)
    const localizedDropSegments = (data.dropSegments || []).map((s: { name?: string; value?: number; fill?: string }) => {
        const key = String(s.name || '').toLowerCase();
        switch (key) {
            case 'skipped': return { ...s, name: t('skipped') };
            case 'abandoned': return { ...s, name: t('abandoned') };
            case 'almost': return { ...s, name: t('almost') };
            case 'finished': return { ...s, name: t('finished') };
            default: return s;
        }
    });

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
                        <StackedBarChart data={normalizedDailyData} keys={normalizedKeys} suffix="_plays" labelMap={labelMap} />
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
                        <StandardAreaChart data={data.dailyData} dataKey="totalDuration" stroke="#f59e0b" name={t('durationPerDay')} />
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-1">
                <Card className="app-surface-soft border-border">
                    <CardHeader>
                        <CardTitle className="text-xl font-bold">{t('playsByLibTitle')}</CardTitle>
                        <CardDescription>{t('playsByLibDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <StackedBarChart data={normalizedDailyData} keys={normalizedKeys} suffix="_plays" labelMap={labelMap} />
                    </CardContent>
                </Card>

                <Card className="app-surface-soft border-border">
                    <CardHeader>
                        <CardTitle className="text-xl font-bold">{t('durationByLibTitle')}</CardTitle>
                        <CardDescription>{t('durationByLibDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <StackedBarChart data={normalizedDailyData} keys={normalizedKeys} suffix="_duration" labelMap={labelMap} />
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card className="app-surface-soft border-border">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold">{t('playsHourlyAvg')}</CardTitle>
                        <CardDescription>{t('playsHourlyAvgDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <StandardBarChart data={data.hourlyData} xAxisKey="time" dataKey="plays" fill="var(--primary)" name={t('playsHourlyAvg')} />
                    </CardContent>
                </Card>

                <Card className="app-surface-soft border-border">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold">{t('durationHourlyAvg')}</CardTitle>
                        <CardDescription>{t('durationHourlyAvgDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <StandardAreaChart data={data.hourlyData} dataKey="duration" stroke="var(--primary)" name={t('durationHourlyAvg')} />
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card className="app-surface-soft border-border">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold">{t('attendanceHeatmap')}</CardTitle>
                        <CardDescription>{t('attendanceHeatmapDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex items-center justify-center p-6">
                        <AttendanceHeatmap data={data.heatmapData} />
                    </CardContent>
                </Card>

                <Card className="app-surface-soft border-border flex flex-col">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold">{t('avgCompletionByLib')}</CardTitle>
                        <CardDescription>{t('avgCompletionByLibDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1">
                        <StandardBarChart data={normalizedDropOffData} horizontal xAxisKey="time" dataKey="completion" fill="var(--primary)" name={t('completionPct')} />
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card className="app-surface-soft border-border">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold">{t('abandonSegments')}</CardTitle>
                        <CardDescription>{t('abandonSegmentsDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px] flex items-center justify-center">
                        <StandardPieChart data={localizedDropSegments} nameKey="name" dataKey="value" />
                    </CardContent>
                </Card>

                <Card className="app-surface-soft border-border">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold">{t('worstCompletion')}</CardTitle>
                        <CardDescription>{t('worstCompletionDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {data.topAbandoned.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-6">—</p>
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
                        <CardTitle className="text-lg font-bold">{t('audioBreakdown')}</CardTitle>
                        <CardDescription>{t('audioBreakdownDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px] flex items-center justify-center">
                        {data.audioData && data.audioData.length > 0 ? (
                            <StandardPieChart data={data.audioData} nameKey="name" dataKey="value" />
                        ) : (
                            <p className="text-xs text-muted-foreground">{tc('noData')}</p>
                        )}
                    </CardContent>
                </Card>

                <Card className="app-surface-soft border-border">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold">{t('subtitles')}</CardTitle>
                        <CardDescription>{t('subtitlesDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px] flex items-center justify-center">
                        {localizedSubtitleData && localizedSubtitleData.length > 0 ? (
                            <StandardPieChart data={localizedSubtitleData} nameKey="name" dataKey="value" />
                        ) : (
                            <p className="text-xs text-muted-foreground">{tc('noData')}</p>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
