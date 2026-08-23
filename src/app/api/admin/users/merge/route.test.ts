import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn().mockResolvedValue({
    session: { user: { isAdmin: true, name: "admin" } },
    isAdmin: true,
  }),
  isAuthError: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/adminRequestGuard", () => ({
  requireAdminMutation: vi.fn().mockResolvedValue({
    session: { user: { isAdmin: true, name: "admin" } },
    isAdmin: true,
    username: "admin",
    jellyfinUserId: "admin-id",
  }),
}));

vi.mock("@/lib/userManagement", () => ({
  mergeUsers: vi.fn().mockResolvedValue({
    success: true,
    sourceUsername: "mmoreau",
    targetUsername: "Maël Moreau",
    sessionsMoved: 10,
    streamsMoved: 0,
    dailyStatsUpdated: 2,
    message: 'User "mmoreau" successfully merged into "Maël Moreau".',
  }),
}));

describe("Admin User Merge API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("successfully calls mergeUsers and returns result", async () => {
    const req = new NextRequest("http://localhost/api/admin/users/merge", {
      method: "POST",
      body: JSON.stringify({
        sourceUserId: "source-id",
        targetUserId: "target-id",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.result.sourceUsername).toBe("mmoreau");
    expect(body.result.targetUsername).toBe("Maël Moreau");
  });

  it("returns 400 when missing sourceUserId or targetUserId", async () => {
    const req = new NextRequest("http://localhost/api/admin/users/merge", {
      method: "POST",
      body: JSON.stringify({
        sourceUserId: "source-id",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("required");
  });
});
