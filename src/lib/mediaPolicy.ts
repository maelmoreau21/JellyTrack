type MediaLike = {
    serverId?: string | null;
    libraryName?: string | null;
    collectionType?: string | null;
    type?: string | null;
    durationMs?: number | bigint | null;
};

export type CompletionBucket = 'completed' | 'partial' | 'abandoned' | 'skipped';
export type ScopedLibraryExclusion = {
    serverId: string;
    libraryName: string;
};
export type LibraryRule = {
    completionEnabled: boolean;
    completedThreshold: number;
    partialThreshold: number;
    abandonedThreshold: number;
};
export type LibraryRuleMap = Record<string, LibraryRule>;

const LIBRARY_ALIASES: Record<string, string> = {
    movie: 'movies',
    movies: 'movies',
    film: 'movies',
    films: 'movies',
    filmsuhd: 'filmsuhd',
    moviesuhd: 'filmsuhd',
    film4k: 'filmsuhd',
    movie4k: 'filmsuhd',
    tv: 'tvshows',
    tvshow: 'tvshows',
    tvshows: 'tvshows',
    series: 'tvshows',
    show: 'tvshows',
    shows: 'tvshows',
    seriestv: 'tvshows',
    seriesuhd: 'seriesuhd',
    tvshowsuhd: 'seriesuhd',
    series4k: 'seriesuhd',
    tv4k: 'seriesuhd',
    music: 'music',
    musics: 'music',
    musique: 'music',
    musiques: 'music',
    album: 'music',
    albums: 'music',
    book: 'books',
    books: 'books',
    audiobook: 'books',
    audiobooks: 'books',
    photo: 'photos',
    photos: 'photos',
    homevideo: 'homevideos',
    homevideos: 'homevideos',
    livetv: 'livetv',
};

const LIBRARY_TYPE_MAP: Record<string, string[]> = {
    movies: ['Movie'],
    filmsuhd: ['Movie'],
    tvshows: ['Series', 'Season', 'Episode'],
    seriesuhd: ['Series', 'Season', 'Episode'],
    music: ['Audio', 'Track', 'MusicAlbum'],
    books: ['Book', 'AudioBook'],
    photos: ['Photo'],
    homevideos: ['Video'],
};

const LIBRARY_ORDER = ['movies', 'filmsuhd', 'tvshows', 'seriesuhd', 'music', 'books', 'homevideos', 'photos', 'livetv'];
const SCOPED_LIBRARY_PREFIX = 'srvlib|';

function cleanKey(value: string) {
    return value
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[\s_-]+/g, '');
}

function normalizeLibraryIdentityName(value: string | null | undefined): string | null {
    if (!value) return null;

    const normalized = value
        .trim()
        .normalize('NFKC')
        .toLowerCase()
        .replace(/\s+/g, ' ');

    return normalized || null;
}

export function makeScopedLibraryExclusion(serverId: string | null | undefined, libraryName: string | null | undefined): string {
    const safeServerId = String(serverId || '').trim();
    const safeLibraryName = String(libraryName || '').trim();

    if (!safeServerId || !safeLibraryName) return '';

    return `${SCOPED_LIBRARY_PREFIX}${safeServerId}|${encodeURIComponent(safeLibraryName)}`;
}

export function parseScopedLibraryExclusion(value: string | null | undefined): ScopedLibraryExclusion | null {
    if (!value) return null;

    const trimmed = String(value).trim();
    if (!trimmed.startsWith(SCOPED_LIBRARY_PREFIX)) return null;

    const rest = trimmed.slice(SCOPED_LIBRARY_PREFIX.length);
    const separatorIndex = rest.indexOf('|');
    if (separatorIndex <= 0 || separatorIndex >= rest.length - 1) return null;

    const serverId = rest.slice(0, separatorIndex).trim();
    const encodedLibraryName = rest.slice(separatorIndex + 1).trim();
    if (!serverId || !encodedLibraryName) return null;

    try {
        const libraryName = decodeURIComponent(encodedLibraryName).trim();
        if (!libraryName) return null;

        return { serverId, libraryName };
    } catch {
        return null;
    }
}

