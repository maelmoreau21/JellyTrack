import prisma from "@/lib/prisma";
import { getTranslations } from 'next-intl/server';
import { FallbackImage } from '@/components/FallbackImage';
import { getJellyfinImageUrl } from '@/lib/jellyfin';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import AllMediaControls from '@/components/media/AllMediaControls';
import { normalizeResolution } from '@/lib/utils';
import { ZAPPING_CONDITION } from '@/lib/statsUtils';
import { buildExcludedMediaClause } from '@/lib/mediaPolicy';
import { ServerFilter } from '@/components/dashboard/ServerFilter';
import { cookies } from 'next/headers';
import { GLOBAL_SERVER_SCOPE_COOKIE, resolveSelectedServerIdsAsync } from '@/lib/serverScope';
import { buildSelectableServerOptions } from '@/lib/selectableServers';

export const dynamic = "force-dynamic";

const ITEMS_PER_PAGE = 50;

import { requireAdmin, isAuthError } from "@/lib/auth";
import { redirect } from "next/navigation";

type AllMediaSearchParams = {
    excludeTypes?: string;
    sortBy?: string;
    q?: string;
    genre?: string;
    page?: string;
    resolution?: string;
    servers?: string;
};

function shouldShowLibraryMediaBadges(resolutionThresholds: unknown): boolean {
    if (!resolutionThresholds || typeof resolutionThresholds !== 'object') return true;
    const candidate = resolutionThresholds as Record<string, unknown>;
    if (typeof candidate.showLibraryMediaBadges === 'boolean') {
        return candidate.showLibraryMediaBadges;
    }
    return true;
}

