import { describe, expect, it } from "vitest";
import { getCumulativeCompletionEntries } from "./mediaPolicy";

describe("cumulative completion metrics", () => {
  it("treats a movie finished across several days as completed", () => {
    const media = { id: "movie-1", type: "Movie", durationMs: BigInt(100 * 60 * 1000) };
    const entries = getCumulativeCompletionEntries([
      { userId: "user-1", mediaId: "movie-1", durationWatched: 30 * 60, media },
      { userId: "user-1", mediaId: "movie-1", durationWatched: 55 * 60, media },
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0].completion.bucket).toBe("completed");
    expect(entries[0].completion.percent).toBe(85);
  });

  it("uses all reference history when scoped history is only the first attempt", () => {
    const media = { id: "movie-1", type: "Movie", durationMs: BigInt(100 * 60 * 1000) };
    const scoped = [
      { userId: "user-1", mediaId: "movie-1", durationWatched: 20 * 60, media },
    ];
    const reference = [
      ...scoped,
      { userId: "user-1", mediaId: "movie-1", durationWatched: 70 * 60, media },
    ];

    const entries = getCumulativeCompletionEntries(scoped, reference);

    expect(entries).toHaveLength(1);
    expect(entries[0].completion.bucket).toBe("completed");
    expect(entries[0].durationWatched).toBe(90 * 60);
  });
});
