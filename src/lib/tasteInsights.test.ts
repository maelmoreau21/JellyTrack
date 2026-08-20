import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTasteInsights } from "./tasteInsights";

const mocks = vi.hoisted(() => ({
    prisma: {
        playbackHistory: {
            findMany: vi.fn(),
        },
    },
}));

vi.mock("@/lib/prisma", () => ({
    default: mocks.prisma,
}));

describe("tasteInsights", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns default suggestions when no playback data exists", async () => {
        mocks.prisma.playbackHistory.findMany.mockResolvedValue([]);

        const result = await getTasteInsights(30);

        expect(result.topGenres).toHaveLength(0);
        expect(result.topArtists).toHaveLength(0);
        expect(result.acquisitionSuggestions.length).toBeGreaterThan(0);
        expect(result.acquisitionSuggestions[0].category).toBe("Général");
    });

    it("aggregates genres and artists correctly and produces tailored acquisition suggestions", async () => {
        mocks.prisma.playbackHistory.findMany.mockResolvedValue([
            {
                id: "p1",
                durationWatched: 7200, // 2h
                media: {
                    id: "m1",
                    title: "Oppenheimer",
                    type: "Movie",
                    artist: "Christopher Nolan",
                    genres: ["Science-Fiction", "Drame", "Histoire"],
                    libraryName: "Films",
                },
            },
            {
                id: "p2",
                durationWatched: 3600, // 1h
                media: {
                    id: "m2",
                    title: "Interstellar",
                    type: "Movie",
                    artist: "Christopher Nolan",
                    genres: ["Science-Fiction"],
                    libraryName: "Films",
                },
            },
        ]);

        const result = await getTasteInsights(30);

        expect(result.totalAnalyzedHours).toBe(3);
        expect(result.topGenres[0].name).toBe("Science-Fiction");
        expect(result.topGenres[0].totalHours).toBe(3);
        expect(result.topArtists[0].name).toBe("Christopher Nolan");
        expect(result.topArtists[0].hours).toBe(3);

        expect(result.acquisitionSuggestions.length).toBeGreaterThanOrEqual(2);
        const genreSuggestion = result.acquisitionSuggestions.find(s => s.category === "Genre Dominant");
        expect(genreSuggestion?.title).toContain("Science-Fiction");
        const artistSuggestion = result.acquisitionSuggestions.find(s => s.category.includes("Artiste"));
        expect(artistSuggestion?.title).toContain("Christopher Nolan");
    });
});
