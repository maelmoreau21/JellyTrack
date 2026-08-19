import type { NextAuthOptions } from "next-auth";
import type { Session } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { checkLoginRateLimit, recordFailedLogin, resetLoginRateLimit } from "@/lib/rateLimit";
import { getResolvedAuthSecret } from "@/lib/authSecret";
import { headers, cookies } from "next/headers";
import {
    CURRENT_SESSION_MAX_AGE_SECONDS,
    INDEFINITE_SESSION_MAX_AGE_SECONDS,
    REMEMBERED_SESSION_MAX_AGE_SECONDS,
    getSessionExpiresAtSeconds,
    isSessionTokenActive,
    isSessionTokenRevoked,
    parseRememberMe,
} from "@/lib/authSession";
import { getAuthSessionPolicy } from "@/lib/authPolicy";
import {
    authenticateAgainstJellyfinDetailed,
    getConfiguredJellyfinServers,
    type JellyfinAuthAttemptStatus,
} from "@/lib/jellyfinServers";
import { writeAdminAuditLog } from "@/lib/adminAudit";
import { getClientIpFromHeaders } from "@/lib/requestIp";
import { getMasterServerIdentityFromEnv } from "@/lib/serverRegistry";
import {
    getOidcConfig,
    getOidcConfigAsync,
    isLocalAdminConfigured,
    getLocalAdminCredentials,
    extractGroupsFromProfile,
    evaluateOidcGroupPermissions,
    resolveJellyfinUserForOidc,
    type OidcConfig,
} from "@/lib/oidcConfig";

if (typeof process.env.NEXTAUTH_URL === "string" && process.env.NEXTAUTH_URL.trim() === "") {
    delete process.env.NEXTAUTH_URL;
}

const authSecret = getResolvedAuthSecret();

