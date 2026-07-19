import { Redis } from "ioredis";

type ValkeyLike = Pick<Redis, "get" | "setex" | "del" | "keys" | "ttl" | "incr" | "expire">;

function createNoopValkey(): ValkeyLike {
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

function createValkeyClient(): ValkeyLike {
    // Read VALKEY_URL with fallback to REDIS_URL
    const valkeyUrl = (process.env.VALKEY_URL || process.env.REDIS_URL)?.trim();

    // In local builds/tests without Valkey/Redis configured, keep app behavior predictable.
    if (!valkeyUrl) {
        return createNoopValkey();
    }

    // Valkey is wire-compatible with Redis. ioredis connects via redis:// or rediss://.
    // If a user specified valkey:// scheme, rewrite to redis:// for ioredis compatibility.
    const parsedUrl = valkeyUrl.replace(/^valkey:\/\//i, "redis://").replace(/^valkeys:\/\//i, "rediss://");

    const client = new Redis(parsedUrl, {
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
    });

    // Prevent noisy "Unhandled error event" logs when Valkey/Redis is unreachable.
    client.on("error", () => {
        // Intentionally silent. Call sites already handle connection failures.
    });

    return client;
}

declare global {
    var valkeyGlobal: undefined | ValkeyLike;
}

const valkey = globalThis.valkeyGlobal ?? createValkeyClient();

if (process.env.NODE_ENV !== "production") {
    globalThis.valkeyGlobal = valkey;
}

export default valkey;
