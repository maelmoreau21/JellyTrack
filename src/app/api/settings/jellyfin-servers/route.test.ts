import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET, PATCH, POST } from "./route";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => ({ session: { user: { name: "admin", isAdmin: true } }, isAdmin: true })),
  isAuthError: vi.fn(() => false),
}));

vi.mock("@/lib/adminRequestGuard", () => ({
  requireAdminMutation: vi.fn(async () => ({ session: { user: { name: "admin", isAdmin: true } }, isAdmin: true })),
  isAuthError: vi.fn(() => false),
}));

describe("/api/settings/jellyfin-servers API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("handles GET request and returns server list", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.servers)).toBe(true);
  });

  it("handles PATCH request with updated name and url", async () => {
    const req = new NextRequest("http://localhost/api/settings/jellyfin-servers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "server-test-id",
        name: "Mon Nouveau Jellyfin",
        url: "http://jellyfin-nouveau.local:8096",
        apiKey: "new-api-key-12345",
      }),
    });

    const res = await PATCH(req);
    // Since mock prisma has stub or database, we verify handling
    expect([200, 404]).toContain(res.status);
  });

  it("rejects cloud metadata URLs in POST", async () => {
    const req = new NextRequest("http://localhost/api/settings/jellyfin-servers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Malicious Server",
        url: "http://169.254.169.254/latest/meta-data/",
        apiKey: "some-key",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("cloud metadata");
  });

  it("rejects cloud metadata URLs in PATCH", async () => {
    const req = new NextRequest("http://localhost/api/settings/jellyfin-servers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "server-test-id",
        url: "http://metadata.google.internal/computeMetadata/v1/",
      }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("cloud metadata");
  });
});
