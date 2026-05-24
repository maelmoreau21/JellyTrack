import fs from "node:fs";
import path from "node:path";
import { getBackupDirectory } from "@/lib/backupDir";

const SAFE_STATE_FILE_PATTERN = /^[a-z0-9._-]+$/i;

function getAppStateDir() {
    return getBackupDirectory();
}

function ensureAppStateDir() {
    const APP_STATE_DIR = getAppStateDir();
    if (!fs.existsSync(APP_STATE_DIR)) {
        fs.mkdirSync(APP_STATE_DIR, { recursive: true });
    }
}

function resolveStateFilePath(fileName: string): string | null {
    const safeName = String(fileName || "").trim();
    if (!SAFE_STATE_FILE_PATTERN.test(safeName)) return null;
    if (path.basename(safeName) !== safeName) return null;
    return path.join(/*turbopackIgnore: true*/ getAppStateDir(), safeName);
}

export function readStateFile<T>(fileName: string, fallback: T): T {
    try {
        ensureAppStateDir();
        const filePath = resolveStateFilePath(fileName);
        if (!filePath) return fallback;
        if (!fs.existsSync(filePath)) return fallback;
        return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
    } catch {
        return fallback;
    }
}
