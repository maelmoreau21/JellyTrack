import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import { isAuthError } from "@/lib/auth";
import { requireAdminMutation } from "@/lib/adminRequestGuard";
import { apiT } from "@/lib/i18n-api";
import fs from "node:fs";
import { replaceSystemHealthState } from "@/lib/systemHealth";
import { getMasterServerIdentityFromEnv } from "@/lib/serverRegistry";
import { resolveAutoBackupFile } from "@/lib/backupDir";
import { revalidateDashboardCache } from "@/lib/revalidate";
import { batchCreateMany, cleanJsonText, extractBackupData, normalizeBackupData } from "@/lib/backupUtils";
import { z } from "zod";

const restoreBackupSchema = z.object({
    fileName: z.string().min(1),
});

export async function POST(req: NextRequest) {
    const auth = await requireAdminMutation(req);
    if (isAuthError(auth)) return auth;

    try {
        const body = await req.json().catch(() => ({}));
        const parseResult = restoreBackupSchema.safeParse(body);

        if (!parseResult.success) {
            return NextResponse.json({ error: await apiT('fileNameInvalid') }, { status: 400 });
        }

        const { fileName } = parseResult.data;

        const backupFile = resolveAutoBackupFile(fileName);
        if (!backupFile) {
            return NextResponse.json({ error: await apiT('fileAutoOnly') }, { status: 400 });
        }

        if (!fs.existsSync(backupFile.filePath)) {
            return NextResponse.json({ error: await apiT('fileNotFound') }, { status: 404 });
        }

        let raw = fs.readFileSync(backupFile.filePath, "utf-8");
        raw = cleanJsonText(raw);
        let backup: any;
        try {
            backup = JSON.parse(raw);
        } catch {
            return NextResponse.json({ error: await apiT('backupFormatInvalid') }, { status: 400 });
        }

        const extracted = extractBackupData(backup);
        if (!extracted) {
            return NextResponse.json({ error: await apiT('backupFormatInvalid') }, { status: 400 });
        }

        const normalized = normalizeBackupData(extracted);

        // Restore using transaction
        await prisma.$transaction(async (tx) => {
            // Clear existing data (volatile and references first)
            await tx.activeStream.deleteMany();
            await tx.telemetryEvent.deleteMany();
            await tx.playbackHistory.deleteMany();
            await tx.media.deleteMany();
            await tx.user.deleteMany();
            await tx.server.deleteMany();
            await tx.systemHealthEvent.deleteMany();
            await tx.systemHealthState.deleteMany();

            // Insert normalized records using batching to avoid PostgreSQL parameter limit overflow (>65,535 params)
            await batchCreateMany((batch) => tx.server.createMany({ data: batch }), normalized.servers, 1000);
            await batchCreateMany((batch) => tx.user.createMany({ data: batch }), normalized.users, 1000);
            await batchCreateMany((batch) => tx.media.createMany({ data: batch }), normalized.media, 1000);
            await batchCreateMany((batch) => tx.playbackHistory.createMany({ data: batch }), normalized.playbackHistory, 1000);
            await batchCreateMany((batch) => tx.telemetryEvent.createMany({ data: batch }), normalized.telemetryEvents, 1000);

            // Restore settings
            if (normalized.settings) {
                const settings = normalized.settings as Record<string, any>;
                await tx.globalSettings.upsert({
                    where: { id: "global" },
                    update: {
                        discordWebhookUrl: settings.discordWebhookUrl ?? null,
                        discordAlertsEnabled: settings.discordAlertsEnabled ?? false,
                        discordAlertCondition: settings.discordAlertCondition ?? "ALL",
                        excludedLibraries: Array.isArray(settings.excludedLibraries) ? settings.excludedLibraries : [],
                        syncCronHour: typeof settings.syncCronHour === "number" ? settings.syncCronHour : 3,
                        syncCronMinute: typeof settings.syncCronMinute === "number" ? settings.syncCronMinute : 0,
                        backupCronHour: typeof settings.backupCronHour === "number" ? settings.backupCronHour : 3,
                        backupCronMinute: typeof settings.backupCronMinute === "number" ? settings.backupCronMinute : 30,
                        defaultLocale: settings.defaultLocale ?? "en",
                        timeFormat: settings.timeFormat ?? "24h",
                        maxConcurrentTranscodes: typeof settings.maxConcurrentTranscodes === "number" ? settings.maxConcurrentTranscodes : 0,
                        wrappedVisible: typeof settings.wrappedVisible === "boolean" ? settings.wrappedVisible : true,
                        wrappedPeriodEnabled: typeof settings.wrappedPeriodEnabled === "boolean" ? settings.wrappedPeriodEnabled : true,
                        wrappedStartMonth: typeof settings.wrappedStartMonth === "number" ? settings.wrappedStartMonth : 12,
                        wrappedStartDay: typeof settings.wrappedStartDay === "number" ? settings.wrappedStartDay : 1,
                        wrappedEndMonth: typeof settings.wrappedEndMonth === "number" ? settings.wrappedEndMonth : 1,
                        wrappedEndDay: typeof settings.wrappedEndDay === "number" ? settings.wrappedEndDay : 31,
                        pluginKeyRotationDays: typeof settings.pluginKeyRotationDays === "number" ? settings.pluginKeyRotationDays : 90,
                        pluginAutoRotateEnabled: typeof settings.pluginAutoRotateEnabled === "boolean" ? settings.pluginAutoRotateEnabled : false,
                        pluginKeyRotationGraceHours: typeof settings.pluginKeyRotationGraceHours === "number" ? settings.pluginKeyRotationGraceHours : 24,
                        pluginTelemetrySettings: settings.pluginTelemetrySettings ?? null,
                        authRememberThirtyDaysEnabled: typeof settings.authRememberThirtyDaysEnabled === "boolean" ? settings.authRememberThirtyDaysEnabled : true,
                        authSessionsRevokedAt: settings.authSessionsRevokedAt ? new Date(String(settings.authSessionsRevokedAt)) : null,
                        resolutionThresholds: settings.resolutionThresholds ?? null,
                    },
                    create: {
                        id: "global",
                        discordWebhookUrl: settings.discordWebhookUrl ?? null,
                        discordAlertsEnabled: settings.discordAlertsEnabled ?? false,
                        discordAlertCondition: settings.discordAlertCondition ?? "ALL",
                        excludedLibraries: Array.isArray(settings.excludedLibraries) ? settings.excludedLibraries : [],
                        syncCronHour: typeof settings.syncCronHour === "number" ? settings.syncCronHour : 3,
                        syncCronMinute: typeof settings.syncCronMinute === "number" ? settings.syncCronMinute : 0,
                        backupCronHour: typeof settings.backupCronHour === "number" ? settings.backupCronHour : 3,
                        backupCronMinute: typeof settings.backupCronMinute === "number" ? settings.backupCronMinute : 30,
                        defaultLocale: settings.defaultLocale ?? "en",
                        timeFormat: settings.timeFormat ?? "24h",
                        maxConcurrentTranscodes: typeof settings.maxConcurrentTranscodes === "number" ? settings.maxConcurrentTranscodes : 0,
                        wrappedVisible: typeof settings.wrappedVisible === "boolean" ? settings.wrappedVisible : true,
                        wrappedPeriodEnabled: typeof settings.wrappedPeriodEnabled === "boolean" ? settings.wrappedPeriodEnabled : true,
                        wrappedStartMonth: typeof settings.wrappedStartMonth === "number" ? settings.wrappedStartMonth : 12,
                        wrappedStartDay: typeof settings.wrappedStartDay === "number" ? settings.wrappedStartDay : 1,
                        wrappedEndMonth: typeof settings.wrappedEndMonth === "number" ? settings.wrappedEndMonth : 1,
                        wrappedEndDay: typeof settings.wrappedEndDay === "number" ? settings.wrappedEndDay : 31,
                        pluginKeyRotationDays: typeof settings.pluginKeyRotationDays === "number" ? settings.pluginKeyRotationDays : 90,
                        pluginAutoRotateEnabled: typeof settings.pluginAutoRotateEnabled === "boolean" ? settings.pluginAutoRotateEnabled : false,
                        pluginKeyRotationGraceHours: typeof settings.pluginKeyRotationGraceHours === "number" ? settings.pluginKeyRotationGraceHours : 24,
                        pluginTelemetrySettings: settings.pluginTelemetrySettings ?? null,
                        authRememberThirtyDaysEnabled: typeof settings.authRememberThirtyDaysEnabled === "boolean" ? settings.authRememberThirtyDaysEnabled : true,
                        authSessionsRevokedAt: settings.authSessionsRevokedAt ? new Date(String(settings.authSessionsRevokedAt)) : null,
                        resolutionThresholds: settings.resolutionThresholds ?? null,
                    }
                });
            }
        }, { timeout: 120000 });

        if (normalized.systemHealth) {
            await replaceSystemHealthState(normalized.systemHealth);
        }

        revalidateDashboardCache();

        console.log(`[Auto-Backup Restore] Successfully restored from ${backupFile.fileName}`);
        return NextResponse.json({ success: true, message: await apiT('restoreSuccess', { fileName: backupFile.fileName }) });

    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[Auto-Backup Restore] Error:", e);
        return NextResponse.json({ error: msg || await apiT('restoreError') }, { status: 500 });
    }
}
