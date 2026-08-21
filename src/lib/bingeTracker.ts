import prisma from "@/lib/prisma";
import { ZAPPING_CONDITION } from "@/lib/statsUtils";
import { subDays } from "date-fns";

export interface BingeSeriesResult {
    seriesId: string;
    seriesTitle: string;
    totalBingeSessions: number;
    avgEpisodesPerSession: number;
    maxEpisodesInSingleRun: number;
    topBingerUsername: string;
    totalHoursBunged: number;
}

export interface BingeStatsSummary {
    mostBingedSeries: BingeSeriesResult | null;
    allBingedSeries: BingeSeriesResult[];
    totalBingeSessionsMonth: number;
}

/**
 * Detects binge-watching runs in playback history.
 * A "Binge Run" is defined as >= 3 episodes watched by the same user with <= 45 minutes gap between episodes.
 */
export async function getBingeWatchingStats(days: number = 30): Promise<BingeStatsSummary> {
    const sinceDate = subDays(new Date(), days);

    // Fetch all episode playbacks in the period
    const playbacks = await prisma.playbackHistory.findMany({
        where: {
            startedAt: { gte: sinceDate },
            ...ZAPPING_CONDITION,
            media: {
                type: "Episode",
            },
        },
        select: {
            id: true,
            userId: true,
            startedAt: true,
            durationWatched: true,
            user: { select: { username: true } },
            media: {
                select: {
                    id: true,
                    title: true,
                    parentId: true, // points to Season or Series
                },
            },
        },
        orderBy: {
            startedAt: "asc",
        },
    });

    if (playbacks.length === 0) {
        return { mostBingedSeries: null, allBingedSeries: [], totalBingeSessionsMonth: 0 };
    }

    // Resolve series parent titles
    // Support both jellyfinMediaId and internal id (for DB and test mocks)
    const parentIds = Array.from(new Set(playbacks.map((p) => p.media?.parentId).filter(Boolean))) as string[];
    const parentMedia = parentIds.length > 0 ? await prisma.media.findMany({
        where: {
            OR: [
                { jellyfinMediaId: { in: parentIds } },
                { id: { in: parentIds } },
            ],
        },
        select: { id: true, jellyfinMediaId: true, title: true, type: true, parentId: true },
    }) : [];
    const parentMap = new Map<string, typeof parentMedia[0]>();
    for (const p of parentMedia) {
        if (p.jellyfinMediaId) parentMap.set(p.jellyfinMediaId, p);
        if (p.id) parentMap.set(p.id, p);
    }

    // If parent is Season, find the grand-parent (Series)
    const grandParentIds = Array.from(
        new Set(
            parentMedia
                .filter((p) => p.type === "Season" && p.parentId)
                .map((p) => p.parentId as string)
        )
    );
    const grandParentMedia = grandParentIds.length > 0 ? await prisma.media.findMany({
        where: {
            OR: [
                { jellyfinMediaId: { in: grandParentIds } },
                { id: { in: grandParentIds } },
            ],
        },
        select: { id: true, jellyfinMediaId: true, title: true },
    }) : [];
    const grandParentMap = new Map<string, typeof grandParentMedia[0]>();
    for (const p of grandParentMedia) {
        if (p.jellyfinMediaId) grandParentMap.set(p.jellyfinMediaId, p);
        if (p.id) grandParentMap.set(p.id, p);
    }

    function resolveSeriesInfo(pMediaId: string | null | undefined): { seriesId: string; seriesTitle: string } {
        if (!pMediaId) return { seriesId: "unknown", seriesTitle: "Série inconnue" };
        const parent = parentMap.get(pMediaId);
        if (!parent) return { seriesId: pMediaId, seriesTitle: "Série" };
        if (parent.type === "Season" && parent.parentId) {
            const series = grandParentMap.get(parent.parentId);
            if (series) return { seriesId: series.id, seriesTitle: series.title };
        }
        return { seriesId: parent.id, seriesTitle: parent.title };
    }

    // Group playbacks by user
    const playbacksByUser = new Map<string, typeof playbacks>();
    for (const p of playbacks) {
        if (!p.userId) continue;
        const list = playbacksByUser.get(p.userId) || [];
        list.push(p);
        playbacksByUser.set(p.userId, list);
    }

    // Detect binge runs per series
    // Map: seriesId -> { runs: number[], userCounts: Map<username, number>, totalDurationSec: number, title: string }
    const seriesStats = new Map<
        string,
        {
            title: string;
            runs: number[]; // length of each binge session (e.g. [3, 5, 4])
            userCounts: Map<string, number>;
            totalDurationSec: number;
        }
    >();

    const MAX_GAP_MS = 45 * 60 * 1000; // 45 minutes threshold between episodes

    for (const userPlaybacks of playbacksByUser.values()) {
        if (userPlaybacks.length < 3) continue;

        let currentSeriesId: string | null = null;
        let currentRunCount = 0;
        let currentRunDuration = 0;
        let lastEndTime = 0;
        let currentUsername = userPlaybacks[0]?.user?.username || "Utilisateur";

        for (const p of userPlaybacks) {
            const { seriesId, seriesTitle } = resolveSeriesInfo(p.media?.parentId);
            const startTime = new Date(p.startedAt).getTime();
            const durationSec = p.durationWatched || 0;
            const endTime = startTime + durationSec * 1000;

            if (currentSeriesId === seriesId && startTime - lastEndTime <= MAX_GAP_MS) {
                currentRunCount += 1;
                currentRunDuration += durationSec;
                lastEndTime = endTime;
            } else {
                // If previous run qualifies as binge (>= 3 episodes)
                if (currentSeriesId && currentRunCount >= 3) {
                    const st = seriesStats.get(currentSeriesId)!;
                    st.runs.push(currentRunCount);
                    st.totalDurationSec += currentRunDuration;
                    st.userCounts.set(currentUsername, (st.userCounts.get(currentUsername) || 0) + currentRunCount);
                }

                // Start new run
                currentSeriesId = seriesId;
                currentRunCount = 1;
                currentRunDuration = durationSec;
                lastEndTime = endTime;
                currentUsername = p.user?.username || "Utilisateur";

                if (!seriesStats.has(seriesId)) {
                    seriesStats.set(seriesId, {
                        title: seriesTitle,
                        runs: [],
                        userCounts: new Map(),
                        totalDurationSec: 0,
                    });
                }
            }
        }

        // Final check for user
        if (currentSeriesId && currentRunCount >= 3 && seriesStats.has(currentSeriesId)) {
            const st = seriesStats.get(currentSeriesId)!;
            st.runs.push(currentRunCount);
            st.totalDurationSec += currentRunDuration;
            st.userCounts.set(currentUsername, (st.userCounts.get(currentUsername) || 0) + currentRunCount);
        }
    }

    const allBingedSeries: BingeSeriesResult[] = [];
    let totalBingeSessions = 0;

    for (const [seriesId, data] of seriesStats.entries()) {
        if (data.runs.length === 0) continue;
        totalBingeSessions += data.runs.length;

        const totalEpisodesInRuns = data.runs.reduce((a, b) => a + b, 0);
        const avgEpisodes = Number((totalEpisodesInRuns / data.runs.length).toFixed(1));
        const maxEpisodes = Math.max(...data.runs);

        // Find top binger
        let topUser = "Personne";
        let maxUserEp = 0;
        for (const [u, count] of data.userCounts.entries()) {
            if (count > maxUserEp) {
                maxUserEp = count;
                topUser = u;
            }
        }

        allBingedSeries.push({
            seriesId,
            seriesTitle: data.title,
            totalBingeSessions: data.runs.length,
            avgEpisodesPerSession: avgEpisodes,
            maxEpisodesInSingleRun: maxEpisodes,
            topBingerUsername: topUser,
            totalHoursBunged: Number((data.totalDurationSec / 3600).toFixed(1)),
        });
    }

    // Sort by most binge sessions, then by total hours
    allBingedSeries.sort((a, b) => b.totalBingeSessions - a.totalBingeSessions || b.totalHoursBunged - a.totalHoursBunged);

    return {
        mostBingedSeries: allBingedSeries[0] || null,
        allBingedSeries,
        totalBingeSessionsMonth: totalBingeSessions,
    };
}
