export type SchedulerIntervals = {
    recentSyncEveryHours: number;
    fullSyncEveryHours: number;
    backupEveryHours: number;
    integrityCheckEveryHours: number;
    logRetentionDays: number;
};

export const DEFAULT_SCHEDULER_INTERVALS: SchedulerIntervals = {
    recentSyncEveryHours: 6,
    fullSyncEveryHours: 48,
    backupEveryHours: 24,
    integrityCheckEveryHours: 6,
    logRetentionDays: 30,
};

function toFiniteNumber(value: unknown): number | null {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function normalizeFullSyncHours(value: unknown): number {
    const parsed = toFiniteNumber(value);
    if (parsed === null) return DEFAULT_SCHEDULER_INTERVALS.fullSyncEveryHours;
    const rounded = Math.round(parsed);
    const safe = clamp(rounded, 24, 168);
    if (safe % 24 !== 0) return DEFAULT_SCHEDULER_INTERVALS.fullSyncEveryHours;
    return safe;
}

function normalizeRepeatHours(value: unknown, fallback: number): number {
    const parsed = toFiniteNumber(value);
    if (parsed === null) return fallback;
    const rounded = Math.round(parsed);
    return clamp(rounded, 1, 168);
}

function normalizeRetentionDays(value: unknown): number {
    const parsed = toFiniteNumber(value);
    if (parsed === null) return DEFAULT_SCHEDULER_INTERVALS.logRetentionDays;
    const rounded = Math.round(parsed);
    return clamp(rounded, 0, 365);
}

export function normalizeSchedulerIntervals(raw: unknown): SchedulerIntervals {
    const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

    return {
        recentSyncEveryHours: normalizeRepeatHours(
            source.recentSyncEveryHours,
            DEFAULT_SCHEDULER_INTERVALS.recentSyncEveryHours
        ),
        fullSyncEveryHours: normalizeFullSyncHours(source.fullSyncEveryHours),
        backupEveryHours: normalizeRepeatHours(
            source.backupEveryHours,
            DEFAULT_SCHEDULER_INTERVALS.backupEveryHours
        ),
        integrityCheckEveryHours: normalizeRepeatHours(
            source.integrityCheckEveryHours,
            DEFAULT_SCHEDULER_INTERVALS.integrityCheckEveryHours
        ),
        logRetentionDays: normalizeRetentionDays(source.logRetentionDays),
    };
}