function buildAuthProviders(customOidc?: OidcConfig): NextAuthOptions["providers"] {
    const providers: NextAuthOptions["providers"] = [];
    const oidc = customOidc || getOidcConfig();

    // 1. SSO OIDC Provider (when OIDC_ENABLED is true)
    if (oidc.enabled && oidc.url && oidc.clientId) {
        const cleanUrl = oidc.url.trim().replace(/\/\.well-known\/openid-configuration$/, "").replace(/\/+$/, "");
        if (cleanUrl.startsWith("http://") || cleanUrl.startsWith("https://")) {
            providers.push({
                id: "oidc",
                name: "SSO",
                type: "oauth",
                wellKnown: `${cleanUrl}/.well-known/openid-configuration`,
                authorization: {
                    params: {
                        scope: "openid email profile groups",
                    },
                },
                idToken: true,
                checks: ["state"],
                clientId: oidc.clientId,
                clientSecret: oidc.clientSecret || undefined,
                profile(profile) {
                const username = String(
                    profile.preferred_username ||
                    profile.username ||
                    profile.name ||
                    profile.nickname ||
                    profile.email ||
                    profile.sub ||
                    "User"
                ).trim();

                const groups = extractGroupsFromProfile(profile);

                return {
                    id: String(profile.sub || username),
                    name: username,
                    email: profile.email || null,
                    image: profile.picture || profile.avatar || null,
                    isAdmin: false,
                    jellyfinUserId: "",
                    authProvider: "oidc" as const,
                    groups,
                };
            },
        });
        }
    }

    // 2. Emergency Local Admin Credentials Provider (if configured)
    if (isLocalAdminConfigured()) {
        providers.push(
            CredentialsProvider({
                id: "local-credentials",
                name: "Local Admin",
                credentials: {
                    username: { label: "Username", type: "text", placeholder: "admin" },
                    password: { label: "Password", type: "password", placeholder: "********" },
                },
                async authorize(credentials) {
                    if (!credentials?.username || !credentials?.password) return null;
                    const local = getLocalAdminCredentials();
                    if (!local.isConfigured || !local.password) return null;

                    let locale = "en";
                    try { const c = await cookies(); locale = c.get("locale")?.value || "en"; } catch {}
                    const { apiTSync } = await import("@/lib/i18n-api");

                    const headersList = await headers();
                    const clientIp = getClientIpFromHeaders(headersList, "unknown") || "unknown";

                    const { allowed, retryAfterSeconds } = await checkLoginRateLimit(clientIp);
                    if (!allowed) {
                        throw new Error(apiTSync(locale, "tooManyAttempts", { minutes: Math.ceil((retryAfterSeconds || 900) / 60) }));
                    }

                    if (credentials.username === local.username && credentials.password === local.password) {
                        await resetLoginRateLimit(clientIp);

                        await writeAdminAuditLog({
                            action: "Local Admin login successful",
                            actorUserId: "local-admin",
                            actorUsername: local.username,
                            ipAddress: clientIp,
                            details: { authType: "local-admin" },
                        });

                        const masterIdentity = getMasterServerIdentityFromEnv();
                        return {
                            id: "local-admin",
                            name: local.username,
                            isAdmin: true,
                            jellyfinUserId: "local-admin",
                            authServerName: "Local Admin",
                            authServerUrl: masterIdentity.url,
                            authServerJellyfinServerId: masterIdentity.jellyfinServerId,
                            authServerIsPrimary: true,
                            authProvider: "local" as const,
                            rememberMe: false,
                        };
                    }

                    await recordFailedLogin(clientIp);
                    throw new Error(apiTSync(locale, "badCredentials"));
                },
            })
        );
    }

    // 3. Jellyfin Credentials Provider (if OIDC is disabled, or fallback)
    if (!oidc.enabled) {
        providers.push(
            CredentialsProvider({
                id: "credentials",
                name: "Jellyfin",
                credentials: {
                    username: { label: "Username", type: "text", placeholder: "Admin" },
                    password: { label: "Admin Password", type: "password", placeholder: "********" },
                    rememberMe: { label: "Remember me", type: "checkbox" },
                },
                async authorize(credentials) {
                    if (!credentials?.username || !credentials?.password) return null;
                    const rememberMe = parseRememberMe(credentials.rememberMe);

                    // Read locale from cookie for error messages
                    let locale = "en";
                    try { const c = await cookies(); locale = c.get("locale")?.value || "en"; } catch {}
                    const { apiTSync } = await import("@/lib/i18n-api");

                    // SECURITY: Rate-limit login attempts by IP
                    const headersList = await headers();
                    const clientIp = getClientIpFromHeaders(headersList, "unknown") || "unknown";

                    const { allowed, retryAfterSeconds } = await checkLoginRateLimit(clientIp);
                    if (!allowed) {
                        throw new Error(apiTSync(locale, "tooManyAttempts", { minutes: Math.ceil((retryAfterSeconds || 900) / 60) }));
                    }

                    const primaryUrl = String(process.env.JELLYFIN_URL || "").trim().replace(/\/+$/, "");
                    const primaryName = String(process.env.JELLYFIN_SERVER_NAME || "").trim() || "Primary Jellyfin";

                    const configuredServers = await getConfiguredJellyfinServers().catch(() => []);

                    const masterIdentity = getMasterServerIdentityFromEnv();
                    const candidates: Array<{ url: string; name: string; isPrimary: boolean; jellyfinServerId: string }> = [];
                    const seenUrls = new Set<string>();

                    const pushCandidate = (candidate: { url: string; name: string; isPrimary: boolean; jellyfinServerId: string }) => {
                        const normalizedUrl = String(candidate.url || "").trim().replace(/\/+$/, "");
                        if (!normalizedUrl || seenUrls.has(normalizedUrl)) return;
                        candidates.push({ ...candidate, url: normalizedUrl });
                        seenUrls.add(normalizedUrl);
                    };

                    if (primaryUrl) {
                        pushCandidate({
                            url: primaryUrl,
                            name: primaryName,
                            isPrimary: true,
                            jellyfinServerId: masterIdentity.jellyfinServerId,
                        });
                    }

                    for (const server of configuredServers) {
                        if (!server.allowAuthFallback || server.isPrimary) continue;
                        pushCandidate({
                            url: server.url,
                            name: server.name,
                            isPrimary: false,
                            jellyfinServerId: server.jellyfinServerId,
                        });
                    }

                    if (candidates.length === 0) {
                        throw new Error(apiTSync(locale, "jellyfinUrlMissing"));
                    }

                    try {
                        let authenticatedUser: {
                            userId: string;
                            username: string;
                            isAdmin: boolean;
                        } | null = null;
                        let authenticatedOn: { url: string; name: string; isPrimary: boolean; jellyfinServerId: string } | null = null;
                        let primaryStatus: JellyfinAuthAttemptStatus | "skipped" = "skipped";
                        let fallbackAttempted = false;
                        let fallbackUnreachableOnly = true;

                        const primaryCandidate = candidates.find((candidate) => candidate.isPrimary) || null;
                        const fallbackCandidates = candidates.filter((candidate) => !candidate.isPrimary);

                        if (primaryCandidate) {
                            const primaryResult = await authenticateAgainstJellyfinDetailed({
                                url: primaryCandidate.url,
                                username: credentials.username,
                                password: credentials.password,
                                timeoutMs: 7000,
                            });

                            primaryStatus = primaryResult.status;
                            if (primaryResult.status === "success" && primaryResult.user) {
                                authenticatedUser = primaryResult.user;
                                authenticatedOn = primaryCandidate;
                            }
                        }

                        const shouldTryFallback =
                            !authenticatedUser && (!primaryCandidate || primaryStatus === "unreachable");

                        if (shouldTryFallback) {
                            for (const candidate of fallbackCandidates) {
                                fallbackAttempted = true;

                                const result = await authenticateAgainstJellyfinDetailed({
                                    url: candidate.url,
                                    username: credentials.username,
                                    password: credentials.password,
                                    timeoutMs: 7000,
                                });

                                if (result.status !== "unreachable") {
                                    fallbackUnreachableOnly = false;
                                }

                                if (result.status === "success" && result.user) {
                                    authenticatedUser = result.user;
                                    authenticatedOn = candidate;
                                    break;
                                }
                            }
                        }

                        if (!authenticatedUser || !authenticatedOn) {
                            await recordFailedLogin(clientIp);

                            const noReachableFallback = !fallbackAttempted || fallbackUnreachableOnly;
                            const primaryDownScenario = primaryCandidate && primaryStatus === "unreachable";
                            const noPrimaryScenario = !primaryCandidate;

                            if ((primaryDownScenario || noPrimaryScenario) && noReachableFallback) {
                                throw new Error(apiTSync(locale, "connectionError"));
                            }

                            throw new Error(apiTSync(locale, "badCredentials"));
                        }

                        if (!authenticatedOn.isPrimary) {
                            console.warn(`[Auth] Primary Jellyfin unreachable. Fallback server used: ${authenticatedOn.name} (${authenticatedOn.url})`);
                        }

                        // Successful login — reset rate limit counter
                        await resetLoginRateLimit(clientIp);

                        // LOG AUDIT EVENT
                        await writeAdminAuditLog({
                            action: "Login successful",
                            actorUserId: authenticatedUser.userId,
                            actorUsername: authenticatedUser.username,
                            ipAddress: clientIp,
                            details: {
                                server: authenticatedOn.name,
                                isPrimary: authenticatedOn.isPrimary,
                            },
                        });

                        const allowFallbackAdmin = process.env.ALLOW_FALLBACK_ADMIN === "true";
                        const jellyTrackIsAdmin =
                            authenticatedUser.isAdmin && (authenticatedOn.isPrimary || allowFallbackAdmin);

                        return {
                            id: authenticatedUser.userId,
                            name: authenticatedUser.username,
                            isAdmin: jellyTrackIsAdmin,
                            jellyfinUserId: authenticatedUser.userId,
                            authServerName: authenticatedOn.name,
                            authServerUrl: authenticatedOn.url,
                            authServerJellyfinServerId: authenticatedOn.jellyfinServerId,
                            authServerIsPrimary: authenticatedOn.isPrimary,
                            authProvider: "jellyfin" as const,
                            rememberMe,
                        };
                    } catch (error: unknown) {
                        const e = error as Error;
                        throw new Error(e.message || apiTSync(locale, "connectionError"));
                    }
                },
            })
        );
    }

    return providers;
}

