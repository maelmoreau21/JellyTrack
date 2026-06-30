import "server-only";

import prisma from "@/lib/prisma";
import { buildJellyfinApiKeyHeaders } from "@/lib/jellyfinServers";
import { getMasterServerIdentityFromEnv } from "@/lib/serverRegistry";

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

async function resolveJellyfinConnection(serverId?: string | null): Promise<JellyfinConnection | null> {
    const envBaseUrl = normalizeUrl(process.env.JELLYFIN_URL);
    const envApiKey = normalizeApiKey(process.env.JELLYFIN_API_KEY);

    if (serverId) {
        const server = await prisma.server.findUnique({
            where: { id: serverId },
            select: { url: true, jellyfinApiKey: true, jellyfinServerId: true },
        });

        if (server) {
            const serverApiKey = normalizeApiKey(server.jellyfinApiKey);
            if (serverApiKey) {
                const baseUrl = normalizeUrl(server.url) || envBaseUrl;
                return baseUrl ? { baseUrl, apiKey: serverApiKey } : null;
            }

            const master = getMasterServerIdentityFromEnv();
            const isPrimaryServer = server.jellyfinServerId === master.jellyfinServerId;
            const baseUrl = isPrimaryServer ? envBaseUrl : "";
            const apiKey = isPrimaryServer ? envApiKey : null;
            if (baseUrl && apiKey) {
                return { baseUrl, apiKey };
            }
        }
    }

    if (!envBaseUrl || !envApiKey) return null;
    return { baseUrl: envBaseUrl, apiKey: envApiKey };
}

export async function fetchJellyfinImage(itemId: string, type: string, serverId?: string | null, noStore = false) {
    const connection = await resolveJellyfinConnection(serverId);

    if (!connection) {
        throw new Error("JELLYFIN_URL ou JELLYFIN_API_KEY non configurées dans les variables d'environnement.");
    }

    const url = `${connection.baseUrl}/Items/${encodeURIComponent(itemId)}/Images/${encodeURIComponent(type)}?fillWidth=300&quality=80`;

    return fetch(url, {
        method: "GET",
        headers: buildJellyfinApiKeyHeaders(connection.apiKey),
        ...(noStore ? { cache: "no-store" as const } : { next: { revalidate: 2592000 } }),
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
            next: { revalidate: 3600 },
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
