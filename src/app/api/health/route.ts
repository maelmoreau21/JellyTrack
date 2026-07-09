import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import redis from "@/lib/redis";
import { getConfiguredJellyfinServers, fetchJellyfinSystemInfo, resolveServerApiKey } from "@/lib/jellyfinServers";
import { requireAdmin, isAuthError } from "@/lib/auth";

export const dynamic = "force-dynamic";

function redactUrlCredentials(str: string): string {
    return str.replace(/([a-zA-Z+.-]+:\/\/)([^@/]+)(@)/g, (match, protocol, credentials, at) => {
        return `${protocol}[REDACTED]${at}`;
    });
}

function sanitizeError(msg: string, secrets: Set<string>): string {
    let sanitized = redactUrlCredentials(msg);
    for (const secret of secrets) {
        if (secret && secret.length >= 4) {
            const escaped = secret.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const regex = new RegExp(escaped, 'g');
            sanitized = sanitized.replace(regex, '[REDACTED]');
        }
    }
    return sanitized;
}

export async function GET() {
    let dbStatus = "up";
    let redisStatus = "up";
    let jellyfinStatus = "up";
    let status = "up";
    const errors: Record<string, string> = {};
    const jellyfinServersStatus: Record<string, string> = {};
    const secretsToMask = new Set<string>();

    // Collect environment variable secrets
    for (const [key, value] of Object.entries(process.env)) {
        if (!value) continue;
        const lowerKey = key.toLowerCase();
        if (
            lowerKey.includes("password") ||
            lowerKey.includes("secret") ||
            lowerKey.includes("key") ||
            lowerKey.includes("token") ||
            lowerKey.includes("url")
        ) {
            if (value.length >= 4 && value !== "true" && value !== "false") {
                secretsToMask.add(value);
            }
        }
    }

    try {
        // Test database connection — use $queryRaw when available (real Prisma client),
        // otherwise fall back to a simple findFirst (dev stub / mock).
        const p = prisma as any;
        if (typeof p.$queryRaw === 'function') {
            await p.$queryRaw`SELECT 1`;
        } else {
            // Fallback for prisma mock / stub
            await prisma.globalSettings.findFirst();
        }
    } catch (e: unknown) {
        dbStatus = "down";
        status = "down";
        errors.database = e instanceof Error ? e.message : String(e);
    }

    try {
        // Test Redis connection
        await redis.get("health_ping");
    } catch (e: unknown) {
        redisStatus = "down";
        status = "down";
        errors.redis = e instanceof Error ? e.message : String(e);
    }

    // Only attempt to check Jellyfin if DB is working (needed to fetch servers)
    if (dbStatus === "up") {
        try {
            const servers = await getConfiguredJellyfinServers();
            if (servers.length === 0) {
                jellyfinStatus = "no_servers_configured";
            } else {
                const primaryEnvApiKey = process.env.JELLYFIN_API_KEY;

                // Collect server API keys to mask them
                servers.forEach((server) => {
                    if (server.apiKey) {
                        secretsToMask.add(server.apiKey);
                    }
                    const resolvedApiKey = resolveServerApiKey(server, primaryEnvApiKey);
                    if (resolvedApiKey) {
                        secretsToMask.add(resolvedApiKey);
                    }
                });

                const results = await Promise.all(
                    servers.map(async (server) => {
                        const apiKey = resolveServerApiKey(server, primaryEnvApiKey);
                        if (!apiKey) {
                            return { id: server.id, name: server.name, reachable: false };
                        }
                        const info = await fetchJellyfinSystemInfo({ url: server.url, apiKey });
                        return {
                            id: server.id,
                            name: server.name,
                            reachable: !!info,
                        };
                    })
                );

                const unreachableCount = results.filter((r) => !r.reachable).length;
                if (unreachableCount === servers.length) {
                    jellyfinStatus = "down";
                    status = "down";
                    errors.jellyfin = "All configured Jellyfin servers are unreachable.";
                } else if (unreachableCount > 0) {
                    jellyfinStatus = "degraded";
                }

                results.forEach((r) => {
                    jellyfinServersStatus[r.name || r.id] = r.reachable ? "up" : "down";
                });
            }
        } catch (e: unknown) {
            jellyfinStatus = "down";
            status = "down";
            errors.jellyfin = e instanceof Error ? e.message : String(e);
        }
    } else {
        jellyfinStatus = "unknown (db down)";
    }

    // Check if the caller is an authenticated admin
    const auth = await requireAdmin().catch(() => null);
    const isAdmin = auth !== null && !isAuthError(auth);

    const cacheHeaders = {
        "Cache-Control": "no-store, max-age=0",
        "Pragma": "no-cache",
    };

    if (!isAdmin) {
        // Public response: minimal status and HTTP code, nothing else.
        return NextResponse.json(
            { status },
            {
                status: status === "up" ? 200 : 503,
                headers: cacheHeaders,
            }
        );
    }

    // Admin response: detailed report with sanitized error messages.
    const uptime = process.uptime();
    const sanitizedErrors: Record<string, string> = {};
    for (const [key, val] of Object.entries(errors)) {
        sanitizedErrors[key] = sanitizeError(val, secretsToMask);
    }

    return NextResponse.json(
        {
            status,
            timestamp: new Date().toISOString(),
            uptime,
            services: {
                database: dbStatus,
                redis: redisStatus,
                jellyfin: jellyfinStatus,
            },
            jellyfinServers: Object.keys(jellyfinServersStatus).length > 0 ? jellyfinServersStatus : undefined,
            errors: Object.keys(sanitizedErrors).length > 0 ? sanitizedErrors : undefined,
        },
        {
            status: status === "up" ? 200 : 503,
            headers: cacheHeaders,
        }
    );
}

