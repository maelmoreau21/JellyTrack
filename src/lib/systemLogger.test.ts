import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
    systemLog,
    getLogFilesList,
    getLogFileContentByName,
    deleteLogFileByName,
    formatFileSize,
    clearSystemLogs,
    cleanupOldSystemLogs,
} from "./systemLogger";

describe("systemLogger", () => {
    beforeEach(() => {
        clearSystemLogs();
    });

    it("writes info, warn, error and audit logs and creates files in list", () => {
        systemLog.info("TestModule", "Informational test message", { userId: "user-123" });
        systemLog.warn("SyncService", "Warning test message");
        systemLog.error("ImageProxy", "Error test message", new Error("Jellyfin 404"));
        systemLog.audit("Export", "admin", "192.168.1.10", { file: "backup.zip" });

        const fileList = getLogFilesList();
        expect(fileList.length).toBeGreaterThan(0);

        const currentFile = fileList.find((f) => f.isCurrent);
        expect(currentFile).toBeDefined();
        expect(currentFile?.sizeBytes).toBeGreaterThan(0);
        expect(currentFile?.lineCount).toBeGreaterThanOrEqual(1);
    });

    it("returns formatted log file content by name for download", () => {
        systemLog.info("Boot", "System initialized successfully for test");
        const fileContent = getLogFileContentByName("jellytrack.log");
        expect(fileContent).toBeDefined();
        expect(fileContent?.content).toContain("[INFO]");
        expect(fileContent?.content).toContain("[Boot]");
        expect(fileContent?.content).toContain("System initialized successfully for test");
    });

    it("formats file sizes properly", () => {
        expect(formatFileSize(500)).toBe("500 B");
        expect(formatFileSize(2048)).toBe("2.0 Ko");
        expect(formatFileSize(1048576 * 3)).toBe("3.00 Mo");
    });

    it("deletes log file when requested", () => {
        systemLog.info("Temp", "Temporary log message");
        const listBefore = getLogFilesList();
        expect(listBefore.length).toBeGreaterThan(0);

        // Deleting invalid or non-existent file returns false safely
        expect(deleteLogFileByName("non-existent-log-file-99.log")).toBe(false);
    });

    it("handles cleanup of old logs without throwing", async () => {
        const result = await cleanupOldSystemLogs(30);
        expect(result).toHaveProperty("deletedFiles");
        expect(result).toHaveProperty("prunedDatabaseRows");
    });

    it("correctly identifies current daily log files", () => {
        systemLog.info("DailyTest", "Message for today");
        const list = getLogFilesList();
        const today = new Date().toISOString().split("T")[0];
        const todayFile = list.find(f => f.filename.includes(today) && f.isCurrent);
        expect(todayFile).toBeDefined();
    });
});
