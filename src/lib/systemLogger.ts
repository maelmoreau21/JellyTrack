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

const LOG_DIR = process.env.LOG_DIR || (fs.existsSync("/data") ? "/data/logs" : path.join(process.cwd(), "logs"));
const LOG_FILE = path.join(LOG_DIR, "jellytrack.log");
const MAX_IN_MEMORY_LOGS = 1000;

// In-memory ring buffer for fast client polling
const memoryLogs: SystemLogEntry[] = [];

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

function appendToLogFile(line: string) {
    if (!ensureLogDir()) return;
    try {
        fs.appendFileSync(LOG_FILE, line, { encoding: "utf8" });
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

    // Write formatted log line to file
    const line = formatLogLine(entry);
    appendToLogFile(line);

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

export function getRecentSystemLogs(limit = 100): SystemLogEntry[] {
    if (memoryLogs.length > 0) {
        return memoryLogs.slice(0, limit);
    }

    // If memory is empty (e.g. after server restart), read from log file
    return readLogsFromFile(limit);
}

export function readLogsFromFile(limit = 100): SystemLogEntry[] {
    try {
        if (!fs.existsSync(LOG_FILE)) return [];
        const content = fs.readFileSync(LOG_FILE, "utf8");
        const lines = content.split("\n").filter((l) => l.trim().length > 0);
        const entries: SystemLogEntry[] = [];

        const logRegex = /^\[(.*?)\]\s+\[(.*?)\]\s+\[(.*?)\]\s+(.*?)(?:\s+\|\s+(.*))?$/;

        for (let i = lines.length - 1; i >= 0 && entries.length < limit; i--) {
            const match = lines[i].match(logRegex);
            if (match) {
                const [, timestamp, level, source, message, detailsRaw] = match;
                let details: unknown = undefined;
                if (detailsRaw) {
                    try {
                        details = JSON.parse(detailsRaw);
                    } catch {
                        details = detailsRaw;
                    }
                }
                entries.push({
                    id: `file-${i}`,
                    timestamp,
                    level: (level as SystemLogLevel) || "INFO",
                    source,
                    message,
                    details,
                });
            } else {
                entries.push({
                    id: `raw-${i}`,
                    timestamp: new Date().toISOString(),
                    level: "INFO",
                    source: "System",
                    message: lines[i],
                });
            }
        }

        return entries;
    } catch {
        return [];
    }
}

export function getLogFileContent(): string {
    try {
        if (fs.existsSync(LOG_FILE)) {
            return fs.readFileSync(LOG_FILE, "utf8");
        }
    } catch {
        // Fallback to memory logs
    }

    if (memoryLogs.length > 0) {
        return memoryLogs.map(formatLogLine).reverse().join("");
    }

    return `[${new Date().toISOString()}] [INFO] [System] Log file initialized.\n`;
}

export function getLogFileInfo(): { sizeBytes: number; lineCount: number; path: string } {
    try {
        if (fs.existsSync(LOG_FILE)) {
            const stats = fs.statSync(LOG_FILE);
            const content = fs.readFileSync(LOG_FILE, "utf8");
            const lineCount = content.split("\n").length;
            return {
                sizeBytes: stats.size,
                lineCount,
                path: LOG_FILE,
            };
        }
    } catch {
        // Ignore stat error
    }

    return {
        sizeBytes: 0,
        lineCount: memoryLogs.length,
        path: LOG_FILE,
    };
}

export function clearSystemLogs(): boolean {
    memoryLogs.length = 0;
    try {
        if (fs.existsSync(LOG_FILE)) {
            fs.writeFileSync(LOG_FILE, `[${new Date().toISOString()}] [INFO] [System] Logs cleared by administrator.\n`, "utf8");
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
                if (file.endsWith(".log") && file !== "jellytrack.log") {
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
        `System logs retention cleanup completed: ${deletedFiles} file(s) deleted, ${prunedDatabaseRows} database row(s) pruned older than ${retentionDays} days.`
    );

    return { deletedFiles, prunedDatabaseRows };
}
