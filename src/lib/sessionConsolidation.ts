import prisma from "@/lib/prisma";
import { consolidateRecentPlaybackSessions } from "@/lib/pluginEventHelpers";

export interface ConsolidateHistoryOptions {
  mergeWindowMinutes?: number;
  serverId?: string;
  userId?: string;
}

export interface ConsolidateHistoryResult {
  clustersMerged: number;
  sessionsPruned: number;
}

/**
 * Runs a global or scoped consolidation pass on playback history.
 * Detects multiple playback entries for the same user and media that occurred within
 * the merge window (caused by disconnections, pause interruptions, or stream restarts)
 * and fuses them into a single coherent playback history session.
 */
export async function consolidatePlaybackHistory(
  options?: ConsolidateHistoryOptions
): Promise<ConsolidateHistoryResult> {
  const mergeWindowMinutes = options?.mergeWindowMinutes ?? 60;
  const mergeWindowMs = mergeWindowMinutes * 60 * 1000;

  const whereClause: {
    userId: { not: null };
    serverId?: string;
  } = {
    userId: { not: null },
  };

  if (options?.serverId) {
    whereClause.serverId = options.serverId;
  }

  // Find candidate groups with more than 1 entry
  const groups = await prisma.playbackHistory.groupBy({
    by: ["serverId", "userId", "mediaId"],
    where: whereClause,
    _count: { id: true },
    having: {
      id: { _count: { gt: 1 } },
    },
  });

  let clustersMerged = 0;
  let sessionsPruned = 0;

  for (const group of groups) {
    if (!group.userId || !group.mediaId) continue;
    if (options?.userId && group.userId !== options.userId) continue;

    const res = await consolidateRecentPlaybackSessions(
      group.serverId,
      group.userId,
      group.mediaId,
      {
        mergeWindowMs,
        since: null, // scan all history for this candidate group
      }
    );

    if (res.consolidated) {
      clustersMerged += 1;
      sessionsPruned += res.mergedCount;
    }
  }

  return {
    clustersMerged,
    sessionsPruned,
  };
}
