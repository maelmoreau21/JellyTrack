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
        const { normalizeSchedulerIntervals, DEFAULT_SCHEDULER_INTERVALS } = await import('@/lib/schedulerIntervals');

        console.log("[Instrumentation] Starting background tasks...");

        // Initial cleanup of orphaned sessions on startup
        cleanupOrphanedSessions().catch(err => console.error("[Instrumentation] Initial cleanup error:", err));

        // Read task schedule from the database
        let syncCronHour = 3, syncCronMinute = 0, backupCronHour = 3, backupCronMinute = 30;
        let recentSyncEveryHours = DEFAULT_SCHEDULER_INTERVALS.recentSyncEveryHours;
        let fullSyncEveryHours = DEFAULT_SCHEDULER_INTERVALS.fullSyncEveryHours;
        let backupEveryHours = DEFAULT_SCHEDULER_INTERVALS.backupEveryHours;
        try {
            const settings = await prisma.globalSettings.findUnique({ where: { id: "global" } });
            if (settings) {
                syncCronHour = settings.syncCronHour ?? 3;
                syncCronMinute = settings.syncCronMinute ?? 0;
                backupCronHour = settings.backupCronHour ?? 3;
                backupCronMinute = settings.backupCronMinute ?? 30;

                const rawResolution = settings.resolutionThresholds;
                const resolutionObj = rawResolution && typeof rawResolution === 'object'
                    ? (rawResolution as Record<string, unknown>)
                    : null;
                const schedulerIntervals = normalizeSchedulerIntervals(resolutionObj?.schedulerIntervals);
                recentSyncEveryHours = schedulerIntervals.recentSyncEveryHours;
                fullSyncEveryHours = schedulerIntervals.fullSyncEveryHours;
                backupEveryHours = schedulerIntervals.backupEveryHours;
            }
        } catch (err) {
            console.warn("[Instrumentation] Unable to read cron settings, using defaults:", err);
        }

        // Initialize cron tasks with configured schedule
        await initCronJobs({
            syncCronHour,
            syncCronMinute,
            backupCronHour,
            backupCronMinute,
            recentSyncEveryHours,
            fullSyncEveryHours,
            backupEveryHours,
        });
    }
}
