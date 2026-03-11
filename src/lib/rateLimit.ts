import redis from "@/lib/redis";

/**
 * Simple Redis-based rate limiter for login attempts.
 * Blocks an IP after MAX_ATTEMPTS failed logins within WINDOW_SECONDS.
 * 
 * Usage in NextAuth authorize():
 *   const { allowed, remaining } = await checkLoginRateLimit(ip);
 *   if (!allowed) throw new Error("Trop de tentatives...");
 */

const MAX_ATTEMPTS = 5;           // Max failed attempts per window
const WINDOW_SECONDS = 15 * 60;   // 15-minute sliding window
const BLOCK_SECONDS = 15 * 60;    // Block duration after max attempts

function getKey(identifier: string): string {
    return `ratelimit:login:${identifier}`;
}

export async function checkLoginRateLimit(ip: string): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds?: number }> {
    const key = getKey(ip);

    try {
        const current = await redis.get(key);
        const attempts = current ? parseInt(current, 10) : 0;

        if (attempts >= MAX_ATTEMPTS) {
            const ttl = await redis.ttl(key);
            return { allowed: false, remaining: 0, retryAfterSeconds: ttl > 0 ? ttl : BLOCK_SECONDS };
        }

        return { allowed: true, remaining: MAX_ATTEMPTS - attempts };
    } catch (error) {
        // If Redis is down, allow the request (fail-open to not block legitimate users)
        console.error("[RateLimit] Redis error, failing open:", error);
        return { allowed: true, remaining: MAX_ATTEMPTS };
    }
}

export async function recordFailedLogin(ip: string): Promise<void> {
    const key = getKey(ip);
    try {
        const count = await redis.incr(key);
        if (count === 1) {
            // First attempt â€” set the expiry window
            await redis.expire(key, WINDOW_SECONDS);
        }
        // If the user hit the limit, extend the block
        if (count >= MAX_ATTEMPTS) {
            await redis.expire(key, BLOCK_SECONDS);
        }
    } catch (error) {
        console.error("[RateLimit] Failed to record attempt:", error);
    }
}

export async function resetLoginRateLimit(ip: string): Promise<void> {
    try {
        await redis.del(getKey(ip));
    } catch (error) {
        console.error("[RateLimit] Failed to reset:", error);
    }
}
