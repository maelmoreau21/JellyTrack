import prisma from "@/lib/prisma";
import { FallbackImage } from "@/components/FallbackImage";
import Link from "next/link";
import { Film, ArrowDownUp, ChevronLeft, ChevronRight, TrendingUp } from "lucide-react";
import { getJellyfinImageUrl } from "@/lib/jellyfin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import LibraryStats from "@/components/media/LibraryStats";
import StatsDeepAnalysis from "@/components/dashboard/StatsDeepAnalysis";
import { requireAdmin, isAuthError } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { GenreDistributionChart, GenreData } from "@/components/charts/GenreDistributionChart";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getTranslations } from 'next-intl/server';

export const dynamic = "force-dynamic";

interface MediaPageProps {
    searchParams: Promise<{
        sortBy?: string;
        type?: string;
        page?: string;
    }>;
}

const ITEMS_PER_PAGE = 50;

export default async function MediaPage({ searchParams }: MediaPageProps) {
    const sParams = await searchParams;
    const t = await getTranslations('media');
    const tc = await getTranslations('common');
    const sortBy = sParams.sortBy || "plays";
    const type = sParams.type;
    const currentPage = Math.max(1, parseInt(sParams.page || "1", 10) || 1);

    const settings = await prisma.globalSettings.findUnique({ where: { id: "global" } });
    const excludedLibraries = settings?.excludedLibraries || [];

    const displayTypes = type === 'movie' ? ['Movie']
        : type === 'series' ? ['Series']
        : type === 'music' ? ['MusicAlbum']
        : ['Movie', 'Series', 'MusicAlbum'];

    const buildMediaFilter = () => {
        const AND: any[] = [{ type: { in: displayTypes } }];
        if (excludedLibraries.length > 0) {
            AND.push({
                NOT: {
                    OR: [
                        { type: { in: excludedLibraries } },
                        ...excludedLibraries.map((lib: string) => ({ collectionType: lib }))
                    ]
                }
            });
        }
        return { AND };
    };

    const mediaWhere = buildMediaFilter();

    const parentItems = await prisma.media.findMany({
        where: mediaWhere,
        include: {
            playbackHistory: {
                select: {
                    durationWatched: true,
                    playMethod: true,
                },
            },
        },
    });

    // Aggregates for Series/Albums (simplified for brevity)
    // In a real app we'd fetch these efficiently
    const seriesIdList = parentItems.filter((m: any) => m.type === 'Series').map((m: any) => m.jellyfinMediaId);
    const seriesChildStats = new Map<string, { plays: number; dur: number; dp: number; childCount: number }>();
    if (seriesIdList.length > 0) {
        const seasons = await prisma.media.findMany({
            where: { type: 'Season', parentId: { in: seriesIdList } },
            select: { jellyfinMediaId: true, parentId: true },
        });
        const seasonToSeries = new Map(seasons.map((s: any) => [s.jellyfinMediaId, s.parentId!]));
        const seasonIdList = seasons.map((s: any) => s.jellyfinMediaId);
        if (seasonIdList.length > 0) {
            const episodes = await prisma.media.findMany({
                where: { type: 'Episode', parentId: { in: seasonIdList } },
                include: { playbackHistory: { select: { durationWatched: true, playMethod: true } } },
            });
            for (const ep of episodes) {
                const sid = seasonToSeries.get(ep.parentId!);
                if (!sid) continue;
                const s = seriesChildStats.get(sid) || { plays: 0, dur: 0, dp: 0, childCount: 0 };
                s.childCount++;
                s.plays += ep.playbackHistory.length;
                s.dur += ep.playbackHistory.reduce((a: number, h: any) => a + h.durationWatched, 0);
                s.dp += ep.playbackHistory.filter((h: any) => h.playMethod === 'DirectPlay').length;
                seriesChildStats.set(sid, s);
            }
        }
    }

    const albumIdList = parentItems.filter((m: any) => m.type === 'MusicAlbum').map((m: any) => m.jellyfinMediaId);
    const albumChildStats = new Map<string, { plays: number; dur: number; dp: number; childCount: number }>();
    if (albumIdList.length > 0) {
        const tracks = await prisma.media.findMany({
            where: { type: 'Audio', parentId: { in: albumIdList } },
            include: { playbackHistory: { select: { durationWatched: true, playMethod: true } } },
        });
        for (const track of tracks) {
            if (!track.parentId) continue;
            const s = albumChildStats.get(track.parentId) || { plays: 0, dur: 0, dp: 0, childCount: 0 };
            s.childCount++;
            s.plays += track.playbackHistory.length;
            s.dur += track.playbackHistory.reduce((a: number, h: any) => a + h.durationWatched, 0);
            s.dp += track.playbackHistory.filter((h: any) => h.playMethod === 'DirectPlay').length;
            albumChildStats.set(track.parentId, s);
        }
    }

    const processedMedia = parentItems.map((media: any) => {
        let plays = 0, durationSeconds = 0, dpCount = 0, childCount = 0;
        if (media.type === 'Movie') {
            plays = media.playbackHistory.length;
            durationSeconds = media.playbackHistory.reduce((a: number, h: any) => a + h.durationWatched, 0);
            dpCount = media.playbackHistory.filter((h: any) => h.playMethod === 'DirectPlay').length;
        } else if (media.type === 'Series') {
            const stats = seriesChildStats.get(media.jellyfinMediaId);
            if (stats) { plays = stats.plays; durationSeconds = stats.dur; dpCount = stats.dp; childCount = stats.childCount; }
        } else if (media.type === 'MusicAlbum') {
            const stats = albumChildStats.get(media.jellyfinMediaId);
            if (stats) { plays = stats.plays; durationSeconds = stats.dur; dpCount = stats.dp; childCount = stats.childCount; }
        }
        const durationHours = parseFloat((durationSeconds / 3600).toFixed(1));
        const qualityPercent = plays > 0 ? Math.round((dpCount / plays) * 100) : 0;
        return { ...media, plays, durationHours, qualityPercent, childCount };
    });

    // Global Stats for Charts
    const genreCounts = new Map<string, number>();
    const resolutionCounts = new Map<string, number>();
    parentItems.forEach((m: any) => {
        if (m.genres) m.genres.forEach((g: string) => genreCounts.set(g, (genreCounts.get(g) || 0) + 1));
        if (m.resolution) resolutionCounts.set(m.resolution, (resolutionCounts.get(m.resolution) || 0) + 1);
    });

    const topGenres = Array.from(genreCounts.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10);
    const res4K = resolutionCounts.get("4K") || 0;
    const res1080p = resolutionCounts.get("1080p") || 0;
    const res720p = resolutionCounts.get("720p") || 0;
    const resSD = resolutionCounts.get("SD") || 0;

    // Library Metrics
    const allMedia = await prisma.media.findMany({
        where: excludedLibraries.length > 0 ? { NOT: { OR: [ { type: { in: excludedLibraries } }, ...excludedLibraries.map((lib: string) => ({ collectionType: lib })) ] } } : {},
        select: { type: true, size: true, durationMs: true }
    });

    let totalSizeBytes = BigInt(0);
    let totalDurationMs = BigInt(0);
    let movieCount = 0;
    let seriesCount = 0;
    allMedia.forEach(m => {
        if (m.size) totalSizeBytes += m.size;
        if (m.durationMs) totalDurationMs += m.durationMs;
        if (m.type === 'Movie') movieCount++;
        else if (m.type === 'Series') seriesCount++;
    });

    const totalTB = (Number(totalSizeBytes) / (1024 ** 4)).toFixed(2);
    const totalDays = Math.floor(Number(totalDurationMs) / (1000 * 60 * 60 * 24));
    const totalHoursAfterDays = Math.floor((Number(totalDurationMs) % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const timeLabel = t('timeDays', { days: totalDays, hours: totalHoursAfterDays });

    // Sorting & Pagination
    if (sortBy === "duration") processedMedia.sort((a: any, b: any) => b.durationHours - a.durationHours);
    else if (sortBy === "quality") processedMedia.sort((a: any, b: any) => b.qualityPercent - a.qualityPercent);
    else processedMedia.sort((a: any, b: any) => b.plays - a.plays);

    const totalItems = processedMedia.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
    const safePage = Math.min(currentPage, totalPages);
    const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
    const displayMedia = processedMedia.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    const buildPageUrl = (page: number) => {
        const params = new URLSearchParams();
        if (type) params.set("type", type);
        if (sortBy !== "plays") params.set("sortBy", sortBy);
        if (page > 1) params.set("page", String(page));
        const qs = params.toString();
        return `/media${qs ? `?${qs}` : ""}`;
    };

    return (
        <div className="flex-col md:flex">
            <div className="flex-1 space-y-4 md:space-y-6 p-4 md:p-8 pt-4 md:pt-6 max-w-[1400px] mx-auto w-full">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4 md:mb-6">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
                        <h2 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
                            <Film className="w-6 h-6 md:w-8 md:h-8 opacity-80" /> {t('title')}
                        </h2>
                        <Tabs defaultValue={type || "all"} className="w-full sm:w-[400px]">
                            <TabsList className="app-field border-zinc-700/60 w-full sm:w-auto">
                                <TabsTrigger value="all" asChild><Link href={`/media${sortBy !== 'plays' ? `?sortBy=${sortBy}` : ''}`}>{tc('all')}</Link></TabsTrigger>
                                <TabsTrigger value="movie" asChild><Link href={`/media?type=movie${sortBy !== 'plays' ? `&sortBy=${sortBy}` : ''}`}>{tc('movies')}</Link></TabsTrigger>
                                <TabsTrigger value="series" asChild><Link href={`/media?type=series${sortBy !== 'plays' ? `&sortBy=${sortBy}` : ''}`}>{tc('series')}</Link></TabsTrigger>
                                <TabsTrigger value="music" asChild><Link href={`/media?type=music${sortBy !== 'plays' ? `&sortBy=${sortBy}` : ''}`}>{tc('music')}</Link></TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>
                </div>

                <LibraryStats totalTB={totalTB} movieCount={movieCount} seriesCount={seriesCount} timeLabel={timeLabel} />

                <div className="mt-8">
                    <h3 className="text-lg font-semibold mb-4 text-zinc-300 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-primary" />
                        {t('deepAnalysisTitle')} (Top 10)
                    </h3>
                    <StatsDeepAnalysis />
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 my-8">
                    <Card className="col-span-2 app-surface border-zinc-800/50">
                        <CardHeader>
                            <CardTitle>{t('genreDiversity')}</CardTitle>
                        </CardHeader>
                        <CardContent className="pl-0 pb-4">
                            <div className="h-[250px] min-h-[250px] w-full">
                                <GenreDistributionChart data={topGenres} />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="col-span-1 app-surface border-zinc-800/50">
                        <CardHeader>
                            <CardTitle>{t('videoQuality')}</CardTitle>
                            <CardDescription>{t('videoQualityDesc')}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4 mt-4">
                            {[
                                { label: "4K UHD", val: res4K, color: "from-yellow-400 to-orange-500", text: "text-transparent bg-clip-text" },
                                { label: "1080p FHD", val: res1080p, color: "text-blue-400" },
                                { label: "720p HD", val: res720p, color: "text-emerald-400" },
                                { label: t('standardOther'), val: resSD, color: "text-zinc-500" }
                            ].map((q, idx) => (
                                <div key={idx} className="app-surface-soft flex justify-between items-center p-3 rounded-lg border border-zinc-800/50">
                                    <span className={`font-semibold ${q.color} ${q.text || ""}`}>{q.label}</span>
                                    <span className="text-xl font-bold">{q.val}</span>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>

                <Card className="app-surface border-zinc-800/50">
                    <CardHeader>
                        <CardTitle>{t('allMedia')}</CardTitle>
                        <CardDescription>{t('availableContent', { count: parentItems.length })}</CardDescription>
                        <div className="flex items-center gap-2 pt-4">
                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                                <ArrowDownUp className="w-4 h-4" /> {t('sortBy')}
                            </span>
                            <div className="app-field flex items-center rounded-md p-1">
                                {['plays', 'duration', 'quality'].map(sort => (
                                    <Link
                                        key={sort}
                                        href={`/media?sortBy=${sort}${type ? `&type=${type}` : ''}`}
                                        className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${sortBy === sort ? "bg-zinc-100 text-zinc-900 shadow-sm" : "text-zinc-400 hover:text-zinc-100"}`}
                                    >
                                        {sort === 'plays' ? t('sortPopularity') : sort === 'duration' ? t('sortWatchTime') : t('sortPlayMode')}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
                            {displayMedia.map((media: any) => (
                                <Link href={`/media/${media.jellyfinMediaId}`} key={media.id} className="group flex flex-col space-y-2">
                                    <div className="app-surface-soft relative aspect-[2/3] rounded-md overflow-hidden ring-1 ring-white/10 shadow-lg">
                                        <FallbackImage
                                            src={getJellyfinImageUrl(media.jellyfinMediaId, 'Primary', media.parentId || undefined)}
                                            alt={media.title}
                                            fill
                                            className="object-cover transition-transform duration-500 group-hover:scale-110 group-hover:brightness-50"
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-4 flex flex-col justify-end">
                                            <h3 className="text-white font-bold text-lg leading-tight truncate">{media.title}</h3>
                                            <span className="text-zinc-300 text-xs">{media.productionYear}</span>
                                        </div>
                                    </div>
                                    <div className="px-1">
                                        <h4 className="font-semibold text-sm truncate text-zinc-100">{media.title}</h4>
                                        <div className="flex items-center justify-between text-xs text-zinc-500 mt-1">
                                            <span>{media.plays} {tc('views')}</span>
                                            {media.durationHours > 0 && <span>{media.durationHours}h</span>}
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>

                        {totalPages > 1 && (
                            <div className="flex items-center justify-center gap-2 mt-12 pt-6 border-t border-zinc-800/50">
                                {safePage > 1 && (
                                    <Link href={buildPageUrl(safePage - 1)} className="app-field flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium hover:bg-zinc-800">
                                        <ChevronLeft className="w-4 h-4" /> {tc('previous')}
                                    </Link>
                                )}
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-zinc-400">{tc('page')} {safePage} / {totalPages}</span>
                                </div>
                                {safePage < totalPages && (
                                    <Link href={buildPageUrl(safePage + 1)} className="app-field flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium hover:bg-zinc-800">
                                        {tc('next')} <ChevronRight className="w-4 h-4" />
                                    </Link>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
