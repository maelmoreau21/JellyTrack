import prisma from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { unstable_cache } from "next/cache";
import { StreamProportionsChart } from "@/components/charts/StreamProportionsChart";
import { DrillDownPieChart } from "@/components/charts/DrillDownChart";
import { getTranslations } from 'next-intl/server';
import { normalizeResolution } from '@/lib/utils';
import { ZAPPING_CONDITION } from "@/lib/statsUtils";
import { GHOST_LIBRARY_NAMES } from "@/lib/libraryUtils";
import { normalizeLanguageTag } from '@/lib/language';

type CategorizedItem = { title?: string; name?: string; type?: string; plays?: number; duration?: number };

function buildDateFilter(timeRange: string): Record<string, unknown> | undefined {
    const now = new Date();
    if (timeRange === "24h") {
        return { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) };
    } else if (timeRange === "7d") {
        const d = new Date(); d.setDate(d.getDate() - 7); d.setHours(0, 0, 0, 0);
        return { gte: d };
    } else if (timeRange === "30d") {
        const d = new Date(); d.setDate(d.getDate() - 30); d.setHours(0, 0, 0, 0);
        return { gte: d };
    }
    // "all" or unknown ? no filter
    return undefined;
}

function buildMediaTypeFilter(type: string | undefined, excludedLibraries: string[]): Record<string, unknown> {
    const AND: Array<Record<string, unknown>> = [];
    if (type === 'movie') AND.push({ type: "Movie" });
    else if (type === 'series') AND.push({ type: { in: ["Series", "Episode"] } });
    else if (type === 'music') AND.push({ type: { in: ["Audio", "Track"] } });
    else if (type === 'book') AND.push({ type: "Book" });

    if (excludedLibraries.length > 0) {
        AND.push({
            NOT: {
                OR: [
                    { libraryName: { in: excludedLibraries } },
                    { collectionType: { in: excludedLibraries } }
                ]
            }
        });
    }

    // BoxSets are usually pseudo-items we want to exclude from many stats
    AND.push({
        collectionType: { not: 'boxsets' }
    });

    return AND.length > 0 ? { AND } : {};
}

