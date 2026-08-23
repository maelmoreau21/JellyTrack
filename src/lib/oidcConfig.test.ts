import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isOidcEnabled,
  getOidcConfig,
  resolveOidcConfig,
  isLocalAdminConfigured,
  getLocalAdminCredentials,
  extractGroupsFromProfile,
  evaluateOidcGroupPermissions,
  extractCandidateUsernames,
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
    it("returns clean OIDC configuration with default RS256 alg", () => {
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
      expect(config.tokenAlg).toBe("RS256");
    });

    it("enforces RS256 algorithm strictly", () => {
      vi.stubEnv("OIDC_ENABLED", "true");
      vi.stubEnv("OIDC_URL", "https://authentik.example.com/application/o/jellytrack");
      vi.stubEnv("OIDC_CLIENT_ID", "jellytrack-app");
      vi.stubEnv("OIDC_TOKEN_ALG", "ES256");

      const config = getOidcConfig();
      expect(config.tokenAlg).toBe("RS256");
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

  describe("resolveOidcConfig (DB + Env precedence)", () => {
    it("uses DB settings when environment variables are unset", () => {
      const db = {
        enabled: true,
        url: "https://db-authentik.example.com",
        clientId: "db-client",
        clientSecret: "db-secret",
        userGroup: "db-users",
        adminGroup: "db-admins",
      };

      const resolved = resolveOidcConfig(db);
      expect(resolved.enabled).toBe(true);
      expect(resolved.url).toBe("https://db-authentik.example.com");
      expect(resolved.clientId).toBe("db-client");
      expect(resolved.clientSecret).toBe("db-secret");
      expect(resolved.userGroup).toBe("db-users");
      expect(resolved.adminGroup).toBe("db-admins");
      expect(resolved.isEnvControlled.url).toBe(false);
      expect(resolved.isEnvControlled.clientId).toBe(false);
    });

    it("prioritizes environment variables over DB settings when env is set", () => {
      vi.stubEnv("OIDC_ENABLED", "true");
      vi.stubEnv("OIDC_URL", "https://env-authentik.example.com");
      vi.stubEnv("OIDC_CLIENT_ID", "env-client");
      // Leaving secret and groups unset in env to test partial DB fallback

      const db = {
        enabled: false,
        url: "https://db-authentik.example.com",
        clientId: "db-client",
        clientSecret: "db-secret-saved",
        userGroup: "db-users-saved",
        adminGroup: "db-admins-saved",
      };

      const resolved = resolveOidcConfig(db);
      expect(resolved.enabled).toBe(true); // From env
      expect(resolved.url).toBe("https://env-authentik.example.com"); // From env
      expect(resolved.clientId).toBe("env-client"); // From env
      expect(resolved.clientSecret).toBe("db-secret-saved"); // From DB
      expect(resolved.userGroup).toBe("db-users-saved"); // From DB
      expect(resolved.adminGroup).toBe("db-admins-saved"); // From DB
      expect(resolved.isEnvControlled.url).toBe(true);
      expect(resolved.isEnvControlled.clientSecret).toBe(false);
    });
  });

  describe("extractCandidateUsernames", () => {
    it("extracts all identity candidates from standard Authentik/OIDC claims", () => {
      const profile = {
        name: "Maël Moreau",
        preferred_username: "mmoreau",
        email: "mael.moreau@example.com",
        given_name: "Maël",
        family_name: "Moreau",
        sub: "authentik-sub-123",
      };

      const candidates = extractCandidateUsernames("mmoreau", profile);
      expect(candidates).toContain("Maël Moreau");
      expect(candidates).toContain("mmoreau");
      expect(candidates).toContain("mael.moreau@example.com");
      expect(candidates).toContain("mael.moreau");
      expect(candidates).toContain("Maël");
      expect(candidates).toContain("Moreau");
    });
  });

  describe("resolveJellyfinUserForOidc", () => {
    it("returns fallback ID for username when offline/stub mode", async () => {
      const res = await resolveJellyfinUserForOidc("Mael", { sub: "auth0|12345" });
      expect(res.username).toBe("Mael");
      expect(res.jellyfinUserId).toBeDefined();
    });

    it("extracts candidates when username is mmoreau and profile has Maël Moreau", async () => {
      const profile = {
        name: "Maël Moreau",
        preferred_username: "mmoreau",
        email: "mael@test.com",
      };
      const res = await resolveJellyfinUserForOidc("mmoreau", profile);
      expect(res.jellyfinUserId).toBeDefined();
    });
  });
});
