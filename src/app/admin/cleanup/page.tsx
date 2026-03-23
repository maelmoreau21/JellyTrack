import { Suspense } from "react";
import prisma from "@/lib/prisma";
import CleanupClient from "./CleanupClient";
import { Skeleton } from "@/components/ui/skeleton";
import { getTranslations } from 'next-intl/server';
import { getCompletionMetrics } from "@/lib/mediaPolicy";
// No more library rules

export const dynamic = "force-dynamic";

async function getCleanupData() {
    // Use defaults
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // 1. Ghost Media: parent-level items (Movie, Series, MusicAlbum) with 0 plays on themselves or children
    // First, get all parent-level items added > 30 days ago
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
        },
        orderBy: { createdAt: 'asc' }
    });

    // For Series/MusicAlbum: check if any child (episode/season/track) has plays
    const ghostMedia = [];
    for (const media of parentGhostCandidates) {
        if (media.type === 'Movie') {
            // Movies have direct playback — already filtered by `none: {}`
            ghostMedia.push(media);
        } else {
            // Series/MusicAlbum: check children (episodes via Season chain, or direct tracks)
            const childrenWithPlays = await prisma.playbackHistory.count({
                where: {
                    media: {
                        OR: [
                            { parentId: media.jellyfinMediaId },
                            // Also check grandchildren (episodes via Season)
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

    // 2. Abandoned Media (Never finished > 80% by any user)
    // For Movies and individual playable items (Episode, Audio)
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
            parentId: true,
            durationMs: true,
            playbackHistory: {
                select: {
                    durationWatched: true,
                    startedAt: true,
                }
            }
        }
    });

    // Preload parent info for enriched titles (Episode â†’ Season â†’ Series, Audio â†’ Album)
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

    const abandonedMedia = [];

    for (const media of mediaWithHistory) {
        if (!media.durationMs || Number(media.durationMs) === 0) continue;

        // durationMs is in milliseconds (RunTimeTicks / 10000) — convert to seconds
        const maxDurationSecs = Number(media.durationMs) / 1000;

        let maxCompletionPercentage = 0;
        let lastPlayed = new Date(0);

        for (const history of media.playbackHistory) {
            const completion = getCompletionMetrics({ type: media.type, durationMs: media.durationMs }, history.durationWatched).percent;
            if (completion > maxCompletionPercentage) maxCompletionPercentage = completion;
            if (history.startedAt > lastPlayed) lastPlayed = history.startedAt;
        }

        const bestBucket = getCompletionMetrics({ type: media.type, durationMs: media.durationMs }, Math.round((maxCompletionPercentage / 100) * maxDurationSecs)).bucket;
        if (maxCompletionPercentage > 0 && bestBucket !== 'completed') {
            abandonedMedia.push({
                ...media,
                title: getEnrichedTitle(media),
                maxCompletion: maxCompletionPercentage,
                lastPlayed
            });
        }
    }

    // Sort abandoned by lowest completion first
    abandonedMedia.sort((a, b) => a.maxCompletion - b.maxCompletion);

    return {
        ghostMedia: ghostMedia.map(item => ({
            ...item,
            durationMs: item.durationMs ? Number(item.durationMs).toString() : null
        })),
        abandonedMedia: abandonedMedia.map(item => ({
            ...item,
            durationMs: item.durationMs ? Number(item.durationMs).toString() : null
        }))
    };
}

export default async function CleanupPage() {
    const t = await getTranslations('cleanup');
    return (
        <div className="flex-col md:flex">
            <div className="flex-1 space-y-4 md:space-y-6 p-4 md:p-8 pt-4 md:pt-6 max-w-6xl mx-auto w-full">
                <div className="flex items-center justify-between space-y-2 mb-6">
                    <h2 className="text-2xl md:text-3xl font-bold tracking-tight">{t('title')}</h2>
                </div>

                <Suspense fallback={<Skeleton className="w-full h-[600px] rounded-xl bg-zinc-900/50" />}>
                    <CleanupDataFetcher />
                </Suspense>
            </div>
        </div>
    );
}

async function CleanupDataFetcher() {
    const data = await getCleanupData();
    return <CleanupClient initialData={data} />;
}
