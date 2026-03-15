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
    const ORPHAN_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
    const now = new Date();

    try {
        // Fetch all open playbacks
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

        if (openPlaybacks.length === 0) return;

        // Fetch all active streams (sessions currently considered "live")
        const activeStreams = await prisma.activeStream.findMany({
            select: { userId: true, mediaId: true }
        });

        // Use a set of user:media pairs for quick lookup
        const activePairs = new Set(activeStreams.map(s => `${s.userId}:${s.mediaId}`));

        let closedCount = 0;

        for (const playback of openPlaybacks) {
            const ageMs = now.getTime() - playback.startedAt.getTime();
            const isActive = activePairs.has(`${playback.userId}:${playback.mediaId}`);

            // Close if not active OR too old
            if (!isActive || ageMs > ORPHAN_THRESHOLD_MS) {
                const endedAt = ageMs > ORPHAN_THRESHOLD_MS 
                    ? new Date(playback.startedAt.getTime() + ORPHAN_THRESHOLD_MS) 
                    : now;
                
                const durationS = Math.floor((endedAt.getTime() - playback.startedAt.getTime()) / 1000);

                await prisma.playbackHistory.update({
                    where: { id: playback.id },
                    data: {
                        endedAt,
                        durationWatched: Math.max(0, Math.min(durationS, 86400)) // Cap at 24h
                    }
                });

                closedCount++;
                console.log(`[Cleanup] Closed orphaned session ${playback.id} for "${playback.media.title}" (${Math.floor(durationS/60)} min)`);
            }
        }

        if (closedCount > 0) {
            await appendHealthEvent({
                source: 'monitor',
                kind: 'orphan-cleanup',
                message: `Nettoyage automatique : ${closedCount} lectures orphelines fermées.`,
                details: { closedCount }
            });
        }

    } catch (err: any) {
        console.error("[Cleanup] Error during orphaned session cleanup:", err);
    }
}
