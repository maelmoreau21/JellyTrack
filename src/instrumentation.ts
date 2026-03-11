export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { startMonitoring } = await import('@/server/monitor');
        const { initCronJobs } = await import('@/server/cronManager');
        const prisma = (await import('@/lib/prisma')).default;

        console.log("[Instrumentation] DÃ©marrage des tÃ¢ches de fond...");

        // DÃ©marrer la boucle de monitoring "ZÃ©ro Configuration" (polling adaptatif)
        await startMonitoring();

        // Lire la planification des tÃ¢ches depuis la BDD
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
            console.warn("[Instrumentation] Impossible de lire les paramÃ¨tres cron, utilisation des valeurs par dÃ©faut:", err);
        }

        // Initialiser les tÃ¢ches cron avec la planification configurÃ©e
        await initCronJobs({ syncCronHour, syncCronMinute, backupCronHour, backupCronMinute });
    }
}
