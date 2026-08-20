import { describe, it, expect } from "vitest";
import {
    parseFiniteNumber,
    parsePlaybackRate,
    bucketPlaybackRate,
    formatPlaybackRate,
    formatPositionLabel,
    buildJumpMetadata,
    inferJumpFromMetadata,
    estimatePlaybackRate,
    isFeishinClient,
    shouldPreferWallClockForFeishinAudio,
    shouldPromoteDurationToWallClock,
} from "./playbackTelemetry";

describe("playbackTelemetry", () => {
    describe("parseFiniteNumber", () => {
        it("parses numbers and numeric strings", () => {
            expect(parseFiniteNumber(42)).toBe(42);
            expect(parseFiniteNumber("123.45")).toBe(123.45);
            expect(parseFiniteNumber("")).toBeNull();
            expect(parseFiniteNumber(null)).toBeNull();
            expect(parseFiniteNumber(NaN)).toBeNull();
        });
    });

    describe("playback rates", () => {
        it("parses playback rates", () => {
            expect(parsePlaybackRate(1.5)).toBe(1.5);
            expect(parsePlaybackRate("x1.25")).toBe(1.25);
            expect(parsePlaybackRate("10")).toBeNull(); // Out of [0.25, 4]
        });

        it("buckets playback rates into standard speeds", () => {
            expect(bucketPlaybackRate(1.02)).toBe(1);
            expect(bucketPlaybackRate(1.22)).toBe(1.25);
            expect(bucketPlaybackRate(1.48)).toBe(1.5);
        });

        it("formats playback rates", () => {
            expect(formatPlaybackRate(1.5)).toBe("x1.5");
            expect(formatPlaybackRate(1)).toBe("x1");
            expect(formatPlaybackRate(null)).toBeNull();
        });
    });

    describe("position and jumps", () => {
        it("formats position labels", () => {
            expect(formatPositionLabel(65_000)).toBe("1:05");
            expect(formatPositionLabel(3_665_000)).toBe("1:01:05");
            expect(formatPositionLabel(null)).toBeNull();
        });

        it("builds jump metadata", () => {
            const jump = buildJumpMetadata({
                fromMs: 10_000,
                toMs: 30_000,
                deltaMs: 20_000,
                source: "seek",
            });
            expect(jump.direction).toBe("forward");
            expect(jump.fromLabel).toBe("0:10");
            expect(jump.toLabel).toBe("0:30");
        });

        it("infers backward jump from metadata", () => {
            const inferred = inferJumpFromMetadata({
                fromMs: 50_000,
                toMs: 20_000,
            }, 20_000);
            expect(inferred?.direction).toBe("backward");
            expect(inferred?.deltaMs).toBe(-30_000);
        });
    });

    describe("Feishin audio compensation", () => {
        it("identifies Feishin client and candidate audio", () => {
            expect(isFeishinClient("Feishin v0.8")).toBe(true);
            expect(isFeishinClient("Chrome")).toBe(false);
        });

        it("detects wallclock promotion candidate", () => {
            expect(shouldPreferWallClockForFeishinAudio({
                mediaType: "Audio",
                clientName: "Feishin",
                wallDeltaS: 10,
                tickDeltaS: 0,
            })).toBe(true);

            expect(shouldPromoteDurationToWallClock({
                mediaType: "Audio",
                clientName: "Feishin",
                wallClockS: 60,
                computedDurationS: 5,
            })).toBe(true);
        });
    });

    describe("estimatePlaybackRate", () => {
        it("returns explicit rate immediately", () => {
            const obs = estimatePlaybackRate({
                explicitRate: 1.5,
                isPaused: false,
                appearsSeek: false,
                prevTime: null,
                prevTick: null,
                now: 1000,
                positionTicks: 1000,
            });
            expect(obs?.rate).toBe(1.5);
            expect(obs?.source).toBe("jellyfin");
        });

        it("estimates 1.5x speed based on position and wall delta", () => {
            const prevTime = 100_000;
            const now = 110_000; // 10s wall delta
            const prevTick = 0;
            const positionTicks = 150_000_000; // 15s position delta

            const obs = estimatePlaybackRate({
                explicitRate: null,
                isPaused: false,
                appearsSeek: false,
                prevTime,
                prevTick,
                now,
                positionTicks,
            });
            expect(obs?.bucket).toBe(1.5);
            expect(obs?.source).toBe("estimated");
        });
    });
});
