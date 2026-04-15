import redis from "@/lib/redis";

const parsedWindow = Number(process.env.PLUGIN_EVENT_RATE_LIMIT_WINDOW_SECONDS);
const parsedMaxEvents = Number(process.env.PLUGIN_EVENT_RATE_LIMIT_MAX);
const hasRedisUrl = Boolean(process.env.REDIS_URL?.trim());

const WINDOW_SECONDS = Number.isFinite(parsedWindow) && parsedWindow > 0 ? parsedWindow : 60;
const MAX_EVENTS = Number.isFinite(parsedMaxEvents) && parsedMaxEvents > 0 ? parsedMaxEvents : 1200;

type InMemoryRateState = {
    count: number;
    resetAtMs: number;
};

const inMemoryPluginRate = new Map<string, InMemoryRateState>();

function getPluginEventsKey(identifier: string): string {
    return `ratelimit:plugin-events:${identifier}`;
}

function consumeInMemory(identifier: string): { allowed: boolean; remaining: number; retryAfterSeconds?: number } {
    const now = Date.now();
    const resetAtMs = now + WINDOW_SECONDS * 1000;
    const existing = inMemoryPluginRate.get(identifier);

    if (!existing || existing.resetAtMs <= now) {
        inMemoryPluginRate.set(identifier, { count: 1, resetAtMs });
        return {
            allowed: true,
            remaining: Math.max(0, MAX_EVENTS - 1),
        };
    }

    existing.count += 1;
    if (existing.count > MAX_EVENTS) {
        return {
            allowed: false,
            remaining: 0,
            retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAtMs - now) / 1000)),
        };
    }

    return {
        allowed: true,
        remaining: Math.max(0, MAX_EVENTS - existing.count),
    };
}

export async function consumePluginEventRateLimit(identifier: string): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds?: number }> {
    if (!hasRedisUrl) {
        return consumeInMemory(identifier);
    }

    const key = getPluginEventsKey(identifier);

    try {
        const count = await redis.incr(key);
        if (count === 1) {
            await redis.expire(key, WINDOW_SECONDS);
        }

        if (count > MAX_EVENTS) {
            const ttl = await redis.ttl(key);
            return {
                allowed: false,
                remaining: 0,
                retryAfterSeconds: ttl > 0 ? ttl : WINDOW_SECONDS,
            };
        }

        return {
            allowed: true,
            remaining: Math.max(0, MAX_EVENTS - count),
        };
    } catch (error) {
        console.error("[PluginRateLimit] Redis error, using in-memory fallback:", error);
        return consumeInMemory(identifier);
    }
}