export default async function AllMediaPage({ searchParams: searchParamsPromise }: { searchParams?: Promise<AllMediaSearchParams> }) {
    const auth = await requireAdmin();
    if (isAuthError(auth)) redirect("/login");

    const searchParams = (await searchParamsPromise) || {};
    const t = await getTranslations('media');
    const tc = await getTranslations('common');
    const excludedParam = searchParams?.excludeTypes;
    const excludedTypes = excludedParam && typeof excludedParam === 'string' ? excludedParam.split(',') : [];
    
    const sortBy = searchParams?.sortBy || 'plays';
    const q = typeof searchParams?.q === 'string' ? (searchParams.q || '').trim() : undefined;
    const genre = typeof searchParams?.genre === 'string' ? (searchParams.genre || '').trim() : undefined;
    const currentPage = Math.max(1, parseInt(searchParams?.page || '1', 10) || 1);

    const [settings, serverRows] = await Promise.all([
        prisma.globalSettings.findUnique({ where: { id: 'global' } }),
        prisma.server.findMany({
            select: { id: true, name: true, isActive: true, url: true, jellyfinServerId: true },
            orderBy: { name: 'asc' },
        }),
    ]);
    const excludedLibraries = settings?.excludedLibraries || [];
    const showLibraryMediaBadges = shouldShowLibraryMediaBadges(settings?.resolutionThresholds);

    const jellytrackMode = (process.env.JELLYTRACK_MODE || 'single').toLowerCase();
    const selectableServerOptions = buildSelectableServerOptions(serverRows);
    const multiServerEnabled = jellytrackMode === 'multi' && selectableServerOptions.length > 1;
    const cookieStore = await cookies();
    const persistedScopeCookie = cookieStore.get(GLOBAL_SERVER_SCOPE_COOKIE)?.value ?? null;
    const { selectedServerIds, selectedServerIdsParam: serversParam } = await resolveSelectedServerIdsAsync({
        multiServerEnabled,
        selectableServerIds: selectableServerOptions.map((server) => server.id),
        requestedServersParam: searchParams?.servers,
        cookieServersParam: persistedScopeCookie,
    });
    const selectedServerScope = selectedServerIds.length > 0 ? { in: selectedServerIds } : undefined;

    const baseTypes = ['Movie', 'Series', 'MusicAlbum'];
    const displayTypes = baseTypes.filter(t => !excludedTypes.includes(t));

    interface MediaWhere {
        type: { in: string[] };
        serverId?: { in: string[] };
        AND?: any[]; // Prisma's AND is tricky to type perfectly without importing generated types, leaving as is for now or using unknown[]
    }

    const mediaWhere: MediaWhere = { type: { in: displayTypes.length > 0 ? displayTypes : baseTypes } };
    if (selectedServerScope) mediaWhere.serverId = selectedServerScope;
    const excludedClause = buildExcludedMediaClause(excludedLibraries);
    if (excludedClause) mediaWhere.AND = [excludedClause];

    // If a free-text query is provided, search title or people/studio arrays
    if (q && q.length >= 2) {
        const searchMode = 'insensitive';
        const orClause = {
            OR: [
                { title: { contains: q, mode: searchMode } },
                { artist: { contains: q, mode: searchMode } },
                { directors: { has: q } },
                { actors: { has: q } },
                { studios: { has: q } },
            ]
        };
        if (!mediaWhere.AND) mediaWhere.AND = [orClause];
        else mediaWhere.AND.push(orClause);
    }
    
    if (genre) {
        const genreClause = { genres: { has: genre } };
        if (!mediaWhere.AND) mediaWhere.AND = [genreClause];
        else mediaWhere.AND.push(genreClause);
    }

    let parentItems = await prisma.media.findMany({
        where: mediaWhere,
        select: {
            id: true,
            jellyfinMediaId: true,
            title: true,
            type: true,
            parentId: true,
            resolution: true,
        },
    });

    // Optional: filter by normalized resolution (client links from analysis page use `resolution`)
    const resolutionFilter = typeof searchParams?.resolution === 'string' && searchParams.resolution ? String(searchParams.resolution) : null;
    if (resolutionFilter) {
        parentItems = parentItems.filter((m) => normalizeResolution(m.resolution) === resolutionFilter);
    }

    const movieItems = parentItems.filter((m) => m.type === 'Movie');
    const seriesItems = parentItems.filter((m) => m.type === 'Series');
    const albumItems = parentItems.filter((m) => m.type === 'MusicAlbum');

    const toBigInt = (value: unknown): bigint => {
        if (typeof value === 'bigint') return value;
        const asNumber = Number(value ?? 0);
        if (!Number.isFinite(asNumber)) return BigInt(0);
        return BigInt(Math.floor(asNumber));
    };

    const movieStats = new Map<string, { plays: number; dur: number; dp: number }>();
    if (movieItems.length > 0) {
        const movieDbIds = movieItems.map((m) => m.id);
        const [movieAgg, movieDirectPlayAgg] = await Promise.all([
            prisma.playbackHistory.groupBy({
                by: ['mediaId'],
                where: { mediaId: { in: movieDbIds }, ...ZAPPING_CONDITION },
                _count: { _all: true },
                _sum: { durationWatched: true },
            }),
            prisma.playbackHistory.groupBy({
                by: ['mediaId'],
                where: { mediaId: { in: movieDbIds }, playMethod: 'DirectPlay', ...ZAPPING_CONDITION },
                _count: { _all: true },
            }),
        ]);

        const movieDirectPlayMap = new Map(movieDirectPlayAgg.map((row) => [row.mediaId, row._count._all ?? 0]));
        for (const row of movieAgg) {
            movieStats.set(row.mediaId, {
                plays: row._count._all ?? 0,
                dur: row._sum.durationWatched ?? 0,
                dp: movieDirectPlayMap.get(row.mediaId) ?? 0,
            });
        }
    }

    const seriesChildStats = new Map<string, { plays: number; dur: number; dp: number; childCount: number }>();
    let seriesResolutionMapLocal: Map<string, string> | undefined = undefined;
    if (seriesItems.length > 0) {
        const seriesJellyfinIds = seriesItems.map((m) => String(m.jellyfinMediaId));
        const seasons = await prisma.media.findMany({
            where: { type: 'Season', parentId: { in: seriesJellyfinIds } },
            select: { jellyfinMediaId: true, parentId: true },
        });
        const seasonToSeries = new Map(seasons.map((s) => [s.jellyfinMediaId, s.parentId ?? '']));
        const seasonIds = seasons.map((s) => s.jellyfinMediaId);

        if (seasonIds.length > 0) {
            // Fetch episodes and include resolution so we can compute a representative resolution per series
            const episodes = await prisma.media.findMany({
                where: { type: 'Episode', parentId: { in: seasonIds } },
                select: { id: true, parentId: true, resolution: true },
            });
            const episodeIds = episodes.map((e) => e.id);
            const episodeById = new Map(episodes.map((e) => [e.id, e]));

            // Build a map of most-frequent normalized resolution per series (mode)
            const seriesResolutionCounts = new Map<string, Map<string, number>>();
            for (const ep of episodes) {
                const seriesJellyfinId = ep.parentId ? seasonToSeries.get(ep.parentId) : undefined;
                if (!seriesJellyfinId) continue;
                const norm = normalizeResolution(ep.resolution);
                const counts = seriesResolutionCounts.get(seriesJellyfinId) || new Map<string, number>();
                counts.set(norm, (counts.get(norm) || 0) + 1);
                seriesResolutionCounts.set(seriesJellyfinId, counts);
            }

            const seriesResolutionMap = new Map<string, string>();
            for (const [seriesId, counts] of seriesResolutionCounts.entries()) {
                let best = 'Unknown';
                let bestCount = -1;
                for (const [res, cnt] of counts.entries()) {
                    if (cnt > bestCount) { bestCount = cnt; best = res; }
                }
                seriesResolutionMap.set(seriesId, best);
            }

            if (episodeIds.length > 0) {
                const [episodeAgg, episodeDirectPlayAgg] = await Promise.all([
                    prisma.playbackHistory.groupBy({
                        by: ['mediaId'],
                        where: { mediaId: { in: episodeIds }, ...ZAPPING_CONDITION },
                        _count: { _all: true },
                        _sum: { durationWatched: true },
                    }),
                    prisma.playbackHistory.groupBy({
                        by: ['mediaId'],
                        where: { mediaId: { in: episodeIds }, playMethod: 'DirectPlay', ...ZAPPING_CONDITION },
                        _count: { _all: true },
                    }),
                ]);

                const episodeDirectPlayMap = new Map(episodeDirectPlayAgg.map((row) => [row.mediaId, row._count._all ?? 0]));

                for (const row of episodeAgg) {
                    const episode = episodeById.get(row.mediaId);
                    const seriesJellyfinId = episode?.parentId ? seasonToSeries.get(episode.parentId) : null;
                    if (!seriesJellyfinId) continue;

                    const stats = seriesChildStats.get(seriesJellyfinId) || { plays: 0, dur: 0, dp: 0, childCount: 0 };
                    stats.childCount += 1;
                    stats.plays += row._count._all ?? 0;
                    stats.dur += row._sum.durationWatched ?? 0;
                    stats.dp += episodeDirectPlayMap.get(row.mediaId) ?? 0;
                    seriesChildStats.set(seriesJellyfinId, stats);
                }
            }

            // Attach the computed representative resolution map to the declared variable
            seriesResolutionMapLocal = seriesResolutionMap;
        }
    }

    const albumChildStats = new Map<string, { plays: number; dur: number; dp: number; childCount: number; sizeBytes: bigint; totalTrackDurationMs: bigint }>();
    if (albumItems.length > 0) {
        const albumJellyfinIds = albumItems.map((m) => String(m.jellyfinMediaId));
        const tracks = await prisma.media.findMany({
            where: { type: 'Audio', parentId: { in: albumJellyfinIds } },
            select: { id: true, parentId: true, size: true, durationMs: true },
        });

        const trackIds = tracks.map((track) => track.id);
        const trackById = new Map(tracks.map((track) => [track.id, track]));

        if (trackIds.length > 0) {
            const [trackAgg, trackDirectPlayAgg] = await Promise.all([
                prisma.playbackHistory.groupBy({
                    by: ['mediaId'],
                    where: { mediaId: { in: trackIds }, ...ZAPPING_CONDITION },
                    _count: { _all: true },
                    _sum: { durationWatched: true },
                }),
                prisma.playbackHistory.groupBy({
                    by: ['mediaId'],
                    where: { mediaId: { in: trackIds }, playMethod: 'DirectPlay', ...ZAPPING_CONDITION },
                    _count: { _all: true },
                }),
            ]);

            const trackDirectPlayMap = new Map(trackDirectPlayAgg.map((row) => [row.mediaId, row._count._all ?? 0]));

            for (const row of trackAgg) {
                const track = trackById.get(row.mediaId);
                if (!track?.parentId) continue;

                const stats = albumChildStats.get(track.parentId) || {
                    plays: 0,
                    dur: 0,
                    dp: 0,
                    childCount: 0,
                    sizeBytes: BigInt(0),
                    totalTrackDurationMs: BigInt(0),
                };

                stats.childCount += 1;
                stats.sizeBytes += toBigInt(track.size);
                stats.totalTrackDurationMs += toBigInt(track.durationMs);
                stats.plays += row._count._all ?? 0;
                stats.dur += row._sum.durationWatched ?? 0;
                stats.dp += trackDirectPlayMap.get(row.mediaId) ?? 0;
                albumChildStats.set(track.parentId, stats);
            }
        }
    }

    const processedMedia = parentItems.map((media) => {
        let plays = 0, durationSeconds = 0, dpCount = 0, childCount = 0;
        if (media.type === 'Movie') {
            const stats = movieStats.get(media.id);
            if (stats) {
                plays = stats.plays;
                durationSeconds = stats.dur;
                dpCount = stats.dp;
            }
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
                bitrateKbps = Math.round(Number(stats.sizeBytes) * 8 / Number(stats.totalTrackDurationMs));
            }
        }

        const durationHours = parseFloat((durationSeconds / 3600).toFixed(1));
        const qualityPercent = plays > 0 ? Math.round((dpCount / plays) * 100) : 0;

        return {
            id: String(media.id),
            jellyfinMediaId: String(media.jellyfinMediaId),
            title: media.title || '',
            type: media.type || 'Movie',
            parentId: media.parentId || null,
            plays,
            durationHours,
            qualityPercent,
            childCount,
            // For Series, prefer the aggregated resolution computed from episodes (mode), fallback to media resolution
            normalizedResolution: media.type === 'Series'
                ? (typeof seriesResolutionMapLocal !== 'undefined' ? (seriesResolutionMapLocal.get(String(media.jellyfinMediaId)) || normalizeResolution(media.resolution)) : normalizeResolution(media.resolution))
                : normalizeResolution(media.resolution),
            bitrateKbps
        };
    });

    if (sortBy === 'duration') processedMedia.sort((a, b) => b.durationHours - a.durationHours);
    else if (sortBy === 'quality') processedMedia.sort((a, b) => b.qualityPercent - a.qualityPercent);
    else processedMedia.sort((a, b) => b.plays - a.plays);

    const totalItems = processedMedia.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
    const safePage = Math.min(currentPage, totalPages);
    const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
    const displayMedia = processedMedia.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    const buildPageUrl = (page: number) => {
        const params = new URLSearchParams();
        if (excludedParam && typeof excludedParam === 'string') params.set('excludeTypes', excludedParam);
        if (sortBy !== 'plays') params.set('sortBy', sortBy);
        if (q) params.set('q', q);
        if (genre) params.set('genre', genre);
        if (serversParam) params.set('servers', serversParam);
        if (page > 1) params.set('page', String(page));
        const qs = params.toString();
        return `/media/all${qs ? `?${qs}` : ''}`;
    };

    return (
        <div className="p-6 max-w-[1400px] mx-auto">
            <h1 className="text-2xl font-bold mb-4">{t('allMedia') || 'Tous les médias'}</h1>
            <div className="mb-4">
                <ServerFilter
                    servers={selectableServerOptions}
                    enabled={multiServerEnabled}
                    showOutsideDashboard
                />
            </div>
            <AllMediaControls />
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
                {displayMedia.map((media) => (
                    <Link href={`/media/${media.jellyfinMediaId}`} key={media.id} className="group flex flex-col space-y-2">
                        <div className={`app-surface-soft relative ${media.type === 'MusicAlbum' ? 'aspect-square' : 'aspect-[2/3]'} rounded-md overflow-hidden ring-1 ring-zinc-200/50 dark:ring-white/10 shadow-lg`}>
                            <FallbackImage src={getJellyfinImageUrl(media.jellyfinMediaId, 'Primary', media.parentId || undefined)} alt={media.title} fill className="object-cover transition-transform duration-500 group-hover:scale-110 group-hover:brightness-50" />
                            {showLibraryMediaBadges && (media.normalizedResolution && !['MusicAlbum', 'Season', 'Series'].includes(media.type)) && (
                                <div className="absolute top-2 right-2 z-10">
                                    <Badge className={`px-1.5 py-0 text-[10px] font-black tracking-tighter uppercase ${media.normalizedResolution === '4K' ? 'bg-orange-500 text-black border-transparent' : media.normalizedResolution === '1080p' ? 'bg-blue-600 text-white border-transparent' : 'bg-zinc-800 text-zinc-300 border-zinc-700'}`}>
                                        {media.normalizedResolution === '4K' ? '4K UHD' : media.normalizedResolution}
                                    </Badge>
                                </div>
                            )}
                            {showLibraryMediaBadges && (media.bitrateKbps && media.type === 'MusicAlbum') && (
                                <div className="absolute top-2 right-2 z-10">
                                    <Badge className="px-1.5 py-0 text-[10px] font-black tracking-tighter uppercase bg-yellow-500/90 text-black border-transparent backdrop-blur-sm">{media.bitrateKbps} KBPS</Badge>
                                </div>
                            )}
                            {showLibraryMediaBadges && media.type === 'Series' && (
                                <div className="absolute top-2 right-2 z-10">
                                    {media.normalizedResolution && media.normalizedResolution !== 'Unknown' ? (
                                        <Badge className={`px-1.5 py-0 text-[10px] font-black tracking-tighter uppercase ${media.normalizedResolution === '4K' ? 'bg-orange-500 text-black border-transparent' : media.normalizedResolution === '1080p' ? 'bg-blue-600 text-white border-transparent' : 'bg-zinc-800 text-zinc-300 border-zinc-700'}`}>
                                            {media.normalizedResolution === '4K' ? '4K UHD' : media.normalizedResolution}
                                        </Badge>
                                    ) : media.plays > 0 ? (
                                        <Badge className={`px-1.5 py-0 text-[10px] font-black tracking-tighter uppercase border-transparent ${media.qualityPercent >= 80 ? 'bg-emerald-500 text-black' : media.qualityPercent >= 50 ? 'bg-amber-500 text-black' : 'bg-red-500 text-white'}`}>
                                            DP {Math.max(0, Math.min(100, media.qualityPercent))}%
                                        </Badge>
                                    ) : null}
                                </div>
                            )}
                        </div>
                        <div className="px-1">
                            <h4 className="font-semibold text-sm truncate text-zinc-900 dark:text-zinc-100">{media.title}</h4>
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
                        <Link href={buildPageUrl(safePage - 1)} className="app-field flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium hover:bg-zinc-800"><ChevronLeft className="w-4 h-4" /> {tc('previous')}</Link>
                    )}
                    <div className="flex items-center gap-2"><span className="text-sm font-medium text-zinc-400">{tc('page')} {safePage} / {totalPages}</span></div>
                    {safePage < totalPages && (
                        <Link href={buildPageUrl(safePage + 1)} className="app-field flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium hover:bg-zinc-800">{tc('next')} <ChevronRight className="w-4 h-4" /></Link>
                    )}
                </div>
            )}
        </div>
    );
}
