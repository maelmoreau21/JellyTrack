/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Reads geographical information from an IP.
 * Executed only on the native Node.js server side.
 */
export function getGeoLocation(ip: string | null | undefined) {
    if (!ip) return { country: "Unknown", city: "Unknown" };

    // Prevent Next.js from resolving `geoip-country` fs lookups during static build.
    if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE === "phase-production-build") {
        return { country: "Unknown", city: "Unknown" };
    }

    try {
        // Deferred loading to bypass Next.js static build analysis "ENOENT data" checks
        const geoip = require("geoip-country");

        const lookup = geoip.lookup(ip);
        if (lookup) {
            return {
                country: lookup.country || "Unknown",
                city: lookup.city || "Unknown"
            };
        }
    } catch (e: unknown) {
        if (e && typeof e === 'object') {
            const err = e as { code?: unknown; message?: unknown };
            if (err.code === 'ENOENT' || (typeof err.message === 'string' && err.message.includes('ENOENT'))) {
                // Silencing the warning to prevent console spam. Unresolved geoip will naturally fallback to Unknown.
            } else {
                console.error("GeoIP lookup failed:", (err.message as any) || err);
            }
        } else {
            console.error("GeoIP lookup failed:", e);
        }
    }

    return { country: "Unknown", city: "Unknown" };
}
