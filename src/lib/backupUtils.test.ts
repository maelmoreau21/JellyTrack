import { describe, expect, it } from "vitest";
import { safeBigInt, extractBackupData, normalizeBackupData, generateDatabaseSqlDump, createZipBackup, unpackBackupZip, formatSqlValue } from "./backupUtils";

describe("backupUtils", () => {
    describe("safeBigInt", () => {
        it("should parse integers, numbers, floats, and bigint strings cleanly", () => {
            expect(safeBigInt(100)).toEqual(BigInt(100));
            expect(safeBigInt(100.99)).toEqual(BigInt(100));
            expect(safeBigInt("123.45")).toEqual(BigInt(123));
            expect(safeBigInt("999")).toEqual(BigInt(999));
            expect(safeBigInt(BigInt(50))).toEqual(BigInt(50));
            expect(safeBigInt(null)).toBeNull();
            expect(safeBigInt(undefined)).toBeNull();
            expect(safeBigInt("")).toBeNull();
            expect(safeBigInt("invalid_string")).toBeNull();
        });
    });

    describe("formatSqlValue", () => {
        it("should format values into valid PostgreSQL SQL literals", () => {
            expect(formatSqlValue(null)).toBe("NULL");
            expect(formatSqlValue(true)).toBe("TRUE");
            expect(formatSqlValue(false)).toBe("FALSE");
            expect(formatSqlValue(123)).toBe("123");
            expect(formatSqlValue("L'Histoire")).toBe("'L''Histoire'");
            expect(formatSqlValue(["Action", "Drama"])).toBe("ARRAY['Action', 'Drama']::text[]");
            expect(formatSqlValue([])).toBe("ARRAY[]::text[]");
        });
    });

    describe("extractBackupData", () => {
        it("should extract data object if nested inside version 1.0 backup", () => {
            const wrapped = { version: "1.0", data: { servers: [], media: [] } };
            expect(extractBackupData(wrapped)).toEqual({ servers: [], media: [] });
        });

        it("should return object if root contains entities directly", () => {
            const root = { servers: [], users: [], media: [] };
            expect(extractBackupData(root)).toEqual(root);
        });

        it("should return null for invalid inputs", () => {
            expect(extractBackupData(null)).toBeNull();
            expect(extractBackupData("hello")).toBeNull();
            expect(extractBackupData({})).toBeNull();
        });
    });

    describe("normalizeBackupData", () => {
        it("should normalize database entity arrays and sanitize types", () => {
            const raw = {
                media: [
                    { id: "m1", title: "Movie 1", durationMs: "123.45", size: 500000 },
                ],
                playbackHistory: [
                    { id: "ph1", mediaId: "m1", durationWatched: 120 },
                    { id: "ph_orphan", mediaId: "nonexistent", durationWatched: 50 }
                ],
                telemetryEvents: [
                    { id: "te1", playbackId: "ph1", positionMs: "12.34" },
                    { id: "te_orphan", playbackId: "ph_orphan", positionMs: 0 }
                ]
            };

            const normalized = normalizeBackupData(raw);

            expect(normalized.servers.length).toBeGreaterThan(0);
            expect(normalized.media.length).toBe(1);
            expect(normalized.media[0].durationMs).toEqual(BigInt(123));
            expect(normalized.media[0].size).toEqual(BigInt(500000));

            expect(normalized.playbackHistory.length).toBe(1);
            expect(normalized.playbackHistory[0].id).toBe("ph1");

            expect(normalized.telemetryEvents.length).toBe(1);
            expect(normalized.telemetryEvents[0].id).toBe("te1");
            expect(normalized.telemetryEvents[0].positionMs).toEqual(BigInt(12));
        });
    });

    describe("ZIP & SQL Dump Backup Engine", () => {
        it("should generate valid database.sql dump string", () => {
            const normalized = normalizeBackupData({
                servers: [{ id: "srv1", name: "Test Server", url: "http://localhost:8096", jellyfinServerId: "jf1" }],
                media: [{ id: "m1", title: "Test Movie", type: "Movie" }],
            });

            const sql = generateDatabaseSqlDump(normalized);
            expect(sql).toContain("TRUNCATE TABLE");
            expect(sql).toContain("INSERT INTO \"Server\"");
            expect(sql).toContain("INSERT INTO \"Media\"");
            expect(sql).toContain("'Test Server'");
        });

        it("should pack and unpack a ZIP backup archive containing database.sql, settings.json, and manifest.json", async () => {
            const rawData = {
                servers: [{ id: "srv1", name: "Test Server", url: "http://localhost:8096", jellyfinServerId: "jf1" }],
                settings: { defaultLocale: "fr", timeFormat: "24h" }
            };

            const zipBuffer = await createZipBackup(rawData);
            expect(zipBuffer).toBeInstanceOf(Buffer);
            expect(zipBuffer.length).toBeGreaterThan(0);

            const unpacked = await unpackBackupZip(zipBuffer);
            expect(unpacked).not.toBeNull();
            expect(unpacked?.databaseData?.servers?.length).toBe(1);
            expect(unpacked?.sqlDump).toContain("INSERT INTO \"Server\"");
            expect(unpacked?.manifest?.format).toBe("zip-json");
            expect(unpacked?.settings?.settings?.defaultLocale).toBe("fr");
        });
    });
});
