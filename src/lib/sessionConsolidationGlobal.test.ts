import { describe, it, expect, vi, beforeEach } from "vitest";
import { consolidatePlaybackHistory } from "./sessionConsolidation";

const mocks = vi.hoisted(() => {
  const prisma = {
    playbackHistory: {
      groupBy: vi.fn(),
    },
  };
  const consolidateRecentPlaybackSessions = vi.fn();
  return { prisma, consolidateRecentPlaybackSessions };
});

vi.mock("@/lib/prisma", () => ({ default: mocks.prisma }));
vi.mock("@/lib/pluginEventHelpers", () => ({
  consolidateRecentPlaybackSessions: mocks.consolidateRecentPlaybackSessions,
}));

describe("consolidatePlaybackHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles empty groups gracefully", async () => {
    mocks.prisma.playbackHistory.groupBy.mockResolvedValue([]);

    const result = await consolidatePlaybackHistory({ mergeWindowMinutes: 30 });
    expect(result).toEqual({ clustersMerged: 0, sessionsPruned: 0 });
    expect(mocks.consolidateRecentPlaybackSessions).not.toHaveBeenCalled();
  });

  it("consolidates candidate groups and aggregates merged count", async () => {
    mocks.prisma.playbackHistory.groupBy.mockResolvedValue([
      { serverId: "srv-1", userId: "usr-1", mediaId: "med-1", _count: { id: 3 } },
      { serverId: "srv-1", userId: "usr-2", mediaId: "med-2", _count: { id: 2 } },
    ]);

    mocks.consolidateRecentPlaybackSessions
      .mockResolvedValueOnce({ consolidated: true, primaryId: "p1", mergedCount: 2 })
      .mockResolvedValueOnce({ consolidated: false, primaryId: "p2", mergedCount: 0 });

    const result = await consolidatePlaybackHistory({ mergeWindowMinutes: 60 });

    expect(mocks.consolidateRecentPlaybackSessions).toHaveBeenCalledTimes(2);
    expect(mocks.consolidateRecentPlaybackSessions).toHaveBeenNthCalledWith(
      1,
      "srv-1",
      "usr-1",
      "med-1",
      { mergeWindowMs: 3600000, since: null }
    );
    expect(result).toEqual({ clustersMerged: 1, sessionsPruned: 2 });
  });

  it("filters by serverId and userId when provided", async () => {
    mocks.prisma.playbackHistory.groupBy.mockResolvedValue([
      { serverId: "srv-1", userId: "usr-1", mediaId: "med-1", _count: { id: 2 } },
      { serverId: "srv-1", userId: "usr-99", mediaId: "med-2", _count: { id: 2 } },
    ]);

    mocks.consolidateRecentPlaybackSessions.mockResolvedValue({
      consolidated: true,
      primaryId: "p1",
      mergedCount: 1,
    });

    const result = await consolidatePlaybackHistory({
      serverId: "srv-1",
      userId: "usr-1",
    });

    expect(mocks.prisma.playbackHistory.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          serverId: "srv-1",
          userId: { not: null },
        }),
      })
    );

    // usr-99 is skipped because userId was specified as usr-1
    expect(mocks.consolidateRecentPlaybackSessions).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ clustersMerged: 1, sessionsPruned: 1 });
  });
});
