import "server-only";

import fs from "fs";
import path from "path";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";

export type SystemLogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "AUDIT";

export type SystemLogEntry = {
    id: string;
    timestamp: string;
    level: SystemLogLevel;
    source: string;
    message: string;
    details?: unknown;
};

export type LogFileInfo = {
    filename: string;
    sizeBytes: number;
    formattedSize: string;
    lineCount: number;
    updatedAt: string;
    isCurrent: boolean;
};

const LOG_DIR = process.env.LOG_DIR || (fs.existsSync("/data") ? "/data/logs" : path.join(process.cwd(), "logs"));
const MAIN_LOG_FILE = path.join(LOG_DIR, "jellytrack.log");
const MAX_IN_MEMORY_LOGS = 1000;
const MAX_LOG_FILE_SIZE_BYTES = Number(process.env.LOG_MAX_FILE_SIZE_BYTES) || 5 * 1024 * 1024; // 5 MB per log file by default

// In-memory ring buffer for live log events
const memoryLogs: SystemLogEntry[] = [];

export function formatFileSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 Ko";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} Go`;
}

function ensureLogDir(): boolean {
    try {
        if (!fs.existsSync(LOG_DIR)) {
            fs.mkdirSync(LOG_DIR, { recursive: true });
        }
        return true;
    } catch {
        return false;
    }
}

function formatLogLine(entry: SystemLogEntry): string {
    const detailsStr = entry.details ? ` | ${typeof entry.details === "object" ? JSON.stringify(entry.details) : String(entry.details)}` : "";
    return `[${entry.timestamp}] [${entry.level}] [${entry.source}] ${entry.message}${detailsStr}\n`;
}

/**
 * Returns the currently active daily log filename, automatically creating indexed files (-1, -2, ...)
 * when the file size threshold is reached.
 */
function getActiveDailyLogFile(today: string): string {
    const baseName = `jellytrack-${today}`;
    const primaryFile = path.join(LOG_DIR, `${baseName}.log`);

    try {
        if (!fs.existsSync(primaryFile)) {
            return primaryFile;
        }

        const primaryStats = fs.statSync(primaryFile);
        if (primaryStats.size < MAX_LOG_FILE_SIZE_BYTES) {
            return primaryFile;
        }

        let index = 1;
        while (index < 1000) {
            const indexedFile = path.join(LOG_DIR, `${baseName}-${index}.log`);
            if (!fs.existsSync(indexedFile)) {
                return indexedFile;
            }
            const stats = fs.statSync(indexedFile);
            if (stats.size < MAX_LOG_FILE_SIZE_BYTES) {
                return indexedFile;
            }
            index++;
        }
        return path.join(LOG_DIR, `${baseName}-${index}.log`);
    } catch {
        return primaryFile;
    }
}

function appendToLogFiles(line: string) {
    if (!ensureLogDir()) return;
    const today = new Date().toISOString().split("T")[0];
    const dailyFile = getActiveDailyLogFile(today);

    try {
        fs.appendFileSync(dailyFile, line, { encoding: "utf8" });

        // Handle master log file size rotation
        try {
            if (fs.existsSync(MAIN_LOG_FILE)) {
                const mainStats = fs.statSync(MAIN_LOG_FILE);
                if (mainStats.size >= MAX_LOG_FILE_SIZE_BYTES) {
                    const rotatedMain = path.join(LOG_DIR, "jellytrack.1.log");
                    try {
                        if (fs.existsSync(rotatedMain)) fs.unlinkSync(rotatedMain);
                        fs.renameSync(MAIN_LOG_FILE, rotatedMain);
                    } catch {}
                }
            }
        } catch {}

        fs.appendFileSync(MAIN_LOG_FILE, line, { encoding: "utf8" });
    } catch {
        // Ignore file system write errors gracefully in case of strict read-only storage
    }
}

