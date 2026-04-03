import prisma from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { unstable_cache } from "next/cache";
import { format } from "date-fns";
import { getTranslations, getLocale } from 'next-intl/server';
import { buildExcludedMediaClause, getAvailableLibraryKeys, getCompletionMetrics, normalizeLibraryKey } from '@/lib/mediaPolicy';
import { normalizeLanguageTag } from '@/lib/language';
import { formatHour } from "@/lib/utils";
import { GranularAnalysisClient } from "./GranularAnalysisClient";

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

const getGranularData = unstable_cache(
    async (type: string | undefined, timeRange: string, excludedLibraries: string[], locale: string, selectedServerIds: string[] = []) => {
        // Use defaults
        let currentStartDate = new Date();
        if (timeRange === "24h") currentStartDate.setDate(currentStartDate.getDate() - 1);
        else if (timeRange === "7d") currentStartDate.setDate(currentStartDate.getDate() - 7);
        else if (timeRange === "30d") currentStartDate.setDate(currentStartDate.getDate() - 30);
        else currentStartDate = new Date(0);

        const selectedServerScope = selectedServerIds.length > 0 ? { in: selectedServerIds } : undefined;

        const mediaAnd: Array<Record<string, unknown>> = [];
        if (type === 'movie') mediaAnd.push({ type: 'Movie' });
        else if (type === 'series') mediaAnd.push({ type: { in: ['Series', 'Episode'] } });
        else if (type === 'music') mediaAnd.push({ type: { in: ['Audio', 'Track', 'MusicAlbum'] } });
        else if (type === 'book') mediaAnd.push({ type: { in: ['Book', 'AudioBook'] } });

        const excludedClause = buildExcludedMediaClause(excludedLibraries);
        if (excludedClause) mediaAnd.push(excludedClause);

        const mediaWhere = mediaAnd.length > 0 ? { AND: mediaAnd } : undefined;

        const history = await prisma.playbackHistory.findMany({
            where: {
                startedAt: { gte: currentStartDate },
                ...(mediaWhere ? { media: mediaWhere } : {}),
                ...(selectedServerScope ? { serverId: selectedServerScope } : {}),
            },
            select: {
                startedAt: true,
                durationWatched: true,
                audioLanguage: true,
                subtitleLanguage: true,
                media: { select: { libraryName: true, collectionType: true, type: true, durationMs: true, title: true, jellyfinMediaId: true } }
            },
            orderBy: { startedAt: 'asc' }
        });

        const dailyMap = new Map<string, Record<string, string | number>>();
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

        const heatmapData: { day: number; hour: number; value: number }[] = [];
        for (let d = 0; d < 7; d++) {
            for (let h = 0; h < 24; h++) {
                heatmapData.push({ day: d, hour: h, value: 0 });
            }
        }

        history.forEach(h => {
            if (!h.media) return;
            const lib = h.media.libraryName || h.media.collectionType || h.media.type || "?";

            collections.add(lib);
            const date = new Date(h.startedAt);
            const dayKey = format(date, "dd MMM");
            const dayOfWeek = date.getDay(); // 0 (Sun) - 6 (Sat)
            const hour = date.getHours();
            const hourKey = formatHour(hour, locale);
            const durationH = h.durationWatched / 3600;

            const heatIdx = dayOfWeek * 24 + hour;
            if (heatmapData[heatIdx]) {
                heatmapData[heatIdx].value += 1;
            }

            if (!dailyMap.has(dayKey)) dailyMap.set(dayKey, { time: dayKey, totalPlays: 0, totalDuration: 0 });
            const dayEntry = dailyMap.get(dayKey)!;
            dayEntry.totalPlays = (Number(dayEntry.totalPlays) || 0) + 1;
            dayEntry.totalDuration = (Number(dayEntry.totalDuration) || 0) + durationH;
            dayEntry[`${lib}_plays`] = (Number(dayEntry[`${lib}_plays`]) || 0) + 1;
            dayEntry[`${lib}_duration`] = (Number(dayEntry[`${lib}_duration`]) || 0) + durationH;

            if (!hourlyMap.has(hourKey)) {
                hourlyMap.set(hourKey, { time: hourKey, plays: 0, duration: 0 });
            }
            const hourEntry = hourlyMap.get(hourKey)!;
            if (hourEntry) {
                hourEntry.plays += 1;
                hourEntry.duration += durationH;
            }

            if (h.media.durationMs) {
                const completion = getCompletionMetrics(h.media as any, h.durationWatched);
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

            if (h.audioLanguage) {
                const lang = normalizeLanguageTag(h.audioLanguage);
                if (lang) {
                    audioMap.set(lang, (audioMap.get(lang) || 0) + 1);
                }
            }

            const sNorm = h.subtitleLanguage ? (normalizeLanguageTag(h.subtitleLanguage) || String(h.subtitleLanguage).toUpperCase()) : 'OFF';
            subMap.set(sNorm, (subMap.get(sNorm) || 0) + 1);
        });

        const dailyData = Array.from(dailyMap.values()).map(d => {
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

        const dropSegments = [
            { name: "skipped", value: dropSkipped, fill: "#ef4444" },
            { name: "abandoned", value: dropAbandoned, fill: "#f97316" },
            { name: "almost", value: dropAlmost, fill: "#eab308" },
            { name: "finished", value: dropFinished, fill: "#22c55e" },
        ];

        const topAbandoned = Array.from(mediaDropMap.values())
            .filter(m => m.count >= 1)
            .map(m => ({
                title: m.title.length > 25 ? m.title.substring(0, 25) + '…' : m.title,
                fullTitle: m.title,
                mediaId: m.mediaId,
                completion: Math.round(m.completion / m.count),
                count: m.count
            }))
            .sort((a, b) => a.completion - b.completion)
            .slice(0, 5);

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
        } as GranularData;
    },
    ['JellyTrack-granular-analysis-v4'],
    { revalidate: 300 }
);

export async function GranularAnalysis({
    type,
    timeRange,
    excludedLibraries,
    selectedServerIds = []
}: {
    type?: string;
    timeRange: string;
    excludedLibraries: string[];
    selectedServerIds?: string[];
}) {
    const locale = await getLocale();
    const data = await getGranularData(type, timeRange, excludedLibraries, locale, selectedServerIds);
    const t = await getTranslations('granular');
    const tc = await getTranslations('common');

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

    const rawKeys = Array.from(rawToNorm.values());
    const availableKeys = getAvailableLibraryKeys(rawKeys);
    
    const normalizedKeys = availableKeys.filter(k => {
        const hasPlays = normalizedDailyData.some((d: any) => (d[`${k}_plays`] || 0) > 0);
        const hasDur = normalizedDailyData.some((d: any) => (d[`${k}_duration`] || 0) > 0);
        return hasPlays || hasDur;
    });

    const labelMap: Record<string, string> = {};
    const normToRaw = new Map<string, string[]>();
    for (const [raw, norm] of rawToNorm.entries()) {
        if (!normToRaw.has(norm)) normToRaw.set(norm, []);
        normToRaw.get(norm)!.push(raw);
    }

    function humanizeLibraryName(value: string) {
        if (!value) return value;
        let s = String(value);
        s = s.replace(/[_-]+/g, ' ');
        s = s.replace(/([a-z])([A-Z])/g, '$1 $2');
        s = s.trim();
        s = s.split(' ').map(w => w ? (w[0].toUpperCase() + w.slice(1)) : w).join(' ');
        return s;
    }

    normalizedKeys.forEach(k => {
        let label = '';
        try {
            const translated = tc(k);
            if (translated && translated !== k && !translated.includes('.')) {
                label = translated;
            }
        } catch {}
        if (!label) {
            const raws = normToRaw.get(k) || [];
            label = raws.length > 0 ? humanizeLibraryName(raws[0]) : humanizeLibraryName(k);
        }
        labelMap[k] = label;
    });

    const localizedSubtitleData = (data.subtitleData || []).map((d: { name?: string; value?: number }) => {
        const name = String(d.name || '').toUpperCase();
        if (name === 'OFF' || name === 'NONE' || name === 'UNKNOWN') return { ...d, name: t('disabled') };
        return d;
    });

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
        <GranularAnalysisClient 
            data={data}
            normalizedDailyData={normalizedDailyData}
            normalizedKeys={normalizedKeys}
            normalizedDropOffData={normalizedDropOffData}
            labelMap={labelMap}
            localizedSubtitleData={localizedSubtitleData}
            localizedDropSegments={localizedDropSegments}
            translations={{
                playsPerDay: t('playsPerDay'),
                playsPerDayDesc: t('playsPerDayDesc'),
                durationPerDay: t('durationPerDay'),
                durationPerDayDesc: t('durationPerDayDesc'),
                playsByLibTitle: t('playsByLibTitle'),
                playsByLibDesc: t('playsByLibDesc'),
                durationByLibTitle: t('durationByLibTitle'),
                durationByLibDesc: t('durationByLibDesc'),
                playsHourlyAvg: t('playsHourlyAvg'),
                playsHourlyAvgDesc: t('playsHourlyAvgDesc'),
                durationHourlyAvg: t('durationHourlyAvg'),
                durationHourlyAvgDesc: t('durationHourlyAvgDesc'),
                attendanceHeatmap: t('attendanceHeatmap'),
                attendanceHeatmapDesc: t('attendanceHeatmapDesc'),
                avgCompletionByLib: t('avgCompletionByLib'),
                avgCompletionByLibDesc: t('avgCompletionByLibDesc'),
                completionPct: t('completionPct'),
                abandonSegments: t('abandonSegments'),
                abandonSegmentsDesc: t('abandonSegmentsDesc'),
                worstCompletion: t('worstCompletion'),
                worstCompletionDesc: t('worstCompletionDesc'),
                audioBreakdown: t('audioBreakdown'),
                audioBreakdownDesc: t('audioBreakdownDesc'),
                subtitles: t('subtitles'),
                subtitlesDesc: t('subtitlesDesc'),
                noData: tc('noData')
            }}
        />
    );
}
