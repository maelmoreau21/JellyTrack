import prisma from "@/lib/prisma";
import { appendHealthEvent, markBackupFinished, markBackupStarted, readSystemHealthState } from "@/lib/systemHealth";
import { getBackupDirectory } from "@/lib/backupDir";
import { redactBackupData } from "@/lib/backupSecurity";
import { logger } from "@/lib/logger";

const MAX_BACKUPS = 5;

/**
 * Performs a full auto-backup of the database to a JSON file.
 * Implements rolling rotation: keeps only the 5 most recent backups.
 */
export async function performAutoBackup(): Promise<string> {
    logger.info("[Auto-Backup] Starting automated backup...");
    await markBackupStarted();

    try {
        const fs = await import("fs");
        const path = await import("path");
        const backupDir = getBackupDirectory();
        logger.info({ backupDir }, `[Auto-Backup] Using backup directory`);

        // Fetch all data
        const servers = await prisma.server.findMany();
        const users = await prisma.user.findMany();
        const media = await prisma.media.findMany();
        const playbackHistory = await prisma.playbackHistory.findMany();
        const telemetryEvents = await prisma.telemetryEvent.findMany();
        const settings = await prisma.globalSettings.findFirst({ where: { id: "global" } });
        const systemHealth = await readSystemHealthState();

        const backupContent = {
            version: "1.0",
            exportDate: new Date().toISOString(),
            type: "auto-backup",
            data: redactBackupData({
                servers,
                users,
                media,
                playbackHistory,
                telemetryEvents,
                settings,
                systemHealth,
            })
        };

        // Generate filename with date
        const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const timeStr = new Date().toISOString().split('T')[1].replace(/:/g, '-').split('.')[0]; // HH-MM-SS
        const fileName = `JellyTrack-auto-${dateStr}_${timeStr}.json`;
        const filePath = path.join(backupDir, fileName);

        // BigInt-safe JSON serializer (Prisma returns BigInt for durationMs, positionTicks, etc.)
        const bigIntReplacer = (_key: string, value: unknown) => typeof value === 'bigint' ? value.toString() : value;

        // Write backup file
        const backupJsonString = JSON.stringify(backupContent, bigIntReplacer, 2);
        fs.writeFileSync(filePath, backupJsonString, "utf-8");
        const fileSizeMb = (Buffer.byteLength(backupJsonString) / 1024 / 1024).toFixed(2);
        logger.info({ fileName, fileSizeMb }, `[Auto-Backup] Backup saved`);

        // Rolling rotation: delete oldest files if we exceed MAX_BACKUPS
        type BackupFile = { name: string; time: number };
        const backupFiles = fs.readdirSync(backupDir)
            .filter((f: string) => f.endsWith(".json") && f.startsWith("JellyTrack-auto-"))
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
            message: `Automated backup created: ${fileName}`,
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

