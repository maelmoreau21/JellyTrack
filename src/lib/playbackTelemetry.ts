/**
 * Playback Telemetry & Rate Estimation Helpers
 * Handles playback speed observation, position jumps/rewinds, and client compensation.
 */

export function parseFiniteNumber(raw: unknown): number | null {
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string" && raw.trim().length > 0) {
        const parsed = Number(raw.trim());
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

export const COMMON_PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];

export type PlaybackRateSource = "jellyfin" | "estimated";

export type PlaybackRateObservation = {
    rate: number;
    bucket: number;
    source: PlaybackRateSource;
    confidence: number;
    wallDeltaMs?: number;
    positionDeltaMs?: number;
};

export const AUDIO_WALL_CLOCK_TYPES = new Set(["audio", "track", "audiobook"]);

export function isFeishinClient(clientName: unknown): boolean {
    return typeof clientName === "string" && clientName.toLowerCase().includes("feishin");
}

export function isAudioWallClockCandidate(mediaType: unknown): boolean {
    return typeof mediaType === "string" && AUDIO_WALL_CLOCK_TYPES.has(mediaType.trim().toLowerCase());
}

export function shouldPreferWallClockForFeishinAudio(input: {
    mediaType: unknown;
    clientName: unknown;
    wallDeltaS: number;
    tickDeltaS: number | null;
    isPaused?: boolean;
}): boolean {
    if (input.isPaused) return false;
    if (!isAudioWallClockCandidate(input.mediaType) || !isFeishinClient(input.clientName)) return false;
    if (!Number.isFinite(input.wallDeltaS) || input.wallDeltaS <= 0) return false;

    if (input.tickDeltaS === null || !Number.isFinite(input.tickDeltaS)) return true;
    if (input.tickDeltaS <= 0) return true;

    const wall = Math.max(1, input.wallDeltaS);
    return input.tickDeltaS <= Math.max(3, wall * 0.35);
}

export function shouldPromoteDurationToWallClock(input: {
    mediaType: unknown;
    clientName: unknown;
    wallClockS: number;
    computedDurationS: number;
}): boolean {
    if (!isAudioWallClockCandidate(input.mediaType) || !isFeishinClient(input.clientName)) return false;
    if (!Number.isFinite(input.wallClockS) || input.wallClockS <= 0) return false;
    if (input.computedDurationS <= 0) return true;
    if (input.wallClockS < 20) return false;
    return input.computedDurationS <= input.wallClockS * 0.5;
}

export function parsePlaybackRate(raw: unknown): number | null {
    const value = typeof raw === "number"
        ? raw
        : typeof raw === "string"
            ? Number(raw.trim().replace(/^x/i, ""))
            : NaN;

    if (!Number.isFinite(value) || value < 0.25 || value > 4) {
        return null;
    }

    return value;
}

export function readPlaybackRate(payload: Record<string, any>, sessionPayload: Record<string, any>): number | null {
    return parsePlaybackRate(
        payload.playbackRate ??
        payload.PlaybackRate ??
        payload.playbackSpeed ??
        payload.PlaybackSpeed ??
        payload.speed ??
        payload.Speed ??
        sessionPayload.playbackRate ??
        sessionPayload.PlaybackRate ??
        sessionPayload.playbackSpeed ??
        sessionPayload.PlaybackSpeed ??
        sessionPayload.speed ??
        sessionPayload.Speed
    );
}

export function bucketPlaybackRate(rate: number): number {
    return COMMON_PLAYBACK_RATES.reduce((best, candidate) => (
        Math.abs(candidate - rate) < Math.abs(best - rate) ? candidate : best
    ), COMMON_PLAYBACK_RATES[0]);
}

export function formatPlaybackRate(rate: number | null | undefined): string | null {
    if (rate === null || rate === undefined || !Number.isFinite(Number(rate))) return null;
    return `x${Number(rate).toFixed(2).replace(/\.?0+$/, "")}`;
}

export function formatPositionLabel(ms: number | null | undefined): string | null {
    if (ms === null || ms === undefined || !Number.isFinite(Number(ms)) || Number(ms) < 0) return null;
    const totalSeconds = Math.floor(Number(ms) / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function buildJumpMetadata(input: {
    fromMs: number;
    toMs: number;
    deltaMs: number;
    source: string;
    existing?: Record<string, unknown> | null;
}) {
    const direction = input.deltaMs >= 0 ? "forward" : "backward";
    const rangeStartMs = Math.min(input.fromMs, input.toMs);
    const rangeEndMs = Math.max(input.fromMs, input.toMs);

    return {
        ...(input.existing || {}),
        fromMs: input.fromMs,
        toMs: input.toMs,
        deltaMs: input.deltaMs,
        direction,
        source: input.source,
        fromLabel: formatPositionLabel(input.fromMs),
        toLabel: formatPositionLabel(input.toMs),
        rangeStartMs,
        rangeEndMs,
        rangeLabel: `${formatPositionLabel(rangeStartMs)} -> ${formatPositionLabel(rangeEndMs)}`,
    };
}

export function inferJumpFromMetadata(metadata: Record<string, unknown>, fallbackPositionMs: number): {
    fromMs: number;
    toMs: number;
    deltaMs: number;
    direction: "forward" | "backward";
} | null {
    const fromMsRaw = parseFiniteNumber(metadata.fromMs);
    const toMsRaw = parseFiniteNumber(metadata.toMs);
    const fromTicks = parseFiniteNumber(metadata.fromTicks);
    const toTicks = parseFiniteNumber(metadata.toTicks);

    const fromMs = fromMsRaw ?? (fromTicks !== null ? Math.floor(fromTicks / 10_000) : null);
    const toMs = toMsRaw ?? (toTicks !== null ? Math.floor(toTicks / 10_000) : fallbackPositionMs);

    if (fromMs === null || toMs === null) return null;

    const rawDelta = parseFiniteNumber(metadata.deltaMs);
    const deltaMs = rawDelta ?? (toMs - fromMs);
    const directionRaw = typeof metadata.direction === "string" ? metadata.direction.toLowerCase() : "";
    const direction = directionRaw === "backward" || deltaMs < 0 ? "backward" : "forward";

    return { fromMs, toMs, deltaMs, direction };
}

export function estimatePlaybackRate(input: {
    explicitRate: number | null;
    isPaused: boolean;
    appearsSeek: boolean;
    prevTime: number | null;
    prevTick: number | null;
    now: number;
    positionTicks: number;
}): PlaybackRateObservation | null {
    if (input.explicitRate !== null) {
        const bucket = bucketPlaybackRate(input.explicitRate);
        return {
            rate: input.explicitRate,
            bucket,
            source: "jellyfin",
            confidence: 1,
        };
    }

    if (input.isPaused || input.appearsSeek || input.prevTime === null || input.prevTick === null) {
        return null;
    }

    const wallDeltaMs = input.now - input.prevTime;
    const positionDeltaMs = (input.positionTicks - input.prevTick) / 10_000;
    if (wallDeltaMs < 2_000 || wallDeltaMs > 60_000 || positionDeltaMs <= 0) {
        return null;
    }

    const rate = positionDeltaMs / wallDeltaMs;
    if (!Number.isFinite(rate) || rate < 0.25 || rate > 4) {
        return null;
    }

    const bucket = bucketPlaybackRate(rate);
    const delta = Math.abs(rate - bucket);
    if (delta > 0.18) {
        return null;
    }

    return {
        rate,
        bucket,
        source: "estimated",
        confidence: Math.max(0.3, Math.min(0.95, 1 - delta)),
        wallDeltaMs,
        positionDeltaMs,
    };
}
