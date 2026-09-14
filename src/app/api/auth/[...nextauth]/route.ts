import type { NextRequest } from "next/server";
import NextAuth from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions, getDynamicAuthOptions } from "@/lib/authOptions";
import { parseRememberMe } from "@/lib/authSession";

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

    return cookie
        .replace(/;\s*Expires=[^;]+(?=;|$)/i, "")
        .replace(/;\s*Max-Age=[^;]+(?=;|$)/i, "");
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

import { trustProxyHeaders } from "@/lib/requestIp";
import { isCloudMetadataHost } from "@/lib/urlUtils";

const VALID_HOST_PATTERN = /^[a-zA-Z0-9.-]+(?::\d{1,5})?$/;

export function ensureNextAuthUrl(req: NextRequest) {
    const shouldTrustProxy = trustProxyHeaders() || process.env.NODE_ENV === "test";
    const rawForwardedHost = shouldTrustProxy ? req.headers.get("x-forwarded-host") : null;
    const rawForwardedProto = shouldTrustProxy ? req.headers.get("x-forwarded-proto") : null;

    const rawHost = (rawForwardedHost || req.headers.get("host") || req.nextUrl.host || "").split(",")[0].trim();
    if (!rawHost || !VALID_HOST_PATTERN.test(rawHost) || rawHost.includes("/") || rawHost.includes("\\") || rawHost.includes("@")) {
        return;
    }

    const portMatch = rawHost.match(/:(\d+)$/);
    if (portMatch) {
        const portNum = Number(portMatch[1]);
        if (!Number.isFinite(portNum) || portNum <= 0 || portNum > 65535) {
            return;
        }
    }

    const hostWithoutPort = rawHost.replace(/:\d+$/, "").toLowerCase();
    if (isCloudMetadataHost(hostWithoutPort)) {
        return;
    }

    // If an allowlist of trusted hosts is configured, enforce it
    const trustedHostsRaw = process.env.AUTH_TRUSTED_HOSTS || process.env.ALLOWED_HOSTS;
    if (trustedHostsRaw) {
        const trustedHosts = new Set(
            trustedHostsRaw.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean)
        );
        if (trustedHosts.size > 0 && !trustedHosts.has(hostWithoutPort) && !trustedHosts.has(rawHost.toLowerCase())) {
            return;
        }
    }

    const isLocalhostOrLanIp =
        !hostWithoutPort ||
        hostWithoutPort === "localhost" ||
        hostWithoutPort === "127.0.0.1" ||
        hostWithoutPort === "0.0.0.0" ||
        hostWithoutPort.endsWith(".local") ||
        hostWithoutPort.endsWith(".lan") ||
        /^(\d{1,3}\.){3}\d{1,3}$/.test(hostWithoutPort);

    const isHttps =
        (shouldTrustProxy && (
            rawForwardedProto?.split(",")[0].trim().toLowerCase() === "https" ||
            req.headers.get("x-forwarded-ssl") === "on" ||
            req.headers.get("x-forwarded-scheme") === "https" ||
            req.headers.get("front-end-https") === "on"
        )) ||
        Boolean(req.headers.get("origin")?.startsWith("https://")) ||
        Boolean(req.headers.get("referer")?.startsWith("https://")) ||
        req.nextUrl.protocol === "https:" ||
        !isLocalhostOrLanIp;

    const proto = isHttps ? "https" : (rawForwardedProto || req.nextUrl.protocol || "http").split(",")[0].trim().replace(/:$/, "");

    const configured = process.env.NEXTAUTH_URL?.trim();

    // Detect if current NEXTAUTH_URL is a localhost/container fallback
    // This matches: http://localhost:3000, http://127.0.0.1:3005, http://0.0.0.0:3000, etc.
    const isConfiguredLocalhost = !configured || /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?\/?$/i.test(configured);

    // Override when: no config, or config is a localhost fallback (e.g. docker-compose default)
    if (rawHost && isConfiguredLocalhost) {
        process.env.NEXTAUTH_URL = `${proto}://${rawHost}`;
    }
}

async function handleAuth(req: NextRequest, context: AuthRouteContext) {
    ensureNextAuthUrl(req);
    const dynamicOptions = await getDynamicAuthOptions();
    const handler = NextAuth(dynamicOptions as any) as (
        req: NextRequest,
        context: AuthRouteContext
    ) => Promise<Response>;
    const rememberMe = await resolveRememberMe(req);
    const response = await handler(req, context);
    return applySessionCookiePersistence(response, rememberMe);
}

export { handleAuth as GET, handleAuth as POST };
