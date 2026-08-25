import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { getUserActiveStream } from "@/lib/liveStreams";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    user: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  resolveLinkedAccounts: vi.fn().mockImplementation(async ({ jellyfinUserId }) => ({
    canonicalJellyfinUserId: jellyfinUserId,
    linkedJellyfinUserIds: [jellyfinUserId],
    accounts: [],
  })),
}));

vi.mock("@/lib/liveStreams", () => ({
  getUserActiveStream: vi.fn(),
}));

describe("GET /api/users/[id]/active-stream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const req = new Request("http://localhost/api/users/jf-1/active-stream");
    const res = await GET(req, { params: Promise.resolve({ id: "jf-1" }) });

    expect(res.status).toBe(401);
  });

  it("returns 403 when non-admin user tries to access another user's stream", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { isAdmin: false, jellyfinUserId: "jf-other" },
    } as any);

    const req = new Request("http://localhost/api/users/jf-1/active-stream");
    const res = await GET(req, { params: Promise.resolve({ id: "jf-1" }) });

    expect(res.status).toBe(403);
  });

  it("returns activeStream for the authenticated user", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { isAdmin: false, jellyfinUserId: "jf-1" },
    } as any);

    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: "u-1",
      jellyfinUserId: "jf-1",
      username: "Alice",
    } as any);

    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: "u-1" }] as any);

    vi.mocked(getUserActiveStream).mockResolvedValue({
      serverId: "srv-1",
      sessionId: "sess-1",
      itemId: "media-1",
      mediaTitle: "Inception",
      mediaSubtitle: null,
      playMethod: "DirectPlay",
      clientName: "Web",
      deviceName: "Chrome",
      progressPercent: 65,
      isPaused: false,
    });

    const req = new Request("http://localhost/api/users/jf-1/active-stream");
    const res = await GET(req, { params: Promise.resolve({ id: "jf-1" }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.activeStream).not.toBeNull();
    expect(body.activeStream.progressPercent).toBe(65);
    expect(body.activeStream.mediaTitle).toBe("Inception");
  });
});
