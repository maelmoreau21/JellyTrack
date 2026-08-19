import prisma from "@/lib/prisma";
import { normalizeJellyfinId } from "@/lib/jellyfinId";
import { ensureMasterServer, getMasterServerIdentityFromEnv } from "@/lib/serverRegistry";
import { buildJellyfinApiKeyHeaders } from "@/lib/jellyfinServers";

export interface OidcConfig {
  enabled: boolean;
  url: string;
  clientId: string;
  clientSecret: string;
  userGroup: string;
  adminGroup: string;
}

export interface LocalAdminCredentials {
  username: string;
  password?: string;
  isConfigured: boolean;
}

export interface OidcGroupEvaluation {
  isAdmin: boolean;
  isAllowed: boolean;
  userGroups: string[];
}

/**
 * Checks if OIDC authentication is enabled via environment variables.
 */
export function isOidcEnabled(): boolean {
  const envVal = String(process.env.OIDC_ENABLED || "").trim().toLowerCase();
  return envVal === "true" || envVal === "1" || envVal === "yes" || envVal === "on";
}

/**
 * Returns the resolved OIDC configuration from environment.
 */
export function getOidcConfig(): OidcConfig {
  const enabled = isOidcEnabled();
  const url = String(process.env.OIDC_URL || process.env.OIDC_ISSUER || "").trim().replace(/\/+$/, "");
  const clientId = String(process.env.OIDC_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.OIDC_CLIENT_SECRET || "").trim();
  const userGroup = String(process.env.OIDC_USER_GROUP || "").trim();
  const adminGroup = String(process.env.OIDC_ADMIN_GROUP || "").trim();

  return {
    enabled,
    url,
    clientId,
    clientSecret,
    userGroup,
    adminGroup,
  };
}

/**
 * Checks if emergency local administrator login is configured.
 */
export function isLocalAdminConfigured(): boolean {
  const pass = (process.env.JELLYTRACK_LOCAL_ADMIN_PASSWORD || process.env.JELLYGATE_LOCAL_ADMIN_PASSWORD || "").trim();
  return pass.length > 0;
}

/**
 * Returns the local admin credentials.
 */
export function getLocalAdminCredentials(): LocalAdminCredentials {
  const user = (process.env.JELLYTRACK_LOCAL_ADMIN_USER || process.env.JELLYGATE_LOCAL_ADMIN_USER || "admin").trim() || "admin";
  const password = (process.env.JELLYTRACK_LOCAL_ADMIN_PASSWORD || process.env.JELLYGATE_LOCAL_ADMIN_PASSWORD || "").trim();
  const isConfigured = password.length > 0;

  return {
    username: user,
    password: isConfigured ? password : undefined,
    isConfigured,
  };
}

/**
 * Extracts group names from various standard and custom OIDC profile claims.
 * Compatible with Authentik, Keycloak, Authelia, Okta, Dex, etc.
 */
export function extractGroupsFromProfile(profile: any): string[] {
  if (!profile || typeof profile !== "object") {
    return [];
  }

  const candidateFields = [
    profile.groups,
    profile.user_groups,
    profile.roles,
    profile.memberOf,
    profile.group,
    profile["https://goauthentik.io/groups"],
    profile["groups_list"],
    profile?.realm_access?.roles,
  ];

  const result = new Set<string>();

  for (const field of candidateFields) {
    if (!field) continue;

    if (Array.isArray(field)) {
      for (const item of field) {
        if (typeof item === "string") {
          const trimmed = item.trim();
          if (trimmed) result.add(trimmed);
        } else if (item && typeof item === "object") {
          const name = String(item.name || item.value || item.id || "").trim();
          if (name) result.add(name);
        }
      }
    } else if (typeof field === "string") {
      const parts = field.split(",").map((s) => s.trim()).filter(Boolean);
      for (const p of parts) result.add(p);
    }
  }

  return Array.from(result);
}

/**
 * Evaluates whether an OIDC user is an admin or allowed access based on their groups.
 */
export function evaluateOidcGroupPermissions(
  userGroups: string[],
  config: Pick<OidcConfig, "adminGroup" | "userGroup"> = getOidcConfig()
): OidcGroupEvaluation {
  const normalizedUserGroups = userGroups.map((g) => g.trim().toLowerCase());
  const adminGroup = config.adminGroup.trim().toLowerCase();
  const userGroup = config.userGroup.trim().toLowerCase();

  let isAdmin = false;
  if (adminGroup) {
    isAdmin = normalizedUserGroups.includes(adminGroup);
  }

  let isAllowed = true;
  if (adminGroup || userGroup) {
    const inUserGroup = userGroup ? normalizedUserGroups.includes(userGroup) : false;
    if (!isAdmin && !inUserGroup) {
      isAllowed = false;
    }
  }

  return {
    isAdmin,
    isAllowed,
    userGroups,
  };
}

