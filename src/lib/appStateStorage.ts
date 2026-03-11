import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

export const APP_STATE_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), "backups");

function ensureAppStateDir() {
    if (!existsSync(APP_STATE_DIR)) {
        mkdirSync(APP_STATE_DIR, { recursive: true });
    }
}

export function readStateFile<T>(fileName: string, fallback: T): T {
    try {
        ensureAppStateDir();
        const filePath = path.join(APP_STATE_DIR, fileName);
        if (!existsSync(filePath)) return fallback;
        return JSON.parse(readFileSync(filePath, "utf-8")) as T;
    } catch {
        return fallback;
    }
}

export function writeStateFile<T>(fileName: string, data: T) {
    ensureAppStateDir();
    writeFileSync(path.join(APP_STATE_DIR, fileName), JSON.stringify(data, null, 2), "utf-8");
}
