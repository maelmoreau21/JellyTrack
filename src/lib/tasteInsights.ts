import prisma from "@/lib/prisma";
import { ZAPPING_CONDITION } from "@/lib/statsUtils";
import { subDays } from "date-fns";

export interface GenreStat {
    name: string;
    playCount: number;
    totalHours: number;
    percentage: number;
}

export interface AcquisitionSuggestion {
    category: string;
    title: string;
    reason: string;
    scorePercent: number;
    badge: string;
}

export interface TasteInsightsSummary {
    topGenres: GenreStat[];
    topArtists: Array<{ name: string; hours: number; plays: number }>;
    acquisitionSuggestions: AcquisitionSuggestion[];
    totalAnalyzedHours: number;
}

export async function getTasteInsights(days: number = 30): Promise<TasteInsightsSummary> {
    const sinceDate = subDays(new Date(), days);

    const playbacks = await prisma.playbackHistory.findMany({
        where: {
            startedAt: { gte: sinceDate },
            ...ZAPPING_CONDITION,
        },
        select: {
            id: true,
            durationWatched: true,
            media: {
                select: {
                    id: true,
                    title: true,
                    type: true,
                    artist: true,
                    genres: true,
                    libraryName: true,
                },
            },
        },
    });

    let totalDurationSec = 0;
    const genreMap = new Map<string, { plays: number; durationSec: number }>();
    const artistMap = new Map<string, { plays: number; durationSec: number }>();

    for (const p of playbacks) {
        const dur = p.durationWatched || 0;
        totalDurationSec += dur;

        // Process genres
        const genres = Array.isArray(p.media?.genres) ? (p.media.genres as string[]) : [];
        for (const g of genres) {
            const cleanG = g.trim();
            if (!cleanG) continue;
            const cur = genreMap.get(cleanG) || { plays: 0, durationSec: 0 };
            cur.plays += 1;
            cur.durationSec += dur;
            genreMap.set(cleanG, cur);
        }

        // Process artist/creator
        if (p.media?.artist) {
            const cleanA = p.media.artist.trim();
            if (cleanA) {
                const cur = artistMap.get(cleanA) || { plays: 0, durationSec: 0 };
                cur.plays += 1;
                cur.durationSec += dur;
                artistMap.set(cleanA, cur);
            }
        }
    }

    const totalHours = totalDurationSec / 3600;

    // Build genre stats
    const topGenres: GenreStat[] = [];
    for (const [name, val] of genreMap.entries()) {
        const h = Number((val.durationSec / 3600).toFixed(1));
        const pct = totalHours > 0 ? Math.min(100, Math.round((h / totalHours) * 100)) : 0;
        topGenres.push({
            name,
            playCount: val.plays,
            totalHours: h,
            percentage: pct,
        });
    }
    topGenres.sort((a, b) => b.totalHours - a.totalHours);

    // Build artist stats
    const topArtists: Array<{ name: string; hours: number; plays: number }> = [];
    for (const [name, val] of artistMap.entries()) {
        topArtists.push({
            name,
            hours: Number((val.durationSec / 3600).toFixed(1)),
            plays: val.plays,
        });
    }
    topArtists.sort((a, b) => b.hours - a.hours);

    // Build actionable acquisition recommendations for the admin
    const acquisitionSuggestions: AcquisitionSuggestion[] = [];

    if (topGenres.length > 0) {
        const g1 = topGenres[0];
        acquisitionSuggestions.push({
            category: "Genre Dominant",
            title: `Enrichir la collection ${g1.name}`,
            reason: `Représente ${g1.percentage}% du temps total de visionnage (${g1.totalHours}h). Vos spectateurs en redemandent !`,
            scorePercent: Math.min(99, Math.max(70, g1.percentage + 20)),
            badge: "Très Forte Demande",
        });

        if (topGenres.length > 1) {
            const g2 = topGenres[1];
            acquisitionSuggestions.push({
                category: "Genre Tendance",
                title: `Films & Séries ${g2.name}`,
                reason: `Deuxième genre le plus plébiscité avec ${g2.totalHours}h visionnées sur les ${days} derniers jours.`,
                scorePercent: Math.min(85, Math.max(50, g2.percentage + 15)),
                badge: "Tendance Forte",
            });
        }
    }

    if (topArtists.length > 0) {
        const a1 = topArtists[0];
        acquisitionSuggestions.push({
            category: "Artiste / Réalisateur Vedette",
            title: `Compléter la filmographie / discographie de ${a1.name}`,
            reason: `Cumule ${a1.hours}h d'écoute/visionnage sur ${a1.plays} lectures.`,
            scorePercent: 92,
            badge: "Favori Utilisateurs",
        });
    }

    // If few or default genres, provide general high-value suggestions
    if (acquisitionSuggestions.length === 0) {
        acquisitionSuggestions.push({
            category: "Général",
            title: "Films d'Action & Science-Fiction populaires",
            reason: "Genres historiquement plébiscités sur les serveurs Jellyfin pour booster l'engagement.",
            scorePercent: 80,
            badge: "Recommandé",
        });
    }

    return {
        topGenres: topGenres.slice(0, 8),
        topArtists: topArtists.slice(0, 6),
        acquisitionSuggestions,
        totalAnalyzedHours: Number(totalHours.toFixed(1)),
    };
}
