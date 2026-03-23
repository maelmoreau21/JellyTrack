import prisma from "@/lib/prisma";
// No rules
import { appendHealthEvent, markBackupFinished, markBackupStarted, readSystemHealthState } from "@/lib/systemHealth";

const MAX_BACKUPS = 5;

/**
 * Performs a full auto-backup of the database to a JSON file.
 * Implements rolling rotation: keeps only the 5 most recent backups.
 */
export async function performAutoBackup(): Promise<string> {
    console.log("[Auto-Backup] Starting automated backup...");
    await markBackupStarted();

    try {
        // Load fs/path dynamically via require-eval to avoid static bundler tracing
        function getFS() {
            try {
                 
                const req = eval('require');
                return req('fs');
            } catch (e) {
                throw new Error('Unable to load fs module dynamically');
            }
        }
        function getPath() {
            try {
                 
                const req = eval('require');
                return req('path');
            } catch (e) {
                throw new Error('Unable to load path module dynamically');
            }
        }
        const fs = getFS();
        const path = getPath();

        // Ensure directory exists
        const BACKUP_DIR = process.env.BACKUP_DIR || "./backups";
        if (!fs.existsSync(BACKUP_DIR)) {
            fs.mkdirSync(BACKUP_DIR, { recursive: true });
            console.log(`[Auto-Backup] Created backup directory: ${BACKUP_DIR}`);
        }

        // Fetch all data
        const users = await prisma.user.findMany();
        const media = await prisma.media.findMany();
        const playbackHistory = await prisma.playbackHistory.findMany();
        const telemetryEvents = await prisma.telemetryEvent.findMany();
        const settings = await prisma.globalSettings.findFirst({ where: { id: "global" } });
        // No rules
        const systemHealth = await readSystemHealthState();

        const backupContent = {
            version: "1.0",
            exportDate: new Date().toISOString(),
            type: "auto-backup",
            data: {
                users,
                media,
                playbackHistory,
                telemetryEvents,
                settings,
                // No rules
                systemHealth,
            }
        };

        // Generate filename with date
        const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const timeStr = new Date().toISOString().split('T')[1].replace(/:/g, '-').split('.')[0]; // HH-MM-SS
        const fileName = `JellyTrack-auto-${dateStr}_${timeStr}.json`;
        const filePath = `${BACKUP_DIR}/${fileName}`;

        // BigInt-safe JSON serializer (Prisma returns BigInt for durationMs, positionTicks, etc.)
        const bigIntReplacer = (_key: string, value: unknown) => typeof value === 'bigint' ? value.toString() : value;

        // Write backup file
        fs.writeFileSync(filePath, JSON.stringify(backupContent, bigIntReplacer, 2), "utf-8");
        const fileSizeMb = (Buffer.byteLength(JSON.stringify(backupContent, bigIntReplacer)) / 1024 / 1024).toFixed(2);
        console.log(`[Auto-Backup] Backup saved: ${fileName} (${fileSizeMb} Mo)`);

        // Rolling rotation: delete oldest files if we exceed MAX_BACKUPS
        type BackupFile = { name: string; time: number };
        const backupFiles = fs.readdirSync(BACKUP_DIR)
            .filter((f: string) => f.endsWith(".json") && f.startsWith("JellyTrack-auto-"))
            .map((f: string): BackupFile => ({
                name: f,
                time: fs.statSync(`${BACKUP_DIR}/${f}`).mtime.getTime(),
            }))
            .sort((a: BackupFile, b: BackupFile) => b.time - a.time); // Newest first

        if (backupFiles.length > MAX_BACKUPS) {
            const toDelete = backupFiles.slice(MAX_BACKUPS);
            for (const old of toDelete) {
                try {
                    fs.unlinkSync(path.join(BACKUP_DIR, old.name));
                    console.log(`[Auto-Backup] Rotation: deleted old backup ${old.name}`);
                } catch (err) {
                    console.warn(`[Auto-Backup] Failed to delete ${old.name}:`, err);
                }
            }
        }

        console.log(`[Auto-Backup] Complete. ${backupFiles.length > MAX_BACKUPS ? MAX_BACKUPS : backupFiles.length} backups retained.`);
        await markBackupFinished({ success: true, fileName });
        await appendHealthEvent({
            source: "backup",
            kind: "success",
            message: `Sauvegarde automatique créée: ${fileName}`,
            details: { fileName },
        });
        return fileName;
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        await markBackupFinished({ success: false, error: msg || "Backup error" });
        await appendHealthEvent({
            source: "backup",
            kind: "error",
            message: "Échec de sauvegarde automatique.",
            details: { error: msg || "Backup error" },
        });
        throw error;
    }
}
