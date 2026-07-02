import type { ScheduledTask } from 'node-cron';
import { logger } from '@/lib/logger';

let recentSyncTask: ScheduledTask | null = null;
let fullSyncTask: ScheduledTask | null = null;
let backupTask: ScheduledTask | null = null;

interface CronSchedule {
    syncCronHour: number;
    syncCronMinute: number;
    backupCronHour: number;
    backupCronMinute: number;
    recentSyncEveryHours: number;
    fullSyncEveryHours: number;
    backupEveryHours: number;
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

    logger.info({ recentSyncCronExpr, recentSyncEveryHours: schedule.recentSyncEveryHours }, `[CronManager] Scheduling recent sync`);
    logger.info({ fullSyncCronExpr, fullSyncEveryHours: schedule.fullSyncEveryHours }, `[CronManager] Scheduling full sync`);
    logger.info({ backupCronExpr, backupCronHour: schedule.backupCronHour, backupCronMinute: schedule.backupCronMinute }, `[CronManager] Scheduling backup`);

    recentSyncTask = cron.schedule(recentSyncCronExpr, async () => {
        logger.info({ recentSyncEveryHours: schedule.recentSyncEveryHours }, `[Cron] Automatic trigger of recent synchronization`);
        try {
            const result = await syncJellyfinLibrary({ recentOnly: true });
            if (!result?.success) {
                logger.warn({ err: result?.error }, `[Cron] Recent synchronization failed`);
            }
        } catch (error) {
            logger.error({ err: error }, "[Cron] Unhandled error during recent synchronization");
        }
    });

    fullSyncTask = cron.schedule(fullSyncCronExpr, async () => {
        logger.info({ fullSyncEveryHours: schedule.fullSyncEveryHours }, `[Cron] Automatic trigger of full synchronization`);
        try {
            const result = await syncJellyfinLibrary({ recentOnly: false });
            if (!result?.success) {
                logger.warn({ err: result?.error }, `[Cron] Full synchronization failed`);
            }
        } catch (error) {
            logger.error({ err: error }, "[Cron] Unhandled error during full synchronization");
        }
    });

    backupTask = cron.schedule(backupCronExpr, async () => {
        logger.info({ backupEveryHours: schedule.backupEveryHours }, `[Cron] Triggering automated backup`);
        try {
            await performAutoBackup();
        } catch (err) {
            logger.error({ err }, "[Cron] Auto-backup failed");
        }
    });
}

export async function rescheduleCronJobs(schedule: CronSchedule) {
    // Destroy existing tasks
    if (recentSyncTask) { recentSyncTask.stop(); recentSyncTask = null; }
    if (fullSyncTask) { fullSyncTask.stop(); fullSyncTask = null; }
    if (backupTask) { backupTask.stop(); backupTask = null; }

    logger.info("[CronManager] Rescheduling cron jobs...");
    await initCronJobs(schedule);
}

