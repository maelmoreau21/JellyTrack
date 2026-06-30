import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import redis from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
    let dbStatus = "up";
    let redisStatus = "up";
    let status = "up";
    const errors: Record<string, string> = {};

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

    const uptime = process.uptime();

    return NextResponse.json({
        status,
        timestamp: new Date().toISOString(),
        uptime,
        services: {
            database: dbStatus,
            redis: redisStatus,
        },
        errors: Object.keys(errors).length > 0 ? errors : undefined,
    }, {
        status: status === "up" ? 200 : 503,
        headers: {
            "Cache-Control": "no-store, max-age=0",
            "Pragma": "no-cache",
        },
    });
}
