export interface FormatMediaSubtitleInput {
    type?: string | null;
    seriesName?: string | null;
    seasonName?: string | null;
    indexNumber?: number | null; // Episode number or Track number
    parentIndexNumber?: number | null; // Season number or Disc number
    albumName?: string | null;
    albumArtist?: string | null;
    artist?: string | null;
    parentTitle?: string | null;
    grandparentTitle?: string | null;
    parentArtist?: string | null;
}

export function formatSeasonEpisodeCode(parentIndexNumber?: number | null, indexNumber?: number | null): string | null {
    const hasSeason = typeof parentIndexNumber === 'number' && Number.isFinite(parentIndexNumber) && parentIndexNumber >= 0;
    const hasEpisode = typeof indexNumber === 'number' && Number.isFinite(indexNumber) && indexNumber >= 0;

    if (hasSeason && hasEpisode) {
        return `S${String(parentIndexNumber).padStart(2, '0')}E${String(indexNumber).padStart(2, '0')}`;
    }
    if (hasEpisode) {
        return `E${String(indexNumber).padStart(2, '0')}`;
    }
    if (hasSeason) {
        return `S${String(parentIndexNumber).padStart(2, '0')}`;
    }
    return null;
}

export function formatTrackCode(parentIndexNumber?: number | null, indexNumber?: number | null, locale: string = 'fr'): string | null {
    const isFr = locale.startsWith('fr');
    const trackLabel = isFr ? 'Piste' : 'Track';
    const hasDisc = typeof parentIndexNumber === 'number' && Number.isFinite(parentIndexNumber) && parentIndexNumber > 1;
    const hasTrack = typeof indexNumber === 'number' && Number.isFinite(indexNumber) && indexNumber >= 0;

    if (hasTrack) {
        const trackStr = `${trackLabel} ${String(indexNumber).padStart(2, '0')}`;
        if (hasDisc) {
            return `CD ${parentIndexNumber} • ${trackStr}`;
        }
        return trackStr;
    }
    return null;
}

export function formatMediaCode(
    type?: string | null,
    indexNumber?: number | null,
    parentIndexNumber?: number | null,
    locale: string = 'fr'
): string | null {
    if (type === 'Episode') {
        return formatSeasonEpisodeCode(parentIndexNumber, indexNumber);
    }
    if (type === 'Audio' || type === 'Track') {
        return formatTrackCode(parentIndexNumber, indexNumber, locale);
    }
    return null;
}

export function formatMediaSubtitle(input: FormatMediaSubtitleInput, locale: string = 'fr'): string | null {
    const isFr = locale.startsWith('fr');
    const episodeLabel = isFr ? 'Épisode' : 'Episode';

    if (input.type === 'Episode') {
        const code = formatSeasonEpisodeCode(input.parentIndexNumber, input.indexNumber);
        const series = input.seriesName || input.grandparentTitle || null;
        let season = input.seasonName || input.parentTitle || null;
        
        if (!season && input.parentIndexNumber !== null && input.parentIndexNumber !== undefined) {
            season = isFr ? `Saison ${input.parentIndexNumber}` : `Season ${input.parentIndexNumber}`;
        }

        const episodeNum = input.indexNumber !== null && input.indexNumber !== undefined ? input.indexNumber : null;

        // If we have a short code like S01E02, put it at the FRONT so it is never truncated
        if (code) {
            if (series) {
                return `${code} • ${series}${season ? ` (${season})` : ''}`;
            }
            if (season) {
                return `${code} • ${season}`;
            }
            return code;
        }

        let seasonEpisodeString = season;
        if (season && episodeNum !== null) {
            seasonEpisodeString = `${season} - ${episodeLabel} ${episodeNum}`;
        } else if (!season && episodeNum !== null) {
            seasonEpisodeString = `${episodeLabel} ${episodeNum}`;
        }

        if (series && seasonEpisodeString) {
            return `${series} — ${seasonEpisodeString}`;
        }
        return seasonEpisodeString || series || null;
    }

    if (input.type === 'Audio' || input.type === 'Track') {
        const code = formatTrackCode(input.parentIndexNumber, input.indexNumber, locale);
        const artist = input.albumArtist || input.artist || input.parentArtist || null;
        const album = input.albumName || input.parentTitle || null;

        if (code) {
            const extra = [artist, album].filter((p): p is string => Boolean(p && p.trim().length > 0)).join(' — ');
            return extra ? `${code} • ${extra}` : code;
        }

        const parts = [artist, album].filter((p): p is string => Boolean(p && p.trim().length > 0));
        if (parts.length === 0) return null;
        return parts.join(' — ');
    }

    if (input.type === 'Season') {
        const series = input.seriesName || input.parentTitle || null;
        const season = input.seasonName || null;
        if (series && season) return `${series} — ${season}`;
        return series || season || null;
    }

    return input.parentTitle || null;
}