export function writeSystemLog(level: SystemLogLevel, source: string, message: string, details?: unknown): SystemLogEntry {
    const timestamp = new Date().toISOString();
    const entry: SystemLogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        timestamp,
        level,
        source,
        message,
        details,
    };

    // Store in memory ring buffer
    memoryLogs.unshift(entry);
    if (memoryLogs.length > MAX_IN_MEMORY_LOGS) {
        memoryLogs.pop();
    }

    // Write formatted log line to daily log and master log file
    const line = formatLogLine(entry);
    appendToLogFiles(line);

    // Also mirror to pino structured logger
    const logPayload = { source, details };
    switch (level) {
        case "ERROR":
            logger.error(logPayload, `[${source}] ${message}`);
            break;
        case "WARN":
            logger.warn(logPayload, `[${source}] ${message}`);
            break;
        case "DEBUG":
            logger.debug(logPayload, `[${source}] ${message}`);
            break;
        case "AUDIT":
        case "INFO":
        default:
            logger.info(logPayload, `[${source}] ${message}`);
            break;
    }

    return entry;
}

export const systemLog = {
    info: (source: string, message: string, details?: unknown) => writeSystemLog("INFO", source, message, details),
    warn: (source: string, message: string, details?: unknown) => writeSystemLog("WARN", source, message, details),
    error: (source: string, message: string, details?: unknown) => writeSystemLog("ERROR", source, message, details),
    debug: (source: string, message: string, details?: unknown) => writeSystemLog("DEBUG", source, message, details),
    audit: (action: string, actorUsername?: string, ipAddress?: string, details?: unknown) =>
        writeSystemLog("AUDIT", "Audit", `${action} by ${actorUsername || "System"}${ipAddress ? ` (${ipAddress})` : ""}`, details),
};

