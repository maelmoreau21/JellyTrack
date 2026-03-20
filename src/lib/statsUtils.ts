/**
 * Zapping Filter: Reusable Prisma condition to exclude short "zapping" sessions.
 * Thresholds: 30s for Video, 10s for Audio/Others.
 * Includes 'endedAt: null' to keep currently active streams in real-time counts.
 */
export const ZAPPING_CONDITION = {
  OR: [
    { media: { type: { in: ['Movie', 'Episode', 'Series'] } }, durationWatched: { gte: 30 } },
    { media: { type: { notIn: ['Movie', 'Episode', 'Series'] } }, durationWatched: { gte: 10 } },
    { endedAt: null } // Still playing shouldn't be zapped yet
  ]
};

/**
 * Zapping Filter for already aggregated results or where media relation is not directly available.
 * Use with caution in JS-side filtering.
 */
export function isZapped(session: { durationWatched: number, media?: { type: string } | null }): boolean {
  if (!session.durationWatched || session.durationWatched <= 0) return true;
  
  const type = session.media?.type || 'Unknown';
  if (['Movie', 'Episode', 'Series'].includes(type)) {
    return session.durationWatched < 30;
  }
  
  return session.durationWatched < 10;
}
