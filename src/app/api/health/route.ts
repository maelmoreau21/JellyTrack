import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import redis from "@/lib/redis";
import { getConfiguredJellyfinServers, fetchJellyfinSystemInfo, resolveServerApiKey } from "@/lib/jellyfinServers";

export const dynamic = "force-dynamic";

export async function GET() {
    let dbStatus = "up";
    let redisStatus = "up";
    let jellyfinStatus = "up";
    let status = "up";
    const errors: Record<string, string> = {};
    const jellyfinServersStatus: Record<string, string> = {};

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

    const uptime = process.uptime();

    return NextResponse.json({
        status,
        timestamp: new Date().toISOString(),
        uptime,
        services: {
            database: dbStatus,
            redis: redisStatus,
            jellyfin: jellyfinStatus,
        },
        jellyfinServers: Object.keys(jellyfinServersStatus).length > 0 ? jellyfinServersStatus : undefined,
        errors: Object.keys(errors).length > 0 ? errors : undefined,
    }, {
        status: status === "up" ? 200 : 503,
        headers: {
            "Cache-Control": "no-store, max-age=0",
            "Pragma": "no-cache",
        },
    });
}

