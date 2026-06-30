import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const FALLBACK_TMP_DIR = "jellytrack-backups";
const AUTO_BACKUP_FILE_PATTERN = /^JellyTrack-auto-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/;
let cachedBackupDirectory: string | null = null;

function isWritableDirectory(directory: string) {
    try {
        if (!fs.existsSync(directory)) {
            fs.mkdirSync(directory, { recursive: true });
        }

        fs.accessSync(directory, fs.constants.W_OK);

        const probeFile = path.join(directory, `.write-test-${process.pid}-${Date.now()}.tmp`);
        fs.writeFileSync(probeFile, "ok", "utf-8");
        fs.unlinkSync(probeFile);
        return true;
    } catch {
        return false;
    }
}

export function getBackupDirectory() {
    if (cachedBackupDirectory) {
        return cachedBackupDirectory;
    }

    const configured = String(process.env.BACKUP_DIR || "").trim();
    const candidates = [
        configured,
        "./backups",
        path.join(/*turbopackIgnore: true*/ process.cwd(), "backups"),
        path.join(os.tmpdir(), FALLBACK_TMP_DIR),
    ].filter(Boolean);

    const uniqueCandidates = Array.from(new Set(candidates.map((candidate) => path.resolve(/*turbopackIgnore: true*/ candidate))));

    for (const candidate of uniqueCandidates) {
        if (isWritableDirectory(candidate)) {
            cachedBackupDirectory = candidate;

            if (configured && path.resolve(/*turbopackIgnore: true*/ configured) !== candidate) {
                console.warn(`[Backup] BACKUP_DIR is not writable (${configured}). Falling back to ${candidate}.`);
            }

            return candidate;
        }
    }

    throw new Error(`No writable backup directory found. Tried: ${uniqueCandidates.join(", ")}`);
}

export function resolveAutoBackupFile(fileName: unknown): { fileName: string; filePath: string } | null {
    const safeName = typeof fileName === "string" ? fileName.trim() : "";
    if (!AUTO_BACKUP_FILE_PATTERN.test(safeName)) return null;
    if (path.basename(safeName) !== safeName) return null;

    const backupDir = path.resolve(/*turbopackIgnore: true*/ getBackupDirectory());
    const filePath = path.resolve(/*turbopackIgnore: true*/ backupDir, safeName);
    if (path.dirname(filePath) !== backupDir) return null;

    return { fileName: safeName, filePath };
}
