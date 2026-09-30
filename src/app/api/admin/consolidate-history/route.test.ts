import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  isAuthError: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/adminRequestGuard", () => ({
  requireAdminMutation: vi.fn().mockResolvedValue({
    session: { user: { isAdmin: true, name: "admin" } },
    isAdmin: true,
    username: "admin",
  }),
}));

vi.mock("@/lib/sessionConsolidation", () => ({
  consolidatePlaybackHistory: vi.fn().mockResolvedValue({
    clustersMerged: 3,
    sessionsPruned: 5,
    details: [],
  }),
}));

vi.mock("@/lib/adminAudit", () => ({
  writeAdminAuditLog: vi.fn().mockResolvedValue(undefined),
}));

describe("POST /api/admin/consolidate-history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls consolidatePlaybackHistory and returns success message", async () => {
    const req = new NextRequest("http://localhost/api/admin/consolidate-history", {
      method: "POST",
      body: JSON.stringify({ mergeWindowMinutes: 45 }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.result.clustersMerged).toBe(3);
    expect(body.result.sessionsPruned).toBe(5);
  });
});
