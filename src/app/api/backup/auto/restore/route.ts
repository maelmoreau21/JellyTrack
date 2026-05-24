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

export async function POST(req: NextRequest) {
    const auth = await requireAdminMutation(req);
    if (isAuthError(auth)) return auth;

    try {
        const { fileName } = await req.json();

        if (!fileName || typeof fileName !== "string") {
            return NextResponse.json({ error: await apiT('fileNameInvalid') }, { status: 400 });
        }

        const backupFile = resolveAutoBackupFile(fileName);
        if (!backupFile) {
            return NextResponse.json({ error: await apiT('fileAutoOnly') }, { status: 400 });
        }

        if (!fs.existsSync(backupFile.filePath)) {
            return NextResponse.json({ error: await apiT('fileNotFound') }, { status: 404 });
        }

        const raw = fs.readFileSync(backupFile.filePath, "utf-8");
        const backup = JSON.parse(raw);

        if (!backup.data) {
            return NextResponse.json({ error: await apiT('backupFormatInvalid') }, { status: 400 });
        }

        const { servers, users, media, playbackHistory, telemetryEvents, settings, systemHealth } = backup.data;
        const masterIdentity = getMasterServerIdentityFromEnv();
        const normalizedServers = Array.isArray(servers) && servers.length > 0
            ? servers.map((s: Record<string, unknown>, index: number) => ({
                id: (typeof s.id === "string" && s.id) ? s.id : randomUUID(),
                jellyfinServerId: (typeof s.jellyfinServerId === "string" && s.jellyfinServerId)
                    ? s.jellyfinServerId
                    : `imported-server-${index + 1}`,
                name: (typeof s.name === "string" && s.name) ? s.name : `Imported Server ${index + 1}`,
                url: (typeof s.url === "string" && s.url) ? s.url : masterIdentity.url,
                isActive: typeof s.isActive === "boolean" ? s.isActive : true,
                createdAt: s.createdAt ? new Date(String(s.createdAt)) : new Date(),
                updatedAt: s.updatedAt ? new Date(String(s.updatedAt)) : new Date(),
            }))
            : [{
                id: randomUUID(),
                jellyfinServerId: masterIdentity.jellyfinServerId,
                name: masterIdentity.name,
                url: masterIdentity.url,
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date(),
            }];
        const defaultServerId = normalizedServers[0].id;

        // Restore using transaction
        await prisma.$transaction(async (tx) => {
            // Clear existing data
            await tx.systemHealthEvent.deleteMany();
            await tx.systemHealthState.deleteMany();
            await tx.playbackHistory.deleteMany();
            await tx.media.deleteMany();
            await tx.user.deleteMany();
            await tx.server.deleteMany();

            // Restore servers first (FK parent)
            for (const s of normalizedServers) {
                await tx.server.create({
                    data: {
                        id: s.id,
                        jellyfinServerId: s.jellyfinServerId,
                        name: s.name,
                        url: s.url,
                        isActive: s.isActive,
                        createdAt: s.createdAt,
                        updatedAt: s.updatedAt,
                    }
                });
            }

            // Restore users
            if (users?.length > 0) {
                for (const u of users) {
                    await tx.user.create({
                        data: {
                            id: u.id,
                            serverId: u.serverId || defaultServerId,
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
                            serverId: m.serverId || defaultServerId,
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
                            serverId: ph.serverId || defaultServerId,
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
                const playbackServerMap = new Map<string, string>();
                for (const ph of playbackHistory || []) {
                    if (ph?.id) playbackServerMap.set(String(ph.id), String(ph.serverId || defaultServerId));
                }
                for (const ev of telemetryEvents) {
                    await tx.telemetryEvent.create({
                        data: {
                            id: ev.id,
                            serverId: ev.serverId || playbackServerMap.get(String(ev.playbackId)) || defaultServerId,
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

        // Skip rules
        if (systemHealth) {
            await replaceSystemHealthState(systemHealth);
        }

        console.log(`[Auto-Backup Restore] Successfully restored from ${backupFile.fileName}`);
        return NextResponse.json({ success: true, message: await apiT('restoreSuccess', { fileName: backupFile.fileName }) });

    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[Auto-Backup Restore] Error:", e);
        return NextResponse.json({ error: msg || await apiT('restoreError') }, { status: 500 });
    }
}
