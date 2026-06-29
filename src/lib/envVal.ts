/**
 * Validates critical environment variables at startup in production mode.
 * Halts the process with a clear error screen if defaults/placeholders are used.
 */
export function validateEnv() {
    // Only run validation in production runtime
    if (process.env.NODE_ENV !== "production") {
        return;
    }

    // Skip validation during Next.js build / pre-rendering phase
    if (process.env.NEXT_PHASE === "phase-production-build") {
        return;
    }

    const required = [
        { key: "NEXTAUTH_SECRET", placeholder: "CHANGE_ME" },
        { key: "JELLYFIN_API_KEY", placeholder: "CHANGE_ME" },
        { key: "ADMIN_PASSWORD", placeholder: "CHANGE_ME" },
        { key: "JELLYFIN_WEBHOOK_SECRET", placeholder: "CHANGE_ME" },
        { key: "PLUGIN_KEY_PEPPER", placeholder: "CHANGE_ME" },
    ];

    const invalidVars: string[] = [];

    for (const req of required) {
        const val = process.env[req.key];
        if (!val || val.trim() === "" || val.includes(req.placeholder)) {
            invalidVars.push(req.key);
        }
    }

    if (invalidVars.length > 0) {
        console.error("\n=======================================================");
        console.error("🔴 CRITICAL CONFIGURATION ERROR");
        console.error("-------------------------------------------------------");
        console.error("The following required environment variables are either");
        console.error("missing or set to default placeholder values:");
        invalidVars.forEach((key) => {
            console.error(`   - ${key}`);
        });
        console.error("-------------------------------------------------------");
        console.error("Please configure these variables with secure values");
        console.error("before starting JellyTrack in production.");
        console.error("=======================================================\n");
        process.exit(1);
    }
}
