import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn().mockResolvedValue({
    session: { user: { isAdmin: true } },
    isAdmin: true,
  }),
  isAuthError: vi.fn().mockReturnValue(false),
}));

describe("GET /api/settings/sso", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

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