export const authOptions: NextAuthOptions = {
    providers: buildAuthProviders(),
    callbacks: {
        async signIn({ user, account, profile }) {
            if (account?.provider === "oidc") {
                const currentOidc = await getOidcConfigAsync();
                const groups = user.groups || extractGroupsFromProfile(profile);
                const groupEval = evaluateOidcGroupPermissions(groups, currentOidc);

                if (!groupEval.isAllowed) {
                    let clientIp = "unknown";
                    try {
                        const headersList = await headers();
                        clientIp = getClientIpFromHeaders(headersList, "unknown") || "unknown";
                    } catch {}

                    await writeAdminAuditLog({
                        action: "SSO Login Denied (Unauthorized Group)",
                        actorUserId: user.id || "unknown",
                        actorUsername: user.name || "unknown",
                        ipAddress: clientIp,
                        details: {
                            userGroups: groups,
                            requiredUserGroup: currentOidc.userGroup,
                            requiredAdminGroup: currentOidc.adminGroup,
                        },
                    }).catch(() => null);

                    return "/login?error=AccessDeniedGroup";
                }

                user.isAdmin = groupEval.isAdmin;
                user.groups = groups;

                const username = String(user.name || (profile as any)?.preferred_username || user.id || "").trim();
                const resolvedUser = await resolveJellyfinUserForOidc(username, profile);

                user.jellyfinUserId = resolvedUser.jellyfinUserId;
                user.name = resolvedUser.username || username;

                const masterIdentity = getMasterServerIdentityFromEnv();
                user.authServerName = "SSO / OIDC";
                user.authServerUrl = masterIdentity.url;
                user.authServerJellyfinServerId = masterIdentity.jellyfinServerId;
                user.authServerIsPrimary = true;
                user.authProvider = "oidc";

                let clientIp = "unknown";
                try {
                    const headersList = await headers();
                    clientIp = getClientIpFromHeaders(headersList, "unknown") || "unknown";
                } catch {}

                await writeAdminAuditLog({
                    action: "SSO Login successful",
                    actorUserId: user.jellyfinUserId,
                    actorUsername: user.name,
                    ipAddress: clientIp,
                    details: {
                        isAdmin: user.isAdmin,
                        groups,
                        provider: "oidc",
                    },
                }).catch(() => null);

                return true;
            }
            return true;
        },
        async jwt({ token, user }) {
            const nowSeconds = Math.floor(Date.now() / 1000);
            const sessionPolicy = await getAuthSessionPolicy();
            if (user) {
                const rememberMe = user.rememberMe === true;
                const rememberedMaxAge = sessionPolicy.rememberSessionsExpireAfterDays
                    ? REMEMBERED_SESSION_MAX_AGE_SECONDS
                    : INDEFINITE_SESSION_MAX_AGE_SECONDS;

                token.isAdmin = user.isAdmin ?? false;
                token.jellyfinUserId = user.jellyfinUserId ?? user.id;
                token.authServerName = user.authServerName ?? "";
                token.authServerUrl = user.authServerUrl ?? "";
                token.authServerJellyfinServerId = user.authServerJellyfinServerId ?? "";
                token.authServerIsPrimary = user.authServerIsPrimary ?? true;
                token.authProvider = user.authProvider;
                token.groups = user.groups;
                token.rememberMe = rememberMe;
                token.rememberSessionLimitedTo30Days = sessionPolicy.rememberSessionsExpireAfterDays;
                token.sessionIssuedAt = nowSeconds;
                token.sessionExpiresAt =
                    nowSeconds + (rememberMe ? rememberedMaxAge : CURRENT_SESSION_MAX_AGE_SECONDS);
                token.sessionExpired = false;
            } else if (getSessionExpiresAtSeconds(token) === null && typeof token.exp === "number") {
                token.sessionExpiresAt = token.exp;
            }

            if (
                isSessionTokenRevoked(token, sessionPolicy.sessionsRevokedAt) ||
                !isSessionTokenActive(token, nowSeconds)
            ) {
                token.sessionExpired = true;
                token.isAdmin = false;
                token.jellyfinUserId = "";
                token.authServerName = "";
                token.authServerUrl = "";
                token.authServerJellyfinServerId = "";
                token.authServerIsPrimary = true;
            }
            return token;
        },
        async session({ session, token }) {
            if (!isSessionTokenActive(token)) {
                return {} as Session;
            }

            const sessionExpiresAt = getSessionExpiresAtSeconds(token);
            if (sessionExpiresAt !== null) {
                session.expires = new Date(sessionExpiresAt * 1000).toISOString();
            }

            if (session.user) {
                session.user.isAdmin = token.isAdmin ?? false;
                session.user.jellyfinUserId = token.jellyfinUserId ?? "";
                session.user.authServerName = String(token.authServerName || "");
                session.user.authServerUrl = String(token.authServerUrl || "");
                session.user.authServerJellyfinServerId = String(token.authServerJellyfinServerId || "");
                session.user.authServerIsPrimary = token.authServerIsPrimary !== false;
                session.user.authProvider = token.authProvider;
                session.user.groups = token.groups;
            }
            return session;
        },
    },
    session: {
        strategy: "jwt",
        maxAge: INDEFINITE_SESSION_MAX_AGE_SECONDS,
    },
    pages: {
        signIn: "/login",
        error: "/login",
    },
    secret: authSecret.value,
};

export async function getDynamicAuthOptions(): Promise<NextAuthOptions> {
    try {
        const oidc = await getOidcConfigAsync();
        return {
            ...authOptions,
            providers: buildAuthProviders(oidc),
        };
    } catch {
        return authOptions;
    }
}


