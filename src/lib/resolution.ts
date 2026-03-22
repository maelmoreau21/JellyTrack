/**
 * Determine a canonical resolution label from width/height.
 * Uses boundaries similar to Tdarr to be inclusive of various aspect ratios.
 */
export function resolutionFromDimensions(width?: number | null, height?: number | null, customThresholds?: any): string {
  const w = width ? Number(width) : 0;
  const h = height ? Number(height) : 0;

  if (!w && !h) return 'Unknown';

  // Boundaries (Max values for each category)
  // Based on Tdarr / Common Media Server standards
  const thresholds = customThresholds || {
    "480p": { maxW: 792, maxH: 528 },
    "720p": { maxW: 1408, maxH: 792 },
    "1080p": { maxW: 2112, maxH: 1188 },
    "4K": { maxW: 4224, maxH: 2376 }
  };

  // If it exceeds 1080p boundaries, it's 4K
  if (w > thresholds["1080p"].maxW || h > thresholds["1080p"].maxH) return '4K';
  
  // If it exceeds 720p boundaries, it's 1080p
  if (w > thresholds["720p"].maxW || h > thresholds["720p"].maxH) return '1080p';
  
  // If it exceeds 480p boundaries, it's 720p
  if (w > thresholds["480p"].maxW || h > thresholds["480p"].maxH) return '720p';
  
  // If it has some dimensions but is within 480p bounds
  if (w > 100 || h > 100) return 'SD';

  return 'Unknown';
}

export default resolutionFromDimensions;
