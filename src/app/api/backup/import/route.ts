import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isAuthError } from "@/lib/auth";
import { requireAdminMutation } from "@/lib/adminRequestGuard";
import { replaceSystemHealthState } from "@/lib/systemHealth";
import { revalidateDashboardCache } from "@/lib/revalidate";
import { batchCreateMany, cleanJsonText, extractBackupData, normalizeBackupData } from "@/lib/backupUtils";

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

    let fullText = "";

    // 1. Primary Strategy: Stream Uint8Array chunks via req.body.getReader()
    if (req.body) {
        try {
            const reader = req.body.getReader();
            const chunks: Uint8Array[] = [];
            let totalBytes = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value && value.byteLength > 0) {
                    totalBytes += value.byteLength;
                    if (totalBytes > MAX_BACKUP_IMPORT_BYTES) {
                        throw new BackupPayloadTooLargeError();
                    }
                    chunks.push(value);
                }
            }

            if (chunks.length > 0) {
                const fullBuffer = Buffer.concat(chunks);
                fullText = fullBuffer.toString("utf-8");
            }
        } catch (err: unknown) {
            if (err instanceof BackupPayloadTooLargeError) throw err;
            // Fallthrough
        }
    }

    // 2. Secondary Strategy: Multipart Form Data
    if (!fullText) {
        const contentType = req.headers.get("content-type") || "";
        if (contentType.includes("multipart/form-data")) {
            let formData: FormData | null = null;
            try {
                formData = await req.clone().formData();
            } catch {
                try {
                    formData = await req.formData();
                } catch {
                    formData = null;
                }
            }

            if (formData) {
                const file = formData.get("file") as File | null;
                if (file) {
                    if (file.size > MAX_BACKUP_IMPORT_BYTES) {
                        throw new BackupPayloadTooLargeError();
                    }
                    fullText = await file.text();
                }
            }
        }
    }

    // 3. Fallback Strategy: req.arrayBuffer() or req.text()
    if (!fullText) {
        let buffer: ArrayBuffer | null = null;
        try {
            buffer = await req.clone().arrayBuffer();
        } catch {
            try {
                buffer = await req.arrayBuffer();
            } catch {
                buffer = null;
            }
        }

        if (buffer && buffer.byteLength > 0) {
            if (buffer.byteLength > MAX_BACKUP_IMPORT_BYTES) {
                throw new BackupPayloadTooLargeError();
            }
            fullText = new TextDecoder("utf-8").decode(buffer);
        }
    }

    if (!fullText) {
        try {
            fullText = await req.text();
        } catch {
            return null;
        }
    }

    fullText = cleanJsonText(fullText);
    if (!fullText) return null;

    if (Buffer.byteLength(fullText, "utf-8") > MAX_BACKUP_IMPORT_BYTES) {
        throw new BackupPayloadTooLargeError();
    }

    try {
        return JSON.parse(fullText);
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
                error: "Invalid backup file format. Missing expected database entities (servers, users, media, playbackHistory)."
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

            // 2. Insert normalized records using batching to avoid PostgreSQL parameter limit overflow (>65,535 params)
            await batchCreateMany((batch) => tx.server.createMany({ data: batch }), normalized.servers, 1000);
            await batchCreateMany((batch) => tx.user.createMany({ data: batch }), normalized.users, 1000);
            await batchCreateMany((batch) => tx.media.createMany({ data: batch }), normalized.media, 1000);
            await batchCreateMany((batch) => tx.playbackHistory.createMany({ data: batch }), normalized.playbackHistory, 1000);
            await batchCreateMany((batch) => tx.telemetryEvent.createMany({ data: batch }), normalized.telemetryEvents, 1000);

            // 3. Ensure globalSettings singleton is always present
            const cs = (normalized.settings || {}) as Record<string, unknown>;
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
        }, {
            timeout: 180000 // 3 minutes timeout for huge database imports
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

