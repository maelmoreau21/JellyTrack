import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { apiTSync } from "@/lib/i18n-api";
import { getResolvedAuthSecret } from "@/lib/authSecret";

// Routes API reservees strictement aux administrateurs (defense-in-depth, les routes ont aussi leurs propres checks)
const ADMIN_API_PATHS = [
    "/api/admin",
    "/api/settings",
    "/api/sync",
    "/api/backup",
    "/api/streams",
    "/api/hardware",
    "/api/jellyfin/kill-stream",
];
const ADMIN_PAGE_PATHS = ["/admin", "/settings"];
// Pages liste (non-admins rediriges vers leur profil au lieu de voir tous les utilisateurs)
const ADMIN_LIST_PATHS = ["/users", "/logs", "/media", "/newsletter", "/recent"];

export default withAuth(
    function proxy(req) {
        const token = req.nextauth.token;
        const pathname = req.nextUrl.pathname;

        // Admin: acces total
        if (token?.isAdmin) {
            return NextResponse.next();
        }

        // Non-admin -> API admin bloquees (403)
        const isAdminApi = ADMIN_API_PATHS.some((p) => pathname.startsWith(p));
        if (isAdminApi) {
            const locale = req.cookies.get("locale")?.value || "fr";
            return NextResponse.json({ error: apiTSync(locale, "adminOnly") }, { status: 403 });
        }

        // Non-admin -> Pages admin redirigees vers profil utilisateur
        const isAdminPage = ADMIN_PAGE_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
        if (isAdminPage) {
            const jellyfinUserId = token?.jellyfinUserId as string;
            if (jellyfinUserId) {
                return NextResponse.redirect(new URL(`/users/${jellyfinUserId}`, req.url));
            }
            return NextResponse.redirect(new URL("/login", req.url));
        }

        // Non-admin -> Pages listes admin (mais /users/[id] reste accessible via le guard de la page)
        const isAdminList = ADMIN_LIST_PATHS.some((p) => pathname === p);
        if (isAdminList) {
            const jellyfinUserId = token?.jellyfinUserId as string;
            if (jellyfinUserId) {
                return NextResponse.redirect(new URL(`/users/${jellyfinUserId}`, req.url));
            }
            return NextResponse.redirect(new URL("/login", req.url));
        }

        // Tout le reste : accessible a tous les utilisateurs authentifies
        return NextResponse.next();
    },
    {
        secret: getResolvedAuthSecret().value,
        callbacks: {
            // L'utilisateur est autorise si le token JWT est present
            authorized: ({ token }) => !!token,
        },
        pages: {
            signIn: "/login",
        },
    }
);

// Configuration du matcher pour proteger toutes les routes SAUF les API publiques, fichiers statiques, etc.
export const config = {
    matcher: [
        "/((?!api/plugin|login|_next|favicon.ico).*)",
    ],
};
