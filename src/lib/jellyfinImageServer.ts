import "server-only";

import prisma from "@/lib/prisma";
import { buildJellyfinApiKeyHeaders, buildJellyfinImageHeaders } from "@/lib/jellyfinServers";
import { compactJellyfinId, normalizeJellyfinId } from "@/lib/jellyfinId";

type JellyfinConnection = {
    baseUrl: string;
    apiKey: string;
};

function normalizeUrl(value: string | null | undefined): string {
    return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeApiKey(value: string | null | undefined): string | null {
    const trimmed = String(value || "").trim();
    return trimmed.length > 0 ? trimmed : null;
}

export async function resolveJellyfinConnection(serverId?: string | null): Promise<JellyfinConnection | null> {
    const envBaseUrl = normalizeUrl(process.env.JELLYFIN_URL);
    const envApiKey = normalizeApiKey(process.env.JELLYFIN_API_KEY);

    if (serverId) {
        try {
            const server = await prisma.server.findFirst({
                where: {
                    OR: [
                        { id: serverId },
                        { jellyfinServerId: serverId },
                    ],
                },
                select: { url: true, jellyfinApiKey: true, jellyfinServerId: true },
            });

            if (server) {
                const serverApiKey = normalizeApiKey(server.jellyfinApiKey) || envApiKey;
                const baseUrl = normalizeUrl(server.url) || envBaseUrl;
                if (baseUrl && serverApiKey) {
                    return { baseUrl, apiKey: serverApiKey };
                }
            }
        } catch {
            // DB lookup failed or stub active
        }
    }

    if (envBaseUrl && envApiKey) {
        return { baseUrl: envBaseUrl, apiKey: envApiKey };
    }

    // Fallback: look up primary or active server in database
    try {
        const dbServer = await prisma.server.findFirst({
            where: { isActive: true },
            orderBy: { createdAt: "asc" },
            select: { url: true, jellyfinApiKey: true },
        });
        if (dbServer) {
            const baseUrl = normalizeUrl(dbServer.url) || envBaseUrl;
            const apiKey = normalizeApiKey(dbServer.jellyfinApiKey) || envApiKey;
            if (baseUrl && apiKey) {
                return { baseUrl, apiKey };
            }
        }
    } catch {
        // DB not available or stub
    }

    return null;
}

export async function fetchJellyfinImage(
    itemId: string,
    type: string,
    serverId?: string | null,
    noStore = false,
    options?: { fillWidth?: number; quality?: number; tag?: string }
): Promise<Response> {
    const connection = await resolveJellyfinConnection(serverId);

    if (!connection) {
        throw new Error("JELLYFIN_URL ou JELLYFIN_API_KEY non configurées dans les variables d'environnement.");
    }

    const fillWidth = options?.fillWidth ?? 300;
    const quality = options?.quality ?? 80;
    const tagParam = options?.tag ? `&tag=${encodeURIComponent(options.tag)}` : "";
    const headers = buildJellyfinImageHeaders(connection.apiKey);

    const candidateIds = Array.from(new Set([
        itemId,
        compactJellyfinId(itemId),
        normalizeJellyfinId(itemId) || itemId,
    ]));

    for (const candidateId of candidateIds) {
        // Primary attempt: standard Items image path with API key in query and headers
        const url = `${connection.baseUrl}/Items/${encodeURIComponent(candidateId)}/Images/${encodeURIComponent(type)}?fillWidth=${fillWidth}&quality=${quality}&api_key=${encodeURIComponent(connection.apiKey)}${tagParam}`;
        try {
            const res = await fetch(url, {
                method: "GET",
                headers,
                cache: "no-store",
            });
            if (res.ok) {
                return res;
            }
        } catch {
            // Try next candidate
        }

        // Secondary attempt: Users image path if it could be a user profile image
        if (type === "Primary") {
            const userUrl = `${connection.baseUrl}/Users/${encodeURIComponent(candidateId)}/Images/Primary?fillWidth=${fillWidth}&quality=${quality}&api_key=${encodeURIComponent(connection.apiKey)}`;
            try {
                const userRes = await fetch(userUrl, {
                    method: "GET",
                    headers,
                    cache: "no-store",
                });
                if (userRes.ok) {
                    return userRes;
                }
            } catch {
                // Ignore
            }
        }
    }

    // Return last response or 404
    const defaultUrl = `${connection.baseUrl}/Items/${encodeURIComponent(itemId)}/Images/${encodeURIComponent(type)}?fillWidth=${fillWidth}&quality=${quality}`;
    return fetch(defaultUrl, {
        method: "GET",
        headers,
        cache: "no-store",
    });
}

export async function fetchJellyfinJson<T>(path: string, serverId?: string | null): Promise<T | null> {
    const connection = await resolveJellyfinConnection(serverId);
    if (!connection) return null;

    try {
        const url = `${connection.baseUrl}${path}`;
        const response = await fetch(url, {
            method: "GET",
            headers: buildJellyfinApiKeyHeaders(connection.apiKey),
            cache: "no-store",
        });

        if (!response.ok) return null;
        return await response.json() as T;
    } catch {
        return null;
    }
}

export async function postJellyfinJson<T>(path: string, serverId?: string | null, body?: unknown): Promise<{ ok: boolean; status: number; data: T | null; text: string }> {
    const connection = await resolveJellyfinConnection(serverId);
    if (!connection) {
        return { ok: false, status: 503, data: null, text: "Jellyfin connection is not configured." };
    }

    try {
        const response = await fetch(`${connection.baseUrl}${path}`, {
            method: "POST",
            headers: {
                ...buildJellyfinApiKeyHeaders(connection.apiKey),
                "Content-Type": "application/json",
            },
            body: body === undefined ? undefined : JSON.stringify(body),
            cache: "no-store",
        });

        const text = await response.text();
        let data: T | null = null;
        if (text.trim()) {
            try {
                data = JSON.parse(text) as T;
            } catch {
                data = null;
            }
        }

        return { ok: response.ok, status: response.status, data, text };
    } catch (error) {
        return {
            ok: false,
            status: 502,
            data: null,
            text: error instanceof Error ? error.message : "Jellyfin request failed.",
        };
    }
}
