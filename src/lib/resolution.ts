/**
 * Determine a canonical resolution label from width/height.
 * Uses boundaries similar to Tdarr to be inclusive of various aspect ratios.
 */
type ResolutionThreshold = { maxW: number; maxH: number };

const DEFAULT_THRESHOLDS: Record<'480p' | '720p' | '1080p' | '4K', ResolutionThreshold> = {
  '480p': { maxW: 792, maxH: 528 },
  '720p': { maxW: 1440, maxH: 792 },
  '1080p': { maxW: 2112, maxH: 1188 },
  '4K': { maxW: 4224, maxH: 2376 },
};

function toPositiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function normalizeThreshold(raw: unknown, fallback: ResolutionThreshold): ResolutionThreshold {
  if (!raw || typeof raw !== 'object') return fallback;
  const candidate = raw as Record<string, unknown>;
  return {
    maxW: toPositiveNumber(candidate.maxW, fallback.maxW),
    maxH: toPositiveNumber(candidate.maxH, fallback.maxH),
  };
}

export function resolutionFromDimensions(width?: number | null, height?: number | null, customThresholds?: any): string {
  const w = width ? Number(width) : 0;
  const h = height ? Number(height) : 0;

  if (!w && !h) return 'Unknown';

  // Boundaries (Max values for each category)
  // Based on Tdarr / Common Media Server standards
  const rawThresholds = (customThresholds && typeof customThresholds === 'object')
    ? (customThresholds as Record<string, unknown>)
    : {};
  const thresholds: Record<'480p' | '720p' | '1080p' | '4K', ResolutionThreshold> = {
    '480p': normalizeThreshold(rawThresholds['480p'], DEFAULT_THRESHOLDS['480p']),
    '720p': normalizeThreshold(rawThresholds['720p'], DEFAULT_THRESHOLDS['720p']),
    '1080p': normalizeThreshold(rawThresholds['1080p'], DEFAULT_THRESHOLDS['1080p']),
    '4K': normalizeThreshold(rawThresholds['4K'], DEFAULT_THRESHOLDS['4K']),
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

/**
 * Numeric weight for comparing resolutions.
 * Higher = better quality. Used by sync to keep the best resolution.
 */
export function getResolutionWeight(resolution: string | null | undefined): number {
  if (!resolution) return 0;
  switch (resolution) {
    case '4K': return 5;
    case '1440p': return 4;
    case '1080p': return 3;
    case '720p': return 2;
    case '480p':
    case 'SD': return 1;
    default: return 0;
  }
}

export default resolutionFromDimensions;
