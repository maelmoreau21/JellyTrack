import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, PUT } from "./route";
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
  }),
}));

vi.mock("@/lib/adminAudit", () => ({
  writeAdminAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    globalSettings: {
      findUnique: vi.fn().mockResolvedValue({
        ssoSettings: {
          enabled: true,
          url: "https://db-sso.example.com",
          clientId: "db-client",
          clientSecret: "db-secret",
          userGroup: "db-user-group",
          adminGroup: "db-admin-group",
        },
      }),
      upsert: vi.fn().mockResolvedValue({}),
    },
  },
}));

describe("SSO Settings API", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  describe("GET /api/settings/sso", () => {
    it("returns SSO status and configuration", async () => {
      vi.stubEnv("OIDC_ENABLED", "true");
      vi.stubEnv("OIDC_URL", "https://authentik.dfmag.fr/application/o/jellytrack/");
      vi.stubEnv("OIDC_CLIENT_ID", "jellytrack");
      vi.stubEnv("OIDC_CLIENT_SECRET", "supersecret123");
      vi.stubEnv("OIDC_USER_GROUP", "jellyfin-users");
      vi.stubEnv("OIDC_ADMIN_GROUP", "jellyfin-admins");
      vi.stubEnv("JELLYTRACK_LOCAL_ADMIN_USER", "admin");
      vi.stubEnv("JELLYTRACK_LOCAL_ADMIN_PASSWORD", "emergencypass");

      const res = await GET();
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.enabled).toBe(true);
      expect(json.url).toBe("https://authentik.dfmag.fr/application/o/jellytrack");
      expect(json.clientId).toBe("jellytrack");
      expect(json.hasClientSecret).toBe(true);
      expect(json.clientSecretMasked).toContain("••••••••");
      expect(json.userGroup).toBe("jellyfin-users");
      expect(json.adminGroup).toBe("jellyfin-admins");
      expect(json.localAdminConfigured).toBe(true);
      expect(json.localAdminUser).toBe("admin");
      expect(json.callbackPath).toBe("/api/auth/callback/oidc");
    });
  });

  describe("PUT /api/settings/sso", () => {
    it("updates SSO database settings", async () => {
      const req = new NextRequest("http://localhost:3000/api/settings/sso", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: true,
          url: "https://my-sso.company.com",
          clientId: "jellytrack-app",
          clientSecret: "super-secret-pw",
          userGroup: "users",
          adminGroup: "admins",
        }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });
});
