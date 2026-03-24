import prisma from "@/lib/prisma";
import { getTranslations } from 'next-intl/server';
import { FallbackImage } from '@/components/FallbackImage';
import { getJellyfinImageUrl } from '@/lib/jellyfin';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Film, ChevronLeft, ChevronRight } from 'lucide-react';
import AllMediaControls from '@/components/media/AllMediaControls';
import { normalizeResolution } from '@/lib/utils';
import { isZapped, ZAPPING_CONDITION } from '@/lib/statsUtils';
import { buildExcludedMediaClause } from '@/lib/mediaPolicy';

export const dynamic = "force-dynamic";

const ITEMS_PER_PAGE = 50;

export default async function AllMediaPage({ searchParams: searchParamsPromise }: { searchParams?: Promise<any> }) {
    const searchParams = await searchParamsPromise;
    const t = await getTranslations('media');
    const tc = await getTranslations('common');
    const excludedParam = searchParams?.excludeTypes;
    const excludedTypes = excludedParam && typeof excludedParam === 'string' ? excludedParam.split(',') : [];
    
    const sortBy = searchParams?.sortBy || 'plays';
    const q = typeof searchParams?.q === 'string' ? (searchParams.q || '').trim() : undefined;
    const genre = typeof searchParams?.genre === 'string' ? (searchParams.genre || '').trim() : undefined;
    const currentPage = Math.max(1, parseInt(searchParams?.page || '1', 10) || 1);

    const settings = await prisma.globalSettings.findUnique({ where: { id: 'global' } });
    const excludedLibraries = settings?.excludedLibraries || [];

    const baseTypes = ['Movie', 'Series', 'MusicAlbum'];
    const displayTypes = baseTypes.filter(t => !excludedTypes.includes(t));

    const mediaWhere: any = { type: { in: displayTypes.length > 0 ? displayTypes : baseTypes } };
    const excludedClause = buildExcludedMediaClause(excludedLibraries);
    if (excludedClause) mediaWhere.AND = [excludedClause];

    // If a free-text query is provided, search title or people/studio arrays
    if (q && q.length >= 2) {
        const searchMode = 'insensitive';
        const orClause = {
            OR: [
                { title: { contains: q, mode: searchMode } },
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
        include: { playbackHistory: { select: { durationWatched: true, playMethod: true } } },
    });

    // Optional: filter by normalized resolution (client links from analysis page use `resolution`)
    const resolutionFilter = typeof searchParams?.resolution === 'string' && searchParams.resolution ? String(searchParams.resolution) : null;
    if (resolutionFilter) {
        parentItems = parentItems.filter((m: any) => normalizeResolution(m.resolution) === resolutionFilter);
    }

    const seriesIdList = parentItems.filter((m: any) => m.type === 'Series').map((m: any) => String(m.jellyfinMediaId));
    const seriesChildStats = new Map<string, { plays: number; dur: number; dp: number; childCount: number }>();
    if (seriesIdList.length > 0) {
        const seasons = await prisma.media.findMany({ where: { type: 'Season', parentId: { in: seriesIdList } }, select: { jellyfinMediaId: true, parentId: true } });
        const seasonToSeries = new Map(seasons.map((s) => [s.jellyfinMediaId, s.parentId ?? '']));
        const seasonIdList = seasons.map((s) => s.jellyfinMediaId);
        if (seasonIdList.length > 0) {
            const episodes = await prisma.media.findMany({ where: { type: 'Episode', parentId: { in: seasonIdList } }, include: { playbackHistory: { select: { durationWatched: true, playMethod: true } } } });
            for (const ep of episodes as any) {
                const sid = seasonToSeries.get(ep.parentId!);
                if (!sid) continue;
                const filteredHistory = (ep.playbackHistory || []).filter((h: any) => !isZapped({ ...h, media: { type: 'Episode' } }));
                if (filteredHistory.length === 0) continue;
                const s = seriesChildStats.get(sid) || { plays: 0, dur: 0, dp: 0, childCount: 0 };
                s.childCount++;
                s.plays += filteredHistory.length;
                s.dur += filteredHistory.reduce((a: number, h: any) => a + (h.durationWatched || 0), 0);
                s.dp += filteredHistory.filter((h: any) => h.playMethod === 'DirectPlay').length;
                seriesChildStats.set(sid, s);
            }
        }
    }

    const albumIdList = parentItems.filter((m: any) => m.type === 'MusicAlbum').map((m: any) => String(m.jellyfinMediaId));
    const albumChildStats = new Map<string, { plays: number; dur: number; dp: number; childCount: number; sizeBytes: bigint; totalTrackDurationMs: bigint }>();
    if (albumIdList.length > 0) {
        const tracks = await prisma.media.findMany({ where: { type: 'Audio', parentId: { in: albumIdList } }, select: { parentId: true, size: true, durationMs: true, playbackHistory: { select: { durationWatched: true, playMethod: true } } } });
        for (const track of tracks as any) {
            if (!track.parentId) continue;
            const filteredHistory = (track.playbackHistory || []).filter((h: any) => !isZapped({ ...h, media: { type: 'Audio' } }));
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
            s.dur += filteredHistory.reduce((a: number, h: any) => a + (h.durationWatched || 0), 0);
            s.dp += filteredHistory.filter((h: any) => h.playMethod === 'DirectPlay').length;
            albumChildStats.set(track.parentId, s);
        }
    }

    const processedMedia = parentItems.map((media: any) => {
        let plays = 0, durationSeconds = 0, dpCount = 0, childCount = 0;
        if (media.type === 'Movie') {
            const filteredHistory = (media.playbackHistory || []).filter((h: any) => !isZapped({ ...h, media: { type: 'Movie' } }));
            plays = filteredHistory.length;
            durationSeconds = filteredHistory.reduce((a: number, h: any) => a + (h.durationWatched || 0), 0);
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
                bitrateKbps = Math.round(Number(stats.sizeBytes) * 8 / Number(stats.totalTrackDurationMs));
            }
        }

        const durationHours = parseFloat((durationSeconds / 3600).toFixed(1));
        const qualityPercent = plays > 0 ? Math.round((dpCount / plays) * 100) : 0;

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

    if (sortBy === 'duration') processedMedia.sort((a: any, b: any) => b.durationHours - a.durationHours);
    else if (sortBy === 'quality') processedMedia.sort((a: any, b: any) => b.qualityPercent - a.qualityPercent);
    else processedMedia.sort((a: any, b: any) => b.plays - a.plays);

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
        if (page > 1) params.set('page', String(page));
        const qs = params.toString();
        return `/media/all${qs ? `?${qs}` : ''}`;
    };

    return (
        <div className="p-6 max-w-[1400px] mx-auto">
            <h1 className="text-2xl font-bold mb-4">{t('allMedia') || 'Tous les médias'}</h1>
            <AllMediaControls />
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
                {displayMedia.map((media: any) => (
                    <Link href={`/media/${media.jellyfinMediaId}`} key={media.id} className="group flex flex-col space-y-2">
                        <div className={`app-surface-soft relative ${media.type === 'MusicAlbum' ? 'aspect-square' : 'aspect-[2/3]'} rounded-md overflow-hidden ring-1 ring-zinc-200/50 dark:ring-white/10 shadow-lg`}>
                            <FallbackImage src={getJellyfinImageUrl(media.jellyfinMediaId, 'Primary', media.parentId || undefined)} alt={media.title} fill className="object-cover transition-transform duration-500 group-hover:scale-110 group-hover:brightness-50" />
                            {(media.normalizedResolution && !['MusicAlbum', 'Season', 'Series'].includes(media.type)) && (
                                <div className="absolute top-2 right-2 z-10">
                                    <Badge className={`px-1.5 py-0 text-[10px] font-black tracking-tighter uppercase ${media.normalizedResolution === '4K' ? 'bg-orange-500 text-black border-transparent' : media.normalizedResolution === '1080p' ? 'bg-blue-600 text-white border-transparent' : 'bg-zinc-800 text-zinc-300 border-zinc-700'}`}>
                                        {media.normalizedResolution === '4K' ? '4K UHD' : media.normalizedResolution}
                                    </Badge>
                                </div>
                            )}
                            {(media.bitrateKbps && media.type === 'MusicAlbum') && (
                                <div className="absolute top-2 right-2 z-10">
                                    <Badge className="px-1.5 py-0 text-[10px] font-black tracking-tighter uppercase bg-yellow-500/90 text-black border-transparent backdrop-blur-sm">{media.bitrateKbps} KBPS</Badge>
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
