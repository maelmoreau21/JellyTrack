import type { ScheduledTask } from 'node-cron';
import { logger } from '@/lib/logger';

let recentSyncTask: ScheduledTask | null = null;
let fullSyncTask: ScheduledTask | null = null;
let backupTask: ScheduledTask | null = null;
let logCleanupTask: ScheduledTask | null = null;
let integrityCheckTask: ScheduledTask | null = null;

interface CronSchedule {
    syncCronHour: number;
    syncCronMinute: number;
    backupCronHour: number;
    backupCronMinute: number;
    recentSyncEveryHours: number;
    fullSyncEveryHours: number;
    backupEveryHours: number;
    integrityCheckEveryHours?: number;
    logRetentionDays?: number;
}

function clampHour(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.min(23, Math.max(0, Math.floor(value)));
}

function clampMinute(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.min(59, Math.max(0, Math.floor(value)));
}

function buildEveryHoursCron(everyHours: number, anchorHour: number, minute: number): string {
    const safeMinute = clampMinute(minute);
    const safeHour = clampHour(anchorHour);
    const normalized = Number.isFinite(everyHours) ? Math.floor(everyHours) : 24;

    if (normalized <= 1) return `${safeMinute} * * * *`;
    if (normalized < 24) return `${safeMinute} */${normalized} * * *`;
    if (normalized === 24) return `${safeMinute} ${safeHour} * * *`;
    if (normalized % 24 === 0) {
        const dayStep = Math.max(1, Math.floor(normalized / 24));
        return `${safeMinute} ${safeHour} */${dayStep} * *`;
    }

    // Fallback for non-standard values > 24h.
    return `${safeMinute} */12 * * *`;
}

