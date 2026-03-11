/**
 * Lit les informations gÃ©ographiques depuis une IP.
 * ExÃ©cutÃ© uniquement cÃ´tÃ© serveur Node.js natif.
 */
export function getGeoLocation(ip: string | null | undefined) {
    if (!ip) return { country: "Unknown", city: "Unknown" };

    // Prevent Next.js from resolving `geoip-country` fs lookups during static build.
    if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE === "phase-production-build") {
        return { country: "Unknown", city: "Unknown" };
    }

    try {
        // Chargement diffÃ©rÃ© pour esquiver l'analyse statique Next.js "ENOENT data" du Build
        const geoip = require("geoip-country");

        const lookup = geoip.lookup(ip);
        if (lookup) {
            return {
                country: lookup.country || "Unknown",
                city: lookup.city || "Unknown"
            };
        }
    } catch (e: any) {
        if (e.code === 'ENOENT' || e.message?.includes('ENOENT')) {
            // Silencing the warning to prevent console spam. Unresolved geoip will naturally fallback to Unknown.
        } else {
            console.error("GeoIP lookup failed:", e.message || e);
        }
    }

    return { country: "Unknown", city: "Unknown" };
}
