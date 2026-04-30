// Module-level logging to surface import-time errors when Next.js loads this route
console.log('[auth.route] module loaded');
import type { NextRequest } from "next/server";
import NextAuth from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/authOptions";
import { parseRememberMe } from "@/lib/authSession";

console.log('[auth.route] creating handler');
const nextAuthHandler = NextAuth(authOptions as any) as (
    req: NextRequest,
    context: AuthRouteContext
) => Promise<Response>;
console.log('[auth.route] handler created');

type AuthRouteContext = {
    params: Promise<{ nextauth: string[] }> | { nextauth: string[] };
};

const SESSION_COOKIE_NAMES = ["next-auth.session-token", "__Secure-next-auth.session-token"];

function splitSetCookieHeader(value: string): string[] {
    const cookies: string[] = [];
    let start = 0;
    let inExpires = false;

    for (let i = 0; i < value.length; i += 1) {
        const char = value[i];
        const rest = value.slice(i).toLowerCase();

        if (rest.startsWith("expires=")) {
            inExpires = true;
        } else if (inExpires && char === ";") {
            inExpires = false;
        } else if (!inExpires && char === ",") {
            const next = value.slice(i + 1).trimStart();
            const equalsIndex = next.indexOf("=");
            const semicolonIndex = next.indexOf(";");

            if (equalsIndex > 0 && (semicolonIndex === -1 || equalsIndex < semicolonIndex)) {
                cookies.push(value.slice(start, i).trim());
                start = i + 1;
            }
        }
    }

    cookies.push(value.slice(start).trim());
    return cookies.filter(Boolean);
}

function getSetCookieHeaders(headers: Headers): string[] {
    const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
    if (typeof getSetCookie === "function") {
        return getSetCookie.call(headers);
    }

    const setCookie = headers.get("set-cookie");
    return setCookie ? splitSetCookieHeader(setCookie) : [];
}

function isSessionCookie(cookie: string): boolean {
    const cookieName = cookie.split("=", 1)[0];
    return SESSION_COOKIE_NAMES.some((name) => cookieName === name || cookieName.startsWith(`${name}.`));
}

function makeCurrentSessionCookie(cookie: string): string {
    if (!isSessionCookie(cookie) || /;\s*Max-Age=0(?:;|$)/i.test(cookie)) {
        return cookie;
    }

    return cookie.replace(/;\s*Expires=[^;]+(?=;|$)/i, "");
}

function applySessionCookiePersistence(response: Response, rememberMe: boolean | null): Response {
    if (rememberMe !== false) {
        return response;
    }

    const setCookieHeaders = getSetCookieHeaders(response.headers);
    if (setCookieHeaders.length === 0) {
        return response;
    }

    const headers = new Headers(response.headers);
    headers.delete("set-cookie");

    for (const cookie of setCookieHeaders) {
        headers.append("set-cookie", makeCurrentSessionCookie(cookie));
    }

    return new Response(response.body, {
        headers,
        status: response.status,
        statusText: response.statusText,
    });
}

async function readSubmittedRememberMe(req: NextRequest): Promise<boolean | null> {
    try {
        const clonedReq = req.clone();
        const contentType = clonedReq.headers.get("content-type") || "";

        if (contentType.includes("application/json")) {
            const body = await clonedReq.json();
            return parseRememberMe((body as { rememberMe?: unknown } | null)?.rememberMe);
        }

        if (contentType.includes("application/x-www-form-urlencoded")) {
            const body = new URLSearchParams(await clonedReq.text());
            return parseRememberMe(body.get("rememberMe"));
        }

        const formData = await clonedReq.formData();
        return parseRememberMe(formData.get("rememberMe"));
    } catch {
        return null;
    }
}

async function resolveRememberMe(req: NextRequest): Promise<boolean | null> {
    if (req.method === "POST" && req.nextUrl.pathname.endsWith("/api/auth/callback/credentials")) {
        return readSubmittedRememberMe(req);
    }

    const secret = String(authOptions.secret || "");
    for (const secureCookie of [false, true]) {
        const token = await getToken({ req, secret, secureCookie });
        if (typeof token?.rememberMe === "boolean") {
            return token.rememberMe;
        }
    }

    return null;
}

async function handleAuth(req: NextRequest, context: AuthRouteContext) {
    const rememberMe = await resolveRememberMe(req);
    const response = await nextAuthHandler(req, context);
    return applySessionCookiePersistence(response, rememberMe);
}

export { handleAuth as GET, handleAuth as POST };
