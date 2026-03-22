type MediaLike = {
    collectionType?: string | null;
    type?: string | null;
    durationMs?: number | bigint | null;
};

export type CompletionBucket = 'completed' | 'partial' | 'abandoned' | 'skipped';
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
    tv: 'tvshows',
    tvshow: 'tvshows',
    tvshows: 'tvshows',
    series: 'tvshows',
    show: 'tvshows',
    shows: 'tvshows',
    seriesuhd: 'seriesuhd',
    tvshowsuhd: 'seriesuhd',
    music: 'music',
    musics: 'music',
    musique: 'music',
    musiques: 'music',
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

function cleanKey(value: string) {
    return value
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[\s_-]+/g, '');
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
    if (!excludedLibraries || excludedLibraries.length === 0) return false;

    const normalizedExcluded = new Set(
        excludedLibraries
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
    if (!excludedLibraries || excludedLibraries.length === 0) return undefined;

    const values = Array.from(new Set(excludedLibraries.filter(Boolean)));
    if (values.length === 0) return undefined;

    // Excluded libraries are now actual Jellyfin library names (e.g., "film-2", "Séries TV")
    // We filter by libraryName primarily, with fallback to collectionType for backward compat
    const orClauses: Array<Record<string, unknown>> = [
        { libraryName: { in: values } },
    ];

    // Also try to match as collectionType keys (backward compat with old data)
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

export function getDefaultLibraryRule(libraryKey: string | null | undefined): LibraryRule {
    const normalized = normalizeLibraryKey(libraryKey);
    if (normalized === 'music') {
        return {
            completionEnabled: true,
            completedThreshold: 60,
            partialThreshold: 30,
            abandonedThreshold: 12,
        };
    }

    return {
        completionEnabled: true,
        completedThreshold: 80,
        partialThreshold: 20,
        abandonedThreshold: 10,
    };
}

export function sanitizeLibraryRule(input: Partial<LibraryRule> | null | undefined, libraryKey: string | null | undefined): LibraryRule {
    const defaults = getDefaultLibraryRule(libraryKey);
    const completedThreshold = Math.max(1, Math.min(100, Number(input?.completedThreshold ?? defaults.completedThreshold)));
    const partialThreshold = Math.max(1, Math.min(completedThreshold - 1, Number(input?.partialThreshold ?? defaults.partialThreshold)));
    const abandonedThreshold = Math.max(0, Math.min(partialThreshold - 1, Number(input?.abandonedThreshold ?? defaults.abandonedThreshold)));

    return {
        completionEnabled: input?.completionEnabled ?? defaults.completionEnabled,
        completedThreshold,
        partialThreshold,
        abandonedThreshold,
    };
}

export function sanitizeLibraryRules(input: LibraryRuleMap | null | undefined, discoveredNames?: string[]): LibraryRuleMap {
    const output: LibraryRuleMap = {};
    const processedKeys = new Set<string>();

    // 1. Process discovered library names (priority)
    const activeNames = discoveredNames && discoveredNames.length > 0 ? discoveredNames : [];
    for (const name of activeNames) {
        const norm = normalizeLibraryKey(name);
        const ruleInput = input?.[name] || (norm ? input?.[norm] : undefined);
        output[name] = sanitizeLibraryRule(ruleInput, name);
        processedKeys.add(name);
        if (norm) processedKeys.add(norm);
    }

    // 2. Process all input keys (to preserve any existing user-configured data)
    for (const key of Object.keys(input || {})) {
        if (!processedKeys.has(key)) {
            output[key] = sanitizeLibraryRule(input?.[key], key);
            processedKeys.add(key);
        }
    }

    // 3. Fallback: if we have NO active libraries and NO input, show minimal standard ones
    if (Object.keys(output).length === 0) {
        for (const key of ['movies', 'tvshows', 'music']) {
            output[key] = sanitizeLibraryRule(null, key);
        }
    }

    return output;
}

export function resolveLibraryRule(media: MediaLike & { libraryName?: string | null }, rules?: LibraryRuleMap | null): LibraryRule {
    const libraryName = media.libraryName;
    const libraryKey = inferLibraryKey(media);
    
    if (!rules) {
        return getDefaultLibraryRule(libraryName || libraryKey);
    }

    // 1. Try exact match on real library name
    if (libraryName && rules[libraryName]) {
        return sanitizeLibraryRule(rules[libraryName], libraryName);
    }

    // 2. Fallback to generic library key (movies, tvshows, etc.)
    if (libraryKey && rules[libraryKey]) {
        return sanitizeLibraryRule(rules[libraryKey], libraryKey);
    }

    return getDefaultLibraryRule(libraryName || libraryKey);
}

export function getCompletionMetrics(media: MediaLike, durationWatched: number, rules?: LibraryRuleMap | null) {
    const durationSeconds = media.durationMs ? Number(media.durationMs) / 1000 : 0;
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationWatched <= 0) {
        return { percent: 0, bucket: 'skipped' as CompletionBucket };
    }

    const percent = clampCompletion((durationWatched / durationSeconds) * 100);
    const rule = resolveLibraryRule(media, rules);
    if (!rule.completionEnabled) {
        return { percent, bucket: 'skipped' as CompletionBucket };
    }

    if (percent >= rule.completedThreshold) return { percent, bucket: 'completed' as CompletionBucket };
    if (percent >= rule.partialThreshold) return { percent, bucket: 'partial' as CompletionBucket };
    if (percent >= rule.abandonedThreshold) return { percent, bucket: 'abandoned' as CompletionBucket };

    return { percent, bucket: 'skipped' as CompletionBucket };
}

/**
 * Zapping Filter: Determines if a session is too short to be counted in statistics.
 * Use this to ignore background pings (PC wake-ups, background app activity).
 * Thresholds: 30s for Video, 10s for Audio/Others.
 */
export function isZapped(session: { durationWatched: number, media?: { type: string } | null }): boolean {
    if (!session.durationWatched || session.durationWatched <= 0) return true;
    
    const type = session.media?.type || 'Unknown';
    if (type === 'Movie' || type === 'Episode' || type === 'Series') {
        return session.durationWatched < 30;
    }
    
    // Default (Audio, Book, etc.)
    return session.durationWatched < 10;
}
