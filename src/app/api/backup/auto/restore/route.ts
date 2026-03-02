import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin, isAuthError } from "@/lib/auth";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { apiT } from "@/lib/i18n-api";

export const dynamic = "force-dynamic";

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), "backups");

export async function POST(req: NextRequest) {
    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    try {
        const { fileName } = await req.json();

        if (!fileName || typeof fileName !== "string") {
            return NextResponse.json({ error: await apiT('fileNameInvalid') }, { status: 400 });
        }

        // Security: prevent path traversal
        const sanitized = path.basename(fileName);

        // Security: only allow restoring auto-backup files
        if (!sanitized.startsWith("jellytulli-auto-") || !sanitized.endsWith(".json")) {
            return NextResponse.json({ error: await apiT('fileAutoOnly') }, { status: 400 });
        }

        const filePath = path.join(BACKUP_DIR, sanitized);

        if (!existsSync(filePath)) {
            return NextResponse.json({ error: await apiT('fileNotFound') }, { status: 404 });
        }

        const raw = readFileSync(filePath, "utf-8");
        const backup = JSON.parse(raw);

        if (!backup.data) {
            return NextResponse.json({ error: await apiT('backupFormatInvalid') }, { status: 400 });
        }

        const { users, media, playbackHistory, telemetryEvents, settings } = backup.data;

        // Restore using transaction
        await prisma.$transaction(async (tx) => {
            // Clear existing data
            await tx.playbackHistory.deleteMany();
            await tx.media.deleteMany();
            await tx.user.deleteMany();

            // Restore users
            if (users?.length > 0) {
                for (const u of users) {
                    await tx.user.create({
                        data: {
                            id: u.id,
                            jellyfinUserId: u.jellyfinUserId,
                            username: u.username,
                            createdAt: new Date(u.createdAt),
                        }
                    });
                }
            }

            // Restore media
            if (media?.length > 0) {
                for (const m of media) {
                    await tx.media.create({
                        data: {
                            id: m.id,
                            jellyfinMediaId: m.jellyfinMediaId,
                            title: m.title,
                            type: m.type,
                            collectionType: m.collectionType || null,
                            genres: m.genres || [],
                            resolution: m.resolution || null,
                            durationMs: m.durationMs != null ? BigInt(m.durationMs) : null,
                            parentId: m.parentId || null,
                            artist: m.artist || null,
                            dateAdded: m.dateAdded ? new Date(m.dateAdded) : null,
                            createdAt: new Date(m.createdAt),
                        }
                    });
                }
            }

            // Restore playback history
            if (playbackHistory?.length > 0) {
                for (const ph of playbackHistory) {
                    await tx.playbackHistory.create({
                        data: {
                            id: ph.id,
                            userId: ph.userId,
                            mediaId: ph.mediaId,
                            startedAt: new Date(ph.startedAt),
                            endedAt: ph.endedAt ? new Date(ph.endedAt) : null,
                            durationWatched: ph.durationWatched || 0,
                            playMethod: ph.playMethod,
                            clientName: ph.clientName,
                            deviceName: ph.deviceName,
                            ipAddress: ph.ipAddress,
                            country: ph.country,
                            city: ph.city,
                            audioCodec: ph.audioCodec,
                            audioLanguage: ph.audioLanguage,
                            subtitleCodec: ph.subtitleCodec,
                            subtitleLanguage: ph.subtitleLanguage,
                            pauseCount: ph.pauseCount || 0,
                            audioChanges: ph.audioChanges || 0,
                            subtitleChanges: ph.subtitleChanges || 0,
                        }
                    });
                }
            }

            // Restore telemetry events (if present in backup)
            if (telemetryEvents?.length > 0) {
                for (const ev of telemetryEvents) {
                    await (tx as any).telemetryEvent.create({
                        data: {
                            id: ev.id,
                            playbackId: ev.playbackId,
                            eventType: ev.eventType,
                            positionMs: ev.positionMs != null ? BigInt(ev.positionMs) : BigInt(0),
                            metadata: ev.metadata || null,
                            createdAt: ev.createdAt ? new Date(ev.createdAt) : new Date(),
                        }
                    });
                }
            }

            // Restore settings
            if (settings) {
                await tx.globalSettings.upsert({
                    where: { id: "global" },
                    update: {
                        discordWebhookUrl: settings.discordWebhookUrl ?? null,
                        discordAlertsEnabled: settings.discordAlertsEnabled ?? false,
                        discordAlertCondition: settings.discordAlertCondition ?? "ALL",
                        excludedLibraries: settings.excludedLibraries ?? [],
                        monitorIntervalActive: settings.monitorIntervalActive ?? 1000,
                        monitorIntervalIdle: settings.monitorIntervalIdle ?? 5000,
                        syncCronHour: settings.syncCronHour ?? 3,
                        syncCronMinute: settings.syncCronMinute ?? 0,
                        backupCronHour: settings.backupCronHour ?? 3,
                        backupCronMinute: settings.backupCronMinute ?? 30,
                        defaultLocale: settings.defaultLocale ?? "fr",
                        timeFormat: settings.timeFormat ?? "24h",
                    },
                    create: {
                        id: "global",
                        discordWebhookUrl: settings.discordWebhookUrl ?? null,
                        discordAlertsEnabled: settings.discordAlertsEnabled ?? false,
                        discordAlertCondition: settings.discordAlertCondition ?? "ALL",
                        excludedLibraries: settings.excludedLibraries ?? [],
                        monitorIntervalActive: settings.monitorIntervalActive ?? 1000,
                        monitorIntervalIdle: settings.monitorIntervalIdle ?? 5000,
                        syncCronHour: settings.syncCronHour ?? 3,
                        syncCronMinute: settings.syncCronMinute ?? 0,
                        backupCronHour: settings.backupCronHour ?? 3,
                        backupCronMinute: settings.backupCronMinute ?? 30,
                        defaultLocale: settings.defaultLocale ?? "fr",
                        timeFormat: settings.timeFormat ?? "24h",
                    }
                });
            }
        }, { timeout: 120000 });

        console.log(`[Auto-Backup Restore] Successfully restored from ${sanitized}`);
        return NextResponse.json({ success: true, message: await apiT('restoreSuccess', { fileName: sanitized }) });

    } catch (e: any) {
        console.error("[Auto-Backup Restore] Error:", e);
        return NextResponse.json({ error: e.message || await apiT('restoreError') }, { status: 500 });
    }
}
