import prisma from "@/lib/prisma";
import { FallbackImage } from "@/components/FallbackImage";
import Link from "next/link";
import { Film, ArrowDownUp, ChevronLeft, ChevronRight } from "lucide-react";
import { getJellyfinImageUrl } from "@/lib/jellyfin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    const sortBy = sParams.sortBy || "plays"; // 'plays', 'duration', ou 'quality'
    const type = sParams.type;
    const currentPage = Math.max(1, parseInt(sParams.page || "1", 10) || 1);

    // 0. RÃ©cupÃ©rer les Settings globaux
    const settings = await prisma.globalSettings.findUnique({ where: { id: "global" } });
    const excludedLibraries = settings?.excludedLibraries || [];

    // Build parent-level type filter (show Series/Albums, not individual Episodes/Tracks)
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

    // 1. Fetch parent-level items (Movies, Series, Albums) with direct playback
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

    // 2. Aggregate child stats for Series (via Seasons â†’ Episodes)
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

    // 3. Aggregate child stats for Albums (Audio tracks)
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

    // 4. Process items with aggregated stats
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

    // 3. Extraction des Stats Globales (Genres et RÃ©solution)
    const genreCounts = new Map<string, number>();
    const resolutionCounts = new Map<string, number>();

    parentItems.forEach((m: any) => {
        if (m.genres && m.genres.length > 0) {
            m.genres.forEach((g: string) => {
                genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
            });
        }
        if (m.resolution) {
            resolutionCounts.set(m.resolution, (resolutionCounts.get(m.resolution) || 0) + 1);
        }
    });

    const topGenres: GenreData[] = Array.from(genreCounts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10); // Top 10 genres

    const res4K = resolutionCounts.get("4K") || 0;
    const res1080p = resolutionCounts.get("1080p") || 0;
    const res720p = resolutionCounts.get("720p") || 0;
    const resSD = resolutionCounts.get("SD") || 0;

    // 4. Tri (Sorting)
    if (sortBy === "duration") {
        processedMedia.sort((a: any, b: any) => b.durationHours - a.durationHours);
    } else if (sortBy === "quality") {
        // Trie par qualitÃ© dÃ©croissante (ceux qui ont le plus gros % de DirectPlay)
        processedMedia.sort((a: any, b: any) => b.qualityPercent - a.qualityPercent);
    } else {
        // DÃ©faut: Tri par nombre de vues "plays"
        processedMedia.sort((a: any, b: any) => b.plays - a.plays);
    }

    // 5. Pagination
    const totalItems = processedMedia.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
    const safePage = Math.min(currentPage, totalPages);
    const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
    const displayMedia = processedMedia.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    // Helper: build pagination URL preserving existing params
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

                {/* Section Stats BibliothÃ¨que */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
                    <Card className="col-span-2 app-surface">
                        <CardHeader>
                            <CardTitle>{t('genreDiversity')}</CardTitle>
                        </CardHeader>
                        <CardContent className="pl-0 pb-4">
                            <div className="h-[250px] min-h-[250px] w-full">
                                <GenreDistributionChart data={topGenres} />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="col-span-1 app-surface">
                        <CardHeader>
                            <CardTitle>{t('videoQuality')}</CardTitle>
                            <CardDescription>{t('videoQualityDesc')}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4 mt-4">
                            <div className="app-surface-soft flex justify-between items-center p-3 rounded-lg border">
                                <span className="font-semibold text-lg drop-shadow-md bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">4K UHD</span>
                                <span className="text-xl font-bold">{res4K}</span>
                            </div>
                            <div className="app-surface-soft flex justify-between items-center p-3 rounded-lg border">
                                <span className="font-semibold text-lg text-blue-400 drop-shadow-md">1080p FHD</span>
                                <span className="text-xl font-bold">{res1080p}</span>
                            </div>
                            <div className="app-surface-soft flex justify-between items-center p-3 rounded-lg border">
                                <span className="font-medium text-lg text-emerald-400">720p HD</span>
                                <span className="text-xl font-bold">{res720p}</span>
                            </div>
                            <div className="app-surface-soft flex justify-between items-center p-3 rounded-lg border">
                                <span className="font-medium text-zinc-500">{t('standardOther')}</span>
                                <span className="text-lg font-bold text-zinc-400">{resSD}</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <Card className="app-surface">
                    <CardHeader>
                        <CardTitle>{t('allMedia')}</CardTitle>
                        <CardDescription>
                            {t('availableContent', { count: parentItems.length })}
                        </CardDescription>
                        {/* Barre de tri */}
                        <div className="flex items-center gap-2 pt-4">
                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                                <ArrowDownUp className="w-4 h-4" /> {t('sortBy')}
                            </span>
                            <div className="app-field flex items-center rounded-md p-1">
                                <Link
                                    href={`/media?sortBy=plays${type ? `&type=${type}` : ''}`}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${sortBy === "plays" ? "bg-slate-100/95 text-slate-900 shadow-sm" : "text-slate-300 hover:bg-slate-700/50"}`}
                                >
                                    {t('sortPopularity')}
                                </Link>
                                <Link
                                    href={`/media?sortBy=duration${type ? `&type=${type}` : ''}`}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${sortBy === "duration" ? "bg-slate-100/95 text-slate-900 shadow-sm" : "text-slate-300 hover:bg-slate-700/50"}`}
                                >
                                    {t('sortWatchTime')}
                                </Link>
                                <Link
                                    href={`/media?sortBy=quality${type ? `&type=${type}` : ''}`}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${sortBy === "quality" ? "bg-slate-100/95 text-slate-900 shadow-sm" : "text-slate-300 hover:bg-slate-700/50"}`}
                                >
                                    {t('sortPlayMode')}
                                </Link>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {displayMedia.length === 0 ? (
                            <p className="text-sm text-center text-muted-foreground py-12">
                                {t('noMedia')}
                            </p>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
                                {displayMedia.map((media: any) => (
                                    <Link href={`/media/${media.jellyfinMediaId}`} key={media.id} className="group flex flex-col space-y-2 relative">
                                        <div className="app-surface-soft relative w-full aspect-[2/3] rounded-md overflow-hidden ring-1 ring-white/10 shadow-lg">
                                            <FallbackImage
                                                src={getJellyfinImageUrl(media.jellyfinMediaId, 'Primary', media.parentId || undefined)}
                                                alt={media.title}
                                                width={400}
                                                height={600}
                                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 group-hover:brightness-50"
                                            />
                                            {/* Type badge on Tous tab */}
                                            {!type && media.type !== 'Movie' && (
                                                <div className="absolute top-2 left-2 z-10 transition-opacity duration-300 group-hover:opacity-0">
                                                    <Badge variant="outline" className="text-[10px] bg-black/60 text-white border-white/20 backdrop-blur-sm">
                                                        {media.type === 'Series' ? t('seriesBadge') : t('albumBadge')}
                                                    </Badge>
                                                </div>
                                            )}
                                            {/* Top Overlay logic (Quality) */}
                                            {media.plays > 0 && (
                                                <div className="absolute top-2 right-2 flex flex-col items-end gap-1 z-10 transition-opacity duration-300 group-hover:opacity-0">
                                                    <Badge variant={media.qualityPercent >= 80 ? "default" : media.qualityPercent >= 50 ? "secondary" : "destructive"} className="shadow-black/50 shadow-sm backdrop-blur-sm bg-opacity-90">
                                                        {media.qualityPercent}% DP
                                                    </Badge>
                                                </div>
                                            )}
                                            {/* Hover Overlay Title */}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4 pointer-events-none">
                                                <h3 className="text-white font-bold text-lg leading-tight drop-shadow-md">{media.title}</h3>
                                                {media.productionYear && (
                                                    <span className="text-zinc-300 text-sm font-medium">{media.productionYear}</span>
                                                )}
                                                {media.resolution && (
                                                    <Badge variant="outline" className="w-fit mt-2 text-xs bg-black/50 text-white border-white/20">
                                                        {media.resolution}
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex flex-col px-1">
                                            <span className="font-semibold text-sm truncate text-zinc-100" title={media.title}>{media.title}</span>
                                            {media.childCount > 0 && (
                                                <span className="text-xs text-zinc-500">
                                                    {media.childCount} {media.type === 'Series' ? tc('episodes') : tc('tracks')}
                                                </span>
                                            )}
                                            <div className="flex items-center justify-between text-xs text-zinc-400 mt-1">
                                                <span>{media.plays} {media.plays > 1 ? tc('views') : tc('view')}</span>
                                                {media.durationHours > 0 && <span className="font-medium">{media.durationHours}h</span>}
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-center gap-2 mt-8 pt-4 border-t border-zinc-700/50">
                                {safePage > 1 && (
                                    <Link href={buildPageUrl(safePage - 1)} className="app-field flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium transition-colors hover:bg-slate-700/50">
                                        <ChevronLeft className="w-4 h-4" /> {tc('previous')}
                                    </Link>
                                )}
                                <div className="flex items-center gap-1">
                                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                                        .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 2)
                                        .reduce<(number | string)[]>((acc, p, idx, arr) => {
                                            if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                                            acc.push(p);
                                            return acc;
                                        }, [])
                                        .map((item, idx) =>
                                            item === "..." ? (
                                                <span key={`ellipsis-${idx}`} className="px-2 text-zinc-500">â€¦</span>
                                            ) : (
                                                <Link
                                                    key={item}
                                                    href={buildPageUrl(item as number)}
                                                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                                        item === safePage
                                                            ? "bg-primary text-primary-foreground"
                                                            : "text-zinc-300 hover:bg-slate-700/50 hover:text-zinc-100"
                                                    }`}
                                                >
                                                    {item}
                                                </Link>
                                            )
                                        )}
                                </div>
                                {safePage < totalPages && (
                                    <Link href={buildPageUrl(safePage + 1)} className="app-field flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium transition-colors hover:bg-slate-700/50">
                                        {tc('next')} <ChevronRight className="w-4 h-4" />
                                    </Link>
                                )}
                                <span className="text-xs text-muted-foreground ml-4">
                                    {startIndex + 1}â€“{Math.min(startIndex + ITEMS_PER_PAGE, totalItems)} {tc('on')} {totalItems}
                                </span>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
