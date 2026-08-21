import prisma from "@/lib/prisma";
import { getCompletionMetrics } from "@/lib/mediaPolicy";

export async function getCleanupData() {
    const globalSettings = await prisma.globalSettings.findUnique({
        where: { id: "global" },
        select: { resolutionThresholds: true },
    });

    const completionRules =
        globalSettings?.resolutionThresholds && typeof globalSettings.resolutionThresholds === "object"
            ? (globalSettings.resolutionThresholds as Record<string, unknown>).completionRules
            : undefined;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const twoYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000);

    // 1. Ghost Media: parent-level items (Movie, Series, MusicAlbum) with 0 plays on themselves or children
    const parentGhostCandidates = await prisma.media.findMany({
        where: {
            createdAt: { lt: thirtyDaysAgo },
            type: { in: ['Movie', 'Series', 'MusicAlbum'] },
            playbackHistory: { none: {} }
        },
        select: {
            id: true,
            jellyfinMediaId: true,
            title: true,
            type: true,
            createdAt: true,
            dateAdded: true,
            durationMs: true,
            size: true,
        },
        orderBy: { createdAt: 'asc' }
    });

    const ghostMedia: Array<{
        id: string;
        jellyfinMediaId: string;
        title: string;
        type: string;
        createdAt: Date;
        dateAdded: Date | null;
        durationMs: bigint | null;
        size: bigint | null;
    }> = [];
    for (const media of parentGhostCandidates) {
        if (media.type === 'Movie') {
            ghostMedia.push(media);
        } else {
            const childrenWithPlays = await prisma.playbackHistory.count({
                where: {
                    media: {
                        OR: [
                            { parentId: media.jellyfinMediaId },
                            { parentId: { in: (await prisma.media.findMany({
                                where: { parentId: media.jellyfinMediaId },
                                select: { jellyfinMediaId: true }
                            })).map(c => c.jellyfinMediaId) } }
                        ]
                    }
                }
            });
            if (childrenWithPlays === 0) {
                ghostMedia.push(media);
            }
        }
    }

    // 2. Abandoned Media
    const mediaWithHistory = await prisma.media.findMany({
        where: {
            playbackHistory: { some: {} },
            durationMs: { not: null },
            type: { in: ['Movie', 'Episode', 'Audio'] }
        },
        select: {
            id: true,
            jellyfinMediaId: true,
            title: true,
            type: true,
            collectionType: true,
            parentId: true,
            durationMs: true,
            playbackHistory: {
                select: {
                    userId: true,
                    durationWatched: true,
                    startedAt: true,
                }
            }
        }
    });

    const parentIds = new Set<string>();
    mediaWithHistory.forEach(m => { if (m.parentId) parentIds.add(m.parentId); });
    const parents = parentIds.size > 0
        ? await prisma.media.findMany({ where: { jellyfinMediaId: { in: Array.from(parentIds) } }, select: { jellyfinMediaId: true, title: true, parentId: true } })
        : [];
    const parentMap = new Map(parents.map(p => [p.jellyfinMediaId, p]));
    const gpIds = new Set<string>();
    parents.forEach(p => { if (p.parentId) gpIds.add(p.parentId); });
    const grandparents = gpIds.size > 0
        ? await prisma.media.findMany({ where: { jellyfinMediaId: { in: Array.from(gpIds) } }, select: { jellyfinMediaId: true, title: true } })
        : [];
    const gpMap = new Map(grandparents.map(g => [g.jellyfinMediaId, g.title]));

    function getEnrichedTitle(media: { title: string; type: string; parentId: string | null }): string {
        if (!media.parentId) return media.title;
        const parent = parentMap.get(media.parentId);
        if (media.type === 'Episode' && parent) {
            const gp = parent.parentId ? gpMap.get(parent.parentId) : null;
            return gp ? `${gp} — ${parent.title} — ${media.title}` : `${parent.title} — ${media.title}`;
        }
        if (media.type === 'Audio' && parent) {
            return `${parent.title} — ${media.title}`;
        }
        return media.title;
    }

    const abandonedMedia: Array<{
        id: string;
        jellyfinMediaId: string;
        title: string;
        type: string;
        parentId: string | null;
        durationMs: bigint | null;
        maxCompletion: number;
        lastPlayed: Date;
    }> = [];

    for (const media of mediaWithHistory) {
        if (!media.durationMs || Number(media.durationMs) === 0) continue;

        const watchedByUser = new Map<string, number>();
        let lastPlayed = new Date(0);

        for (const history of media.playbackHistory) {
            if (history.durationWatched <= 0) continue;

            const userKey = history.userId || 'anonymous';
            watchedByUser.set(userKey, (watchedByUser.get(userKey) || 0) + history.durationWatched);

            if (history.startedAt > lastPlayed) lastPlayed = history.startedAt;
        }

        if (watchedByUser.size === 0) continue;

        let bestCompletion = getCompletionMetrics(
            { type: media.type, collectionType: media.collectionType, durationMs: media.durationMs },
            0,
            completionRules
        );

        for (const totalWatchedSeconds of watchedByUser.values()) {
            const completion = getCompletionMetrics(
                { type: media.type, collectionType: media.collectionType, durationMs: media.durationMs },
                totalWatchedSeconds,
                completionRules
            );
            if (completion.percent > bestCompletion.percent) {
                bestCompletion = completion;
            }
        }

        if (bestCompletion.percent > 0 && bestCompletion.bucket === 'abandoned') {
            abandonedMedia.push({
                ...media,
                title: getEnrichedTitle(media),
                maxCompletion: bestCompletion.percent,
                lastPlayed
            });
        }
    }

    abandonedMedia.sort((a, b) => a.maxCompletion - b.maxCompletion);

    const staleMovieCandidates = ghostMedia
        .filter((media) => {
            if (media.type !== "Movie") return false;
            const referenceDate = media.dateAdded || media.createdAt;
            return referenceDate < twoYearsAgo;
        })
        .sort((left, right) => {
            const leftRef = (left.dateAdded || left.createdAt).getTime();
            const rightRef = (right.dateAdded || right.createdAt).getTime();
            return leftRef - rightRef;
        })
        .slice(0, 10);

    const staleMovieSizeBytes = staleMovieCandidates.reduce((sum, media) => {
        return sum + (media.size || BigInt(0));
    }, BigInt(0));

    // 3. Duplicate media detection
    const allParentMedia = await prisma.media.findMany({
        where: { type: { in: ['Movie', 'Series'] } },
        select: {
            id: true,
            serverId: true,
            jellyfinMediaId: true,
            title: true,
            type: true,
            resolution: true,
            size: true,
            libraryName: true,
            createdAt: true,
            dateAdded: true,
        }
    });

    const mediaByNormTitle = new Map<string, typeof allParentMedia>();
    for (const item of allParentMedia) {
        const key = `${item.type}:${(item.title || '').trim().toLowerCase().replace(/[\s\-_.:]+/g, ' ')}`;
        const list = mediaByNormTitle.get(key) || [];
        list.push(item);
        mediaByNormTitle.set(key, list);
    }

    const duplicateMedia: Array<{
        id: string;
        jellyfinMediaId: string;
        title: string;
        type: string;
        resolution?: string | null;
        libraryName?: string | null;
        size?: string | null;
        duplicateGroup: string;
    }> = [];

    for (const [groupKey, items] of mediaByNormTitle.entries()) {
        if (items.length > 1) {
            for (const item of items) {
                duplicateMedia.push({
                    id: item.id,
                    jellyfinMediaId: item.jellyfinMediaId,
                    title: item.title,
                    type: item.type,
                    resolution: item.resolution,
                    libraryName: item.libraryName,
                    size: item.size ? item.size.toString() : null,
                    duplicateGroup: groupKey,
                });
            }
        }
    }

    const totalGhostSizeBytes = ghostMedia.reduce((sum, media) => sum + (media.size || BigInt(0)), BigInt(0));

    return {
        totalRecoverableSizeBytes: totalGhostSizeBytes.toString(),
        ghostMedia: ghostMedia.map(item => ({
            ...item,
            durationMs: item.durationMs ? Number(item.durationMs).toString() : null,
            size: item.size ? item.size.toString() : null,
        })),
        abandonedMedia: abandonedMedia.map(item => ({
            ...item,
            durationMs: item.durationMs ? Number(item.durationMs).toString() : null
        })),
        duplicateMedia,
        recommendations: {
            staleMoviesToDelete: {
                count: staleMovieCandidates.length,
                totalSizeBytes: staleMovieSizeBytes.toString(),
                itemIds: staleMovieCandidates.map((media) => media.id),
                items: staleMovieCandidates.map((media) => ({
                    id: media.id,
                    title: media.title,
                    jellyfinMediaId: media.jellyfinMediaId,
                    size: media.size ? media.size.toString() : null,
                    dateAdded: media.dateAdded || media.createdAt,
                })),
            },
        },
    };
}