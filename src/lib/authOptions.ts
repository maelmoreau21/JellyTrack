import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { checkLoginRateLimit, recordFailedLogin, resetLoginRateLimit } from "@/lib/rateLimit";
import { getResolvedAuthSecret } from "@/lib/authSecret";
import { headers, cookies } from "next/headers";
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
                password: { label: "Mot de passe Administrateur", type: "password", placeholder: "********" }
            },
            async authorize(credentials) {
                if (!credentials?.username || !credentials?.password) return null;

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
            if (user) {
                token.isAdmin = user.isAdmin ?? false;
                token.jellyfinUserId = user.jellyfinUserId ?? user.id;
                token.authServerName = user.authServerName ?? "";
                token.authServerUrl = user.authServerUrl ?? "";
                token.authServerIsPrimary = user.authServerIsPrimary ?? true;
            }
            return token;
        },
        async session({ session, token }) {
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
        maxAge: 7 * 24 * 60 * 60,
    },
    pages: {
        signIn: '/login',
    },
    secret: authSecret.value,
};
