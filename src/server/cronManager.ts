import type { ScheduledTask } from 'node-cron';

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

    console.log(`[CronManager] Scheduling recent sync: ${recentSyncCronExpr} (every ${schedule.recentSyncEveryHours}h)`);
    console.log(`[CronManager] Scheduling full sync: ${fullSyncCronExpr} (every ${schedule.fullSyncEveryHours}h)`);
    console.log(`[CronManager] Scheduling backup: ${backupCronExpr} (${String(schedule.backupCronHour).padStart(2, '0')}:${String(schedule.backupCronMinute).padStart(2, '0')})`);

    recentSyncTask = cron.schedule(recentSyncCronExpr, async () => {
        console.log(`[Cron] Automatic trigger of recent synchronization (every ${schedule.recentSyncEveryHours}h)`);
        try {
            const result = await syncJellyfinLibrary({ recentOnly: true });
            if (!result?.success) {
                console.warn(`[Cron] Recent synchronization failed: ${result?.error || "unknown error"}`);
            }
        } catch (error) {
            console.error("[Cron] Unhandled error during recent synchronization:", error);
        }
    });

    fullSyncTask = cron.schedule(fullSyncCronExpr, async () => {
        console.log(`[Cron] Automatic trigger of full synchronization (every ${schedule.fullSyncEveryHours}h)`);
        try {
            const result = await syncJellyfinLibrary({ recentOnly: false });
            if (!result?.success) {
                console.warn(`[Cron] Full synchronization failed: ${result?.error || "unknown error"}`);
            }
        } catch (error) {
            console.error("[Cron] Unhandled error during full synchronization:", error);
        }
    });

    backupTask = cron.schedule(backupCronExpr, async () => {
        console.log(`[Cron] Triggering automated backup (every ${schedule.backupEveryHours}h)`);
        try {
            await performAutoBackup();
        } catch (err) {
            console.error("[Cron] Auto-backup failed:", err);
        }
    });
}

export async function rescheduleCronJobs(schedule: CronSchedule) {
    // Destroy existing tasks
    if (recentSyncTask) { recentSyncTask.stop(); recentSyncTask = null; }
    if (fullSyncTask) { fullSyncTask.stop(); fullSyncTask = null; }
    if (backupTask) { backupTask.stop(); backupTask = null; }

    console.log("[CronManager] Rescheduling cron jobs...");
    await initCronJobs(schedule);
}
