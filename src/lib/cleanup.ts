import prisma from "@/lib/prisma";
import { appendHealthEvent } from "@/lib/systemHealth";
import { clampDuration } from "@/lib/utils";

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
    const DEFAULT_HEARTBEAT_TIMEOUT_SEC = 600; // default to plugin heartbeat interval (10 minutes)
    const parsedHeartbeatTimeoutSec = Number(process.env.PLUGIN_HEARTBEAT_TIMEOUT_SEC);
    const HEARTBEAT_TIMEOUT_SEC =
        Number.isFinite(parsedHeartbeatTimeoutSec) && parsedHeartbeatTimeoutSec > 0
            ? parsedHeartbeatTimeoutSec
            : DEFAULT_HEARTBEAT_TIMEOUT_SEC;
    const HEARTBEAT_TIMEOUT_MS = HEARTBEAT_TIMEOUT_SEC * 1000;
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
            console.log(
                `[Cleanup] Found ${staleStreamList.length} stale streams (no heartbeat for ${HEARTBEAT_TIMEOUT_SEC}s).`
            );
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
                durationWatched: true,
                media: { select: { title: true, durationMs: true } }
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
                
                const cappedDuration = clampDuration(playback.durationWatched, playback.media?.durationMs);

                await prisma.playbackHistory.update({
                    where: { id: playback.id },
                    data: {
                        endedAt,
                        durationWatched: cappedDuration
                    }
                });

                closedCount++;
                console.log(`[Cleanup] Closed orphaned history ${playback.id} for "${playback.media?.title || 'Unknown'}" (duration capped to ${cappedDuration}s)`);
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

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[Cleanup] Error during orphaned session cleanup:", msg);
    }
}
