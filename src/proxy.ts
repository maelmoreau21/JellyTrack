import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { apiTSync } from "@/lib/i18n-api";
import { getResolvedAuthSecret } from "@/lib/authSecret";

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

        // 1. Admin: full access
        if (token?.isAdmin) {
            return NextResponse.next();
        }

        // 2. Non-admin -> API admin paths blocked (403)
        const isAdminApi = ADMIN_API_PATHS.some((p) => matchesPath(pathname, p));
        if (isAdminApi) {
            const locale = req.cookies.get("locale")?.value || "fr";
            return NextResponse.json({ error: apiTSync(locale, "adminOnly") }, { status: 403 });
        }

        // 3. Non-admin -> Admin-only pages redirected to Dashboard
        const isAdminPage = ADMIN_PAGE_PATHS.some((p) => matchesPath(pathname, p));
        if (isAdminPage) {
            return NextResponse.redirect(new URL("/", req.url));
        }

        // 4. Non-admin -> List pages redirected to their own profile
        const isRedirectList = REDIRECT_IF_NOT_ADMIN.some((p) => matchesPath(pathname, p, false));
        if (isRedirectList) {
            const jellyfinUserId = token?.jellyfinUserId as string;
            if (jellyfinUserId) {
                return NextResponse.redirect(new URL(`/users/${jellyfinUserId}`, req.url));
            }
            return NextResponse.redirect(new URL("/login", req.url));
        }

        return NextResponse.next();
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
                return !!token;
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
         * - login (Login page)
         * - favicon.ico (favicon)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         */
        "/((?!api/auth|api/plugin/events|login|favicon.ico|_next/static|_next/image).*)",
    ],
};