const getDeepInsights = unstable_cache(
    async (type: string | undefined, timeRange: string, excludedLibraries: string[]) => {
        // Build date and media filters from parameters
        const dateFilter = buildDateFilter(timeRange);
        const mediaWhere = buildMediaTypeFilter(type, excludedLibraries);
        const historyWhere: Record<string, unknown> = {};
        if (dateFilter) historyWhere.startedAt = dateFilter;
        if (Object.keys(mediaWhere).length > 0) historyWhere.media = mediaWhere;

        // Find most watched media (take more for series/album aggregation)
        const topMedia = await prisma.playbackHistory.groupBy({
            by: ['mediaId'],
            _count: { id: true },
            _sum: { durationWatched: true },
            orderBy: { _count: { id: 'desc' } },
            take: 200,
            where: { ...(Object.keys(historyWhere).length > 0 ? historyWhere : {}), ...ZAPPING_CONDITION }
        });

        const popMediaId = topMedia.map(m => m.mediaId);
        const resolvedMedia = await prisma.media.findMany({
            where: { id: { in: popMediaId } },
            select: { id: true, title: true, type: true, parentId: true, jellyfinMediaId: true, genres: true, directors: true, actors: true }
        });

        // === Preload ALL Seasons, Series, and Albums for robust parent chain resolution ===
        const allSeasons = await prisma.media.findMany({
            where: { type: 'Season' },
            select: { jellyfinMediaId: true, parentId: true, title: true }
        });
        const allSeries = await prisma.media.findMany({
            where: { type: 'Series' },
            select: { jellyfinMediaId: true, title: true }
        });
        const allAlbums = await prisma.media.findMany({
            where: { type: 'MusicAlbum' },
            select: { jellyfinMediaId: true, title: true, artist: true }
        });

        const seasonMap = new Map(allSeasons.map(s => [s.jellyfinMediaId, s]));
        const seriesMap = new Map(allSeries.map(s => [s.jellyfinMediaId, s.title]));
        const albumMap = new Map(allAlbums.map(a => [a.jellyfinMediaId, a.title]));

        if (seasonMap.size === 0 && seriesMap.size > 0) {
            console.warn("[DeepInsights] Aucune saison trouvée en BDD — les épisodes ne peuvent pas être agrégés par série. Lancez une synchronisation complète.");
        }

        function resolveSeriesTitle(parentId: string | null): string | null {
            if (!parentId) return null;
            const season = seasonMap.get(parentId);
            if (season?.parentId) {
                const seriesTitle = seriesMap.get(season.parentId);
                if (seriesTitle) return seriesTitle;
            }
            const directSeries = seriesMap.get(parentId);
            if (directSeries) return directSeries;
            return null;
        }

        // === DEDICATED SERIES AGGREGATION ===
        const episodeHistoryWhere: Record<string, unknown> = { media: { type: 'Episode' } };
        if (dateFilter) episodeHistoryWhere.startedAt = dateFilter;

        const allEpisodeHistory = await prisma.playbackHistory.groupBy({
            by: ['mediaId'],
            _count: { id: true },
            _sum: { durationWatched: true },
            where: { ...episodeHistoryWhere, ...ZAPPING_CONDITION }
        });
        const episodeMediaIds = allEpisodeHistory.map(e => e.mediaId);
        const allEpisodes = episodeMediaIds.length > 0
            ? await prisma.media.findMany({
                where: { id: { in: episodeMediaIds } },
                select: { id: true, parentId: true, type: true, title: true }
            })
            : [];
        const episodeMap = new Map(allEpisodes.map(e => [e.id, e]));

        const seriesAgg = new Map<string, { plays: number; duration: number }>();
        allEpisodeHistory.forEach(h => {
            const episode = episodeMap.get(h.mediaId);
            if (!episode?.parentId) return;
            const seriesTitle = resolveSeriesTitle(episode.parentId);
            // Fallback: if parent chain resolution fails, use episode title (better than dropping it)
            const title = seriesTitle || episode.title || "???";
            const existing = seriesAgg.get(title) || { plays: 0, duration: 0 };
            existing.plays += h._count.id;
            existing.duration += (h._sum.durationWatched || 0) / 3600;
            seriesAgg.set(title, existing);
        });

        // === DEDICATED ALBUM AGGREGATION ===
        const audioHistoryWhere: Record<string, unknown> = { media: { type: 'Audio' } };
        if (dateFilter) audioHistoryWhere.startedAt = dateFilter;

        const allAudioHistory = await prisma.playbackHistory.groupBy({
            by: ['mediaId'],
            _count: { id: true },
            _sum: { durationWatched: true },
            where: { ...audioHistoryWhere, ...ZAPPING_CONDITION }
        });
        const audioMediaIds = allAudioHistory.map(a => a.mediaId);
        const allAudioMedia = audioMediaIds.length > 0
            ? await prisma.media.findMany({
                where: { id: { in: audioMediaIds } },
                select: { id: true, parentId: true, type: true, title: true }
            })
            : [];
        const audioMediaMap = new Map(allAudioMedia.map(a => [a.id, a]));

        const albumAgg = new Map<string, { plays: number; duration: number }>();
        allAudioHistory.forEach(h => {
            const audio = audioMediaMap.get(h.mediaId);
            if (!audio) return;
            const albumTitle = audio.parentId ? (albumMap.get(audio.parentId) || audio.title) : audio.title;
            const existing = albumAgg.get(albumTitle) || { plays: 0, duration: 0 };
            existing.plays += h._count.id;
            existing.duration += (h._sum.durationWatched || 0) / 3600;
            albumAgg.set(albumTitle, existing);
        });

        // Group movies, books, genres from the top 200
        const categorized: { movie: CategorizedItem[]; series: CategorizedItem[]; album: CategorizedItem[]; book: CategorizedItem[] } = { movie: [], series: [], album: [], book: [] };
        const genreAgg = new Map<string, { plays: number; duration: number }>();
        const directorAgg = new Map<string, { plays: number; duration: number }>();
        const actorAgg = new Map<string, { plays: number; duration: number }>();

        topMedia.forEach(m => {
            const media = resolvedMedia.find(r => r.id === m.mediaId);
            if (!media) return;
            const lowerType = media.type.toLowerCase();
            const plays = m._count.id;
            const duration = (m._sum.durationWatched || 0) / 3600;

            if (media.genres && media.genres.length > 0) {
                for (const genre of media.genres) {
                    const existing = genreAgg.get(genre) || { plays: 0, duration: 0 };
                    existing.plays += plays;
                    existing.duration += duration;
                    genreAgg.set(genre, existing);
                }
            }

            if (media.directors && media.directors.length > 0) {
                for (const d of media.directors) {
                    const existing = directorAgg.get(d) || { plays: 0, duration: 0 };
                    existing.plays += plays;
                    existing.duration += duration;
                    directorAgg.set(d, existing);
                }
            }

            if (media.actors && media.actors.length > 0) {
                for (const a of media.actors) {
                    const existing = actorAgg.get(a) || { plays: 0, duration: 0 };
                    existing.plays += plays;
                    existing.duration += duration;
                    actorAgg.set(a, existing);
                }
            }

            if (lowerType === 'movie') {
                categorized.movie.push({ title: media.title, type: media.type, plays, duration });
            } else if (lowerType.includes('book')) {
                categorized.book.push({ title: media.title, type: media.type, plays, duration });
            }
        });

        categorized.series = Array.from(seriesAgg.entries())
            .map(([title, data]) => ({ title, type: 'Series', plays: data?.plays || 0, duration: data?.duration || 0 }))
            .sort((a, b) => b.plays - a.plays);

        categorized.album = Array.from(albumAgg.entries())
            .map(([title, data]) => ({ title, type: 'Album', plays: data?.plays || 0, duration: data?.duration || 0 }))
            .sort((a, b) => b.plays - a.plays);

        const topGenres = Array.from(genreAgg.entries())
            .map(([name, data]) => ({ name, plays: data?.plays || 0, duration: parseFloat((data?.duration || 0).toFixed(1)) }))
            .sort((a, b) => b.plays - a.plays)
            .slice(0, 10);

        const topDirectors = Array.from(directorAgg.entries())
            .map(([name, data]) => ({ name, plays: data?.plays || 0, duration: parseFloat((data?.duration || 0).toFixed(1)) }))
            .sort((a, b) => b.plays - a.plays)
            .slice(0, 5);

        const topActors = Array.from(actorAgg.entries())
            .map(([name, data]) => ({ name, plays: data?.plays || 0, duration: parseFloat((data?.duration || 0).toFixed(1)) }))
            .sort((a, b) => b.plays - a.plays)
            .slice(0, 5);

        categorized.movie = categorized.movie.slice(0, 5);
        categorized.series = categorized.series.slice(0, 5);
        categorized.album = categorized.album.slice(0, 5);
        categorized.book = categorized.book.slice(0, 5);

        // Filtered queries for clients, stream methods, resolution, devices
        const filteredWhere = Object.keys(historyWhere).length > 0 ? historyWhere : undefined;

        const topClients = await prisma.playbackHistory.groupBy({
            by: ['clientName'],
            _count: { id: true },
            orderBy: { _count: { id: 'desc' } },
            take: 5,
            where: { ...(filteredWhere || {}), ...ZAPPING_CONDITION }
        });

        const streamMethods = await prisma.playbackHistory.groupBy({
            by: ['playMethod'],
            _count: { id: true },
            where: { ...(filteredWhere || {}), ...ZAPPING_CONDITION }
        });

        const streamMethodsChartData = streamMethods.map(s => ({
            name: s.playMethod || "?",
            value: s._count.id
        }));

        // --- Pro Telemetry: Resolution Matrix ---
        const resolutionData = await prisma.playbackHistory.findMany({
            where: { ...(filteredWhere || {}), ...ZAPPING_CONDITION },
            select: { media: { select: { resolution: true, type: true } } },
        });

        const resolutionMap = new Map<string, number>();
        resolutionData.forEach(r => {
            const type = r.media?.type || "Unknown";
            if (['Audio', 'Track', 'MusicAlbum', 'Book', 'AudioBook'].includes(type)) return;
            const res = normalizeResolution(r.media?.resolution);
            resolutionMap.set(res, (resolutionMap.get(res) || 0) + 1);
        });

        const resolutionChartData = Array.from(resolutionMap.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8);

        // --- Pro Telemetry: Audio & Subtitle distribution ---
        const audioWhere = {
            ...filteredWhere,
            media: {
                type: { notIn: ['Audio', 'MusicAlbum'] }
            }
        };

        const audioRows = await prisma.playbackHistory.findMany({
            where: { ...audioWhere, ...ZAPPING_CONDITION },
            select: { audioLanguage: true, audioCodec: true },
        });
        const audioMap = new Map<string, number>();
        const isValidLang = (lang: string | null | undefined) => {
            if (!lang) return false;
            const l = lang.toLowerCase().trim();
            if (l === 'und' || l === 'undefined' || l === 'null' || l === 'none' || l === '' || l === 'unknown') return false;
            return l.length >= 2 && l.length <= 20;
        };

        audioRows.forEach(a => {
            if (a.audioLanguage) {
                const lang = normalizeLanguageTag(a.audioLanguage);
                if (lang) {
                    let codec = a.audioCodec ? String(a.audioCodec).trim() : '';
                    if (codec.toLowerCase() === 'unknown') codec = '';

                    const key = codec ? `${lang} (${codec})` : lang;
                    audioMap.set(key, (audioMap.get(key) || 0) + 1);
                }
            }
        });
        const audioChartData = Array.from(audioMap.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8);

        const subtitleRows = await prisma.playbackHistory.findMany({
            where: { ...audioWhere, ...ZAPPING_CONDITION },
            select: { subtitleLanguage: true, subtitleCodec: true },
        });
        const subtitleMap = new Map<string, number>();
        subtitleRows.forEach(s => {
            if (!s.subtitleLanguage && !s.subtitleCodec) {
                subtitleMap.set('None', (subtitleMap.get('None') || 0) + 1);
            } else if (s.subtitleLanguage) {
                const lang = normalizeLanguageTag(s.subtitleLanguage);
                if (lang) {
                    let codec = s.subtitleCodec ? String(s.subtitleCodec).trim() : '';
                    if (codec.toLowerCase() === 'unknown') codec = '';

                    const key = codec ? `${lang} (${codec})` : lang;
                    subtitleMap.set(key, (subtitleMap.get(key) || 0) + 1);
                } else if (s.subtitleCodec && s.subtitleCodec.toLowerCase() !== 'unknown') {
                    // Fallback to just codec if language is unknown but codec is known
                    subtitleMap.set(s.subtitleCodec, (subtitleMap.get(s.subtitleCodec) || 0) + 1);
                }
            } else if (s.subtitleCodec && s.subtitleCodec.toLowerCase() !== 'unknown') {
                subtitleMap.set(s.subtitleCodec, (subtitleMap.get(s.subtitleCodec) || 0) + 1);
            }
        });
        const subtitleChartData = Array.from(subtitleMap.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8);

        // --- Pro Telemetry: Device Ecosystem ---
        const deviceData = await prisma.playbackHistory.findMany({
            where: { ...(filteredWhere || {}), ...ZAPPING_CONDITION },
            select: { clientName: true, deviceName: true },
        });

        const deviceMap = new Map<string, number>();
        deviceData.forEach(d => {
            const device = d.deviceName || "?";
            deviceMap.set(device, (deviceMap.get(device) || 0) + 1);
        });

        const deviceChartData = Array.from(deviceMap.entries())
            .map(([name, value]) => ({ name: name.length > 20 ? name.substring(0, 20) + "…" : name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8);

        return { categorized, topClients, streamMethodsChartData, resolutionChartData, deviceChartData, topGenres, topDirectors, topActors, audioChartData, subtitleChartData };
    },
    // Dynamic cache key — varies with params so different filters get different cached results
    ['JellyTrack-deep-insights-v4'],
    { revalidate: 300 }
);

import Link from 'next/link';
import { User, Film as FilmIcon, Star } from 'lucide-react';

export async function DeepInsights({ type, timeRange, excludedLibraries }: { type?: string, timeRange: string, excludedLibraries: string[] }) {
    const t = await getTranslations('deepInsights');
    const tc = await getTranslations('common');
    const tCharts = await getTranslations('charts');
    const tGranular = await getTranslations('granular');
    const tm = await getTranslations('media');

    const data = await getDeepInsights(type, timeRange, excludedLibraries);

    const chartTooltipStyle = { 
        backgroundColor: 'var(--chart-tooltip-bg)', 
        borderColor: 'var(--chart-tooltip-border)', 
        borderRadius: 'var(--chart-tooltip-radius)', 
        color: 'var(--chart-item-color)',
        backdropFilter: 'var(--chart-tooltip-backdrop)'
    };
    const chartLabelStyle = { color: 'var(--chart-label-color)' };
    const chartItemStyle = { color: 'var(--chart-item-color)' };

    const localizedResolutionChartData = (data.resolutionChartData || []).map((d: { name: string; value: number }) => {
        const rawName = String(d.name || '');
        let localizedName = rawName;
        const key = rawName.toLowerCase();
        
        if (key === '4k') localizedName = tm('4kLabel');
        else if (key === '1080p') localizedName = tm('1080pLabel');
        else if (key === '720p') localizedName = tm('720pLabel');
        else if (key === 'sd') localizedName = tm('sdLabel');
        else if (key === 'unknown') localizedName = tGranular('unknown');
        
        return { ...d, name: localizedName, rawName };
    });

    const localizedDeviceChartData = (data.deviceChartData || []).map((d: { name: string; value: number }) => {
        const rawName = String(d.name || '');
        let localizedName = rawName;
        
        if (rawName === 'Other') localizedName = tc('other');
        else if (rawName === 'Unknown') localizedName = tc('unknown');
        
        return { ...d, name: localizedName, rawName };
    });

    const localizedAudioChartData = (data.audioChartData || []).map((d: { name: string; value: number }) => {
        const rawName = String(d.name || '');
        if (rawName === 'Unknown') return { ...d, name: tc('unknown'), rawName };
        return { ...d, rawName };
    });

    const localizedSubtitleChartData = (data.subtitleChartData || []).map((d: { name: string; value: number }) => {
        const rawName = String(d.name || '');
        if (rawName === 'None') return { ...d, name: t('none'), rawName };
        return { ...d, rawName };
    });

    const renderCategory = (title: string, items: CategorizedItem[], empty: string, icon?: React.ReactNode) => (
        <Card className="app-surface-soft border-border">
            <CardHeader className="pb-2">
                <CardTitle className="text-md flex items-center gap-2 font-bold">{icon}{title}</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    {items.length === 0 ? <p className="text-xs text-muted-foreground">{empty}</p> : null}
                    {items.map((m, i) => {
                        const label = m.title || m.name || '';
                        return (
                            <Link 
                                key={i} 
                                href={`/media?q=${encodeURIComponent(label)}`}
                                className="flex justify-between items-center text-sm group cursor-pointer"
                            >
                                <div className="truncate pr-2 max-w-[180px] group-hover:text-primary transition-colors font-medium">
                                    <span className="text-muted-foreground w-4 inline-block">{i + 1}.</span>
                                    {label}
                                </div>
                                <div className="font-bold text-xs bg-primary/10 text-primary px-2 py-1 rounded-lg group-hover:bg-primary/20 transition-all">{m?.plays || 0} {t('views')}</div>
                            </Link>
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
                {renderCategory(t('topMovies'), data.categorized.movie, t('noMovies'))}
                {renderCategory(t('topSeries'), data.categorized.series, t('noSeries'))}
                {renderCategory(t('topActors'), data.topActors, t('noData'), <Star className="w-4 h-4 text-yellow-500" />)}
                {renderCategory(t('topDirectors'), data.topDirectors, t('noData'), <User className="w-4 h-4 text-cyan-500" />)}
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
                {renderCategory(t('topAlbums'), data.categorized.album, t('noAlbums'))}
                {renderCategory(t('topBooks'), data.categorized.book, t('noBooks'))}
            </div>

            {/* Top Genres */}
            {data.topGenres.length > 0 && (
                <Card className="app-surface-soft border-border">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-md">{t('topGenres')}</CardTitle>
                        <CardDescription>{t('genresDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-2 md:grid-cols-2">
                            {data.topGenres.map((g: { name: string; plays?: number; duration?: number }, i: number) => {
                                const maxPlays = data.topGenres[0]?.plays || 1;
                                const pct = Math.round(((g?.plays || 0) / maxPlays) * 100);
                                const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500', 'bg-cyan-500', 'bg-yellow-500', 'bg-red-500', 'bg-indigo-500', 'bg-teal-500'];
                                return (
                                    <Link 
                                        key={g.name} 
                                        href={`/media?q=${encodeURIComponent(g.name)}`}
                                        className="flex items-center gap-3 text-sm group cursor-pointer"
                                    >
                                        <span className="text-muted-foreground w-5 text-right shrink-0">{i + 1}.</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between mb-1 group-hover:text-primary transition-colors font-medium">
                                                <span className="truncate">{g.name}</span>
                                                <span className="text-xs text-muted-foreground shrink-0 ml-2">{g?.plays || 0} {t('views')} · {g?.duration || 0}h</span>
                                            </div>
                                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                                <div className={`h-full rounded-full ${colors[i % colors.length]}`} style={{ width: `${pct}%`, opacity: 0.8 }} />
                                            </div>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">

                <Card className="app-surface-soft border-border">
                    <CardHeader>
                        <CardTitle>{t('topClients')}</CardTitle>
                        <CardDescription>{t('topClientsDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {data.topClients.map((c, i) => (
                                <Link 
                                    key={i} 
                                    href={`/logs?query=${encodeURIComponent(c.clientName || '')}`}
                                    className="flex justify-between items-center text-sm group cursor-pointer"
                                >
                                    <div className="truncate pr-2 group-hover:text-primary transition-colors font-medium">{c.clientName || '?'}</div>
                                    <div className="font-bold group-hover:bg-primary/10 px-1 rounded transition-colors text-primary">{c._count.id} {tCharts('sessions')}</div>
                                </Link>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <Card className="app-surface-soft border-border">
                    <CardHeader>
                        <CardTitle>{t('streamMethods')}</CardTitle>
                        <CardDescription>{t('streamMethodsDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex justify-center">
                        <StreamProportionsChart data={data.streamMethodsChartData} />
                    </CardContent>
                </Card>
            </div>

            {/* Pro Telemetry Section */}
            <div className="grid gap-4 md:grid-cols-2">
                <Card className="app-surface-soft border-border">
                    <CardHeader>
                        <CardTitle>{t('resolutionMatrix')}</CardTitle>
                        <CardDescription>{t('resolutionMatrixDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px] flex items-center justify-center">
                        {localizedResolutionChartData.length > 0 ? (
                            <DrillDownPieChart data={localizedResolutionChartData} nameKey="name" dataKey="value" baseUrl="/logs" paramName="resolution" payloadKey="rawName" />
                        ) : (
                            <p className="text-xs text-muted-foreground">{t('noResolutionData')}</p>
                        )}
                    </CardContent>
                </Card>

                <Card className="app-surface-soft border-border">
                    <CardHeader>
                        <CardTitle>{t('deviceEcosystem')}</CardTitle>
                        <CardDescription>{t('deviceEcosystemDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px] flex items-center justify-center">
                        {localizedDeviceChartData.length > 0 ? (
                            <DrillDownPieChart data={localizedDeviceChartData} nameKey="name" dataKey="value" baseUrl="/logs" paramName="client" payloadKey="rawName" />
                        ) : (
                            <p className="text-xs text-muted-foreground">{t('noDeviceData')}</p>
                        )}
                    </CardContent>
                </Card>
            </div>
            {/* Audio & Subtitles */}
            <div className="grid gap-4 md:grid-cols-2">
                <Card className="app-surface-soft border-border">
                    <CardHeader>
                        <CardTitle>{tGranular('audioBreakdown')}</CardTitle>
                        <CardDescription>{tGranular('audioBreakdownDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px] flex items-center justify-center">
                        {localizedAudioChartData.length > 0 ? (
                            <DrillDownPieChart data={localizedAudioChartData} nameKey="name" dataKey="value" baseUrl="/logs" paramName="audio" payloadKey="rawName" />
                        ) : (
                            <p className="text-xs text-muted-foreground">{t('noAudioData')}</p>
                        )}
                    </CardContent>
                </Card>

                <Card className="app-surface-soft border-border">
                    <CardHeader>
                        <CardTitle>{tGranular('subtitles')}</CardTitle>
                        <CardDescription>{tGranular('subtitlesDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px] flex items-center justify-center">
                        {localizedSubtitleChartData.length > 0 ? (
                            <DrillDownPieChart data={localizedSubtitleChartData} nameKey="name" dataKey="value" baseUrl="/logs" paramName="subtitle" payloadKey="rawName" />
                        ) : (
                            <p className="text-xs text-muted-foreground">{t('noSubtitleData')}</p>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
