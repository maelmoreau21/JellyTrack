import { NextResponse } from "next/server";
import { comparePluginApiKey, getPluginKeySnapshot, isPreviousPluginKeyValid } from "@/lib/pluginKeyManager";
import { parsePluginApiKeyCandidate, verifyScopedPluginApiKey } from "@/lib/pluginServerKey";

export const CORS_HEADERS = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key",
};

export interface PluginAuthResult {
    authorized: boolean;
    usedPreviousKey: boolean;
    autoRotated: boolean;
    scopeServerId: string | null;
}

export function corsJson(body: unknown, init?: { status?: number }) {
    return NextResponse.json(body, { ...init, headers: CORS_HEADERS });
}

export function extractBearerToken(headerValue: string | null): string | null {
    if (!headerValue) return null;
    const match = headerValue.match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    const token = match[1].trim();
    return token.length > 0 ? token : null;
}

export async function verifyPluginAuth(req: Request): Promise<PluginAuthResult> {
    const { snapshot, autoRotated } = await getPluginKeySnapshot();

    const currentKeyHash = snapshot.currentKeyHash?.trim() || null;
    const previousKeyHash = snapshot.previousKeyHash?.trim() || null;

    const bearerParsed = parsePluginApiKeyCandidate(extractBearerToken(req.headers.get("authorization")));
    const headerParsed = parsePluginApiKeyCandidate(req.headers.get("x-api-key"));

    const bearerScopedCurrent = verifyScopedPluginApiKey(bearerParsed.scopedToken, currentKeyHash);
    if (bearerScopedCurrent.valid) {
        return {
            authorized: true,
            usedPreviousKey: false,
            autoRotated,
            scopeServerId: bearerScopedCurrent.jellyfinServerId,
        };
    }

    const headerScopedCurrent = verifyScopedPluginApiKey(headerParsed.scopedToken, currentKeyHash);
    if (headerScopedCurrent.valid) {
        return {
            authorized: true,
            usedPreviousKey: false,
            autoRotated,
            scopeServerId: headerScopedCurrent.jellyfinServerId,
        };
    }

    if (!bearerParsed.scoped && await comparePluginApiKey(bearerParsed.rawKey, currentKeyHash)) {
        return {
            authorized: true,
            usedPreviousKey: false,
            autoRotated,
            scopeServerId: null,
        };
    }

    if (!headerParsed.scoped && await comparePluginApiKey(headerParsed.rawKey, currentKeyHash)) {
        return {
            authorized: true,
            usedPreviousKey: false,
            autoRotated,
            scopeServerId: null,
        };
    }

    if (!isPreviousPluginKeyValid(snapshot) || !previousKeyHash) {
        return { authorized: false, usedPreviousKey: false, autoRotated, scopeServerId: null };
    }

    const bearerScopedPrevious = verifyScopedPluginApiKey(bearerParsed.scopedToken, previousKeyHash);
    if (bearerScopedPrevious.valid) {
        return {
            authorized: true,
            usedPreviousKey: true,
            autoRotated,
            scopeServerId: bearerScopedPrevious.jellyfinServerId,
        };
    }

    const headerScopedPrevious = verifyScopedPluginApiKey(headerParsed.scopedToken, previousKeyHash);
    if (headerScopedPrevious.valid) {
        return {
            authorized: true,
            usedPreviousKey: true,
            autoRotated,
            scopeServerId: headerScopedPrevious.jellyfinServerId,
        };
    }

    if (!bearerParsed.scoped && await comparePluginApiKey(bearerParsed.rawKey, previousKeyHash)) {
        return {
            authorized: true,
            usedPreviousKey: true,
            autoRotated,
            scopeServerId: null,
        };
    }

    if (!headerParsed.scoped && await comparePluginApiKey(headerParsed.rawKey, previousKeyHash)) {
        return {
            authorized: true,
            usedPreviousKey: true,
            autoRotated,
            scopeServerId: null,
        };
    }

    return { authorized: false, usedPreviousKey: false, autoRotated, scopeServerId: null };
}
