import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { apiTSync } from "@/lib/i18n-api";
import { getResolvedAuthSecret } from "@/lib/authSecret";
import { isSessionTokenActive } from "@/lib/authSession";
import { AVAILABLE_LOCALES, DEFAULT_LOCALE, isSupportedLocale } from "@/i18n/locales";

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesPath(pathname: string, target: string, allowSubPaths = true) {
    const normalizedPath = pathname.replace(/^\/+/, "");
    const normalizedTarget = target.replace(/^\/+/, "").replace(/\/+$/, "");

    if (!normalizedTarget) {
        return false;
    }

    const escapedTarget = escapeRegExp(normalizedTarget);
    const suffix = allowSubPaths ? "(?:/|$)" : "$";
    const pattern = new RegExp(`(?:^|/)${escapedTarget}${suffix}`);
    return pattern.test(normalizedPath);
}

/**
 * Parses the Accept-Language header and returns the best matching supported locale.
 * Example: "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7" → "fr"
 */
function resolveLocaleFromHeader(acceptLanguage: string | null): string {
    if (!acceptLanguage) return DEFAULT_LOCALE;

    const langs = acceptLanguage
        .split(',')
        .map((entry) => {
            const [tag, q] = entry.trim().split(';q=');
            return { tag: tag.trim().toLowerCase(), q: q ? parseFloat(q) : 1.0 };
        })
        .filter((l) => !isNaN(l.q))
        .sort((a, b) => b.q - a.q);

    for (const { tag } of langs) {
        // Exact match (e.g. "pt-br" → "pt-BR")
        const exactMatch = AVAILABLE_LOCALES.find(
            (l) => l.code.toLowerCase() === tag
        );
        if (exactMatch) return exactMatch.code;

        // Base language match (e.g. "fr-fr" → "fr", "pt-br" → "pt-BR")
        const base = tag.split('-')[0];
        const baseMatch = AVAILABLE_LOCALES.find(
            (l) => l.code.toLowerCase() === base || l.code.toLowerCase().startsWith(base + '-')
        );
        if (baseMatch) return baseMatch.code;
    }

    return DEFAULT_LOCALE;
}

// Admin-only routes for API and Pages
const ADMIN_API_PATHS = [
    "/api/admin",
    "/api/settings",
    "/api/sync",
    "/api/backup",
    "/api/streams",
    "/api/hardware",
    "/api/jellyfin/kill-stream",
    "/api/plugin/api-key",
];

const ADMIN_PAGE_PATHS = [
    "/admin",
    "/settings",
    "/media/collections",
    "/media/analysis",
    "/media/all"
];

// Pages that redirect non-admins to their own profile
const REDIRECT_IF_NOT_ADMIN = ["/users", "/logs", "/media", "/recent"];

export default withAuth(
    function proxy(req) {
        const token = req.nextauth.token;
        const pathname = req.nextUrl.pathname;

        // 1. Detect and propagate locale
        const existingLocale = req.cookies.get('locale')?.value;
        let detectedLocale = existingLocale;
        let setCookie = false;
        const requestHeaders = new Headers(req.headers);

        if (!existingLocale || !isSupportedLocale(existingLocale)) {
            const acceptLanguage = req.headers.get('accept-language');
            detectedLocale = resolveLocaleFromHeader(acceptLanguage);
            setCookie = true;
        }

        // Set the custom header to propagate the detected locale to downstream components
        requestHeaders.set('x-detected-locale', detectedLocale || DEFAULT_LOCALE);

        let responseToUse: NextResponse | null = null;

        // 2. Authentication & Authorization routing
        if (pathname === "/login" || pathname.startsWith("/login/")) {
            // Bypass auth verification for login routes
            responseToUse = NextResponse.next({
                request: {
                    headers: requestHeaders,
                }
            });
        } else {
            const hasActiveSession = isSessionTokenActive(token);

            if (!hasActiveSession) {
                if (matchesPath(pathname, "/api")) {
                    responseToUse = NextResponse.next({
                        request: {
                            headers: requestHeaders,
                        }
                    });
                } else {
                    responseToUse = NextResponse.redirect(new URL("/login", req.url));
                }
            } else {
                // User is authenticated
                if (token?.isAdmin) {
                    // Admins have full access
                    responseToUse = NextResponse.next({
                        request: {
                            headers: requestHeaders,
                        }
                    });
                } else {
                    // Non-admin user restrictions
                    const isAdminApi = ADMIN_API_PATHS.some((p) => matchesPath(pathname, p));
                    if (isAdminApi) {
                        const browserLang = requestHeaders.get('accept-language')?.split(",")[0]?.split(";")[0]?.trim().split("-")[0] || "en";
                        const locale = detectedLocale || browserLang || "en";
                        responseToUse = NextResponse.json({ error: apiTSync(locale, "adminOnly") }, { status: 403 });
                    } else {
                        const isAdminPage = ADMIN_PAGE_PATHS.some((p) => matchesPath(pathname, p));
                        if (isAdminPage) {
                            responseToUse = NextResponse.redirect(new URL("/", req.url));
                        } else {
                            const isRedirectList = REDIRECT_IF_NOT_ADMIN.some((p) => matchesPath(pathname, p, false));
                            if (isRedirectList) {
                                const jellyfinUserId = token?.jellyfinUserId as string;
                                if (jellyfinUserId) {
                                    responseToUse = NextResponse.redirect(new URL(`/users/${jellyfinUserId}`, req.url));
                                } else {
                                    responseToUse = NextResponse.redirect(new URL("/login", req.url));
                                }
                            } else {
                                responseToUse = NextResponse.next({
                                    request: {
                                        headers: requestHeaders,
                                    }
                                });
                            }
                        }
                    }
                }
            }
        }

        // 3. Set the locale cookie on the response if we detected it on this request
        if (setCookie && detectedLocale && responseToUse) {
            responseToUse.cookies.set('locale', detectedLocale, {
                path: '/',
                maxAge: 365 * 24 * 60 * 60, // 1 year
                sameSite: 'lax',
                httpOnly: false,
            });
        }

        return responseToUse;
    },
    {
        secret: getResolvedAuthSecret().value,
        callbacks: {
            authorized: ({ token, req }) => {
                const pathname = req.nextUrl.pathname;

                // Let API routes return JSON auth errors from their own handlers
                // instead of forcing an HTML redirect to /login.
                if (matchesPath(pathname, "/api")) {
                    return true;
                }
                return isSessionTokenActive(token);
            },
        },
        pages: {
            signIn: "/login",
        },
    }
);

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api/auth (NextAuth endpoints)
         * - api/plugin/events (Internal plugin API)
         * - api/backup (Backup import/export endpoints - allows large payload streaming)
         * - favicon.ico (favicon)
         * - logo.svg, icon.svg
         * - _next/static (static files)
         * - _next/image (image optimization files)
         */
        "/((?!api/auth|api/plugin/events|api/backup|favicon\\.ico|logo\\.svg|icon\\.svg|_next/static|_next/image).*)",
    ],
};