export async function initCronJobs(schedule: CronSchedule) {
    const cron = (await import('node-cron')).default;
    const { syncJellyfinLibrary } = await import('@/lib/sync');
    const { performAutoBackup } = await import('@/lib/autoBackup');
    const { cleanupOldSystemLogs } = await import('@/lib/systemLogger');
    const { cleanupOrphanedSessions } = await import('@/lib/cleanup');

    const recentSyncCronExpr = buildEveryHoursCron(
        schedule.recentSyncEveryHours,
        schedule.syncCronHour,
        schedule.syncCronMinute
    );
    const fullSyncCronExpr = buildEveryHoursCron(
        schedule.fullSyncEveryHours,
        schedule.syncCronHour,
        schedule.syncCronMinute
    );
    const backupCronExpr = buildEveryHoursCron(
        schedule.backupEveryHours,
        schedule.backupCronHour,
        schedule.backupCronMinute
    );
    const integrityCheckHours = schedule.integrityCheckEveryHours ?? 6;
    const integrityCronExpr = buildEveryHoursCron(
        integrityCheckHours,
        schedule.syncCronHour,
        schedule.syncCronMinute
    );

    logger.info({ recentSyncCronExpr, recentSyncEveryHours: schedule.recentSyncEveryHours }, `[CronManager] Scheduling recent sync`);
    logger.info({ fullSyncCronExpr, fullSyncEveryHours: schedule.fullSyncEveryHours }, `[CronManager] Scheduling full sync`);
    logger.info({ backupCronExpr, backupCronHour: schedule.backupCronHour, backupCronMinute: schedule.backupCronMinute }, `[CronManager] Scheduling backup`);
    logger.info({ integrityCronExpr, integrityCheckEveryHours: integrityCheckHours }, `[CronManager] Scheduling integrity check`);
    cleanupOldSystemLogs(schedule.logRetentionDays ?? 30).catch(() => null);

    systemLog.info("CronManager", `Planification active : Sync récente (toutes les ${schedule.recentSyncEveryHours}h), Sync complète (toutes les ${schedule.fullSyncEveryHours}h), Backup (toutes les ${schedule.backupEveryHours}h), Intégrité (toutes les ${integrityCheckHours}h)`);

    recentSyncTask = cron.schedule(recentSyncCronExpr, async () => {
        logger.info({ recentSyncEveryHours: schedule.recentSyncEveryHours }, `[Cron] Automatic trigger of recent synchronization`);
        systemLog.info("Cron", "Déclenchement automatique de la synchronisation récente");
        try {
            const result = await syncJellyfinLibrary({ recentOnly: true });
            if (!result?.success) {
                logger.warn({ err: result?.error }, `[Cron] Recent synchronization failed`);
                systemLog.warn("Cron", `Échec de la synchronisation récente : ${result?.error || 'Erreur inconnue'}`);
            } else {
                systemLog.info("Cron", "Synchronisation récente terminée avec succès");
            }
        } catch (error) {
            logger.error({ err: error }, "[Cron] Unhandled error during recent synchronization");
            systemLog.error("Cron", `Erreur non gérée lors de la synchronisation récente : ${error instanceof Error ? error.message : String(error)}`);
        }
    });

    fullSyncTask = cron.schedule(fullSyncCronExpr, async () => {
        logger.info({ fullSyncEveryHours: schedule.fullSyncEveryHours }, `[Cron] Automatic trigger of full synchronization`);
        systemLog.info("Cron", "Déclenchement automatique de la synchronisation complète");
        try {
            const result = await syncJellyfinLibrary({ recentOnly: false });
            if (!result?.success) {
                logger.warn({ err: result?.error }, `[Cron] Full synchronization failed`);
                systemLog.warn("Cron", `Échec de la synchronisation complète : ${result?.error || 'Erreur inconnue'}`);
            } else {
                systemLog.info("Cron", "Synchronisation complète terminée avec succès");
            }
        } catch (error) {
            logger.error({ err: error }, "[Cron] Unhandled error during full synchronization");
            systemLog.error("Cron", `Erreur non gérée lors de la synchronisation complète : ${error instanceof Error ? error.message : String(error)}`);
        }
    });

    backupTask = cron.schedule(backupCronExpr, async () => {
        logger.info({ backupEveryHours: schedule.backupEveryHours }, `[Cron] Triggering automated backup`);
        systemLog.info("Cron", "Déclenchement de la sauvegarde automatique");
        try {
            const fileName = await performAutoBackup();
            systemLog.info("Cron", `Sauvegarde automatique créée : ${fileName}`);
        } catch (err) {
            logger.error({ err }, "[Cron] Auto-backup failed");
            systemLog.error("Cron", `Échec de la sauvegarde automatique : ${err instanceof Error ? err.message : String(err)}`);
        }
    });

    integrityCheckTask = cron.schedule(integrityCronExpr, async () => {
        logger.info({ integrityCheckEveryHours: integrityCheckHours }, `[Cron] Running scheduled integrity check`);
        systemLog.info("Cron", "Vérification programmée de l'intégrité des sessions");
        try {
            const cleaned = await cleanupOrphanedSessions();
            systemLog.info("Cron", `Vérification d'intégrité terminée (${cleaned} sessions orphelines traitées)`);
        } catch (err) {
            logger.error({ err }, "[Cron] Scheduled integrity check failed");
            systemLog.error("Cron", `Échec de la vérification d'intégrité : ${err instanceof Error ? err.message : String(err)}`);
        }
    });

    // Daily system log retention cleanup at 04:00 UTC
    logCleanupTask = cron.schedule("0 4 * * *", async () => {
        logger.info("[Cron] Running daily system logs retention cleanup");
        try {
            const retentionDays = schedule.logRetentionDays ?? 30;
            await cleanupOldSystemLogs(retentionDays);
        } catch (err) {
            logger.error({ err }, "[Cron] System log retention cleanup failed");
        }
    });
}

export async function rescheduleCronJobs(schedule: CronSchedule) {
    // Destroy existing tasks
    if (recentSyncTask) { recentSyncTask.stop(); recentSyncTask = null; }
    if (fullSyncTask) { fullSyncTask.stop(); fullSyncTask = null; }
    if (backupTask) { backupTask.stop(); backupTask = null; }
    if (integrityCheckTask) { integrityCheckTask.stop(); integrityCheckTask = null; }
    if (logCleanupTask) { logCleanupTask.stop(); logCleanupTask = null; }

    logger.info("[CronManager] Rescheduling cron jobs...");
    systemLog.info("CronManager", "Reconfiguration des tâches planifiées...");
    await initCronJobs(schedule);
}

