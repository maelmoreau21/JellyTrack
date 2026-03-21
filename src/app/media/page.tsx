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
import { normalizeResolution } from '@/lib/utils';
import { isZapped, ZAPPING_CONDITION } from '@/lib/statsUtils';
import { buildExcludedMediaClause } from '@/lib/mediaPolicy';
import { getSanitizedLibraryNames, GHOST_LIBRARY_NAMES } from "@/lib/libraryUtils";

export const dynamic = "force-dynamic";

interface MediaPageProps {
    searchParams: Promise<{
        sortBy?: string;
        type?: string;
        page?: string;
        q?: string;
    }>;
}

const ITEMS_PER_PAGE = 50;

export default async function MediaPage({ searchParams }: MediaPageProps) {
    const sParams = await searchParams;
    const t = await getTranslations('media');
    const tc = await getTranslations('common');
    const sortBy = sParams.sortBy || "plays";
    const type = sParams.type;
    const q = sParams.q;
    const currentPage = Math.max(1, parseInt(sParams.page || "1", 10) || 1);

    const settings = await prisma.globalSettings.findUnique({ where: { id: "global" } });
    const excludedLibraries = settings?.excludedLibraries || [];

    // Attempt to fetch the list of libraries (Virtual Folders) directly from Jellyfin
    const baseUrl = process.env.JELLYFIN_URL;
    const apiKey = process.env.JELLYFIN_API_KEY;
    let jellyfinViews: any[] = [];
    if (baseUrl && apiKey) {
        try {
            const [vfRes, uvRes] = await Promise.all([
                fetch(`${baseUrl}/Library/VirtualFolders`, { headers: { 'X-Emby-Token': apiKey } }),
                fetch(`${baseUrl}/UserViews`, { headers: { 'X-Emby-Token': apiKey } })
            ]);
            
            let folders: any[] = [];
            if (vfRes.ok) folders = await vfRes.json();
            
            let userViews: any[] = [];
            if (uvRes.ok) {
                const uv = await uvRes.json();
                userViews = Array.isArray(uv) ? uv : (uv.Items || []);
            }

            // Deduplicate by Name or Id to get the most complete list of available libraries
            const viewsMap = new Map();
            [...folders, ...userViews].forEach(v => {
                if (v?.CollectionType === 'boxsets') return;
                if (v && v.Name && !viewsMap.has(v.Name)) {
                    viewsMap.set(v.Name, v);
                }
            });
            jellyfinViews = Array.from(viewsMap.values());
        } catch (e) {
            console.warn('[MediaPage] Error fetching Jellyfin libraries:', e);
        }
    }

    const displayTypes = type === 'movie' ? ['Movie']
        : type === 'series' ? ['Series']
        : type === 'music' ? ['MusicAlbum']
        : ['Movie', 'Series', 'MusicAlbum'];

    const buildMediaFilter = () => {
        const clauses: any[] = [{ type: { in: displayTypes } }];
        if (q) {
            // Case-insensitive Prisma text / array search
            const searchMode = "insensitive";
            clauses.push({
                OR: [
                    { title: { contains: q, mode: searchMode } },
                    { directors: { has: q } },
                    { actors: { has: q } },
                    { studios: { has: q } }
                ]
            });
        }
        const excludedClause = buildExcludedMediaClause(excludedLibraries);
        if (excludedClause) clauses.push(excludedClause);
        return { AND: clauses };
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
                const filteredHistory = ep.playbackHistory.filter((h: any) => !isZapped({ ...h, media: { type: 'Episode' } }));
                if (filteredHistory.length === 0) continue;

                const s = seriesChildStats.get(sid) || { plays: 0, dur: 0, dp: 0, childCount: 0 };
                s.childCount++;
                s.plays += filteredHistory.length;
                s.dur += filteredHistory.reduce((a: number, h: any) => a + h.durationWatched, 0);
                s.dp += filteredHistory.filter((h: any) => h.playMethod === 'DirectPlay').length;
                seriesChildStats.set(sid, s);
            }
        }
    }

    const albumIdList = parentItems.filter((m: any) => m.type === 'MusicAlbum').map((m: any) => m.jellyfinMediaId);
    const albumChildStats = new Map<string, { plays: number; dur: number; dp: number; childCount: number; sizeBytes: bigint; totalTrackDurationMs: bigint }>();
    if (albumIdList.length > 0) {
        const tracks = await prisma.media.findMany({
            where: { type: 'Audio', parentId: { in: albumIdList } },
            select: { parentId: true, size: true, durationMs: true, playbackHistory: { select: { durationWatched: true, playMethod: true } } },
        });
        for (const track of tracks) {
            if (!track.parentId) continue;
            const filteredHistory = track.playbackHistory.filter((h: any) => !isZapped({ ...h, media: { type: 'Audio' } }));
            if (filteredHistory.length === 0) continue;

            const existing = albumChildStats.get(track.parentId);
            const s = existing || { plays: 0, dur: 0, dp: 0, childCount: 0, sizeBytes: BigInt(0), totalTrackDurationMs: BigInt(0) };
            s.childCount++;

            const rawSize = (track.size ?? 0);
            const sizeBig = typeof rawSize === 'bigint' ? rawSize : BigInt(Math.floor(Number(rawSize)));
            s.sizeBytes = (s.sizeBytes || BigInt(0)) + sizeBig;

            const rawDurMs = (track.durationMs ?? 0);
            const durBig = typeof rawDurMs === 'bigint' ? rawDurMs : BigInt(Math.floor(Number(rawDurMs)));
            s.totalTrackDurationMs = (s.totalTrackDurationMs || BigInt(0)) + durBig;

            s.plays += filteredHistory.length;
            s.dur += filteredHistory.reduce((a: number, h: any) => a + h.durationWatched, 0);
            s.dp += filteredHistory.filter((h: any) => h.playMethod === 'DirectPlay').length;
            albumChildStats.set(track.parentId, s);
        }
    }

    // Build a sanitized media list that only exposes primitive, serializable fields
    const processedMedia = parentItems.map((media: any) => {
        let plays = 0, durationSeconds = 0, dpCount = 0, childCount = 0;
        if (media.type === 'Movie') {
            const filteredHistory = media.playbackHistory.filter((h: any) => !isZapped({ ...h, media: { type: 'Movie' } }));
            plays = filteredHistory.length;
            durationSeconds = filteredHistory.reduce((a: number, h: any) => a + h.durationWatched, 0);
            dpCount = filteredHistory.filter((h: any) => h.playMethod === 'DirectPlay').length;
        } else if (media.type === 'Series') {
            const stats = seriesChildStats.get(media.jellyfinMediaId);
            if (stats) { plays = stats.plays; durationSeconds = stats.dur; dpCount = stats.dp; childCount = stats.childCount; }
        } else if (media.type === 'MusicAlbum') {
            const stats = albumChildStats.get(media.jellyfinMediaId);
            if (stats) { plays = stats.plays; durationSeconds = stats.dur; dpCount = stats.dp; childCount = stats.childCount; }
        }

        let bitrateKbps: number | null = null;
        if (media.type === 'MusicAlbum') {
            const stats = albumChildStats.get(media.jellyfinMediaId);
            if (stats && stats.totalTrackDurationMs > 0) {
                // (Bytes * 8) = Bits. (DurationMs / 1000) = Seconds. Bits / Seconds = bps. bps / 1000 = kbps.
                bitrateKbps = Math.round(Number(stats.sizeBytes) * 8 / Number(stats.totalTrackDurationMs));
            }
        }

        const durationHours = parseFloat((durationSeconds / 3600).toFixed(1));
        const qualityPercent = plays > 0 ? Math.round((dpCount / plays) * 100) : 0;

        // Only expose a trimmed set of primitive fields to avoid accidentally serializing BigInt/Date objects
        return {
            id: String(media.id),
            jellyfinMediaId: String(media.jellyfinMediaId),
            title: media.title || '',
            productionYear: media.productionYear || null,
            type: media.type || null,
            plays,
            durationHours,
            qualityPercent,
            childCount,
            normalizedResolution: normalizeResolution(media.resolution),
            bitrateKbps
        };
    });

    // Global Stats for Charts
    const genreCounts = new Map<string, number>();
    const resolutionCounts = new Map<string, number>();
    parentItems.forEach((m: any) => {
        if (m.genres) m.genres.forEach((g: string) => genreCounts.set(g, (genreCounts.get(g) || 0) + 1));
        const nr = normalizeResolution(m.resolution);
        resolutionCounts.set(nr, (resolutionCounts.get(nr) || 0) + 1);
    });

    const topGenres = Array.from(genreCounts.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10);
    const res4K = resolutionCounts.get('4K') || 0;
    const res1080p = resolutionCounts.get('1080p') || 0;
    const res720p = resolutionCounts.get('720p') || 0;
    const resSD = resolutionCounts.get('SD') || 0;

    // Library Metrics
    const allMedia = await prisma.media.findMany({
        where: buildExcludedMediaClause(excludedLibraries) || {},
        select: { type: true, size: true, durationMs: true, libraryName: true, title: true, collectionType: true }
    });

    const libraryStatsMap = new Map<string, { size: bigint; duration: bigint; watchedSeconds?: number; items: number; movies: number; series: number; music: number; books: number, collectionType?: string | null }>();

    console.log(`[MediaPage] Libraries in settings:`, JSON.stringify(excludedLibraries));
    // Safe logging: don't stringify the whole object because of BigInt (durationMs)
    console.log(`[MediaPage] Found ${allMedia.length} total media items across all libraries.`);
    if (allMedia.length > 0) {
      console.log(`[MediaPage] First item title: ${allMedia[0].title}`);
    }

    // Pre-populate library map with Jellyfin libraries so empty libraries appear in the UI
    if (jellyfinViews && jellyfinViews.length > 0) {
        for (const v of jellyfinViews) {
            const name = v?.Name || tc('other');
            if (!libraryStatsMap.has(name)) {
                libraryStatsMap.set(name, { size: BigInt(0), duration: BigInt(0), items: 0, movies: 0, series: 0, music: 0, books: 0, collectionType: v?.CollectionType || null });
            }
        }
    }

    // Use consolidated library logic
    const sanitizedLibraries = await getSanitizedLibraryNames();
    const ghostNames = new Set(GHOST_LIBRARY_NAMES);

    // Ensure all sanitized libraries are in the map (even if empty in DB)
    for (const name of sanitizedLibraries) {
        if (!libraryStatsMap.has(name)) {
            libraryStatsMap.set(name, { size: BigInt(0), duration: BigInt(0), watchedSeconds: 0, items: 0, movies: 0, series: 0, music: 0, books: 0, collectionType: null });
        }
    }

    let totalSizeBytes = BigInt(0);
    let totalDurationMs = BigInt(0);
    let movieCount = 0;
    let seriesCount = 0;
    let albumCount = 0;
    let bookCount = 0;

    allMedia.forEach(m => {
        // We skip items without a library name (orphans/ghosts) OR explicitly blacklisted names
        if (!m.libraryName || ghostNames.has(m.libraryName) || m.collectionType === 'boxsets') return;
        
        const libName = m.libraryName;
        
        if (!libraryStatsMap.has(libName)) {
            libraryStatsMap.set(libName, { size: BigInt(0), duration: BigInt(0), watchedSeconds: 0, items: 0, movies: 0, series: 0, music: 0, books: 0, collectionType: m.collectionType });
        }
        const lib = libraryStatsMap.get(libName)!;
        if (!lib.collectionType && m.collectionType) lib.collectionType = m.collectionType;

        // CRITICAL: Only count durations from leaf items for "Watch Time" (sizes will be aggregated via Prisma below)
        const isLeaf = ['Movie', 'Episode', 'Audio', 'Book'].includes(m.type);

        if (m.durationMs != null) {
            if (isLeaf) {
                const durBig = typeof m.durationMs === 'bigint' ? m.durationMs : BigInt(Math.floor(Number(m.durationMs)));
                totalDurationMs += durBig;
                lib.duration = (lib.duration || BigInt(0)) + durBig;
            }
        }

        if (m.type === 'Movie' || m.type === 'BoxSet') { movieCount++; lib.movies++; lib.items++; }
        else if (m.type === 'Series' || m.type === 'Season') { seriesCount++; lib.series++; lib.items++; }
        else if (m.type === 'MusicAlbum') { albumCount++; lib.music++; lib.items++; }
        else if (m.type === 'Book') { bookCount++; lib.books++; lib.items++; }
    });

    // Use Prisma aggregation to compute total size and per-library sizes robustly
    try {
        const leafTypes = ['Movie', 'Episode', 'Audio', 'Book'];
        const sizeWhere: any = { type: { in: leafTypes } };
        const excludedForSize = buildExcludedMediaClause(excludedLibraries);
        if (excludedForSize) {
            sizeWhere.AND = [excludedForSize];
        }

        const sizeAgg = await prisma.media.aggregate({ where: sizeWhere, _sum: { size: true } });
        const rawTotal = (sizeAgg._sum && (sizeAgg._sum as any).size) ?? 0;
        totalSizeBytes = typeof rawTotal === 'bigint' ? rawTotal : BigInt(Math.floor(Number(rawTotal)));

        const perLibSizes = await prisma.media.groupBy({ by: ['libraryName'], where: sizeWhere, _sum: { size: true } });
        for (const p of perLibSizes) {
            const name = p.libraryName || tc('other');
            if (!libraryStatsMap.has(name)) {
                libraryStatsMap.set(name, { size: BigInt(0), duration: BigInt(0), watchedSeconds: 0, items: 0, movies: 0, series: 0, music: 0, books: 0, collectionType: null });
            }
            const lib = libraryStatsMap.get(name)!;
            const rawLibSize = (p._sum && (p._sum as any).size) ?? 0;
            lib.size = typeof rawLibSize === 'bigint' ? rawLibSize : BigInt(Math.floor(Number(rawLibSize)));
        }
    } catch (e) {
        console.warn('[MediaPage] Failed to aggregate sizes from DB:', e);
    }

    // Aggregate actual watch time (from playback history) per library so we can show total watched time
    try {
        const playbackAgg = await prisma.playbackHistory.groupBy({
            by: ['mediaId'],
            _sum: { durationWatched: true },
            where: ZAPPING_CONDITION
        });
        const mediaIdsWithHistory = playbackAgg.map(p => p.mediaId);
        const mediasForHistory = mediaIdsWithHistory.length > 0
            ? await prisma.media.findMany({ where: { id: { in: mediaIdsWithHistory } }, select: { id: true, libraryName: true } })
            : [];
        const mediaToLib = new Map(mediasForHistory.map(m => [m.id, m.libraryName || tc('other')]));

        for (const p of playbackAgg) {
            const libName = mediaToLib.get(p.mediaId) || tc('other');
            if (!libraryStatsMap.has(libName)) {
                libraryStatsMap.set(libName, { size: BigInt(0), duration: BigInt(0), watchedSeconds: 0, items: 0, movies: 0, series: 0, music: 0, books: 0, collectionType: null });
            }
            const lib = libraryStatsMap.get(libName)!;
            lib.watchedSeconds = (lib.watchedSeconds ?? 0) + (p._sum?.durationWatched ?? 0);
        }
    } catch (e) {
        console.warn('[MediaPage] Failed to aggregate playback history by library:', e);
    }

    const formatSize = (bytes: bigint | number) => {
        const n = typeof bytes === 'bigint' ? Number(bytes) : Number(bytes ?? 0);
        const tb = n / (1024 ** 4);
        if (tb >= 1) return { value: tb.toFixed(2), unit: "To" };
        const gb = n / (1024 ** 3);
        return { value: gb.toFixed(1), unit: "Go" };
    };

    const globalSize = formatSize(totalSizeBytes);
    const totalTB = `${globalSize.value} ${globalSize.unit}`;

    const totalDays = Math.floor(Number(totalDurationMs) / (1000 * 60 * 60 * 24));
    const totalHoursAfterDays = Math.floor((Number(totalDurationMs) % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const timeLabel = t('timeDays', { days: totalDays, hours: totalHoursAfterDays });

    const validLibraries = Array.from(libraryStatsMap.entries()).filter(([name, stats]) => {
        // We hide the fallback "Other" library if it's empty, or if it's a ghost name
        if (ghostNames.has(name)) return false;
        
        if (name === tc('other')) {
            const hasItems = stats.movies > 0 || stats.series > 0 || stats.music > 0 || stats.books > 0;
            return hasItems;
        }
        return true; 
    });

    const libraryStatsList = await Promise.all(validLibraries.map(async ([name, stats]) => {
            const size = formatSize(stats.size);
            
            // Fetch Top Content (most played) for this library
            const topContent = await prisma.playbackHistory.groupBy({
                by: ['mediaId'],
                where: { media: { libraryName: name } },
                _count: { mediaId: true },
                orderBy: { _count: { mediaId: 'desc' } },
                take: 1,
            });
            let topItem = null;
            if (topContent.length > 0) {
                topItem = await prisma.media.findUnique({
                    where: { id: topContent[0].mediaId },
                    select: { title: true, type: true, jellyfinMediaId: true }
                });
            }

            // Fetch Recently Added for this library
            const lastAdded = await prisma.media.findFirst({
                where: { libraryName: name, type: { in: ['Movie', 'Series', 'MusicAlbum', 'BoxSet'] } },
                orderBy: { dateAdded: 'desc' },
                select: { title: true, dateAdded: true, jellyfinMediaId: true }
            });

            // Prefer actual watched time (from playback history) when available, otherwise fall back to total media durations
            let d = 0;
            let h = 0;
            if (stats.watchedSeconds && stats.watchedSeconds > 0) {
                d = Math.floor(stats.watchedSeconds / (60 * 60 * 24));
                h = Math.floor((stats.watchedSeconds % (60 * 60 * 24)) / (60 * 60));
            } else {
                d = Math.floor(Number(stats.duration) / (1000 * 60 * 60 * 24));
                h = Math.floor((Number(stats.duration) % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            }
            return {
                name,
                collectionType: stats.collectionType,
                size: `${size.value} ${size.unit}`,
                duration: t('timeDays', { days: d, hours: h }),
                counts: [
                    stats.movies > 0 && `${stats.movies} ${tc('movies').toLowerCase()}`,
                    stats.series > 0 && `${stats.series} ${tc('series').toLowerCase()}`,
                    stats.music > 0 && `${stats.music} albums`,
                    stats.books > 0 && `${stats.books} ${tc('books').toLowerCase()}`,
                ].filter(Boolean).join(', ') || tc('noData'),
                topItem: (topItem && topContent[0]._count.mediaId) ? { title: topItem.title, plays: topContent[0]._count.mediaId, id: topItem.jellyfinMediaId } : null,
                lastAdded: lastAdded ? { title: lastAdded.title, date: lastAdded.dateAdded ? lastAdded.dateAdded.toISOString() : null, id: lastAdded.jellyfinMediaId } : null
            };
        }));
    
    libraryStatsList.sort((a, b) => b.name.localeCompare(a.name));

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

                <LibraryStats
                    totalTB={totalTB}
                    movieCount={movieCount}
                    seriesCount={seriesCount}
                    albumCount={albumCount}
                    bookCount={bookCount}
                    timeLabel={timeLabel}
                    libraries={libraryStatsList}
                />

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
                                { label: "4K UHD", val: res4K, color: "bg-gradient-to-r from-yellow-400 to-orange-500", text: "text-transparent bg-clip-text" },
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
                        <CardTitle>{q ? `${t('searchResult') || 'Recherche'}: ${q}` : t('allMedia')}</CardTitle>
                        <CardDescription>{t('availableContent', { count: parentItems.length })}</CardDescription>
                        <div className="flex items-center gap-2 pt-4">
                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                                <ArrowDownUp className="w-4 h-4" /> {t('sortBy')}
                            </span>
                            <div className="app-field flex items-center rounded-md p-1">
                                {['plays', 'duration', 'quality'].map(sort => (
                                    <Link
                                        key={sort}
                                        href={`/media?sortBy=${sort}${type ? `&type=${type}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
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
                                    <div className={`app-surface-soft relative ${media.type === 'MusicAlbum' ? 'aspect-square' : 'aspect-[2/3]'} rounded-md overflow-hidden ring-1 ring-white/10 shadow-lg`}>
                                        <FallbackImage
                                            src={getJellyfinImageUrl(media.jellyfinMediaId, 'Primary', media.parentId || undefined)}
                                            alt={media.title}
                                            fill
                                            className="object-cover transition-transform duration-500 group-hover:scale-110 group-hover:brightness-50"
                                        />
                                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-4 flex flex-col justify-end">
                                            <h3 className="text-white font-bold text-lg leading-tight truncate">{media.title}</h3>
                                            <span className="text-zinc-300 text-xs">{media.productionYear}</span>
                                        </div>
                                        {(media.normalizedResolution && !['MusicAlbum', 'Season', 'Series'].includes(media.type)) && (
                                            <div className="absolute top-2 right-2 z-10">
                                                <Badge className={`px-1.5 py-0 text-[10px] font-black tracking-tighter uppercase ${
                                                    media.normalizedResolution === '4K' ? 'bg-orange-500 text-black border-transparent' : 
                                                    media.normalizedResolution === '1080p' ? 'bg-blue-600 text-white border-transparent' :
                                                    'bg-zinc-800 text-zinc-300 border-zinc-700'
                                                }`}>
                                                    {media.normalizedResolution === '4K' ? '4K UHD' : media.normalizedResolution}
                                                </Badge>
                                            </div>
                                        )}
                                        {(media.bitrateKbps && media.type === 'MusicAlbum') && (
                                            <div className="absolute top-2 right-2 z-10">
                                                <Badge className="px-1.5 py-0 text-[10px] font-black tracking-tighter uppercase bg-yellow-500/90 text-black border-transparent backdrop-blur-sm">
                                                    {media.bitrateKbps} KBPS
                                                </Badge>
                                            </div>
                                        )}
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
