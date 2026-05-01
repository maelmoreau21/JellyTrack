type ResolvedAuthSecret = {
    value: string;
    source: "NEXTAUTH_SECRET" | "AUTH_SECRET" | "derived";
};

const INVALID_SECRET_VALUES = new Set([
    "",
    "build-placeholder",
    "your-generated-random-secret",
    "changeme",
    "change-me",
    "default",
]);

const INVALID_SECRET_PATTERNS = [
    /^change[_-]?me(?:[_-].*)?$/i,
    /^your[_-].*$/i,
    /^example(?:[_-].*)?$/i,
    /placeholder/i,
];

let cachedSecret: ResolvedAuthSecret | null = null;
let warnedAboutDerivedSecret = false;

function normalizeSecret(value: string | undefined) {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (INVALID_SECRET_VALUES.has(trimmed.toLowerCase())) return null;
    if (INVALID_SECRET_PATTERNS.some((pattern) => pattern.test(trimmed))) return null;
    return trimmed;
}

function buildDerivedSecret() {
    const entropyParts = [
        process.env.JELLYFIN_API_KEY,
        process.env.ADMIN_PASSWORD,
        process.env.DATABASE_URL,
        process.env.JELLYFIN_URL,
        process.env.NEXTAUTH_URL,
        process.env.HOSTNAME,
        process.env.PORT,
    ].filter((value): value is string => Boolean(value && value.trim()));

    const seed = entropyParts.length > 0
        ? entropyParts.join("|")
        : "JellyTrack|standalone|fallback-secret";

    const hashFragment = (input: string, salt: string) => {
        let hash = 2166136261;
        const value = `${salt}|${input}`;

        for (let index = 0; index < value.length; index++) {
            hash ^= value.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }

        return (hash >>> 0).toString(36).padStart(7, "0");
    };

    return [
        "jt",
        hashFragment(seed, "a"),
        hashFragment(seed, "b"),
        hashFragment(seed, "c"),
        hashFragment(seed, "d"),
    ].join("-");
}

export function getResolvedAuthSecret() {
    if (cachedSecret) {
        return cachedSecret;
    }

    const nextAuthSecret = normalizeSecret(process.env.NEXTAUTH_SECRET);
    if (nextAuthSecret) {
        cachedSecret = { value: nextAuthSecret, source: "NEXTAUTH_SECRET" };
        return cachedSecret;
    }

    const authSecret = normalizeSecret(process.env.AUTH_SECRET);
    if (authSecret) {
        cachedSecret = { value: authSecret, source: "AUTH_SECRET" };
        return cachedSecret;
    }

    const isProduction = process.env.NODE_ENV === "production";
    const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

    // Production runtime must have an explicit secret to avoid accidental weak deployments.
    if (isProduction && !isBuildPhase) {
        throw new Error("[Auth] NEXTAUTH_SECRET (ou AUTH_SECRET) est obligatoire en production runtime.");
    }

    const derivedSecret = buildDerivedSecret();
    cachedSecret = { value: derivedSecret, source: "derived" };

    if (!isBuildPhase && !warnedAboutDerivedSecret) {
        warnedAboutDerivedSecret = true;
        console.warn("[Auth] NEXTAUTH_SECRET/AUTH_SECRET absent ou invalide. Secret derive utilise (mode non-production).");
    }

    return cachedSecret;
}
