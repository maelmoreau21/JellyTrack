import prisma from "@/lib/prisma";
import { appendHealthEvent, markBackupFinished, markBackupStarted, readSystemHealthState } from "@/lib/systemHealth";
import { getBackupDirectory, resolveAutoBackupFile } from "@/lib/backupDir";
import { redactBackupData } from "@/lib/backupSecurity";
import { createZipBackup } from "@/lib/backupUtils";
import { logger } from "@/lib/logger";

const MAX_BACKUPS = 10;

/**
 * Performs a backup of the database to a compressed ZIP file containing database.sql and settings.json.
 * Mode can be 'auto' or 'manuelle'.
 * Implements rolling rotation: keeps only recent backups.
 */
export async function performAutoBackup(mode: 'auto' | 'manuelle' = 'auto'): Promise<string> {
    logger.info(`[Backup] Starting ${mode} backup...`);
    await markBackupStarted();

    try {
        const fs = await import("fs");
        const path = await import("path");
        const backupDir = getBackupDirectory();
        logger.info({ backupDir }, `[Backup] Using backup directory`);

        // Fetch all data
        const servers = await prisma.server.findMany();
        const users = await prisma.user.findMany();
        const media = await prisma.media.findMany();
        const playbackHistory = await prisma.playbackHistory.findMany();
        const telemetryEvents = await prisma.telemetryEvent.findMany();
        const dailyStats = await prisma.dailyStats.findMany();
        const adminAuditLogs = await prisma.adminAuditLog.findMany();
        const settings = await prisma.globalSettings.findFirst({ where: { id: "global" } });
        const systemHealth = await readSystemHealthState();

        const rawData = {
            servers,
            users,
            media,
            playbackHistory,
            telemetryEvents,
            dailyStats,
            adminAuditLogs,
            settings,
            systemHealth,
        };

        // Generate filename with date (.zip)
        const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const timeStr = new Date().toISOString().split('T')[1].replace(/:/g, '-').split('.')[0]; // HH-MM-SS
        const prefix = mode === "manuelle" ? "JellyTrack-manuelle-" : "JellyTrack-auto-";
        const fileName = `${prefix}${dateStr}_${timeStr}.zip`;
        const filePath = path.join(backupDir, fileName);

        // Generate ZIP backup buffer
        const zipBuffer = await createZipBackup(rawData);
        fs.writeFileSync(filePath, zipBuffer);

        const fileSizeMb = (zipBuffer.length / 1024 / 1024).toFixed(2);
        logger.info({ fileName, fileSizeMb }, `[Backup] ZIP backup saved`);

        // Rolling rotation: delete oldest files if we exceed MAX_BACKUPS
        type BackupFile = { name: string; time: number };
        const backupFiles = fs.readdirSync(backupDir)
            .filter((f: string) => resolveAutoBackupFile(f) !== null)
            .map((f: string): BackupFile => ({
                name: f,
                time: fs.statSync(path.join(backupDir, f)).mtime.getTime(),
            }))
            .sort((a: BackupFile, b: BackupFile) => b.time - a.time); // Newest first

        if (backupFiles.length > MAX_BACKUPS) {
            const toDelete = backupFiles.slice(MAX_BACKUPS);
            for (const old of toDelete) {
                try {
                    fs.unlinkSync(path.join(backupDir, old.name));
                    logger.info({ backupName: old.name }, `[Auto-Backup] Rotation: deleted old backup`);
                } catch (err) {
                    logger.warn({ backupName: old.name, err }, `[Auto-Backup] Failed to delete backup`);
                }
            }
        }

        logger.info({ retainedCount: backupFiles.length > MAX_BACKUPS ? MAX_BACKUPS : backupFiles.length }, `[Auto-Backup] Complete`);
        await markBackupFinished({ success: true, fileName });
        await appendHealthEvent({
            source: "backup",
            kind: "success",
            message: `Automated ZIP backup created: ${fileName}`,
            details: { fileName },
        });
        return fileName;
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        await markBackupFinished({ success: false, error: msg || "Backup error" });
        await appendHealthEvent({
            source: "backup",
            kind: "error",
            message: "Automated backup failed.",
            details: { error: msg || "Backup error" },
        });
        throw error;
    }
}
