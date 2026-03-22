import prisma from "@/lib/prisma";
import { getTranslations } from 'next-intl/server';
import LibraryStats from '@/components/media/LibraryStats';
import { formatSize } from '@/lib/size';
import { buildExcludedMediaClause, inferLibraryKey, normalizeLibraryKey } from '@/lib/mediaPolicy';
import { getSanitizedLibraryNames, GHOST_LIBRARY_NAMES } from "@/lib/libraryUtils";
import { isZapped, ZAPPING_CONDITION } from '@/lib/statsUtils';

export const dynamic = "force-dynamic";

export default async function CollectionsPage() {
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

    // Pre-populate sanitized libraries so empty ones show
    for (const name of sanitizedLibraries) {
        if (!libraryStatsMap.has(name)) {
            libraryStatsMap.set(name, {
                size: BigInt(0),
                duration: BigInt(0),
                watchedSeconds: 0,
                items: 0,
                movies: 0,
                series: 0,
                music: 0,
                books: 0,
                collectionType: null,
                // Sets used to deduplicate by jellyfin ids / parents
                uniqueMovies: new Set<string>(),
                uniqueSeries: new Set<string>(),
                uniqueMusicAlbums: new Set<string>(),
                uniqueBooks: new Set<string>(),
                // Pending parent ids to resolve (season -> series, track -> album)
                pendingSeasonIds: new Set<string>(),
                pendingAlbumIds: new Set<string>(),
                // Counters for ignored (non top-level) items to surface in UI
                ignoredTracks: 0,
                ignoredEpisodes: 0
            });
        }
    }

    let totalSizeBytes = BigInt(0);
    let totalDurationMs = BigInt(0);
    let totalWatchedSeconds = 0; // aggregated from playback history
    let movieCount = 0;
    let seriesCount = 0;
    let albumCount = 0;
    let bookCount = 0;

    // Compute per-library stats from the fetched `allMedia` array.
    // Track deduplication sets for movies/series/albums/books and also
    // collect pending parent ids for seasons/tracks which will be resolved
    // in a second pass against the DB to map season -> series and track -> album.
    const TOP_LEVEL_TYPES = new Set(['Movie', 'Series', 'MusicAlbum', 'Book', 'AudioBook']);
    for (const m of allMedia) {
        if (!m.libraryName || m.collectionType === 'boxsets') continue;
        
        // Normalize and localize the library name for grouping
        const normKey = normalizeLibraryKey(m.collectionType || m.libraryName);
        let libName = m.libraryName;
        if (normKey) {
            try {
                const translated = tc(normKey);
                if (translated && !translated.includes('.')) {
                    libName = translated;
                }
            } catch { /* ignore */ }
        }

        if (!libraryStatsMap.has(libName)) {
            libraryStatsMap.set(libName, {
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
                // Keep track of raw names for database queries later
                rawNames: new Set<string>()
            });
        }
        const lib = libraryStatsMap.get(libName)!;
        lib.rawNames.add(m.libraryName);
        if (!lib.collectionType && m.collectionType) lib.collectionType = m.collectionType;

        // Aggregate size (if present) from all media records (tracks, files, parents)
        if (m.size != null) {
            const sizeBig = typeof m.size === 'bigint' ? m.size : BigInt(Math.floor(Number(m.size)));
            lib.size = (lib.size || BigInt(0)) + sizeBig;
            totalSizeBytes += sizeBig;
        }

        // Aggregate media duration (if present) as a fallback when there is no playback history
        if (m.durationMs != null) {
            const durBig = typeof m.durationMs === 'bigint' ? m.durationMs : BigInt(Math.floor(Number(m.durationMs)));
            lib.duration = (lib.duration || BigInt(0)) + durBig;
            totalDurationMs += durBig;
        }

        const mediaKey = m.jellyfinMediaId ? String(m.jellyfinMediaId) : String(m.id || '');

        // Top-level types - deduplicate by jellyfinMediaId
        if (TOP_LEVEL_TYPES.has(m.type || '')) {
            if (m.type === 'Movie') {
                if (!lib.uniqueMovies.has(mediaKey)) {
                    lib.uniqueMovies.add(mediaKey);
                }
            } else if (m.type === 'Series') {
                if (!lib.uniqueSeries.has(mediaKey)) {
                    lib.uniqueSeries.add(mediaKey);
                }
            } else if (m.type === 'MusicAlbum') {
                if (!lib.uniqueMusicAlbums.has(mediaKey)) {
                    lib.uniqueMusicAlbums.add(mediaKey);
                }
            } else if (m.type === 'Book' || m.type === 'AudioBook') {
                if (!lib.uniqueBooks.has(mediaKey)) {
                    lib.uniqueBooks.add(mediaKey);
                }
            }
        } else {
            // Non top-level: keep counters and remember parent ids to resolve later
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
                const libName = se.libraryName || tc('other');
                if (!libraryStatsMap.has(libName)) continue;
                const lib = libraryStatsMap.get(libName)!;
                if (seriesId && !lib.uniqueSeries.has(String(seriesId))) lib.uniqueSeries.add(String(seriesId));
            }
        }

        if (allPendingAlbumIds.size > 0) {
            const albums = await prisma.media.findMany({ where: { jellyfinMediaId: { in: Array.from(allPendingAlbumIds) } }, select: { jellyfinMediaId: true, libraryName: true } });
            for (const al of albums) {
                const albumId = al.jellyfinMediaId;
                const libName = al.libraryName || tc('other');
                if (!libraryStatsMap.has(libName)) continue;
                const lib = libraryStatsMap.get(libName)!;
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

    // Sizes were aggregated above from the `allMedia` set to avoid DB groupBy mismatches
    // and to support the variety of Jellyfin `type` values. If needed, a DB-side groupBy
    // could be reintroduced but must include all relevant types.

    try {
        const playbackAgg = await prisma.playbackHistory.groupBy({ by: ['mediaId'], _sum: { durationWatched: true }, where: ZAPPING_CONDITION });
        const mediaIdsWithHistory = playbackAgg.map(p => p.mediaId);
        const mediasForHistory = mediaIdsWithHistory.length > 0 ? await prisma.media.findMany({ where: { id: { in: mediaIdsWithHistory } }, select: { id: true, libraryName: true } }) : [];
        const mediaToLib = new Map(mediasForHistory.map(m => [m.id, m.libraryName || tc('other')]));
        for (const p of playbackAgg) {
            const seconds = p._sum?.durationWatched ?? 0;
            totalWatchedSeconds += seconds;
            const rawLibName = mediaToLib.get(p.mediaId) || tc('other');
            
            // Normalize the library name from playback history to match regrouped stats
            const normKey = normalizeLibraryKey(rawLibName);
            let libName = rawLibName;
            if (normKey) {
                try {
                    const translated = tc(normKey);
                    if (translated && !translated.includes('.')) {
                        libName = translated;
                    }
                } catch { /* ignore */ }
            }

            if (!libraryStatsMap.has(libName)) {
                libraryStatsMap.set(libName, { size: BigInt(0), duration: BigInt(0), watchedSeconds: 0, items: 0, movies: 0, series: 0, music: 0, books: 0, collectionType: null, rawNames: new Set([rawLibName]) });
            }
            const lib = libraryStatsMap.get(libName)!;
            lib.watchedSeconds = (lib.watchedSeconds ?? 0) + seconds;
            lib.rawNames?.add(rawLibName);
        }
    } catch (e) {
        console.warn('[CollectionsPage] Failed to aggregate playback history by library:', e);
    }

    const globalSize = formatSize(totalSizeBytes);
    const totalTB = `${globalSize.value} ${globalSize.unit}`;

    // Prefer total watched time (aggregated from playback history). Fall back to sum of media durations.
    let timeLabel = t('timeDays', { days: 0, hours: 0 });
    if (totalWatchedSeconds > 0) {
        const totalDays = Math.floor(totalWatchedSeconds / (60 * 60 * 24));
        const totalHoursAfterDays = Math.floor((totalWatchedSeconds % (60 * 60 * 24)) / (60 * 60));
        timeLabel = t('timeDays', { days: totalDays, hours: totalHoursAfterDays });
    } else {
        const totalDays = Math.floor(Number(totalDurationMs) / (1000 * 60 * 60 * 24));
        const totalHoursAfterDays = Math.floor((Number(totalDurationMs) % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        timeLabel = t('timeDays', { days: totalDays, hours: totalHoursAfterDays });
    }

    const validLibraries = Array.from(libraryStatsMap.entries()).filter(([name, stats]) => {
        if (new Set(GHOST_LIBRARY_NAMES).has(name)) return false;
        if (name === tc('other')) {
            const hasItems = stats.movies > 0 || stats.series > 0 || stats.music > 0 || stats.books > 0;
            return hasItems;
        }
        return true;
    });

    const libraryStatsList = await Promise.all(validLibraries.map(async ([name, stats]) => {
        const size = formatSize(stats.size);
        const rawNames = stats.rawNames ? Array.from(stats.rawNames as Set<string>) : [name];
        
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
        let d = 0; let h = 0;
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
            counts: [ stats.movies > 0 && `${stats.movies} ${tc('movies').toLowerCase()}`, stats.series > 0 && `${stats.series} ${tc('series').toLowerCase()}`, stats.music > 0 && `${stats.music} ${tc('music').toLowerCase()}`, stats.books > 0 && `${stats.books} ${tc('books').toLowerCase()}` ].filter(Boolean).join(', ') || tc('noData'),
            topItem: (topItem && topContent[0]._count.mediaId) ? { title: topItem.title, plays: topContent[0]._count.mediaId, id: topItem.jellyfinMediaId, type: topItem.type } : null,
            lastAdded: lastAdded ? { title: lastAdded.title, date: lastAdded.dateAdded ? lastAdded.dateAdded.toISOString() : null, id: lastAdded.jellyfinMediaId } : null
            ,
            ignoredTracks: stats.ignoredTracks || 0,
            ignoredEpisodes: stats.ignoredEpisodes || 0
        };
    }));

    libraryStatsList.sort((a, b) => b.name.localeCompare(a.name));

    return (
        <div className="p-6 max-w-[1400px] mx-auto">
            <h1 className="text-2xl font-bold mb-4">{t('libraryCollections') || 'Collections'}</h1>
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
