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

export function formatMediaSubtitle(input: FormatMediaSubtitleInput, locale: string = 'fr'): string | null {
    const isFr = locale.startsWith('fr');
    const episodeLabel = isFr ? 'Épisode' : 'Episode';
    const trackLabel = isFr ? 'Piste' : 'Track';

    if (input.type === 'Episode') {
        const series = input.seriesName || input.grandparentTitle || null;
        let season = input.seasonName || input.parentTitle || null;
        
        // If parentIndexNumber is present (e.g. 2) and seasonName isn't formatted, construct "Saison 2"
        if (!season && input.parentIndexNumber !== null && input.parentIndexNumber !== undefined) {
            season = isFr ? `Saison ${input.parentIndexNumber}` : `Season ${input.parentIndexNumber}`;
        }

        const episodeNum = input.indexNumber !== null && input.indexNumber !== undefined ? input.indexNumber : null;
        
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
        const artist = input.albumArtist || input.artist || input.parentArtist || null;
        const album = input.albumName || input.parentTitle || null;
        const trackNum = input.indexNumber !== null && input.indexNumber !== undefined ? input.indexNumber : null;

        const trackNumString = trackNum !== null ? `${trackLabel} ${trackNum}` : null;

        const parts = [artist, album, trackNumString].filter((p): p is string => Boolean(p && p.trim().length > 0));
        
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
