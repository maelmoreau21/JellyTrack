import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
    systemLog,
    getRecentSystemLogs,
    getLogFileContent,
    getLogFileInfo,
    clearSystemLogs,
    cleanupOldSystemLogs,
} from "./systemLogger";

describe("systemLogger", () => {
    beforeEach(() => {
        clearSystemLogs();
    });

    it("writes and retrieves info, warn, error and audit logs", () => {
        systemLog.info("TestModule", "Informational test message", { userId: "user-123" });
        systemLog.warn("SyncService", "Warning test message");
        systemLog.error("ImageProxy", "Error test message", new Error("Jellyfin 404"));
        systemLog.audit("Export", "admin", "192.168.1.10", { file: "backup.zip" });

        const recent = getRecentSystemLogs(10);
        expect(recent.length).toBeGreaterThanOrEqual(4);

        const auditLog = recent.find((r) => r.level === "AUDIT");
        expect(auditLog).toBeDefined();
        expect(auditLog?.message).toContain("Export by admin (192.168.1.10)");

        const errorLog = recent.find((r) => r.level === "ERROR");
        expect(errorLog).toBeDefined();
        expect(errorLog?.source).toBe("ImageProxy");
    });

    it("returns formatted log file content for download", () => {
        systemLog.info("Boot", "System initialized successfully");
        const content = getLogFileContent();
        expect(typeof content).toBe("string");
        expect(content).toContain("[INFO]");
        expect(content).toContain("[Boot]");
        expect(content).toContain("System initialized successfully");
    });

    it("returns log file info with byte size and line count", () => {
        systemLog.info("Metric", "Sample metric message");
        const info = getLogFileInfo();
        expect(info).toHaveProperty("sizeBytes");
        expect(info).toHaveProperty("lineCount");
        expect(info).toHaveProperty("path");
    });

    it("clears system logs properly", () => {
        systemLog.info("Temp", "Temporary log message");
        expect(getRecentSystemLogs().length).toBeGreaterThan(0);

        clearSystemLogs();
        const afterClear = getRecentSystemLogs();
        expect(afterClear.length).toBeLessThanOrEqual(1); // At most the 'Logs cleared' record
    });

    it("handles cleanup of old logs without throwing", async () => {
        const result = await cleanupOldSystemLogs(30);
        expect(result).toHaveProperty("deletedFiles");
        expect(result).toHaveProperty("prunedDatabaseRows");
    });
});
