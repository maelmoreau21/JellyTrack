import valkey from "@/lib/valkey";

/**
 * Simple Valkey-based rate limiter for login attempts.
 * Blocks an IP after MAX_ATTEMPTS failed logins within WINDOW_SECONDS.
 * 
 * Usage in NextAuth authorize():
 *   const { allowed, remaining } = await checkLoginRateLimit(ip);
 *   if (!allowed) throw new Error("Trop de tentatives...");
 */

const MAX_ATTEMPTS = 5;           // Max failed attempts per window
const WINDOW_SECONDS = 15 * 60;   // 15-minute sliding window
const BLOCK_SECONDS = 15 * 60;    // Block duration after max attempts
const hasValkeyUrl = Boolean((process.env.VALKEY_URL || process.env.REDIS_URL)?.trim());

type InMemoryLoginState = {
    attempts: number;
    expiresAtMs: number;
};

const inMemoryLoginRate = new Map<string, InMemoryLoginState>();

export function resolveRateLimitIdentifier(ip: string, username?: string): string {
    const cleanIp = String(ip || "").trim().toLowerCase();
    const cleanUser = String(username || "").trim().toLowerCase();

    if (cleanIp && cleanIp !== "unknown") {
        return cleanIp;
    }

    if (cleanUser) {
        return `user:${cleanUser}`;
    }

    return "unknown";
}

function getKey(identifier: string): string {
    return `ratelimit:login:${identifier}`;
}

function getInMemoryState(identifier: string): InMemoryLoginState | null {
    const key = getKey(identifier);
    const state = inMemoryLoginRate.get(key);
    if (!state) return null;

    if (state.expiresAtMs <= Date.now()) {
        inMemoryLoginRate.delete(key);
        return null;
    }

    return state;
}

function checkInMemoryRate(identifier: string): { allowed: boolean; remaining: number; retryAfterSeconds?: number } {
    const state = getInMemoryState(identifier);
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

function recordInMemoryFailure(identifier: string): void {
    const key = getKey(identifier);
    const state = getInMemoryState(identifier);
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

function resetInMemoryRate(identifier: string): void {
    inMemoryLoginRate.delete(getKey(identifier));
}

export async function checkLoginRateLimit(ip: string, username?: string): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds?: number }> {
    const identifier = resolveRateLimitIdentifier(ip, username);
    if (!hasValkeyUrl) {
        return checkInMemoryRate(identifier);
    }

    const key = getKey(identifier);

    try {
        const current = await valkey.get(key);
        const attempts = current ? parseInt(current, 10) : 0;

        if (attempts >= MAX_ATTEMPTS) {
            const ttl = await valkey.ttl(key);
            return { allowed: false, remaining: 0, retryAfterSeconds: ttl > 0 ? ttl : BLOCK_SECONDS };
        }

        return { allowed: true, remaining: MAX_ATTEMPTS - attempts };
    } catch (error) {
        console.error("[RateLimit] Valkey error, using in-memory fallback:", error);
        return checkInMemoryRate(identifier);
    }
}

export async function recordFailedLogin(ip: string, username?: string): Promise<void> {
    const identifier = resolveRateLimitIdentifier(ip, username);
    if (!hasValkeyUrl) {
        recordInMemoryFailure(identifier);
        return;
    }

    const key = getKey(identifier);
    try {
        const count = await valkey.incr(key);
        if (count === 1) {
            // First attempt — set the expiry window
            await valkey.expire(key, WINDOW_SECONDS);
        }
        // If the user hit the limit, extend the block
        if (count >= MAX_ATTEMPTS) {
            await valkey.expire(key, BLOCK_SECONDS);
        }
    } catch (error) {
        console.error("[RateLimit] Failed to record attempt in Valkey, using in-memory fallback:", error);
        recordInMemoryFailure(identifier);
    }
}

export async function resetLoginRateLimit(ip: string, username?: string): Promise<void> {
    const identifier = resolveRateLimitIdentifier(ip, username);
    if (!hasValkeyUrl) {
        resetInMemoryRate(identifier);
        return;
    }

    try {
        await valkey.del(getKey(identifier));
    } catch (error) {
        console.error("[RateLimit] Failed to reset in Valkey, using in-memory fallback:", error);
        resetInMemoryRate(identifier);
    }
}
