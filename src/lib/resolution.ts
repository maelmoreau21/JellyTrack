/**
 * Determine a canonical resolution label from width/height.
 * Prefer height when available (handles anamorphic / 4:3 like 1440x1080).
 */
export function resolutionFromDimensions(width?: number | null, height?: number | null): string {
  if (height !== undefined && height !== null) {
    const h = Number(height);
    if (Number.isNaN(h)) return 'Unknown';
    if (h >= 2160) return '4K';
    if (h >= 1080) return '1080p';
    if (h >= 720) return '720p';
    if (h >= 480) return '480p';
    return 'SD';
  }
  if (width !== undefined && width !== null) {
    const w = Number(width);
    if (Number.isNaN(w)) return 'Unknown';
    if (w >= 3800) return '4K';
    if (w >= 1800) return '1080p';
    if (w >= 1200) return '720p';
    if (w >= 700) return '480p';
    return 'SD';
  }
  return 'Unknown';
}

export default resolutionFromDimensions;
