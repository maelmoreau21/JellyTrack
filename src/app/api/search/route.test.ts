import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/authOptions", () => ({
  authOptions: {},
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    globalSettings: {
      findUnique: vi.fn(),
    },
    media: {
      findMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  },
}));

describe("Search API (/api/search)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 Unauthorized when session is absent", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);

    const req = new NextRequest("http://localhost:3000/api/search?q=Matrix");
    const res = await GET(req);

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("returns empty arrays when query parameter is missing or too short", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce({
      user: { name: "User", isAdmin: false },
    } as any);

    const req = new NextRequest("http://localhost:3000/api/search?q=a");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ media: [], users: [] });
  });

  it("filters out excluded libraries when searching media", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce({
      user: { name: "User", isAdmin: false },
    } as any);

    vi.mocked(prisma.globalSettings.findUnique).mockResolvedValueOnce({
      excludedLibraries: ["Private", "Adults"],
    } as any);

    vi.mocked(prisma.media.findMany).mockResolvedValueOnce([]);

    const req = new NextRequest("http://localhost:3000/api/search?q=Batman");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(prisma.media.findMany).toHaveBeenCalledTimes(1);

    const callArgs = vi.mocked(prisma.media.findMany).mock.calls[0][0];
    expect(callArgs?.where?.AND).toBeDefined();

    // Check that excluded libraries clause was appended to AND
    const andConditions = callArgs?.where?.AND as any[];
    const hasExcludedClause = andConditions.some((cond) => cond.NOT?.OR);
    expect(hasExcludedClause).toBe(true);
  });

  it("allows searching users only when user is admin", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce({
      user: { name: "RegularUser", isAdmin: false },
    } as any);

    vi.mocked(prisma.globalSettings.findUnique).mockResolvedValueOnce(null as any);
    vi.mocked(prisma.media.findMany).mockResolvedValueOnce([]);

    const reqUser = new NextRequest("http://localhost:3000/api/search?q=John");
    await GET(reqUser);
    expect(prisma.user.findMany).not.toHaveBeenCalled();

    // Now test with admin session
    vi.mocked(getServerSession).mockResolvedValueOnce({
      user: { name: "AdminUser", isAdmin: true },
    } as any);

    vi.mocked(prisma.globalSettings.findUnique).mockResolvedValueOnce(null as any);
    vi.mocked(prisma.media.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
      { jellyfinUserId: "user-1", username: "John" },
    ] as any);

    const reqAdmin = new NextRequest("http://localhost:3000/api/search?q=John");
    const resAdmin = await GET(reqAdmin);
    const dataAdmin = await resAdmin.json();

    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(dataAdmin.users).toHaveLength(1);
    expect(dataAdmin.users[0].username).toBe("John");
  });
});
