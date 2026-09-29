#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Standalone playback history consolidation script for JellyTrack.
 * Detects and merges playback history entries fragmented by pauses or disconnections.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/consolidate_history.js
 *
 * Options (via env):
 *   MERGE_WINDOW_MINUTES=60   (default: 60)
 *   DRY_RUN=true              (preview without deleting or updating)
 */
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const mergeWindowMinutes = parseInt(process.env.MERGE_WINDOW_MINUTES || '60', 10);
const mergeWindowMs = mergeWindowMinutes * 60 * 1000;
const isDryRun = process.env.DRY_RUN === 'true' || process.env.DRY_RUN === '1';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

function clampDuration(durationS, durationMs) {
  if (durationMs && durationMs > 0n) {
    const maxS = Math.ceil(Number(durationMs) / 1000);
    return Math.min(Math.max(0, durationS), maxS);
  }
  return Math.max(0, durationS);
}

function clusterSessions(sessions, windowMs) {
  if (sessions.length <= 1) return [sessions];

  const clusters = [];
  let currentCluster = [sessions[0]];

  for (let i = 1; i < sessions.length; i++) {
    const cur = sessions[i];
    const prev = sessions[i - 1];

    const prevRefTime = prev.endedAt
      ? new Date(prev.endedAt).getTime()
      : (new Date(prev.startedAt).getTime() + (prev.durationWatched * 1000));

    const gapMs = Math.max(0, new Date(cur.startedAt).getTime() - prevRefTime);

    if (gapMs <= windowMs) {
      currentCluster.push(cur);
    } else {
      clusters.push(currentCluster);
      currentCluster = [cur];
    }
  }
  clusters.push(currentCluster);
  return clusters;
}

(async () => {
  console.log(`[Consolidate] Starting playback history consolidation (mergeWindow=${mergeWindowMinutes}m, dryRun=${isDryRun})...`);

  const groups = await prisma.playbackHistory.groupBy({
    by: ['serverId', 'userId', 'mediaId'],
    where: { userId: { not: null } },
    _count: { id: true },
    having: {
      id: { _count: { gt: 1 } },
    },
  });

  console.log(`[Consolidate] Found ${groups.length} (server, user, media) candidate groups with multiple sessions.`);

  let totalClustersMerged = 0;
  let totalDuplicatesRemoved = 0;

  for (const group of groups) {
    if (!group.userId || !group.mediaId) continue;

    const sessions = await prisma.playbackHistory.findMany({
      where: {
        serverId: group.serverId,
        userId: group.userId,
        mediaId: group.mediaId,
      },
      orderBy: { startedAt: 'asc' },
      include: {
        media: { select: { title: true, durationMs: true } },
      },
    });

    const clusters = clusterSessions(sessions, mergeWindowMs);

    for (const cluster of clusters) {
      if (cluster.length <= 1) continue;

      const leader = cluster[0];
      const duplicates = cluster.slice(1);
      const dupIds = duplicates.map((d) => d.id);

      const accumulatedDuration = cluster.reduce((sum, s) => sum + s.durationWatched, 0);
      const finalDuration = clampDuration(accumulatedDuration, leader.media?.durationMs);
      const accumulatedPauses = cluster.reduce((sum, s) => sum + s.pauseCount, 0) + (cluster.length - 1);
      const accumulatedSeeks = cluster.reduce((sum, s) => sum + s.seekCount, 0);
      const accumulatedRewatches = cluster.reduce((sum, s) => sum + s.rewatchCount, 0);
      const accumulatedSpeedChanges = cluster.reduce((sum, s) => sum + s.speedChangeCount, 0);
      const accumulatedAudioChanges = cluster.reduce((sum, s) => sum + s.audioChanges, 0);
      const accumulatedSubtitleChanges = cluster.reduce((sum, s) => sum + s.subtitleChanges, 0);

      const hasOpen = cluster.some((s) => s.endedAt === null);
      let finalEndedAt = null;
      if (!hasOpen) {
        const maxEndTime = Math.max(...cluster.map((s) => new Date(s.endedAt).getTime()));
        finalEndedAt = new Date(maxEndTime);
      }

      console.log(
        `[Consolidate] Merging ${cluster.length} sessions into leader ${leader.id} for "${leader.media?.title || 'Unknown'}" (duration: ${leader.durationWatched}s -> ${finalDuration}s, +${dupIds.length} merged)`
      );

      if (!isDryRun) {
        await prisma.$transaction(async (tx) => {
          await tx.telemetryEvent.updateMany({
            where: { playbackId: { in: dupIds } },
            data: { playbackId: leader.id },
          });
          await tx.activeStream.updateMany({
            where: { playbackId: { in: dupIds } },
            data: { playbackId: leader.id },
          });
          await tx.playbackHistory.deleteMany({
            where: { id: { in: dupIds } },
          });
          await tx.playbackHistory.update({
            where: { id: leader.id },
            data: {
              durationWatched: finalDuration,
              endedAt: finalEndedAt,
              pauseCount: accumulatedPauses,
              seekCount: accumulatedSeeks,
              rewatchCount: accumulatedRewatches,
              speedChangeCount: accumulatedSpeedChanges,
              audioChanges: accumulatedAudioChanges,
              subtitleChanges: accumulatedSubtitleChanges,
            },
          });
        });
      }

      totalClustersMerged++;
      totalDuplicatesRemoved += dupIds.length;
    }
  }

  console.log(
    `[Consolidate] Done. Consolidated ${totalClustersMerged} session clusters, removed ${totalDuplicatesRemoved} duplicate rows.${isDryRun ? ' (Dry run: no changes written)' : ''}`
  );

  await prisma.$disconnect();
  process.exit(0);
})().catch(async (err) => {
  console.error('[Consolidate] Error during consolidation:', err);
  await prisma.$disconnect();
  process.exit(1);
});
