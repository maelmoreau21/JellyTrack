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

    const requiredGroups = [
        {
            name: "NEXTAUTH_SECRET (or AUTH_SECRET / JELLYTRACK_SECRET)",
            keys: ["NEXTAUTH_SECRET", "AUTH_SECRET", "JELLYTRACK_SECRET"],
            placeholder: "CHANGE_ME",
        },
        {
            name: "JELLYFIN_API_KEY (or JELLYTRACK_JELLYFIN_API_KEY)",
            keys: ["JELLYFIN_API_KEY", "JELLYTRACK_JELLYFIN_API_KEY"],
            placeholder: "CHANGE_ME",
        },
        {
            name: "JELLYFIN_WEBHOOK_SECRET (or JELLYTRACK_WEBHOOK_SECRET)",
            keys: ["JELLYFIN_WEBHOOK_SECRET", "JELLYTRACK_WEBHOOK_SECRET"],
            placeholder: "CHANGE_ME",
        },
    ];

    const invalidVars: string[] = [];

    for (const group of requiredGroups) {
        const isValid = group.keys.some((key) => {
            const val = process.env[key];
            return Boolean(val && val.trim() !== "" && !val.includes(group.placeholder));
        });
        if (!isValid) {
            invalidVars.push(group.name);
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
