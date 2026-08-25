import { describe, it, expect, vi, beforeEach } from "vitest";
import { getUserActiveStream } from "./liveStreams";
import prisma from "@/lib/prisma";
import valkey from "@/lib/valkey";

vi.mock("@/lib/prisma", () => ({
  default: {
    activeStream: {
      findFirst: vi.fn(),
    },
    media: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/valkey", () => ({
  default: {
    get: vi.fn(),
  },
}));

describe("getUserActiveStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when userDbIds is empty", async () => {
    const result = await getUserActiveStream([]);
    expect(result).toBeNull();
  });

  it("calculates progress from valkey progressPercent when present", async () => {
    vi.mocked(prisma.activeStream.findFirst).mockResolvedValue({
      serverId: "srv-1",
      sessionId: "sess-1",
      userId: "u-1",
      mediaId: "m-1",
      clientName: "Web",
      deviceName: "Chrome",
      playMethod: "DirectPlay",
      positionTicks: BigInt(5000000),
      media: {
        jellyfinMediaId: "item-1",
        title: "Interstellar",
        type: "Movie",
        parentId: null,
        artist: null,
        durationMs: BigInt(10000000),
      },
    } as any);

    vi.mocked(valkey.get).mockResolvedValue(
      JSON.stringify({
        progressPercent: 42,
        isPaused: false,
      })
    );

    const result = await getUserActiveStream(["u-1"]);
    expect(result).not.toBeNull();
    expect(result?.mediaTitle).toBe("Interstellar");
    expect(result?.progressPercent).toBe(42);
    expect(result?.isPaused).toBe(false);
  });

  it("calculates progress from database ticks when valkey is empty or missing progressPercent", async () => {
    vi.mocked(prisma.activeStream.findFirst).mockResolvedValue({
      serverId: "srv-1",
      sessionId: "sess-1",
      userId: "u-1",
      mediaId: "m-1",
      clientName: "Web",
      deviceName: "Firefox",
      playMethod: "DirectPlay",
      // 50% through 100,000 ms movie (durationMs * 10,000 = 1,000,000,000 ticks)
      positionTicks: BigInt(500000000),
      media: {
        jellyfinMediaId: "item-1",
        title: "Inception",
        type: "Movie",
        parentId: null,
        artist: null,
        durationMs: BigInt(100000), // 100,000 ms
      },
    } as any);

    vi.mocked(valkey.get).mockResolvedValue(null);

    const result = await getUserActiveStream(["u-1"]);
    expect(result).not.toBeNull();
    expect(result?.mediaTitle).toBe("Inception");
    expect(result?.progressPercent).toBe(50);
  });

  it("identifies paused streams accurately", async () => {
    vi.mocked(prisma.activeStream.findFirst).mockResolvedValue({
      serverId: "srv-1",
      sessionId: "sess-1",
      userId: "u-1",
      mediaId: "m-1",
      clientName: "Android TV",
      deviceName: "Shield",
      playMethod: "Transcode",
      positionTicks: BigInt(250000000),
      media: {
        jellyfinMediaId: "item-1",
        title: "Dark",
        type: "Episode",
        parentId: "season-1",
        artist: null,
        durationMs: BigInt(100000),
      },
    } as any);

    vi.mocked(valkey.get).mockResolvedValue(
      JSON.stringify({
        isPaused: true,
        progressPercent: 25,
      })
    );

    const result = await getUserActiveStream(["u-1"]);
    expect(result).not.toBeNull();
    expect(result?.isPaused).toBe(true);
    expect(result?.progressPercent).toBe(25);
  });
});
