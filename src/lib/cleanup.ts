import prisma from "@/lib/prisma";
import { appendHealthEvent } from "@/lib/systemHealth";

/**
 * Robust utility to close orphaned playback sessions.
 * 
 * Logic:
 * 1. Fetch all PlaybackHistory where endedAt is null.
 * 2. Match them against ActiveStream (current live sessions).
 * 3. Close any history entry that:
 *    - Has no corresponding ActiveStream.
 *    - OR is older than 24 hours (sanity check for ghosts).
 * 4. Cap durationWatched at a maximum (24h).
 */
export async function cleanupOrphanedSessions() {
    const ORPHAN_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours (backstop)
    const HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000;      // 5 minutes (stale stream)
    const now = new Date();

    try {
        // 1. Fetch all ActiveStreams
        const allStreams = await prisma.activeStream.findMany({
            select: { id: true, sessionId: true, userId: true, mediaId: true, lastPingAt: true, media: { select: { title: true } } }
        });

        const staleThreshold = new Date(now.getTime() - HEARTBEAT_TIMEOUT_MS);
        const staleStreamList = allStreams.filter(s => s.lastPingAt < staleThreshold);
        const activePairs = new Set(allStreams.filter(s => s.lastPingAt >= staleThreshold).map(s => `${s.userId}:${s.mediaId}`));
        const userMediaToPing = new Map(allStreams.map(s => [`${s.userId}:${s.mediaId}`, s.lastPingAt]));

        let staleDeletedCount = 0;
        if (staleStreamList.length > 0) {
            console.log(`[Cleanup] Found ${staleStreamList.length} stale streams (no heartbeat for 5+ mins).`);
            for (const stream of staleStreamList) {
                console.log(`[Cleanup] Removing ghost stream: ${stream.sessionId} ("${stream.media?.title || 'Unknown'}")`);
                await prisma.activeStream.delete({ where: { id: stream.id } });
                staleDeletedCount++;
            }
        }

        // 2. Fetch PlaybackHistory where endedAt is null
        const openPlaybacks = await prisma.playbackHistory.findMany({
            where: { endedAt: null },
            select: {
                id: true,
                startedAt: true,
                userId: true,
                mediaId: true,
                media: { select: { title: true } }
            }
        });

        let closedCount = 0;

        for (const playback of openPlaybacks) {
            const ageMs = now.getTime() - playback.startedAt.getTime();
            const pairKey = `${playback.userId}:${playback.mediaId}`;
            
            // Check if this specific user+media pair still has a valid active stream
            const isActive = activePairs.has(pairKey);

            // Close if not active OR way too old (24h backstop)
            if (!isActive || ageMs > ORPHAN_THRESHOLD_MS) {
                const lastPingAt = userMediaToPing.get(pairKey);
                
                let endedAt;
                if (lastPingAt && lastPingAt < staleThreshold) {
                    endedAt = lastPingAt; // Use exact last ping if it was a stale stream!
                } else if (ageMs > ORPHAN_THRESHOLD_MS) {
                    endedAt = new Date(playback.startedAt.getTime() + ORPHAN_THRESHOLD_MS);
                } else {
                    endedAt = now;
                }
                
                await prisma.playbackHistory.update({
                    where: { id: playback.id },
                    data: {
                        endedAt
                    }
                });

                closedCount++;
                console.log(`[Cleanup] Closed orphaned history ${playback.id} for "${playback.media?.title || 'Unknown'}"`);
            }
        }

        if (closedCount > 0 || staleDeletedCount > 0) {
            await appendHealthEvent({
                source: 'monitor',
                kind: 'orphan-cleanup',
                message: `Nettoyage : ${staleDeletedCount} flux fantômes supprimés, ${closedCount} lectures fermées.`,
                details: { staleStreams: staleDeletedCount, closedHistory: closedCount }
            });
        }

    } catch (err: any) {
        console.error("[Cleanup] Error during orphaned session cleanup:", err);
    }
}
