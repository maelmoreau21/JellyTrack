import prisma from "@/lib/prisma";
import redis from "@/lib/redis";
// No rules
import { readSystemHealthState } from "@/lib/systemHealth";
import { buildLegacyStreamRedisKey, buildStreamRedisKey } from "@/lib/serverRegistry";

export async function getLogHealthSnapshot() {
    const anomalyWindowStart = new Date();
    anomalyWindowStart.setUTCHours(0, 0, 0, 0);
    anomalyWindowStart.setUTCDate(anomalyWindowStart.getUTCDate() - 13);

    const [settings, activeStreams, openPlaybackHistory, healthState, discoveredLibraries, anomalyEvents] = await Promise.all([
        prisma.globalSettings.findUnique({ where: { id: "global" } }),
        prisma.activeStream.findMany({
            select: {
                id: true,
                serverId: true,
                sessionId: true,
                userId: true,
                mediaId: true,
                lastPingAt: true,
                user: { select: { username: true } },
                media: { select: { title: true, collectionType: true, type: true } },
            }
        }),
        prisma.playbackHistory.findMany({
            where: { endedAt: null },
            orderBy: { startedAt: "desc" },
            take: 50,
            select: {
                id: true,
                userId: true,
                mediaId: true,
                startedAt: true,
                durationWatched: true,
                user: { select: { username: true } },
                media: { select: { title: true, collectionType: true, type: true } },
            }
        }),
        readSystemHealthState({ eventLimit: 120 }),
        prisma.media.findMany({
            where: { libraryName: { not: null } },
            select: { libraryName: true },
            distinct: ['libraryName'],
        }),
        prisma.systemHealthEvent.findMany({
            where: {
                stateId: "global",
                createdAt: { gte: anomalyWindowStart },
            },
            orderBy: { createdAt: "asc" },
            select: {
                source: true,
                kind: true,
                details: true,
                createdAt: true,
            },
        }),
    ]);

    // No rules
    const discoveredNames = discoveredLibraries.map(l => l.libraryName as string);

    const activePairSet = new Set(activeStreams.map((stream) => `${stream.userId}:${stream.mediaId}`));
    const openPlaybackOrphans = openPlaybackHistory.filter((entry) => !activePairSet.has(`${entry.userId}:${entry.mediaId}`));

    let redisKeys: string[] = [];
    try {
        redisKeys = await redis.keys("stream:*");
    } catch {
        redisKeys = [];
    }

    const redisKeySet = new Set(redisKeys);
    const expectedRedisKeys = new Set(activeStreams.map((stream) => buildStreamRedisKey(stream.serverId, stream.sessionId)));
    const expectedLegacyKeys = new Set(activeStreams.map((stream) => buildLegacyStreamRedisKey(stream.sessionId)));
    const dbStreamsWithoutRedis = activeStreams.filter((stream) => {
        const scopedKey = buildStreamRedisKey(stream.serverId, stream.sessionId);
        const legacyKey = buildLegacyStreamRedisKey(stream.sessionId);
        return !redisKeySet.has(scopedKey) && !redisKeySet.has(legacyKey);
    });
    const redisOrphanKeys = redisKeys.filter((key) => !expectedRedisKeys.has(key) && !expectedLegacyKeys.has(key));

    const dailyMap = new Map<string, { day: string; monitorErrors: number; syncErrors: number; backupErrors: number; cleanupOps: number; syncSuccesses: number }>();
    for (let index = 0; index < 14; index++) {
        const current = new Date(anomalyWindowStart);
        current.setUTCDate(anomalyWindowStart.getUTCDate() + index);
        const key = current.toISOString().slice(0, 10);
        dailyMap.set(key, {
            day: current.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
            monitorErrors: 0,
            syncErrors: 0,
            backupErrors: 0,
            cleanupOps: 0,
            syncSuccesses: 0,
        });
    }

    const sourceImpact = new Map<string, number>([
        ["monitor", 0],
        ["sync", 0],
        ["backup", 0],
        ["restore", 0],
    ]);

    const normalizeDetailCount = (details: unknown) => {
        const raw = typeof details === "object" && details !== null
            ? Number((details as Record<string, unknown>).count ?? 1)
            : 1;

        if (!Number.isFinite(raw) || raw <= 0) {
            return 1;
        }

        return Math.max(1, Math.floor(raw));
    };

    anomalyEvents.forEach((event) => {
        const key = event.createdAt.toISOString().slice(0, 10);
        const dayEntry = dailyMap.get(key);
        if (!dayEntry) {
            return;
        }

        const detailCount = normalizeDetailCount(event.details);
        const kind = (event.kind || "").toLowerCase();
        const isErrorLike = kind.includes("error");
        const isCleanupLike = kind.includes("ghost") || kind.includes("orphan") || kind.includes("open-playbacks");
        const isSuccessLike = kind === "sync_success" || kind.includes("success") || kind.includes("ping") || kind.includes("ok");

        if (isErrorLike) {
            if (event.source === "monitor") dayEntry.monitorErrors += detailCount;
            if (event.source === "sync") dayEntry.syncErrors += detailCount;
            if (event.source === "backup") dayEntry.backupErrors += detailCount;
        }

        if (isCleanupLike) {
            dayEntry.cleanupOps += detailCount;
        }

        if (isSuccessLike) {
            dayEntry.syncSuccesses += detailCount;
        }

        if (isErrorLike || isCleanupLike) {
            sourceImpact.set(event.source, (sourceImpact.get(event.source) || 0) + detailCount);
        }
    });

    return {
        status: healthState,
        excludedLibraries: settings?.excludedLibraries || [],
        counts: {
            activeStreams: activeStreams.length,
            openPlaybackOrphans: openPlaybackOrphans.length,
            dbStreamsWithoutRedis: dbStreamsWithoutRedis.length,
            redisOrphans: redisOrphanKeys.length,
        },
        orphanPlaybacks: openPlaybackOrphans.slice(0, 20).map((entry) => ({
            id: entry.id,
            startedAt: entry.startedAt.toISOString(),
            durationWatched: entry.durationWatched,
            username: entry.user?.username || "Utilisateur Supprimé",
            mediaTitle: entry.media?.title || "Média inconnu",
            library: entry.media?.collectionType || entry.media?.type || "?",
        })),
        dbStreamsWithoutRedis: dbStreamsWithoutRedis.slice(0, 20).map((entry) => ({
            id: entry.id,
            sessionId: entry.sessionId,
            lastPingAt: entry.lastPingAt.toISOString(),
            username: entry.user?.username || "Utilisateur Supprimé",
            mediaTitle: entry.media?.title || "Média inconnu",
            library: entry.media?.collectionType || entry.media?.type || "?",
        })),
        redisOrphanKeys: redisOrphanKeys.slice(0, 20),
        recentEvents: healthState.events.slice(0, 20),
        anomalyTimeline: Array.from(dailyMap.values()),
        anomalyBreakdown: Array.from(sourceImpact.entries()).map(([source, value]) => ({ source, value })),
    };
}
