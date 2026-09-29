import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    computeMergeWindowMs,
    clusterSessions,
    consolidateRecentPlaybackSessions,
    DEFAULT_VIDEO_MERGE_WINDOW_MS,
    DEFAULT_AUDIO_MERGE_WINDOW_MS,
} from "./pluginEventHelpers";

const mocks = vi.hoisted(() => {
    const prisma = {
        playbackHistory: {
            findMany: vi.fn(),
            update: vi.fn(),
            deleteMany: vi.fn(),
        },
        telemetryEvent: {
            updateMany: vi.fn(),
        },
        activeStream: {
            updateMany: vi.fn(),
        },
        $transaction: vi.fn((fn: (tx: any) => Promise<any>) => fn(prisma)),
    };

    const valkey = {
        setex: vi.fn(),
        del: vi.fn(),
        get: vi.fn(),
    };

    return { prisma, valkey };
});

vi.mock("@/lib/prisma", () => ({ default: mocks.prisma }));
vi.mock("@/lib/valkey", () => ({ default: mocks.valkey }));

describe("Session Consolidation & Window Computation", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("computeMergeWindowMs", () => {
        it("returns default video merge window (1h) for video media types", () => {
            expect(computeMergeWindowMs("Movie", null)).toBe(DEFAULT_VIDEO_MERGE_WINDOW_MS);
            expect(computeMergeWindowMs("Episode", undefined)).toBe(DEFAULT_VIDEO_MERGE_WINDOW_MS);
            expect(computeMergeWindowMs(null, null)).toBe(DEFAULT_VIDEO_MERGE_WINDOW_MS);
        });

        it("returns default audio merge window (5m) for audio media types", () => {
            expect(computeMergeWindowMs("Audio", null)).toBe(DEFAULT_AUDIO_MERGE_WINDOW_MS);
            expect(computeMergeWindowMs("Track", null)).toBe(DEFAULT_AUDIO_MERGE_WINDOW_MS);
            expect(computeMergeWindowMs("MusicAlbum", null)).toBe(DEFAULT_AUDIO_MERGE_WINDOW_MS);
        });

        it("respects configured merge window when greater than video default for video", () => {
            // 7200s (2 hours) > 1h
            expect(computeMergeWindowMs("Movie", 7200)).toBe(7200 * 1000);
            // 1800s (30m) < 1h default -> stays at 1h minimum for video
            expect(computeMergeWindowMs("Movie", 1800)).toBe(DEFAULT_VIDEO_MERGE_WINDOW_MS);
        });

        it("respects configured merge window for audio capped at audio default", () => {
            // 120s (2m) < 5m -> returns 2m
            expect(computeMergeWindowMs("Audio", 120)).toBe(120 * 1000);
            // 600s (10m) > 5m default -> capped at 5m for audio
            expect(computeMergeWindowMs("Audio", 600)).toBe(DEFAULT_AUDIO_MERGE_WINDOW_MS);
        });
    });

    describe("clusterSessions", () => {
        it("returns single cluster for single session or empty array", () => {
            expect(clusterSessions([], 3600_000)).toEqual([]);
            const s1 = { startedAt: new Date(1000), endedAt: new Date(2000), durationWatched: 1 };
            expect(clusterSessions([s1], 3600_000)).toEqual([[s1]]);
        });

        it("groups sessions into single cluster when gap is within window", () => {
            const s1 = {
                id: "1",
                startedAt: new Date("2026-09-29T10:00:00Z"),
                endedAt: new Date("2026-09-29T10:30:00Z"),
                durationWatched: 1800,
            };
            // 5 minutes pause
            const s2 = {
                id: "2",
                startedAt: new Date("2026-09-29T10:35:00Z"),
                endedAt: new Date("2026-09-29T11:00:00Z"),
                durationWatched: 1500,
            };

            const clusters = clusterSessions([s1, s2], 3600_000); // 1h window
            expect(clusters.length).toBe(1);
            expect(clusters[0]).toEqual([s1, s2]);
        });

        it("separates sessions into distinct clusters when gap exceeds window", () => {
            const s1 = {
                id: "1",
                startedAt: new Date("2026-09-29T10:00:00Z"),
                endedAt: new Date("2026-09-29T10:30:00Z"),
                durationWatched: 1800,
            };
            // 3 hours later
            const s2 = {
                id: "2",
                startedAt: new Date("2026-09-29T13:30:00Z"),
                endedAt: new Date("2026-09-29T14:00:00Z"),
                durationWatched: 1800,
            };

            const clusters = clusterSessions([s1, s2], 3600_000); // 1h window
            expect(clusters.length).toBe(2);
            expect(clusters[0]).toEqual([s1]);
            expect(clusters[1]).toEqual([s2]);
        });

        it("correctly handles unclosed sessions with endedAt = null", () => {
            const s1 = {
                id: "1",
                startedAt: new Date("2026-09-29T10:00:00Z"),
                endedAt: null, // cut or crash
                durationWatched: 600, // played for 10 minutes
            };
            // reconnect 1 minute after last known played position
            const s2 = {
                id: "2",
                startedAt: new Date("2026-09-29T10:11:00Z"),
                endedAt: new Date("2026-09-29T10:40:00Z"),
                durationWatched: 1740,
            };

            const clusters = clusterSessions([s1, s2], 3600_000);
            expect(clusters.length).toBe(1);
            expect(clusters[0]).toEqual([s1, s2]);
        });
    });

    describe("consolidateRecentPlaybackSessions", () => {
        it("consolidates duplicate sessions and updates leader with summed stats", async () => {
            const s1 = {
                id: "session-1",
                serverId: "server-1",
                userId: "user-1",
                mediaId: "media-1",
                startedAt: new Date("2026-09-29T10:00:00Z"),
                endedAt: new Date("2026-09-29T10:30:00Z"),
                durationWatched: 1800,
                pauseCount: 1,
                seekCount: 2,
                rewatchCount: 0,
                speedChangeCount: 0,
                audioChanges: 0,
                subtitleChanges: 0,
                media: { durationMs: BigInt(7_200_000) }, // 2h movie
            };
            const s2 = {
                id: "session-2",
                serverId: "server-1",
                userId: "user-1",
                mediaId: "media-1",
                startedAt: new Date("2026-09-29T10:32:00Z"), // 2 min pause
                endedAt: new Date("2026-09-29T11:00:00Z"),
                durationWatched: 1680,
                pauseCount: 0,
                seekCount: 1,
                rewatchCount: 1,
                speedChangeCount: 0,
                audioChanges: 1,
                subtitleChanges: 0,
                media: { durationMs: BigInt(7_200_000) },
            };

            mocks.prisma.playbackHistory.findMany.mockResolvedValue([s1, s2]);

            const result = await consolidateRecentPlaybackSessions("server-1", "user-1", "media-1", 3600_000);

            expect(result.consolidated).toBe(true);
            expect(result.primaryId).toBe("session-1");
            expect(result.mergedCount).toBe(1);

            // Telemetry events pointing to session-2 must be updated to session-1
            expect(mocks.prisma.telemetryEvent.updateMany).toHaveBeenCalledWith({
                where: { playbackId: { in: ["session-2"] } },
                data: { playbackId: "session-1" },
            });

            // Duplicate session-2 must be deleted
            expect(mocks.prisma.playbackHistory.deleteMany).toHaveBeenCalledWith({
                where: { id: { in: ["session-2"] } },
            });

            // Primary session-1 must be updated with combined duration (1800 + 1680 = 3480) and pauseCount (1 + 0 + 1 = 2)
            expect(mocks.prisma.playbackHistory.update).toHaveBeenCalledWith({
                where: { id: "session-1" },
                data: expect.objectContaining({
                    durationWatched: 3480,
                    pauseCount: 2,
                    seekCount: 3,
                    rewatchCount: 1,
                    audioChanges: 1,
                }),
            });

            // Valkey duration key updated for primary, deleted for duplicate
            expect(mocks.valkey.setex).toHaveBeenCalledWith("dur:session-1", 86400, "3480");
            expect(mocks.valkey.del).toHaveBeenCalledWith(
                "dur:session-2",
                "last_time:session-2",
                "last_tick:session-2",
                "start_pos:session-2",
                "pause:session-2",
                "audio:session-2",
                "sub:session-2",
                "rate:session-2",
                "jump:session-2"
            );
        });

        it("leaves sessions untouched if there is only 1 session", async () => {
            mocks.prisma.playbackHistory.findMany.mockResolvedValue([
                {
                    id: "single-1",
                    startedAt: new Date(),
                    endedAt: new Date(),
                    durationWatched: 500,
                    media: null,
                },
            ]);

            const result = await consolidateRecentPlaybackSessions("server-1", "user-1", "media-1", 3600_000);
            expect(result.consolidated).toBe(false);
            expect(result.mergedCount).toBe(0);
            expect(mocks.prisma.playbackHistory.deleteMany).not.toHaveBeenCalled();
        });
    });
});