export function getLogFilesList(): LogFileInfo[] {
    ensureLogDir();
    const files: LogFileInfo[] = [];
    const todayFilename = `jellytrack-${new Date().toISOString().split("T")[0]}.log`;

    try {
        if (fs.existsSync(LOG_DIR)) {
            const dirEntries = fs.readdirSync(LOG_DIR);
            for (const filename of dirEntries) {
                if (!filename.endsWith(".log") && !filename.endsWith(".txt")) continue;
                const fullPath = path.join(LOG_DIR, filename);

                try {
                    const stats = fs.statSync(fullPath);
                    if (!stats.isFile()) continue;

                    let lineCount = 0;
                    try {
                        const content = fs.readFileSync(fullPath, "utf8");
                        lineCount = content.split("\n").filter((l) => l.trim().length > 0).length;
                    } catch {
                        lineCount = 0;
                    }

                    files.push({
                        filename,
                        sizeBytes: stats.size,
                        formattedSize: formatFileSize(stats.size),
                        lineCount,
                        updatedAt: stats.mtime.toISOString(),
                        isCurrent: filename === "jellytrack.log" || filename === todayFilename || filename.startsWith(`jellytrack-${new Date().toISOString().split("T")[0]}`),
                    });
                } catch {
                    // Ignore unreadable stats
                }
            }
        }
    } catch {
        // Ignore directory read errors
    }

    // Sort: current/today file first, then descending by updatedAt date
    files.sort((a, b) => {
        if (a.isCurrent && !b.isCurrent) return -1;
        if (!a.isCurrent && b.isCurrent) return 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    // If no log file exists yet on disk, ensure an active one is created
    if (files.length === 0) {
        const initialFilename = "jellytrack.log";
        const initialContent = `[${new Date().toISOString()}] [INFO] [System] Journal système initialisé.\n`;
        try {
            fs.writeFileSync(path.join(LOG_DIR, initialFilename), initialContent, "utf8");
            files.push({
                filename: initialFilename,
                sizeBytes: Buffer.byteLength(initialContent),
                formattedSize: formatFileSize(Buffer.byteLength(initialContent)),
                lineCount: 1,
                updatedAt: new Date().toISOString(),
                isCurrent: true,
            });
        } catch {
            // Ignore
        }
    }

    return files;
}

export function getLogFileContentByName(filename?: string | null): { content: string; filename: string } {
    ensureLogDir();
    const today = new Date().toISOString().split("T")[0];
    const defaultName = "jellytrack.log";
    const safeFilename = filename ? path.basename(filename) : defaultName;
    const targetFile = path.join(LOG_DIR, safeFilename);

    try {
        if (fs.existsSync(targetFile)) {
            const content = fs.readFileSync(targetFile, "utf8");
            if (content.length > 0) {
                return { content, filename: safeFilename };
            }
        }
    } catch {
        // Continue to fallbacks
    }

    // Check main log file fallback
    const mainFile = path.join(LOG_DIR, defaultName);
    try {
        if (fs.existsSync(mainFile)) {
            const content = fs.readFileSync(mainFile, "utf8");
            if (content.length > 0) {
                return { content, filename: defaultName };
            }
        }
    } catch {
        // Continue to fallbacks
    }

    // Check today daily file fallback
    const todayFile = path.join(LOG_DIR, `jellytrack-${today}.log`);
    try {
        if (fs.existsSync(todayFile)) {
            const content = fs.readFileSync(todayFile, "utf8");
            if (content.length > 0) {
                return { content, filename: `jellytrack-${today}.log` };
            }
        }
    } catch {
        // Continue
    }

    // If we have in-memory ring buffer logs
    if (memoryLogs.length > 0) {
        const memContent = memoryLogs.map(formatLogLine).reverse().join("");
        try {
            fs.writeFileSync(targetFile, memContent, "utf8");
        } catch {
            // Ignore write error
        }
        return { content: memContent, filename: safeFilename };
    }

    // Initial default fallback: create active log file and return it
    const initialContent = `[${new Date().toISOString()}] [INFO] [System] Journal système JellyTrack actif.\n[${new Date().toISOString()}] [INFO] [System] Serveur opérationnel.\n`;
    try {
        fs.writeFileSync(targetFile, initialContent, "utf8");
    } catch {
        // Ignore write error
    }

    return { content: initialContent, filename: safeFilename };
}

export function deleteLogFileByName(filename: string): boolean {
    ensureLogDir();
    const safeFilename = path.basename(filename);
    if (!safeFilename || safeFilename === "." || safeFilename === "..") return false;

    const targetFile = path.join(LOG_DIR, safeFilename);

    try {
        if (fs.existsSync(targetFile)) {
            fs.unlinkSync(targetFile);
            return true;
        }
    } catch {
        return false;
    }

    return false;
}

export function clearSystemLogs(): boolean {
    memoryLogs.length = 0;
    try {
        if (fs.existsSync(MAIN_LOG_FILE)) {
            fs.writeFileSync(MAIN_LOG_FILE, `[${new Date().toISOString()}] [INFO] [System] Logs réinitialisés par l'administrateur.\n`, "utf8");
        }
        return true;
    } catch {
        return false;
    }
}

export async function cleanupOldSystemLogs(retentionDays = 30): Promise<{ deletedFiles: number; prunedDatabaseRows: number }> {
    let deletedFiles = 0;
    let prunedDatabaseRows = 0;

    if (retentionDays <= 0) {
        // 0 = keep indefinitely
        return { deletedFiles: 0, prunedDatabaseRows: 0 };
    }

    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    // 1. Clean up old log files in LOG_DIR
    try {
        if (fs.existsSync(LOG_DIR)) {
            const files = fs.readdirSync(LOG_DIR);
            for (const file of files) {
                if ((file.endsWith(".log") || file.endsWith(".txt")) && file !== "jellytrack.log") {
                    const filePath = path.join(LOG_DIR, file);
                    const stats = fs.statSync(filePath);
                    if (stats.mtime < cutoffDate) {
                        fs.unlinkSync(filePath);
                        deletedFiles++;
                    }
                }
            }
        }
    } catch (err) {
        logger.error({ err }, "[SystemLogger] Failed to cleanup log files");
    }

    // 2. Prune old database audit logs and health events
    try {
        const [auditResult, healthResult] = await Promise.all([
            prisma.adminAuditLog.deleteMany({
                where: { createdAt: { lt: cutoffDate } },
            }),
            prisma.systemHealthEvent.deleteMany({
                where: { createdAt: { lt: cutoffDate } },
            }),
        ]);
        prunedDatabaseRows = (auditResult?.count || 0) + (healthResult?.count || 0);
    } catch (err) {
        logger.error({ err }, "[SystemLogger] Failed to prune database audit/health logs");
    }

    systemLog.info(
        "Maintenance",
        `Nettoyage de rétention des logs terminé : ${deletedFiles} fichier(s) supprimé(s), ${prunedDatabaseRows} ligne(s) d'audit purgée(s) (plus de ${retentionDays} jours).`
    );

    return { deletedFiles, prunedDatabaseRows };
}
