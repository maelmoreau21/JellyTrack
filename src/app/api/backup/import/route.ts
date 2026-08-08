import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isAuthError } from "@/lib/auth";
import { requireAdminMutation } from "@/lib/adminRequestGuard";
import { replaceSystemHealthState } from "@/lib/systemHealth";
import { revalidateDashboardCache } from "@/lib/revalidate";
import { extractBackupData, normalizeBackupData } from "@/lib/backupUtils";

export const dynamic = "force-dynamic";

const parsedMaxBackupImportBytes = Number(process.env.BACKUP_IMPORT_MAX_BYTES);
const MAX_BACKUP_IMPORT_BYTES =
    Number.isFinite(parsedMaxBackupImportBytes) && parsedMaxBackupImportBytes > 0
        ? Math.floor(parsedMaxBackupImportBytes)
        : 50 * 1024 * 1024;

class BackupPayloadTooLargeError extends Error {
    constructor() {
        super("backup_payload_too_large");
        this.name = "BackupPayloadTooLargeError";
    }
}

async function readJsonBodyWithLimit(req: NextRequest): Promise<unknown> {
    const contentLength = Number(req.headers.get("content-length") || "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_BACKUP_IMPORT_BYTES) {
        throw new BackupPayloadTooLargeError();
    }

    let text = "";
    try {
        text = await req.text();
    } catch {
        return null;
    }

    if (!text || !text.trim()) return null;

    if (Buffer.byteLength(text, "utf-8") > MAX_BACKUP_IMPORT_BYTES) {
        throw new BackupPayloadTooLargeError();
    }

    try {
        return JSON.parse(text);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Invalid JSON syntax";
        throw new SyntaxError(`Invalid backup JSON: ${msg}`);
    }
}

export async function POST(req: NextRequest) {
    const auth = await requireAdminMutation(req);
    if (isAuthError(auth)) return auth;

    try {
        const body = await readJsonBodyWithLimit(req) as any;
        const extracted = extractBackupData(body);

        if (!extracted) {
            return NextResponse.json({
                error: "Invalid backup file format. Expected a JellyTrack backup JSON file."
            }, { status: 400 });
        }

        const normalized = normalizeBackupData(extracted);

        // Perform atomic restore transaction
        await prisma.$transaction(async (tx) => {
            // 1. Clear current database completely (Volatile first, then records)
            await tx.activeStream.deleteMany();
            await tx.telemetryEvent.deleteMany();
            await tx.playbackHistory.deleteMany();
            await tx.media.deleteMany();
            await tx.user.deleteMany();
            await tx.server.deleteMany();
            await tx.systemHealthEvent.deleteMany();
            await tx.systemHealthState.deleteMany();
            await tx.globalSettings.deleteMany();

            // 2. Insert normalized records
            if (normalized.servers.length > 0) {
                await tx.server.createMany({ data: normalized.servers });
            }

            if (normalized.users.length > 0) {
                await tx.user.createMany({ data: normalized.users });
            }

            if (normalized.media.length > 0) {
                await tx.media.createMany({ data: normalized.media });
            }

            if (normalized.playbackHistory.length > 0) {
                await tx.playbackHistory.createMany({ data: normalized.playbackHistory });
            }

            if (normalized.telemetryEvents.length > 0) {
                await tx.telemetryEvent.createMany({ data: normalized.telemetryEvents });
            }

            if (normalized.settings) {
                const cs = normalized.settings as Record<string, unknown>;
                await tx.globalSettings.create({
                    data: {
                        id: "global",
                        discordWebhookUrl: (cs['discordWebhookUrl'] as string) ?? null,
                        discordAlertCondition: (cs['discordAlertCondition'] as string) ?? "ALL",
                        discordAlertsEnabled: (cs['discordAlertsEnabled'] as boolean) ?? false,
                        excludedLibraries: Array.isArray(cs['excludedLibraries']) ? (cs['excludedLibraries'] as string[]) : [],
                        syncCronHour: typeof cs['syncCronHour'] === "number" ? cs['syncCronHour'] : 3,
                        syncCronMinute: typeof cs['syncCronMinute'] === "number" ? cs['syncCronMinute'] : 0,
                        backupCronHour: typeof cs['backupCronHour'] === "number" ? cs['backupCronHour'] : 3,
                        backupCronMinute: typeof cs['backupCronMinute'] === "number" ? cs['backupCronMinute'] : 30,
                        defaultLocale: (cs['defaultLocale'] as string) ?? "en",
                        timeFormat: (cs['timeFormat'] as string) ?? "24h",
                        maxConcurrentTranscodes: typeof cs['maxConcurrentTranscodes'] === "number" ? cs['maxConcurrentTranscodes'] : 0,
                        wrappedVisible: typeof cs['wrappedVisible'] === "boolean" ? cs['wrappedVisible'] : true,
                        wrappedPeriodEnabled: typeof cs['wrappedPeriodEnabled'] === "boolean" ? cs['wrappedPeriodEnabled'] : true,
                        wrappedStartMonth: typeof cs['wrappedStartMonth'] === "number" ? cs['wrappedStartMonth'] : 12,
                        wrappedStartDay: typeof cs['wrappedStartDay'] === "number" ? cs['wrappedStartDay'] : 1,
                        wrappedEndMonth: typeof cs['wrappedEndMonth'] === "number" ? cs['wrappedEndMonth'] : 1,
                        wrappedEndDay: typeof cs['wrappedEndDay'] === "number" ? cs['wrappedEndDay'] : 31,
                        pluginKeyRotationDays: typeof cs['pluginKeyRotationDays'] === "number" ? cs['pluginKeyRotationDays'] : 90,
                        pluginAutoRotateEnabled: typeof cs['pluginAutoRotateEnabled'] === "boolean" ? cs['pluginAutoRotateEnabled'] : false,
                        pluginKeyRotationGraceHours: typeof cs['pluginKeyRotationGraceHours'] === "number" ? cs['pluginKeyRotationGraceHours'] : 24,
                        pluginTelemetrySettings: (cs['pluginTelemetrySettings'] as any) ?? null,
                        authRememberThirtyDaysEnabled: typeof cs['authRememberThirtyDaysEnabled'] === "boolean" ? cs['authRememberThirtyDaysEnabled'] : true,
                        authSessionsRevokedAt: cs['authSessionsRevokedAt'] ? new Date(String(cs['authSessionsRevokedAt'])) : null,
                        resolutionThresholds: (cs['resolutionThresholds'] as any) ?? null,
                    }
                });
            }
        }, {
            timeout: 120000 // Give it 120 seconds if the DB is massive
        });

        if (normalized.systemHealth) {
            await replaceSystemHealthState(normalized.systemHealth);
        }

        revalidateDashboardCache();

        return NextResponse.json({ success: true }, { status: 200 });

    } catch (e: unknown) {
        if (e instanceof BackupPayloadTooLargeError) {
            return NextResponse.json({ error: "Backup import payload is too large (max 50 MB)." }, { status: 413 });
        }
        if (e instanceof SyntaxError) {
            return NextResponse.json({ error: e.message }, { status: 400 });
        }
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[BackupImport] Restoration failed:", e);
        return NextResponse.json({ error: msg || "Failed to restore backup" }, { status: 500 });
    }
}

