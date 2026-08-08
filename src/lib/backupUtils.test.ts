import { describe, expect, it } from "vitest";
import { safeBigInt, extractBackupData, normalizeBackupData } from "./backupUtils";

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
});