function splitExcludedLibraries(excludedLibraries: string[] | null | undefined) {
    const globalValues: string[] = [];
    const scopedValues: ScopedLibraryExclusion[] = [];

    const seenGlobal = new Set<string>();
    const seenScoped = new Set<string>();

    if (!excludedLibraries || excludedLibraries.length === 0) {
        return { globalValues, scopedValues };
    }

    for (const raw of excludedLibraries) {
        const trimmed = String(raw || '').trim();
        if (!trimmed) continue;

        const scoped = parseScopedLibraryExclusion(trimmed);
        if (scoped) {
            const scopedName = normalizeLibraryIdentityName(scoped.libraryName) || scoped.libraryName;
            const scopedKey = `${scoped.serverId}|${scopedName}`;
            if (!seenScoped.has(scopedKey)) {
                scopedValues.push(scoped);
                seenScoped.add(scopedKey);
            }
            continue;
        }

        if (seenGlobal.has(trimmed)) continue;
        globalValues.push(trimmed);
        seenGlobal.add(trimmed);
    }

    return { globalValues, scopedValues };
}

export function normalizeLibraryKey(value: string | null | undefined): string | null {
    if (!value) return null;
    const cleaned = cleanKey(value);
    return LIBRARY_ALIASES[cleaned] || cleaned || null;
}

export function inferLibraryKey(media: MediaLike): string | null {
    const explicit = normalizeLibraryKey(media.collectionType);
    if (explicit) return explicit;

    const normalizedType = normalizeLibraryKey(media.type);
    if (!normalizedType) return null;

    if (['movie'].includes(normalizedType)) return 'movies';
    if (['series', 'season', 'episode'].includes(normalizedType)) return 'tvshows';
    if (['audio', 'track', 'musicalbum'].includes(normalizedType)) return 'music';
    if (['book', 'audiobook'].includes(normalizedType)) return 'books';
    if (['photo'].includes(normalizedType)) return 'photos';
    if (['video'].includes(normalizedType)) return 'homevideos';

    return normalizedType;
}

export function isLibraryExcluded(media: MediaLike, excludedLibraries: string[] | null | undefined): boolean {
    const { globalValues, scopedValues } = splitExcludedLibraries(excludedLibraries);

    if (scopedValues.length > 0 && media.serverId) {
        const mediaServerId = String(media.serverId || '').trim();
        const mediaLibraryName = normalizeLibraryIdentityName(media.libraryName);
        const mediaCollectionType = normalizeLibraryIdentityName(media.collectionType);

        for (const scoped of scopedValues) {
            if (scoped.serverId !== mediaServerId) continue;

            const scopedLibraryName = normalizeLibraryIdentityName(scoped.libraryName);
            if (!scopedLibraryName) continue;

            if (mediaLibraryName && mediaLibraryName === scopedLibraryName) return true;
            if (!mediaLibraryName && mediaCollectionType && mediaCollectionType === scopedLibraryName) return true;
        }
    }

    if (globalValues.length === 0) return false;

    const normalizedGlobalNames = new Set(
        globalValues
            .map((value) => normalizeLibraryIdentityName(value))
            .filter((value): value is string => Boolean(value))
    );

    const mediaLibraryName = normalizeLibraryIdentityName(media.libraryName);
    if (mediaLibraryName && normalizedGlobalNames.has(mediaLibraryName)) return true;

    const normalizedExcluded = new Set(
        globalValues
            .map((value) => normalizeLibraryKey(value))
            .filter((value): value is string => Boolean(value))
    );

    const inferred = inferLibraryKey(media);
    if (inferred && normalizedExcluded.has(inferred)) return true;

    const explicitCollection = normalizeLibraryKey(media.collectionType);
    if (explicitCollection && normalizedExcluded.has(explicitCollection)) return true;

    const explicitType = normalizeLibraryKey(media.type);
    if (explicitType && normalizedExcluded.has(explicitType)) return true;

    return false;
}

