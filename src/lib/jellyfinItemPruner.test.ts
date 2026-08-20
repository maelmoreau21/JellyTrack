import { describe, it, expect } from "vitest";
import { pruneJellyfinItem } from "./jellyfinItemPruner";

describe("jellyfinItemPruner", () => {
    it("handles minimal item correctly", () => {
        const item = pruneJellyfinItem({ Id: "item-1", Name: "Interstellar", Type: "Movie" });
        expect(item.Id).toBe("item-1");
        expect(item.Name).toBe("Interstellar");
        expect(item.Type).toBe("Movie");
        expect(item.Genres).toEqual([]);
        expect(item.Directors).toEqual([]);
        expect(item.Actors).toEqual([]);
        expect(item.MediaSourceSize).toBeNull();
    });

    it("parses genres, people, media stream dimensions and run time correctly", () => {
        const raw = {
            Id: "item-2",
            Name: "Dune",
            Type: "Movie",
            Genres: ["Sci-Fi", "Adventure"],
            Studios: [{ Name: "Legendary" }, "Warner Bros."],
            People: [
                { Type: "Director", Name: "Denis Villeneuve" },
                { Type: "Actor", Name: "Timothée Chalamet" },
            ],
            MediaSources: [
                {
                    Size: "15000000000",
                    MediaStreams: [
                        { Type: "Video", Width: 3840, Height: 2160 },
                    ],
                },
            ],
            RunTimeTicks: "1550000000000",
            AlbumArtist: "Hans Zimmer",
            DateCreated: "2026-01-15T10:00:00Z",
        };

        const item = pruneJellyfinItem(raw);
        expect(item.Id).toBe("item-2");
        expect(item.Genres).toEqual(["Sci-Fi", "Adventure"]);
        expect(item.Studios).toEqual(["Legendary", "Warner Bros."]);
        expect(item.Directors).toEqual(["Denis Villeneuve"]);
        expect(item.Actors).toEqual(["Timothée Chalamet"]);
        expect(item.MediaSourceSize).toBe(BigInt("15000000000"));
        expect(item.VideoStreamWidth).toBe(3840);
        expect(item.VideoStreamHeight).toBe(2160);
        expect(item.RunTimeTicks).toBe(BigInt(155000000));
        expect(item.AlbumArtist).toBe("Hans Zimmer");
        expect(item.DateCreated.toISOString()).toBe("2026-01-15T10:00:00.000Z");
    });
});
