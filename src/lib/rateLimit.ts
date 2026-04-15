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
const hasRedisUrl = Boolean(process.env.REDIS_URL?.trim());

type InMemoryLoginState = {
    attempts: number;
    expiresAtMs: number;
};

const inMemoryLoginRate = new Map<string, InMemoryLoginState>();

function getKey(identifier: string): string {
    return `ratelimit:login:${identifier}`;
}

function getInMemoryState(ip: string): InMemoryLoginState | null {
    const key = getKey(ip);
    const state = inMemoryLoginRate.get(key);
    if (!state) return null;

    if (state.expiresAtMs <= Date.now()) {
        inMemoryLoginRate.delete(key);
        return null;
    }

    return state;
}

function checkInMemoryRate(ip: string): { allowed: boolean; remaining: number; retryAfterSeconds?: number } {
    const state = getInMemoryState(ip);
    if (!state) {
        return { allowed: true, remaining: MAX_ATTEMPTS };
    }

    if (state.attempts >= MAX_ATTEMPTS) {
        return {
            allowed: false,
            remaining: 0,
            retryAfterSeconds: Math.max(1, Math.ceil((state.expiresAtMs - Date.now()) / 1000)),
        };
    }

    return {
        allowed: true,
        remaining: Math.max(0, MAX_ATTEMPTS - state.attempts),
    };
}

function recordInMemoryFailure(ip: string): void {
    const key = getKey(ip);
    const state = getInMemoryState(ip);
    const now = Date.now();

    if (!state) {
        inMemoryLoginRate.set(key, {
            attempts: 1,
            expiresAtMs: now + WINDOW_SECONDS * 1000,
        });
        return;
    }

    const nextAttempts = state.attempts + 1;
    state.attempts = nextAttempts;
    if (nextAttempts >= MAX_ATTEMPTS) {
        state.expiresAtMs = now + BLOCK_SECONDS * 1000;
    }
    inMemoryLoginRate.set(key, state);
}

function resetInMemoryRate(ip: string): void {
    inMemoryLoginRate.delete(getKey(ip));
}

export async function checkLoginRateLimit(ip: string): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds?: number }> {
    if (!hasRedisUrl) {
        return checkInMemoryRate(ip);
    }

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
        console.error("[RateLimit] Redis error, using in-memory fallback:", error);
        return checkInMemoryRate(ip);
    }
}

export async function recordFailedLogin(ip: string): Promise<void> {
    if (!hasRedisUrl) {
        recordInMemoryFailure(ip);
        return;
    }

    const key = getKey(ip);
    try {
        const count = await redis.incr(key);
        if (count === 1) {
            // First attempt — set the expiry window
            await redis.expire(key, WINDOW_SECONDS);
        }
        // If the user hit the limit, extend the block
        if (count >= MAX_ATTEMPTS) {
            await redis.expire(key, BLOCK_SECONDS);
        }
    } catch (error) {
        console.error("[RateLimit] Failed to record attempt in Redis, using in-memory fallback:", error);
        recordInMemoryFailure(ip);
    }
}

export async function resetLoginRateLimit(ip: string): Promise<void> {
    if (!hasRedisUrl) {
        resetInMemoryRate(ip);
        return;
    }

    try {
        await redis.del(getKey(ip));
    } catch (error) {
        console.error("[RateLimit] Failed to reset in Redis, using in-memory fallback:", error);
        resetInMemoryRate(ip);
    }
}
