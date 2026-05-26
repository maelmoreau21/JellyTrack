import { describe, expect, it } from "vitest";
import { DEFAULT_PLUGIN_TELEMETRY_SETTINGS, normalizePluginTelemetrySettings } from "./pluginTelemetrySettings";

describe("normalizePluginTelemetrySettings", () => {
    it("defaults to the very precise profile", () => {
        expect(normalizePluginTelemetrySettings(null)).toEqual(DEFAULT_PLUGIN_TELEMETRY_SETTINGS);
    });

    it("clamps noisy numeric values for large-server safety", () => {
        const settings = normalizePluginTelemetrySettings({
            precisionProfile: "minimal",
            playingIntervalSeconds: 0,
            pausedIntervalSeconds: 1,
            staleSessionTimeoutSeconds: 5,
            mergeWindowSeconds: 999999,
            seekThresholdSeconds: 1,
            retryQueueSize: 2,
            retryFlushBatchSize: 9999,
            trackSeek: false,
        });

        expect(settings).toMatchObject({
            precisionProfile: "minimal",
            playingIntervalSeconds: 1,
            pausedIntervalSeconds: 5,
            staleSessionTimeoutSeconds: 30,
            mergeWindowSeconds: 86400,
            seekThresholdSeconds: 5,
            retryQueueSize: 10,
            retryFlushBatchSize: 500,
            trackSeek: false,
        });
    });
});
