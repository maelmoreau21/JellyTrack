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

const authSecret = getResolvedAuthSecret();

export const authOptions: NextAuthOptions = {
    providers: [
        CredentialsProvider({
            name: "Jellyfin",
            credentials: {
                username: { label: "Nom d'utilisateur", type: "text", placeholder: "Admin" },
                password: { label: "Mot de passe Administrateur", type: "password", placeholder: "********" },
                rememberMe: { label: "Se souvenir de moi", type: "checkbox" }
            },
            async authorize(credentials) {
                if (!credentials?.username || !credentials?.password) return null;
                const rememberMe = parseRememberMe(credentials.rememberMe);

                // Read locale from cookie for error messages
                let locale = 'fr';
                try { const c = await cookies(); locale = c.get('locale')?.value || 'fr'; } catch {}
                const { apiTSync } = await import("@/lib/i18n-api");

                // SECURITY: Rate-limit login attempts by IP
                const headersList = await headers();
                const forwarded = headersList.get("x-forwarded-for");
                const clientIp = forwarded?.split(",")[0]?.trim() || headersList.get("x-real-ip") || "unknown";
                
                const { allowed, retryAfterSeconds } = await checkLoginRateLimit(clientIp);
                if (!allowed) {
                    throw new Error(apiTSync(locale, 'tooManyAttempts', { minutes: Math.ceil((retryAfterSeconds || 900) / 60) }));
                }

                const primaryUrl = String(process.env.JELLYFIN_URL || "").trim().replace(/\/+$/, "");
                const primaryName = String(process.env.JELLYFIN_SERVER_NAME || "").trim() || "Primary Jellyfin";

                const configuredServers = await getConfiguredJellyfinServers().catch(() => []);

                const candidates: Array<{ url: string; name: string; isPrimary: boolean }> = [];
                const seenUrls = new Set<string>();

                const pushCandidate = (candidate: { url: string; name: string; isPrimary: boolean }) => {
                    const normalizedUrl = String(candidate.url || "").trim().replace(/\/+$/, "");
                    if (!normalizedUrl || seenUrls.has(normalizedUrl)) return;
                    candidates.push({ ...candidate, url: normalizedUrl });
                    seenUrls.add(normalizedUrl);
                };

                if (primaryUrl) {
                    pushCandidate({ url: primaryUrl, name: primaryName, isPrimary: true });
                }

                for (const server of configuredServers) {
                    if (!server.allowAuthFallback || server.isPrimary) continue;
                    pushCandidate({
                        url: server.url,
                        name: server.name,
                        isPrimary: false,
                    });
                }

                if (candidates.length === 0) {
                    throw new Error(apiTSync(locale, 'jellyfinUrlMissing'));
                }

                try {
                    let authenticatedUser: {
                        userId: string;
                        username: string;
                        isAdmin: boolean;
                    } | null = null;
                    let authenticatedOn: { url: string; name: string; isPrimary: boolean } | null = null;
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
                            throw new Error(apiTSync(locale, 'connectionError'));
                        }

                        throw new Error(apiTSync(locale, 'badCredentials'));
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
                            isPrimary: authenticatedOn.isPrimary
                        }
                    });

                    return {
                        id: authenticatedUser.userId,
                        name: authenticatedUser.username,
                        isAdmin: authenticatedUser.isAdmin,
                        jellyfinUserId: authenticatedUser.userId,
                        authServerName: authenticatedOn.name,
                        authServerUrl: authenticatedOn.url,
                        authServerIsPrimary: authenticatedOn.isPrimary,
                        rememberMe,
                    };
                } catch (error: unknown) {
                    const e = error as Error;
                    throw new Error(e.message || apiTSync(locale, 'connectionError'));
                }
            }
        })
    ],
    callbacks: {
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
                token.authServerIsPrimary = user.authServerIsPrimary ?? true;
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
                session.user.authServerIsPrimary = token.authServerIsPrimary !== false;
            }
            return session;
        },
    },
    session: {
        strategy: "jwt",
        maxAge: INDEFINITE_SESSION_MAX_AGE_SECONDS,
    },
    pages: {
        signIn: '/login',
    },
    secret: authSecret.value,
};
