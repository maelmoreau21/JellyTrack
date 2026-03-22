/**
 * Determine a canonical resolution label from width/height.
 * Prefer height when available (handles anamorphic / 4:3 like 1440x1080).
 */
export function resolutionFromDimensions(width?: number | null, height?: number | null): string {
  // Helper to classify by height
  const classifyByHeight = (hVal?: number | null): string | undefined => {
    if (hVal === undefined || hVal === null) return undefined;
    const h = Number(hVal);
    if (Number.isNaN(h)) return 'Unknown';
    if (h >= 2160) return '4K';
    if (h >= 1080) return '1080p';
    if (h >= 720) return '720p';
    if (h >= 480) return '480p';
    return 'SD';
  };

  // Helper to classify by width
  const classifyByWidth = (wVal?: number | null): string | undefined => {
    if (wVal === undefined || wVal === null) return undefined;
    const w = Number(wVal);
    if (Number.isNaN(w)) return 'Unknown';
    if (w >= 3800) return '4K';
    if (w >= 1800) return '1080p';
    if (w >= 1200) return '720p';
    if (w >= 700) return '480p';
    return 'SD';
  };

  const hRes = classifyByHeight(height);
  const wRes = classifyByWidth(width);

  // If we have both dimensions, pick the stronger (higher) bucket between
  // width and height. This handles common letterboxed/cinemascope files
  // like 1920x800 which should be considered 1080p rather than 720p.
  if (hRes && wRes) {
    const order = ['Unknown', 'SD', '480p', '720p', '1080p', '4K'];
    const idx = (r: string) => Math.max(0, order.indexOf(r));
    return idx(hRes) >= idx(wRes) ? hRes : wRes;
  }

  return hRes ?? wRes ?? 'Unknown';
}

export default resolutionFromDimensions;
