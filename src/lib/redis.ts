import { Redis } from "ioredis";

type RedisLike = Pick<Redis, "get" | "setex" | "del" | "keys" | "ttl" | "incr" | "expire">;

function createNoopRedis(): RedisLike {
    return {
        async get() {
            return null;
        },
        async setex() {
            return "OK";
        },
        async del() {
            return 0;
        },
        async keys() {
            return [];
        },
        async ttl() {
            return -1;
        },
        async incr() {
            return 1;
        },
        async expire() {
            return 1;
        },
    };
}

function createRedisClient(): RedisLike {
    const redisUrl = process.env.REDIS_URL?.trim();

    // In local builds/tests without Redis configured, keep app behavior predictable.
    if (!redisUrl) {
        return createNoopRedis();
    }

    const client = new Redis(redisUrl, {
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
    });

    // Prevent noisy "Unhandled error event" logs when Redis is unreachable.
    client.on("error", () => {
        // Intentionally silent. Call sites already handle Redis failures.
    });

    return client;
}

declare global {
    var redisGlobal: undefined | RedisLike;
}

const redis = globalThis.redisGlobal ?? createRedisClient();

if (process.env.NODE_ENV !== "production") {
    globalThis.redisGlobal = redis;
}

export default redis;
