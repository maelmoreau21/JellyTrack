import type { ScheduledTask } from 'node-cron';

let syncTask: ScheduledTask | null = null;
let backupTask: ScheduledTask | null = null;

interface CronSchedule {
    syncCronHour: number;
    syncCronMinute: number;
    backupCronHour: number;
    backupCronMinute: number;
}

export async function initCronJobs(schedule: CronSchedule) {
    const cron = (await import('node-cron')).default;
    const { syncJellyfinLibrary } = await import('@/lib/sync');
    const { performAutoBackup } = await import('@/lib/autoBackup');

    const syncCronExpr = `${schedule.syncCronMinute} ${schedule.syncCronHour} * * *`;
    const backupCronExpr = `${schedule.backupCronMinute} ${schedule.backupCronHour} * * *`;

    console.log(`[CronManager] Planification sync: ${syncCronExpr} (${String(schedule.syncCronHour).padStart(2, '0')}:${String(schedule.syncCronMinute).padStart(2, '0')})`);
    console.log(`[CronManager] Planification backup: ${backupCronExpr} (${String(schedule.backupCronHour).padStart(2, '0')}:${String(schedule.backupCronMinute).padStart(2, '0')})`);

    syncTask = cron.schedule(syncCronExpr, async () => {
        console.log(`[Cron] DÃ©clenchement automatique de la synchronisation (${String(schedule.syncCronHour).padStart(2, '0')}:${String(schedule.syncCronMinute).padStart(2, '0')})`);
        await syncJellyfinLibrary();
    });

    backupTask = cron.schedule(backupCronExpr, async () => {
        console.log(`[Cron] DÃ©clenchement de la sauvegarde automatique (${String(schedule.backupCronHour).padStart(2, '0')}:${String(schedule.backupCronMinute).padStart(2, '0')})`);
        try {
            await performAutoBackup();
        } catch (err) {
            console.error("[Cron] Auto-backup failed:", err);
        }
    });
}

export async function rescheduleCronJobs(schedule: CronSchedule) {
    // Destroy existing tasks
    if (syncTask) { syncTask.stop(); syncTask = null; }
    if (backupTask) { backupTask.stop(); backupTask = null; }

    console.log("[CronManager] Rescheduling cron jobs...");
    await initCronJobs(schedule);
}
