export async function register() {
    // Allow skipping background instrumentation for local/dev without DB
    if (process.env.SKIP_INSTRUMENTATION === '1' || process.env.SKIP_INSTRUMENTATION === 'true') {
        console.log("[Instrumentation] SKIP_INSTRUMENTATION set — skipping background tasks.");
        return;
    }

    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { initCronJobs } = await import('@/server/cronManager');
        const prisma = (await import('@/lib/prisma')).default;
        const { cleanupOrphanedSessions } = await import('@/lib/cleanup');

        console.log("[Instrumentation] Démarrage des tâches de fond...");

        // Initial cleanup of orphaned sessions on startup
        cleanupOrphanedSessions().catch(err => console.error("[Instrumentation] Initial cleanup error:", err));

        // Lire la planification des tâches depuis la BDD
        let syncCronHour = 3, syncCronMinute = 0, backupCronHour = 3, backupCronMinute = 30;
        try {
            const settings = await prisma.globalSettings.findUnique({ where: { id: "global" } });
            if (settings) {
                syncCronHour = settings.syncCronHour ?? 3;
                syncCronMinute = settings.syncCronMinute ?? 0;
                backupCronHour = settings.backupCronHour ?? 3;
                backupCronMinute = settings.backupCronMinute ?? 30;
            }
        } catch (err) {
            console.warn("[Instrumentation] Impossible de lire les paramètres cron, utilisation des valeurs par défaut:", err);
        }

        // Initialiser les tâches cron avec la planification configurée
        await initCronJobs({ syncCronHour, syncCronMinute, backupCronHour, backupCronMinute });
    }
}
