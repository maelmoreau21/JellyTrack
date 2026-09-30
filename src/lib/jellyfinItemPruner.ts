/**
 * Jellyfin Media Item Pruner & Metadata Normalizer
 * Extracts and sanitizes media fields from Jellyfin API responses.
 */

export type PrunedJellyfinItem = {
    Id: string;
    Name: string;
    Type: string;
    CollectionType: string | null;
    ParentId: string | null;
    SeasonId: string | null;
    SeriesId: string | null;
    AlbumId: string | null;
    Genres: string[];
    Studios: string[];
    Directors: string[];
    Actors: string[];
    MediaSourceSize: bigint | null;
    VideoStreamWidth: number | null;
    VideoStreamHeight: number | null;
    RunTimeTicks: bigint | null;
    AlbumArtist: string | null;
    DateCreated: Date;
};

export function pruneJellyfinItem(raw: Record<string, any>): PrunedJellyfinItem {
    const rawId = typeof raw?.Id === 'string' ? raw.Id : '';

    const genres = Array.isArray(raw?.Genres)
        ? (raw.Genres.filter((g: unknown) => typeof g === 'string') as string[])
        : [];

    const studios = Array.isArray(raw?.Studios)
        ? (raw.Studios
            .map((s: any) => (typeof s === 'string' ? s : s?.Name))
            .filter((s: unknown) => typeof s === 'string') as string[])
        : [];

    const people = Array.isArray(raw?.People) ? raw.People : [];
    const directors = people
        .filter((p: any) => p?.Type === 'Director')
        .map((p: any) => p?.Name)
        .filter((n: unknown) => typeof n === 'string') as string[];
    const actors = people
        .filter((p: any) => p?.Type === 'Actor')
        .map((p: any) => p?.Name)
        .filter((n: unknown) => typeof n === 'string') as string[];

    let mediaSourceSize: bigint | null = null;
    let videoStreamWidth: number | null = null;
    let videoStreamHeight: number | null = null;

    if (Array.isArray(raw?.MediaSources) && raw.MediaSources.length > 0) {
        let totalSize = BigInt(0);
        let hasValidSize = false;

        for (const ms of raw.MediaSources) {
            if (ms.Size !== undefined && ms.Size !== null) {
                try {
                    totalSize += BigInt(ms.Size);
                    hasValidSize = true;
                } catch {
                    // Ignore non-numeric size
                }
            }
            const vs = Array.isArray(ms.MediaStreams)
                ? ms.MediaStreams.find((s: any) => s?.Type === 'Video')
                : undefined;
            if (vs) {
                const w = typeof vs.Width === 'number' ? vs.Width : (typeof vs.Width === 'string' && !Number.isNaN(Number(vs.Width)) ? Number(vs.Width) : null);
                const h = typeof vs.Height === 'number' ? vs.Height : (typeof vs.Height === 'string' && !Number.isNaN(Number(vs.Height)) ? Number(vs.Height) : null);
                if (w !== null && (videoStreamWidth === null || w > videoStreamWidth)) {
                    videoStreamWidth = w;
                }
                if (h !== null && (videoStreamHeight === null || h > videoStreamHeight)) {
                    videoStreamHeight = h;
                }
            }
        }

        if (hasValidSize) {
            mediaSourceSize = totalSize;
        }
    }

    let runTimeTicks: bigint | null = null;
    if (raw?.RunTimeTicks !== undefined && raw?.RunTimeTicks !== null) {
        const ticksNum = Number(raw.RunTimeTicks);
        if (!Number.isNaN(ticksNum)) {
            runTimeTicks = BigInt(Math.floor(ticksNum / 10000));
        }
    }

    const artist = (typeof raw?.AlbumArtist === 'string' && raw.AlbumArtist.trim())
        ? raw.AlbumArtist.trim()
        : (typeof raw?.AlbumArtists?.[0]?.Name === 'string' && raw.AlbumArtists[0].Name.trim())
            ? raw.AlbumArtists[0].Name.trim()
            : (typeof raw?.Artists?.[0] === 'string' && raw.Artists[0].trim())
                ? raw.Artists[0].trim()
                : null;

    let dateCreated = new Date();
    if (raw?.DateCreated) {
        const parsed = new Date(raw.DateCreated);
        if (!Number.isNaN(parsed.getTime())) {
            dateCreated = parsed;
        }
    }

    return {
        Id: rawId,
        Name: typeof raw?.Name === 'string' ? raw.Name : 'Unknown',
        Type: typeof raw?.Type === 'string' ? raw.Type : '',
        CollectionType: typeof raw?.CollectionType === 'string' ? raw.CollectionType : null,
        ParentId: typeof raw?.ParentId === 'string' ? raw.ParentId : null,
        SeasonId: typeof raw?.SeasonId === 'string' ? raw.SeasonId : null,
        SeriesId: typeof raw?.SeriesId === 'string' ? raw.SeriesId : null,
        AlbumId: typeof raw?.AlbumId === 'string' ? raw.AlbumId : null,
        Genres: genres,
        Studios: studios,
        Directors: directors,
        Actors: actors,
        MediaSourceSize: mediaSourceSize,
        VideoStreamWidth: videoStreamWidth,
        VideoStreamHeight: videoStreamHeight,
        RunTimeTicks: runTimeTicks,
        AlbumArtist: artist,
        DateCreated: dateCreated,
    };
}
