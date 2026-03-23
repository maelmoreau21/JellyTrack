import prisma from "@/lib/prisma";
import { getTranslations } from 'next-intl/server';
import LibraryStats from '@/components/media/LibraryStats';
import { formatSize } from '@/lib/size';
import { buildExcludedMediaClause, inferLibraryKey, normalizeLibraryKey } from '@/lib/mediaPolicy';
import { getSanitizedLibraryNames, GHOST_LIBRARY_NAMES } from "@/lib/libraryUtils";
import { isZapped, ZAPPING_CONDITION } from '@/lib/statsUtils';

export const dynamic = "force-dynamic";

export default async function CollectionsPage({ searchParams }: { searchParams?: Record<string, string | string[]> }) {
    const t = await getTranslations('media');
    const tc = await getTranslations('common');

    const settings = await prisma.globalSettings.findUnique({ where: { id: "global" } });
    const excludedLibraries = settings?.excludedLibraries || [];

    // Fetch all leaf media items for library aggregation (include ids for deduplication)
    const allMedia = await prisma.media.findMany({
        where: buildExcludedMediaClause(excludedLibraries) || {},
        select: { id: true, jellyfinMediaId: true, parentId: true, type: true, size: true, durationMs: true, libraryName: true, title: true, collectionType: true }
    });

    // Use a loose any map so we can store intermediate Sets for deduplication/resolution
    const libraryStatsMap = new Map<string, any>();

    const sanitizedLibraries = await getSanitizedLibraryNames();
    const ghostNames = new Set(GHOST_LIBRARY_NAMES);

    // Initial pass to set up mapping from normalized key to preferred display name
    // and initialize the stats objects.
    for (const name of sanitizedLibraries) {
        const key = normalizeLibraryKey(name) || name;
        if (!libraryStatsMap.has(key)) {
            libraryStatsMap.set(key, {
                displayName: name, // Original name from Jellyfin is preferred
                size: BigInt(0),
                duration: BigInt(0),
                watchedSeconds: 0,
                items: 0,
                movies: 0,
                series: 0,
                music: 0,
                books: 0,
                collectionType: null,
                uniqueMovies: new Set<string>(),
                uniqueSeries: new Set<string>(),
                uniqueMusicAlbums: new Set<string>(),
                uniqueBooks: new Set<string>(),
                pendingSeasonIds: new Set<string>(),
                pendingAlbumIds: new Set<string>(),
                ignoredTracks: 0,
                ignoredEpisodes: 0,
                rawNames: new Set<string>([name])
            });
        } else {
            // Already seen this normalized key (e.g. "music" vs "Musique")
            // Keep the first name as display name, but aggregate rawNames
            libraryStatsMap.get(key).rawNames.add(name);
        }
    }

    let totalSizeBytes = BigInt(0);
    let totalDurationMs = BigInt(0);
    let totalWatchedSeconds = 0; // aggregated from playback history
    let movieCount = 0;
    let seriesCount = 0;
    let albumCount = 0;
    let bookCount = 0;

    const TOP_LEVEL_TYPES = new Set(['Movie', 'Series', 'MusicAlbum', 'Book', 'AudioBook']);
    for (const m of allMedia) {
        if (!m.libraryName || m.collectionType === 'boxsets') continue;
        
        // Use normalized key for deduplication
        const key = normalizeLibraryKey(m.collectionType || m.libraryName) || m.libraryName;

        if (!libraryStatsMap.has(key)) {
            let libDisplayName = m.libraryName;
            
            // Resolve UHD names and others via translations
            const norm = normalizeLibraryKey(m.libraryName);
            if (norm && norm !== m.libraryName) {
                try {
                    const translated = tc(norm);
                    if (translated && !translated.includes('.')) {
                        libDisplayName = translated;
                    }
                } catch { /* ignore */ }
            }

            libraryStatsMap.set(key, {
                displayName: libDisplayName,
                size: BigInt(0),
                duration: BigInt(0),
                watchedSeconds: 0,
                items: 0,
                movies: 0,
                series: 0,
                music: 0,
                books: 0,
                collectionType: m.collectionType,
                uniqueMovies: new Set<string>(),
                uniqueSeries: new Set<string>(),
                uniqueMusicAlbums: new Set<string>(),
                uniqueBooks: new Set<string>(),
                pendingSeasonIds: new Set<string>(),
                pendingAlbumIds: new Set<string>(),
                ignoredTracks: 0,
                ignoredEpisodes: 0,
                rawNames: new Set<string>([m.libraryName])
            });
        }

        const lib = libraryStatsMap.get(key)!;
        lib.rawNames.add(m.libraryName);
        if (!lib.collectionType && m.collectionType) lib.collectionType = m.collectionType;

        // Aggregate size (if present) from all media records
        if (m.size != null) {
            const sizeBig = typeof m.size === 'bigint' ? m.size : BigInt(Math.floor(Number(m.size)));
            lib.size = (lib.size || BigInt(0)) + sizeBig;
            totalSizeBytes += sizeBig;
        }

        const LEAF_TYPES = new Set(['Movie', 'Episode', 'Audio', 'Book', 'AudioBook']);
        // Aggregate media duration (if present)
        if (m.durationMs != null) {
            const durBig = typeof m.durationMs === 'bigint' ? m.durationMs : BigInt(Math.floor(Number(m.durationMs)));
            lib.duration = (lib.duration || BigInt(0)) + durBig;
            
            // Avoid double counting: ignore container types like Series/Season in the global collection total
            if (LEAF_TYPES.has(m.type || '')) {
                totalDurationMs += durBig;
            }
        }

        const mediaKey = m.jellyfinMediaId ? String(m.jellyfinMediaId) : String(m.id || '');

        if (TOP_LEVEL_TYPES.has(m.type || '')) {
            if (m.type === 'Movie') {
                lib.uniqueMovies.add(mediaKey);
            } else if (m.type === 'Series') {
                lib.uniqueSeries.add(mediaKey);
            } else if (m.type === 'MusicAlbum') {
                lib.uniqueMusicAlbums.add(mediaKey);
            } else if (m.type === 'Book' || m.type === 'AudioBook') {
                lib.uniqueBooks.add(mediaKey);
            }
        } else {
            if (m.type === 'Season') {
                if (m.parentId) lib.uniqueSeries.add(String(m.parentId));
                else if (m.jellyfinMediaId) lib.pendingSeasonIds.add(String(m.jellyfinMediaId));
            }
            if (m.type === 'Episode') {
                lib.ignoredEpisodes = (lib.ignoredEpisodes || 0) + 1;
                if (m.parentId) lib.pendingSeasonIds.add(String(m.parentId));
            }
            if (m.type === 'Track' || m.type === 'Audio') {
                lib.ignoredTracks = (lib.ignoredTracks || 0) + 1;
                if (m.parentId) lib.pendingAlbumIds.add(String(m.parentId));
            }
        }
    }

    // Resolve pending season/album parent ids to their parent series/album entries
    try {
        const allPendingSeasonIds = new Set<string>();
        const allPendingAlbumIds = new Set<string>();
        for (const [, s] of libraryStatsMap) {
            for (const id of s.pendingSeasonIds || []) allPendingSeasonIds.add(id);
            for (const id of s.pendingAlbumIds || []) allPendingAlbumIds.add(id);
        }

        if (allPendingSeasonIds.size > 0) {
            const seasons = await prisma.media.findMany({ where: { jellyfinMediaId: { in: Array.from(allPendingSeasonIds) } }, select: { jellyfinMediaId: true, parentId: true, libraryName: true } });
            for (const se of seasons) {
                const seriesId = se.parentId || se.jellyfinMediaId;
                const key = normalizeLibraryKey(se.libraryName) || se.libraryName || tc('other');
                if (!libraryStatsMap.has(key)) continue;
                const lib = libraryStatsMap.get(key)!;
                if (seriesId && !lib.uniqueSeries.has(String(seriesId))) lib.uniqueSeries.add(String(seriesId));
            }
        }

        if (allPendingAlbumIds.size > 0) {
            const albums = await prisma.media.findMany({ where: { jellyfinMediaId: { in: Array.from(allPendingAlbumIds) } }, select: { jellyfinMediaId: true, libraryName: true } });
            for (const al of albums) {
                const albumId = al.jellyfinMediaId;
                const key = normalizeLibraryKey(al.libraryName) || al.libraryName || tc('other');
                if (!libraryStatsMap.has(key)) continue;
                const lib = libraryStatsMap.get(key)!;
                if (albumId && !lib.uniqueMusicAlbums.has(String(albumId))) lib.uniqueMusicAlbums.add(String(albumId));
            }
        }
    } catch (e) {
        console.warn('[CollectionsPage] Failed to resolve pending parent ids:', e);
    }

    // Convert deduplicated sets into numeric counts and aggregate totals
    movieCount = 0; seriesCount = 0; albumCount = 0; bookCount = 0;
    for (const [, s] of libraryStatsMap) {
        s.movies = (s.uniqueMovies?.size) || 0;
        s.series = (s.uniqueSeries?.size) || 0;
        s.music = (s.uniqueMusicAlbums?.size) || 0;
        s.books = (s.uniqueBooks?.size) || 0;
        s.items = s.movies + s.series + s.music + s.books;
        movieCount += s.movies;
        seriesCount += s.series;
        albumCount += s.music;
        bookCount += s.books;
    }

    try {
        const playbackAgg = await prisma.playbackHistory.groupBy({ by: ['mediaId'], _sum: { durationWatched: true }, where: ZAPPING_CONDITION });
        const mediaIdsWithHistory = playbackAgg.map(p => p.mediaId);
        const mediasForHistory = mediaIdsWithHistory.length > 0 ? await prisma.media.findMany({ where: { id: { in: mediaIdsWithHistory } }, select: { id: true, libraryName: true } }) : [];
        const mediaToLibKey = new Map(mediasForHistory.map(m => [m.id, normalizeLibraryKey(m.libraryName) || m.libraryName || tc('other')]));
        
        for (const p of playbackAgg) {
            const seconds = p._sum?.durationWatched ?? 0;
            totalWatchedSeconds += seconds;
            const key = mediaToLibKey.get(p.mediaId) || tc('other');
            
            if (!libraryStatsMap.has(key)) {
                libraryStatsMap.set(key, { 
                    displayName: key, 
                    size: BigInt(0), 
                    duration: BigInt(0), 
                    watchedSeconds: 0, 
                    items: 0, 
                    movies: 0, 
                    series: 0, 
                    music: 0, 
                    books: 0, 
                    collectionType: null, 
                    rawNames: new Set() 
                });
            }
            const lib = libraryStatsMap.get(key)!;
            lib.watchedSeconds = (lib.watchedSeconds ?? 0) + seconds;
        }
    } catch (e) {
        console.warn('[CollectionsPage] Failed to aggregate playback history by library:', e);
    }

    const globalSize = formatSize(totalSizeBytes);
    const totalTB = `${globalSize.value} ${globalSize.unit}`;

    // Total Duration: Show the sum of media durations ALWAYS (the user wants to see the total size of their collection)
    const totalDays = Math.floor(Number(totalDurationMs) / (1000 * 60 * 60 * 24));
    const totalHoursAfterDays = Math.floor((Number(totalDurationMs) % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const timeLabel = t('timeDays', { days: totalDays, hours: totalHoursAfterDays });

    const validLibraries = Array.from(libraryStatsMap.entries()).filter(([key, stats]) => {
        if (ghostNames.has(key)) return false;
        if (key === tc('other')) {
            const hasItems = stats.movies > 0 || stats.series > 0 || stats.music > 0 || stats.books > 0 || stats.watchedSeconds > 0;
            return hasItems;
        }
        return true;
    });

    const debugEnabled = (searchParams && String(searchParams.debugCollections) === '1') || process.env.DEBUG_COLLECTIONS === '1';
    const debugOutput = debugEnabled ? Array.from(libraryStatsMap.entries()).map(([key, stats]) => ({
        key,
        displayName: stats.displayName,
        rawNames: stats.rawNames ? Array.from(stats.rawNames as Set<string>) : [],
        size: String(stats.size ?? '0'),
        duration: String(stats.duration ?? '0'),
        items: stats.items ?? 0,
        movies: stats.movies ?? 0,
        series: stats.series ?? 0,
        music: stats.music ?? 0,
        books: stats.books ?? 0,
        ignoredTracks: stats.ignoredTracks ?? 0,
        ignoredEpisodes: stats.ignoredEpisodes ?? 0,
        watchedSeconds: stats.watchedSeconds ?? 0
    })) : null;

    const libraryStatsList = await Promise.all(validLibraries.map(async ([key, stats]) => {
        const size = formatSize(stats.size);
        const rawNames = stats.rawNames ? Array.from(stats.rawNames as Set<string>) : [stats.displayName || key];
        
        const topContent = await prisma.playbackHistory.groupBy({ 
            by: ['mediaId'], 
            where: { media: { libraryName: { in: rawNames } } }, 
            _count: { mediaId: true }, 
            orderBy: { _count: { mediaId: 'desc' } }, 
            take: 1 
        });
        
        let topItem = null;
        if (topContent.length > 0) {
            topItem = await prisma.media.findUnique({ where: { id: topContent[0].mediaId }, select: { title: true, type: true, jellyfinMediaId: true } });
        }
        
        const lastAdded = await prisma.media.findFirst({ 
            where: { 
                libraryName: { in: rawNames }, 
                type: { in: ['Movie', 'Series', 'MusicAlbum', 'BoxSet'] } 
            }, 
            orderBy: { dateAdded: 'desc' }, 
            select: { title: true, dateAdded: true, jellyfinMediaId: true } 
        });

        // For per-library duration, show the total media duration too, unless it's 0 then show watched.
        let d = 0; let h = 0;
        const durToUse = stats.duration > BigInt(0) ? stats.duration : BigInt((stats.watchedSeconds || 0) * 1000);
        d = Math.floor(Number(durToUse) / (1000 * 60 * 60 * 24));
        h = Math.floor((Number(durToUse) % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

        return {
            name: stats.displayName || key,
            collectionType: stats.collectionType,
            size: `${size.value} ${size.unit}`,
            duration: t('timeDays', { days: d, hours: h }),
            counts: [ stats.movies > 0 && `${stats.movies} ${tc('movies').toLowerCase()}`, stats.series > 0 && `${stats.series} ${tc('series').toLowerCase()}`, stats.music > 0 && `${stats.music} ${tc('music').toLowerCase()}`, stats.books > 0 && `${stats.books} ${tc('books').toLowerCase()}` ].filter(Boolean).join(', ') || tc('noData'),
            topItem: (topItem && topContent[0]._count.mediaId) ? { title: topItem.title, plays: topContent[0]._count.mediaId, id: topItem.jellyfinMediaId, type: topItem.type } : null,
            lastAdded: lastAdded ? { title: lastAdded.title, date: lastAdded.dateAdded ? lastAdded.dateAdded.toISOString() : null, id: lastAdded.jellyfinMediaId } : null
            ,
            ignoredTracks: stats.ignoredTracks || 0,
            ignoredEpisodes: stats.ignoredEpisodes || 0
        };
    }));

    libraryStatsList.sort((a, b) => a.name.localeCompare(b.name));

    return (
        <div className="p-6 max-w-[1400px] mx-auto">
            <h1 className="text-2xl font-bold mb-4">{t('libraryCollections') || 'Collections'}</h1>
            {debugEnabled && debugOutput ? (
                <div className="mb-4 p-3 bg-slate-800/70 text-sm rounded">
                    <div className="font-medium mb-2">Debug: Collections snapshot</div>
                    <pre className="whitespace-pre-wrap max-h-72 overflow-auto text-xs">{JSON.stringify(debugOutput, null, 2)}</pre>
                </div>
            ) : null}
            <LibraryStats
                totalTB={totalTB}
                movieCount={movieCount}
                seriesCount={seriesCount}
                albumCount={albumCount}
                bookCount={bookCount}
                timeLabel={timeLabel}
                libraries={libraryStatsList}
            />
        </div>
    );
}