/**
 * Resolves a Jellyfin user from an OIDC username by matching against the JellyTrack database
 * or querying the Jellyfin server API directly (since Jellyfin uses the same LDAP directory).
 */
export async function resolveJellyfinUserForOidc(
  username: string,
  profile?: any
): Promise<{ jellyfinUserId: string; username: string; userDbId?: string }> {
  const cleanUsername = String(username || "").trim();
  if (!cleanUsername) {
    return {
      jellyfinUserId: "oidc-user",
      username: "OIDC User",
    };
  }

  try {
    const masterIdentity = getMasterServerIdentityFromEnv();
    const primaryServer = await ensureMasterServer();

    // 1. Check local JellyTrack DB for existing user with this username
    const prismaAny = prisma as any;
    if (prismaAny?.user?.findFirst) {
      const existingUser = await prismaAny.user.findFirst({
        where: {
          serverId: primaryServer.id,
          username: { equals: cleanUsername, mode: "insensitive" },
        },
        select: { id: true, jellyfinUserId: true, username: true },
      });

      if (existingUser?.jellyfinUserId) {
        return {
          jellyfinUserId: existingUser.jellyfinUserId,
          username: existingUser.username || cleanUsername,
          userDbId: existingUser.id,
        };
      }
    }

    // 2. Query Jellyfin API directly if API key is configured
    const apiKey = process.env.JELLYFIN_API_KEY || process.env.JELLYTRACK_JELLYFIN_API_KEY;
    const jellyfinUrl = masterIdentity.url;

    if (apiKey && jellyfinUrl) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const endpoints = [
        `${jellyfinUrl}/Users`,
        `${jellyfinUrl}/Users/Query`,
      ];

      for (const endpoint of endpoints) {
        try {
          const res = await fetch(endpoint, {
            headers: buildJellyfinApiKeyHeaders(apiKey),
            signal: controller.signal,
            cache: "no-store",
          });

          if (res.ok) {
            const data = await res.json();
            const usersList = Array.isArray(data) ? data : Array.isArray(data?.Items) ? data.Items : [];

            const matched = usersList.find(
              (u: any) => String(u?.Name || "").trim().toLowerCase() === cleanUsername.toLowerCase()
            );

            if (matched && matched.Id) {
              clearTimeout(timeout);
              const jellyfinUserId = normalizeJellyfinId(matched.Id) || String(matched.Id);

              // Upsert in local database for seamless stats and sync
              if (prismaAny?.user?.upsert) {
                const upserted = await prismaAny.user.upsert({
                  where: {
                    jellyfinUserId_serverId: {
                      jellyfinUserId,
                      serverId: primaryServer.id,
                    },
                  },
                  create: {
                    serverId: primaryServer.id,
                    jellyfinUserId,
                    username: matched.Name || cleanUsername,
                    isActive: true,
                    lastActive: new Date(),
                  },
                  update: {
                    username: matched.Name || cleanUsername,
                    lastActive: new Date(),
                  },
                  select: { id: true },
                }).catch(() => null);

                return {
                  jellyfinUserId,
                  username: matched.Name || cleanUsername,
                  userDbId: upserted?.id,
                };
              }

              return {
                jellyfinUserId,
                username: matched.Name || cleanUsername,
              };
            }
          }
        } catch {
          // Try next endpoint or fallback
        }
      }
      clearTimeout(timeout);
    }

    // 3. Fallback: use normalized clean username / sub
    const fallbackId = (profile?.sub && typeof profile.sub === "string")
      ? normalizeJellyfinId(profile.sub) || profile.sub
      : `oidc-${cleanUsername.toLowerCase().replace(/[^a-z0-9_-]/g, "_")}`;

    if (prismaAny?.user?.create) {
      const created = await prismaAny.user.create({
        data: {
          serverId: primaryServer.id,
          jellyfinUserId: fallbackId,
          username: cleanUsername,
          isActive: true,
          lastActive: new Date(),
        },
        select: { id: true },
      }).catch(() => null);

      return {
        jellyfinUserId: fallbackId,
        username: cleanUsername,
        userDbId: created?.id,
      };
    }

    return {
      jellyfinUserId: fallbackId,
      username: cleanUsername,
    };
  } catch (error) {
    console.error("[OIDC] Error resolving Jellyfin user for OIDC username:", error);
    return {
      jellyfinUserId: `oidc-${cleanUsername.toLowerCase()}`,
      username: cleanUsername,
    };
  }
}