export function buildExcludedMediaClause(excludedLibraries: string[] | null | undefined) {
    const { globalValues, scopedValues } = splitExcludedLibraries(excludedLibraries);
    if (globalValues.length === 0 && scopedValues.length === 0) return undefined;

    const orClauses: Array<Record<string, unknown>> = [];

    if (scopedValues.length > 0) {
        scopedValues.forEach((scoped) => {
            orClauses.push({
                AND: [
                    { serverId: scoped.serverId },
                    { libraryName: scoped.libraryName },
                ],
            });
        });
    }

    const values = Array.from(new Set(globalValues.filter(Boolean)));
    if (values.length > 0) {
        // Global exclusions match by libraryName primarily, with fallback to type-based keys
        // for backward compatibility with older settings values.
        orClauses.push({ libraryName: { in: values } });

        const normalizedValues = Array.from(
            new Set(
                values
                    .map((value) => normalizeLibraryKey(value))
                    .filter((value): value is string => Boolean(value))
            )
        );
        if (normalizedValues.length > 0) {
            orClauses.push({ collectionType: { in: normalizedValues } });
            const typeValues = Array.from(
                new Set(normalizedValues.flatMap((value) => LIBRARY_TYPE_MAP[value] || []))
            );
            if (typeValues.length > 0) {
                orClauses.push({ type: { in: typeValues } });
            }
        }
    }

    if (orClauses.length === 0) return undefined;
    return { NOT: { OR: orClauses } };
}

export function getAvailableLibraryKeys(values: Array<string | null | undefined>) {
    const normalized = new Set<string>();

    for (const key of LIBRARY_ORDER) {
        normalized.add(key);
    }

    values.forEach((value) => {
        const normalizedValue = normalizeLibraryKey(value);
        if (normalizedValue) normalized.add(normalizedValue);
    });

    return Array.from(normalized).sort((left, right) => {
        const leftIndex = LIBRARY_ORDER.indexOf(left);
        const rightIndex = LIBRARY_ORDER.indexOf(right);

        if (leftIndex !== -1 && rightIndex !== -1) return leftIndex - rightIndex;
        if (leftIndex !== -1) return -1;
        if (rightIndex !== -1) return 1;
        return left.localeCompare(right);
    });
}

function clampCompletion(percent: number) {
    return Math.max(0, Math.min(100, percent));
}

export function getDefaultLibraryRule(libraryKey: string | null | undefined) {
    const normalized = normalizeLibraryKey(libraryKey);
    if (normalized === 'music') {
        return {
            completedThreshold: 60,
            partialThreshold: 30,
            abandonedThreshold: 12,
        };
    }

    return {
        completedThreshold: 80,
        partialThreshold: 20,
        abandonedThreshold: 10,
    };
}

export function getCompletionMetrics(media: MediaLike, durationWatched: number) {
    const durationSeconds = media.durationMs ? Number(media.durationMs) / 1000 : 0;
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationWatched <= 0) {
        return { percent: 0, bucket: 'skipped' as CompletionBucket };
    }

    const percent = clampCompletion((durationWatched / durationSeconds) * 100);
    const rule = getDefaultLibraryRule(media.collectionType || media.type);
    
    if (percent >= rule.completedThreshold) return { percent, bucket: 'completed' as CompletionBucket };
    if (percent >= rule.partialThreshold) return { percent, bucket: 'partial' as CompletionBucket };
    if (percent >= rule.abandonedThreshold) return { percent, bucket: 'abandoned' as CompletionBucket };

    return { percent, bucket: 'skipped' as CompletionBucket };
}

import { isZapped } from "./statsUtils";
 
export { isZapped };
