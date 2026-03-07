import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { apiTSync } from "@/lib/i18n-api";
import { getResolvedAuthSecret } from "@/lib/authSecret";

// Routes API réservées strictement aux administrateurs (defense-in-depth, les routes ont aussi leurs propres checks)
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
// Pages liste (non-admins redirigés vers leur profil au lieu de voir tous les utilisateurs)
const ADMIN_LIST_PATHS = ["/users", "/logs", "/media", "/newsletter", "/recent"];

export default withAuth(
    function middleware(req) {
        const token = req.nextauth.token;
        const pathname = req.nextUrl.pathname;

        // Admin: accès total
        if (token?.isAdmin) {
            return NextResponse.next();
        }

        // Non-admin → API admin bloquées (403)
        const isAdminApi = ADMIN_API_PATHS.some(p => pathname.startsWith(p));
        if (isAdminApi) {
            const locale = req.cookies.get('locale')?.value || 'fr';
            return NextResponse.json({ error: apiTSync(locale, 'adminOnly') }, { status: 403 });
        }

        // Non-admin → Pages admin redirigées vers profil utilisateur
        const isAdminPage = ADMIN_PAGE_PATHS.some(p => pathname === p || pathname.startsWith(p + "/"));
        if (isAdminPage) {
            const jellyfinUserId = token?.jellyfinUserId as string;
            if (jellyfinUserId) {
                return NextResponse.redirect(new URL(`/users/${jellyfinUserId}`, req.url));
            }
            return NextResponse.redirect(new URL("/login", req.url));
        }

        // Non-admin → Pages listes admin (mais /users/[id] reste accessible via le guard de la page)
        const isAdminList = ADMIN_LIST_PATHS.some(p => pathname === p);
        if (isAdminList) {
            const jellyfinUserId = token?.jellyfinUserId as string;
            if (jellyfinUserId) {
                return NextResponse.redirect(new URL(`/users/${jellyfinUserId}`, req.url));
            }
            return NextResponse.redirect(new URL("/login", req.url));
        }

        // Tout le reste : accessible à tous les utilisateurs authentifiés
        return NextResponse.next();
    },
    {
        secret: getResolvedAuthSecret().value,
        callbacks: {
            // L'utilisateur est autorisé si le token JWT est présent
            authorized: ({ token }) => !!token,
        },
        pages: {
            signIn: "/login",
        }
    }
);

// Configuration du matcher pour protéger toutes les routes SAUF les API publiques, fichiers statiques, etc.
export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api/jellyfin/image (Proxy images publiques)
         * - api/webhook (Réception webhook)
         * - login (Page de connexion publique)
         * - _next/static (Fichiers Next.js internes statiques)
         * - _next/image (Next.js image optimization API)
         * - favicon.ico, sitemap.xml, robots.txt (Metadata basique)
         */
        "/((?!api/jellyfin/image|api/webhook|login|_next|favicon.ico).*)",
    ],
};
