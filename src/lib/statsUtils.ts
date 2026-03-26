/**
 * Zapping Filter: Reusable Prisma condition to exclude short "zapping" sessions.
 * Thresholds: 30s for Video, 10s for Audio/Others.
 * Includes 'endedAt: null' to keep currently active streams in real-time counts.
 */
export const ZAPPING_CONDITION = {
  OR: [
    { durationWatched: { gte: 60 } },
    { endedAt: null } // Still playing shouldn't be zapped yet
  ]
};
 
/**
 * Zapping Filter for already aggregated results or where media relation is not directly available.
 * Threshold: 60s (1 min) for all media types as per UI label.
 */
export function isZapped(session: { durationWatched: number }): boolean {
  if (!session.durationWatched || session.durationWatched <= 0) return true;
  return session.durationWatched < 60;
}
