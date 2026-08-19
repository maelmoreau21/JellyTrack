import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isOidcEnabled,
  getOidcConfig,
  isLocalAdminConfigured,
  getLocalAdminCredentials,
  extractGroupsFromProfile,
  evaluateOidcGroupPermissions,
  resolveJellyfinUserForOidc,
} from "@/lib/oidcConfig";

describe("oidcConfig", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  describe("isOidcEnabled", () => {
    it("returns true when OIDC_ENABLED is 'true' or '1'", () => {
      vi.stubEnv("OIDC_ENABLED", "true");
      expect(isOidcEnabled()).toBe(true);

      vi.stubEnv("OIDC_ENABLED", "1");
      expect(isOidcEnabled()).toBe(true);

      vi.stubEnv("OIDC_ENABLED", "yes");
      expect(isOidcEnabled()).toBe(true);
    });

    it("returns false when OIDC_ENABLED is false or unset", () => {
      vi.stubEnv("OIDC_ENABLED", "false");
      expect(isOidcEnabled()).toBe(false);

      vi.stubEnv("OIDC_ENABLED", "");
      expect(isOidcEnabled()).toBe(false);
    });
  });

  describe("getOidcConfig", () => {
    it("returns clean OIDC configuration", () => {
      vi.stubEnv("OIDC_ENABLED", "true");
      vi.stubEnv("OIDC_URL", "https://authentik.example.com/application/o/jellytrack///");
      vi.stubEnv("OIDC_CLIENT_ID", "jellytrack-app");
      vi.stubEnv("OIDC_CLIENT_SECRET", "super-secret");
      vi.stubEnv("OIDC_USER_GROUP", "jellyfin-users");
      vi.stubEnv("OIDC_ADMIN_GROUP", "jellyfin-admins");

      const config = getOidcConfig();
      expect(config.enabled).toBe(true);
      expect(config.url).toBe("https://authentik.example.com/application/o/jellytrack");
      expect(config.clientId).toBe("jellytrack-app");
      expect(config.clientSecret).toBe("super-secret");
      expect(config.userGroup).toBe("jellyfin-users");
      expect(config.adminGroup).toBe("jellyfin-admins");
    });
  });

  describe("Local Admin configuration", () => {
    it("detects when local admin password is set", () => {
      vi.stubEnv("JELLYTRACK_LOCAL_ADMIN_USER", "superadmin");
      vi.stubEnv("JELLYTRACK_LOCAL_ADMIN_PASSWORD", "secretpass123");

      expect(isLocalAdminConfigured()).toBe(true);
      const creds = getLocalAdminCredentials();
      expect(creds.username).toBe("superadmin");
      expect(creds.password).toBe("secretpass123");
      expect(creds.isConfigured).toBe(true);
    });

    it("detects when local admin password is empty or unset", () => {
      vi.stubEnv("JELLYTRACK_LOCAL_ADMIN_USER", "admin");
      vi.stubEnv("JELLYTRACK_LOCAL_ADMIN_PASSWORD", "");

      expect(isLocalAdminConfigured()).toBe(false);
      const creds = getLocalAdminCredentials();
      expect(creds.isConfigured).toBe(false);
      expect(creds.password).toBeUndefined();
    });

    it("supports legacy JELLYGATE alias", () => {
      vi.stubEnv("JELLYTRACK_LOCAL_ADMIN_PASSWORD", "");
      vi.stubEnv("JELLYGATE_LOCAL_ADMIN_USER", "gatekeeper");
      vi.stubEnv("JELLYGATE_LOCAL_ADMIN_PASSWORD", "emergency999");

      expect(isLocalAdminConfigured()).toBe(true);
      const creds = getLocalAdminCredentials();
      expect(creds.username).toBe("gatekeeper");
      expect(creds.password).toBe("emergency999");
    });
  });

  describe("extractGroupsFromProfile", () => {
    it("extracts groups from string array", () => {
      const profile = {
        groups: ["jellyfin-users", "jellyfin-admins"],
      };
      expect(extractGroupsFromProfile(profile)).toEqual(["jellyfin-users", "jellyfin-admins"]);
    });

    it("extracts groups from object array (e.g. Authentik / Dex)", () => {
      const profile = {
        groups: [{ name: "jellyfin-users" }, { value: "jellyfin-admins" }],
      };
      expect(extractGroupsFromProfile(profile)).toEqual(["jellyfin-users", "jellyfin-admins"]);
    });

    it("extracts groups from comma-separated string", () => {
      const profile = {
        memberOf: "jellyfin-users, jellyfin-admins",
      };
      expect(extractGroupsFromProfile(profile)).toEqual(["jellyfin-users", "jellyfin-admins"]);
    });

    it("handles realm_access roles (Keycloak)", () => {
      const profile = {
        realm_access: {
          roles: ["jellyfin-admins", "default-roles"],
        },
      };
      expect(extractGroupsFromProfile(profile)).toContain("jellyfin-admins");
    });

    it("returns empty array for null/empty profile", () => {
      expect(extractGroupsFromProfile(null)).toEqual([]);
      expect(extractGroupsFromProfile({})).toEqual([]);
    });
  });

  describe("evaluateOidcGroupPermissions", () => {
    const config = {
      userGroup: "jellyfin-users",
      adminGroup: "jellyfin-admins",
    };

    it("grants admin rights when user belongs to admin group", () => {
      const res = evaluateOidcGroupPermissions(["jellyfin-users", "jellyfin-admins"], config);
      expect(res.isAdmin).toBe(true);
      expect(res.isAllowed).toBe(true);
    });

    it("grants user access (non-admin) when user belongs to user group only", () => {
      const res = evaluateOidcGroupPermissions(["jellyfin-users"], config);
      expect(res.isAdmin).toBe(false);
      expect(res.isAllowed).toBe(true);
    });

    it("denies access when user does not belong to any authorized group", () => {
      const res = evaluateOidcGroupPermissions(["other-group", "plex-users"], config);
      expect(res.isAdmin).toBe(false);
      expect(res.isAllowed).toBe(false);
    });

    it("is case-insensitive for group comparison", () => {
      const res = evaluateOidcGroupPermissions(["JELLYFIN-ADMINS"], config);
      expect(res.isAdmin).toBe(true);
      expect(res.isAllowed).toBe(true);
    });

    it("allows all users if no user/admin groups are configured", () => {
      const res = evaluateOidcGroupPermissions(["any-group"], { userGroup: "", adminGroup: "" });
      expect(res.isAdmin).toBe(false);
      expect(res.isAllowed).toBe(true);
    });
  });

  describe("resolveJellyfinUserForOidc", () => {
    it("returns fallback ID for username when offline/stub mode", async () => {
      const res = await resolveJellyfinUserForOidc("Mael", { sub: "auth0|12345" });
      expect(res.username).toBe("Mael");
      expect(res.jellyfinUserId).toBeDefined();
    });
  });
});
