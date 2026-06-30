import prisma from "@/lib/prisma";

export type PluginPrecisionProfile = "very_precise" | "balanced" | "minimal";

export type PluginTelemetrySettings = {
    precisionProfile: PluginPrecisionProfile;
    playingIntervalSeconds: number;
    pausedIntervalSeconds: number;
    staleSessionTimeoutSeconds: number;
    mergeWindowSeconds: number;
    seekThresholdSeconds: number;
    trackPauseResume: boolean;
    trackSeek: boolean;
    trackAudioSubtitleChanges: boolean;
    trackSessionEnded: boolean;
    retryQueueSize: number;
    retryFlushBatchSize: number;
};

export const DEFAULT_PLUGIN_TELEMETRY_SETTINGS: PluginTelemetrySettings = {
    precisionProfile: "very_precise",
    playingIntervalSeconds: 5,
    pausedIntervalSeconds: 30,
    staleSessionTimeoutSeconds: 90,
    mergeWindowSeconds: 300,
    seekThresholdSeconds: 20,
    trackPauseResume: true,
    trackSeek: true,
    trackAudioSubtitleChanges: true,
    trackSessionEnded: true,
    retryQueueSize: 500,
    retryFlushBatchSize: 50,
};

type CachedIngestSettings = {
    excludedLibraries: string[];
    telemetry: PluginTelemetrySettings;
};

let cachedSettings: { value: CachedIngestSettings; expiresAt: number } | null = null;
const CACHE_TTL_MS = 10_000;

function clampInteger(raw: unknown, fallback: number, min: number, max: number): number {
    const parsed = typeof raw === "string" ? Number(raw.trim()) : Number(raw);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.round(parsed)));
}

function coerceBoolean(raw: unknown, fallback: boolean): boolean {
    if (typeof raw === "boolean") return raw;
    return fallback;
}

export function normalizePluginTelemetrySettings(raw: unknown): PluginTelemetrySettings {
    const source = raw && typeof raw === "object" && !Array.isArray(raw)
        ? raw as Record<string, unknown>
        : {};
    const profileRaw = typeof source.precisionProfile === "string" ? source.precisionProfile : "";
    const precisionProfile: PluginPrecisionProfile = profileRaw === "balanced" || profileRaw === "minimal"
        ? profileRaw
        : "very_precise";

    return {
        precisionProfile,
        playingIntervalSeconds: clampInteger(source.playingIntervalSeconds, DEFAULT_PLUGIN_TELEMETRY_SETTINGS.playingIntervalSeconds, 1, 3600),
        pausedIntervalSeconds: clampInteger(source.pausedIntervalSeconds, DEFAULT_PLUGIN_TELEMETRY_SETTINGS.pausedIntervalSeconds, 5, 3600),
        staleSessionTimeoutSeconds: clampInteger(source.staleSessionTimeoutSeconds, DEFAULT_PLUGIN_TELEMETRY_SETTINGS.staleSessionTimeoutSeconds, 30, 86400),
        mergeWindowSeconds: clampInteger(source.mergeWindowSeconds, DEFAULT_PLUGIN_TELEMETRY_SETTINGS.mergeWindowSeconds, 0, 86400),
        seekThresholdSeconds: clampInteger(source.seekThresholdSeconds, DEFAULT_PLUGIN_TELEMETRY_SETTINGS.seekThresholdSeconds, 5, 300),
        trackPauseResume: coerceBoolean(source.trackPauseResume, DEFAULT_PLUGIN_TELEMETRY_SETTINGS.trackPauseResume),
        trackSeek: coerceBoolean(source.trackSeek, DEFAULT_PLUGIN_TELEMETRY_SETTINGS.trackSeek),
        trackAudioSubtitleChanges: coerceBoolean(source.trackAudioSubtitleChanges, DEFAULT_PLUGIN_TELEMETRY_SETTINGS.trackAudioSubtitleChanges),
        trackSessionEnded: coerceBoolean(source.trackSessionEnded, DEFAULT_PLUGIN_TELEMETRY_SETTINGS.trackSessionEnded),
        retryQueueSize: clampInteger(source.retryQueueSize, DEFAULT_PLUGIN_TELEMETRY_SETTINGS.retryQueueSize, 10, 5000),
        retryFlushBatchSize: clampInteger(source.retryFlushBatchSize, DEFAULT_PLUGIN_TELEMETRY_SETTINGS.retryFlushBatchSize, 1, 500),
    };
}

export function invalidatePluginIngestSettingsCache() {
    cachedSettings = null;
}

export async function getCachedPluginIngestSettings(): Promise<CachedIngestSettings> {
    const now = Date.now();
    if (cachedSettings && cachedSettings.expiresAt > now) {
        return cachedSettings.value;
    }

    const settings = await (prisma.globalSettings as any).findUnique({
        where: { id: "global" },
        select: {
            excludedLibraries: true,
            pluginTelemetrySettings: true,
        },
    });

    const value = {
        excludedLibraries: settings?.excludedLibraries || [],
        telemetry: normalizePluginTelemetrySettings(settings?.pluginTelemetrySettings),
    };
    cachedSettings = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
}
