export interface SmartSecurityThresholds {
  ipAttemptThreshold: number;
  ipWindowMinutes: number;
  newCountryGraceMinutes: number;
}

export const DEFAULT_SMART_SECURITY_THRESHOLDS: SmartSecurityThresholds = {
  ipAttemptThreshold: 50,
  ipWindowMinutes: 24 * 60,
  newCountryGraceMinutes: 5,
};

const LIMITS = {
  ipAttemptThreshold: { min: 1, max: 10_000 },
  ipWindowMinutes: { min: 5, max: 7 * 24 * 60 },
  newCountryGraceMinutes: { min: 1, max: 24 * 60 },
} as const;

function toBoundedInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
      ? Number(value)
      : Number.NaN;

  if (!Number.isFinite(numeric)) return fallback;

  const normalized = Math.floor(numeric);
  if (normalized < min) return min;
  if (normalized > max) return max;
  return normalized;
}

export function normalizeSmartSecurityThresholds(input: unknown): SmartSecurityThresholds {
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};

  return {
    ipAttemptThreshold: toBoundedInt(
      source.ipAttemptThreshold,
      DEFAULT_SMART_SECURITY_THRESHOLDS.ipAttemptThreshold,
      LIMITS.ipAttemptThreshold.min,
      LIMITS.ipAttemptThreshold.max,
    ),
    ipWindowMinutes: toBoundedInt(
      source.ipWindowMinutes,
      DEFAULT_SMART_SECURITY_THRESHOLDS.ipWindowMinutes,
      LIMITS.ipWindowMinutes.min,
      LIMITS.ipWindowMinutes.max,
    ),
    newCountryGraceMinutes: toBoundedInt(
      source.newCountryGraceMinutes,
      DEFAULT_SMART_SECURITY_THRESHOLDS.newCountryGraceMinutes,
      LIMITS.newCountryGraceMinutes.min,
      LIMITS.newCountryGraceMinutes.max,
    ),
  };
}

export function readSmartSecurityThresholdsFromResolutionSettings(
  resolutionThresholds: unknown,
): SmartSecurityThresholds {
  const resolutionObject =
    resolutionThresholds && typeof resolutionThresholds === "object"
      ? (resolutionThresholds as Record<string, unknown>)
      : {};

  return normalizeSmartSecurityThresholds(resolutionObject.smartSecurityThresholds);
}

export function mergeSmartSecurityThresholdsIntoResolutionSettings(
  resolutionThresholds: unknown,
  thresholds: SmartSecurityThresholds,
): Record<string, unknown> {
  const resolutionObject =
    resolutionThresholds && typeof resolutionThresholds === "object"
      ? (resolutionThresholds as Record<string, unknown>)
      : {};

  return {
    ...resolutionObject,
    smartSecurityThresholds: thresholds,
  };
}
