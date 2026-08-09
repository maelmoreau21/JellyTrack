import { describe, expect, it, vi } from "vitest";
import { GET as exportGET } from "./export/route";
import { POST as importPOST } from "./import/route";
import { createZipBackup, unpackBackupZip } from "@/lib/backupUtils";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
    requireAdmin: vi.fn().mockResolvedValue({ user: { role: "ADMIN" } }),
    isAuthError: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/adminRequestGuard", () => ({
    requireAdminMutation: vi.fn().mockResolvedValue({ user: { role: "ADMIN" } }),
}));

vi.mock("@/lib/revalidate", () => ({
    revalidateDashboardCache: vi.fn(),
}));

describe("Backup API Endpoints & ZIP Workflow", () => {
    it("GET /api/backup/export should return application/zip with attachment filename", async () => {
        const response = await exportGET();

        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toBe("application/zip");
        expect(response.headers.get("Content-Disposition")).toContain("attachment; filename=\"JellyTrack-backup-");

        const arrayBuf = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);

        const unpacked = await unpackBackupZip(buffer);
        expect(unpacked).not.toBeNull();
        expect(unpacked?.manifest?.generator).toContain("JellyTrack Backup Engine");
        expect(unpacked?.sqlDump).toContain("TRUNCATE TABLE");
    });

    it("POST /api/backup/import should accept valid ZIP backup buffer", async () => {
        const rawData = {
            servers: [{ id: "s1", jellyfinServerId: "jf1", name: "Test Server", url: "http://test" }],
            settings: { defaultLocale: "fr", timeFormat: "24h" }
        };

        const zipBuffer = await createZipBackup(rawData);

        const req = new NextRequest("http://localhost:3000/api/backup/import", {
            method: "POST",
            headers: {
                "Content-Type": "application/zip"
            },
            body: new Uint8Array(zipBuffer),
        });

        const res = await importPOST(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.mode).toBe("zip");
    });

    it("POST /api/backup/import should handle legacy JSON fallback buffer", async () => {
        const legacyJson = JSON.stringify({
            version: "1.0",
            data: {
                servers: [{ id: "s1", jellyfinServerId: "jf1", name: "Legacy Server", url: "http://test" }]
            }
        });

        const req = new NextRequest("http://localhost:3000/api/backup/import", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: legacyJson,
        });

        const res = await importPOST(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.mode).toBe("json");
    });
});
