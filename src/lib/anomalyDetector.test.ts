import { describe, it, expect, vi, beforeEach } from "vitest";
import { detectPlaybackAnomalies, getActiveSecurityAnomalies } from "./anomalyDetector";

const mocks = vi.hoisted(() => ({
    prisma: {
        playbackHistory: {
            findMany: vi.fn(),
        },
        media: {
            findUnique: vi.fn(),
        },
    },
}));

vi.mock("@/lib/prisma", () => ({
    default: mocks.prisma,
}));

describe("anomalyDetector", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("detects account sharing / double location when same user connects from different IPs within 30m", async () => {
        mocks.prisma.playbackHistory.findMany.mockResolvedValue([
            {
                id: "p-other",
                ipAddress: "198.51.100.5",
                country: "FR",
                startedAt: new Date(),
                user: { username: "Alice" },
            },
        ]);

        const alerts = await detectPlaybackAnomalies({
            userId: "user-1",
            ipAddress: "203.0.113.10",
            country: "US",
            durationWatched: 120,
        });

        expect(alerts).toHaveLength(1);
        expect(alerts[0].type).toBe("account_sharing");
        expect(alerts[0].severity).toBe("warning");
        expect(alerts[0].description).toContain("Alice");
    });

    it("detects corrupted media when stopped within <= 15s by >= 3 distinct users", async () => {
        mocks.prisma.playbackHistory.findMany
            .mockResolvedValueOnce([]) // no IP sharing
            .mockResolvedValueOnce([
                { userId: "user-1" },
                { userId: "user-2" },
                { userId: "user-3" },
            ]);

        mocks.prisma.media.findUnique.mockResolvedValue({
            title: "Corrupted_Movie.mkv",
            type: "Movie",
        });

        const alerts = await detectPlaybackAnomalies({
            userId: "user-3",
            mediaId: "media-bad-1",
            ipAddress: "127.0.0.1",
            durationWatched: 5,
        });

        expect(alerts).toHaveLength(1);
        expect(alerts[0].type).toBe("corrupted_media");
        expect(alerts[0].severity).toBe("critical");
        expect(alerts[0].title).toContain("fichier corrompu");
        expect(alerts[0].description).toContain("Corrupted_Movie.mkv");
    });

    it("retrieves active security anomalies for health dashboard", async () => {
        mocks.prisma.playbackHistory.findMany
            .mockResolvedValueOnce([
                {
                    userId: "user-1",
                    ipAddress: "1.1.1.1",
                    country: "FR",
                    startedAt: new Date(),
                    user: { username: "Charlie" },
                },
                {
                    userId: "user-1",
                    ipAddress: "2.2.2.2",
                    country: "DE",
                    startedAt: new Date(),
                    user: { username: "Charlie" },
                },
            ])
            .mockResolvedValueOnce([]); // no corrupted media

        const anomalies = await getActiveSecurityAnomalies();

        expect(anomalies).toHaveLength(1);
        expect(anomalies[0].type).toBe("account_sharing");
        expect(anomalies[0].title).toContain("Charlie");
    });
});
