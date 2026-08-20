import { describe, it, expect, vi, beforeEach } from "vitest";
import { getBingeWatchingStats } from "./bingeTracker";

const mocks = vi.hoisted(() => ({
    prisma: {
        playbackHistory: {
            findMany: vi.fn(),
        },
        media: {
            findMany: vi.fn(),
        },
    },
}));

vi.mock("@/lib/prisma", () => ({
    default: mocks.prisma,
}));

describe("bingeTracker", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns empty result when no playbacks exist", async () => {
        mocks.prisma.playbackHistory.findMany.mockResolvedValue([]);

        const result = await getBingeWatchingStats(30);

        expect(result.mostBingedSeries).toBeNull();
        expect(result.allBingedSeries).toHaveLength(0);
        expect(result.totalBingeSessionsMonth).toBe(0);
    });

    it("detects a binge run of >= 3 episodes watched with short gaps", async () => {
        const baseTime = new Date("2026-08-01T14:00:00Z").getTime();

        mocks.prisma.playbackHistory.findMany.mockResolvedValue([
            {
                id: "p1",
                userId: "user-1",
                startedAt: new Date(baseTime),
                durationWatched: 2400, // 40m
                user: { username: "Alice" },
                media: { id: "ep-1", title: "Ep 1", parentId: "season-1" },
            },
            {
                id: "p2",
                userId: "user-1",
                startedAt: new Date(baseTime + 2500 * 1000), // + 41m40s (1m40s gap)
                durationWatched: 2400,
                user: { username: "Alice" },
                media: { id: "ep-2", title: "Ep 2", parentId: "season-1" },
            },
            {
                id: "p3",
                userId: "user-1",
                startedAt: new Date(baseTime + 5000 * 1000),
                durationWatched: 2400,
                user: { username: "Alice" },
                media: { id: "ep-3", title: "Ep 3", parentId: "season-1" },
            },
        ]);

        mocks.prisma.media.findMany
            .mockResolvedValueOnce([
                { id: "season-1", title: "Saison 1", type: "Season", parentId: "series-1" },
            ])
            .mockResolvedValueOnce([
                { id: "series-1", title: "Breaking Bad" },
            ]);

        const result = await getBingeWatchingStats(30);

        expect(result.totalBingeSessionsMonth).toBe(1);
        expect(result.mostBingedSeries).not.toBeNull();
        expect(result.mostBingedSeries?.seriesTitle).toBe("Breaking Bad");
        expect(result.mostBingedSeries?.totalBingeSessions).toBe(1);
        expect(result.mostBingedSeries?.avgEpisodesPerSession).toBe(3);
        expect(result.mostBingedSeries?.maxEpisodesInSingleRun).toBe(3);
        expect(result.mostBingedSeries?.topBingerUsername).toBe("Alice");
    });

    it("does not count runs of fewer than 3 episodes as binge", async () => {
        const baseTime = new Date("2026-08-01T14:00:00Z").getTime();

        mocks.prisma.playbackHistory.findMany.mockResolvedValue([
            {
                id: "p1",
                userId: "user-1",
                startedAt: new Date(baseTime),
                durationWatched: 2400,
                user: { username: "Bob" },
                media: { id: "ep-1", title: "Ep 1", parentId: "series-2" },
            },
            {
                id: "p2",
                userId: "user-1",
                startedAt: new Date(baseTime + 2500 * 1000),
                durationWatched: 2400,
                user: { username: "Bob" },
                media: { id: "ep-2", title: "Ep 2", parentId: "series-2" },
            },
        ]);

        mocks.prisma.media.findMany
            .mockResolvedValueOnce([
                { id: "series-2", title: "Stranger Things", type: "Series", parentId: null },
            ])
            .mockResolvedValueOnce([]);

        const result = await getBingeWatchingStats(30);

        expect(result.totalBingeSessionsMonth).toBe(0);
        expect(result.mostBingedSeries).toBeNull();
    });
});
