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
            // Clear existing data (volatile and references first)
            await tx.activeStream.deleteMany();
            await tx.telemetryEvent.deleteMany();
            await tx.playbackHistory.deleteMany();
            await tx.media.deleteMany();
            await tx.user.deleteMany();
            await tx.server.deleteMany();
            await tx.systemHealthEvent.deleteMany();
            await tx.systemHealthState.deleteMany();

            // Restore servers first (FK parent)
            if (normalizedServers.length > 0) {
                await tx.server.createMany({ data: normalizedServers });
            }

            // Restore users
            if (users && users.length > 0) {
                const usersToInsert = users.map((u: any) => ({
                    id: u.id,
                    serverId: u.serverId || defaultServerId,
                    jellyfinUserId: u.jellyfinUserId,
                    username: u.username,
                    isActive: typeof u.isActive === "boolean" ? u.isActive : true,
                    lastActive: u.lastActive ? new Date(String(u.lastActive)) : null,
                    createdAt: u.createdAt ? new Date(String(u.createdAt)) : new Date(),
                    updatedAt: u.updatedAt ? new Date(String(u.updatedAt)) : new Date(),
                }));
                await tx.user.createMany({ data: usersToInsert });
            }

            // Restore media
            if (media && media.length > 0) {
                const mediaToInsert = media.map((m: any) => ({
                    id: m.id,
                    serverId: m.serverId || defaultServerId,
                    jellyfinMediaId: m.jellyfinMediaId,
                    title: m.title,
                    type: m.type,
                    collectionType: m.collectionType || null,
                    libraryName: m.libraryName || null,
                    genres: Array.isArray(m.genres) ? m.genres : [],
                    resolution: m.resolution || null,
                    durationMs: m.durationMs != null ? BigInt(String(m.durationMs)) : null,
                    size: m.size != null ? BigInt(String(m.size)) : null,
                    directors: Array.isArray(m.directors) ? m.directors : [],
                    actors: Array.isArray(m.actors) ? m.actors : [],
                    studios: Array.isArray(m.studios) ? m.studios : [],
                    parentId: m.parentId || null,
                    artist: m.artist || null,
                    dateAdded: m.dateAdded ? new Date(String(m.dateAdded)) : null,
                    createdAt: m.createdAt ? new Date(String(m.createdAt)) : new Date(),
                    updatedAt: m.updatedAt ? new Date(String(m.updatedAt)) : new Date(),
                }));
                await tx.media.createMany({ data: mediaToInsert });
            }

            // Restore playback history
            const playbackToInsert = Array.isArray(playbackHistory)
                ? playbackHistory.map((ph: any) => ({
                    id: ph.id,
                    serverId: ph.serverId || defaultServerId,
                    userId: ph.userId || null,
                    mediaId: ph.mediaId,
                    playMethod: ph.playMethod,
                    eventSource: ph.eventSource || "playback",
                    sourceEventId: ph.sourceEventId || null,
                    clientName: ph.clientName || null,
                    deviceName: ph.deviceName || null,
                    ipAddress: ph.ipAddress || null,
                    country: ph.country || null,
                    city: ph.city || null,
                    durationWatched: typeof ph.durationWatched === "number" ? ph.durationWatched : 0,
                    startedAt: ph.startedAt ? new Date(String(ph.startedAt)) : new Date(),
                    endedAt: ph.endedAt ? new Date(String(ph.endedAt)) : null,
                    audioLanguage: ph.audioLanguage || null,
                    audioCodec: ph.audioCodec || null,
                    subtitleLanguage: ph.subtitleLanguage || null,
                    subtitleCodec: ph.subtitleCodec || null,
                    bitrate: typeof ph.bitrate === "number" ? ph.bitrate : null,
                    pauseCount: typeof ph.pauseCount === "number" ? ph.pauseCount : 0,
                    audioChanges: typeof ph.audioChanges === "number" ? ph.audioChanges : 0,
                    subtitleChanges: typeof ph.subtitleChanges === "number" ? ph.subtitleChanges : 0,
                    seekCount: typeof ph.seekCount === "number" ? ph.seekCount : 0,
                    rewatchCount: typeof ph.rewatchCount === "number" ? ph.rewatchCount : 0,
                    speedChangeCount: typeof ph.speedChangeCount === "number" ? ph.speedChangeCount : 0,
                    maxPlaybackRate: typeof ph.maxPlaybackRate === "number" ? ph.maxPlaybackRate : null,
                }))
                : [];

            if (playbackToInsert.length > 0) {
                await tx.playbackHistory.createMany({ data: playbackToInsert });
            }

            // Restore telemetry events (if present in backup)
            if (telemetryEvents && telemetryEvents.length > 0) {
                const playbackServerMap = new Map<string, string>();
                for (const ph of playbackToInsert) {
                    if (ph.id) playbackServerMap.set(String(ph.id), String(ph.serverId || defaultServerId));
                }
                const telemetryToInsert = telemetryEvents.map((ev: any) => ({
                    id: ev.id,
                    serverId: ev.serverId || playbackServerMap.get(String(ev.playbackId)) || defaultServerId,
                    playbackId: ev.playbackId,
                    eventType: ev.eventType,
                    positionMs: ev.positionMs != null ? BigInt(String(ev.positionMs)) : BigInt(0),
                    metadata: ev.metadata || null,
                    createdAt: ev.createdAt ? new Date(String(ev.createdAt)) : new Date(),
                }));
                await tx.telemetryEvent.createMany({ data: telemetryToInsert });
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
                        defaultLocale: settings.defaultLocale ?? "en",
                        timeFormat: settings.timeFormat ?? "24h",
                        maxConcurrentTranscodes: settings.maxConcurrentTranscodes ?? 0,
                        wrappedVisible: settings.wrappedVisible ?? true,
                        wrappedPeriodEnabled: settings.wrappedPeriodEnabled ?? true,
                        wrappedStartMonth: settings.wrappedStartMonth ?? 12,
                        wrappedStartDay: settings.wrappedStartDay ?? 1,
                        wrappedEndMonth: settings.wrappedEndMonth ?? 1,
                        wrappedEndDay: settings.wrappedEndDay ?? 31,
                        pluginKeyRotationDays: settings.pluginKeyRotationDays ?? 90,
                        pluginAutoRotateEnabled: settings.pluginAutoRotateEnabled ?? false,
                        pluginKeyRotationGraceHours: settings.pluginKeyRotationGraceHours ?? 24,
                        pluginTelemetrySettings: settings.pluginTelemetrySettings ?? null,
                        authRememberThirtyDaysEnabled: settings.authRememberThirtyDaysEnabled ?? true,
                        authSessionsRevokedAt: settings.authSessionsRevokedAt ? new Date(String(settings.authSessionsRevokedAt)) : null,
                        resolutionThresholds: settings.resolutionThresholds ?? null,
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
                        defaultLocale: settings.defaultLocale ?? "en",
                        timeFormat: settings.timeFormat ?? "24h",
                        maxConcurrentTranscodes: settings.maxConcurrentTranscodes ?? 0,
                        wrappedVisible: settings.wrappedVisible ?? true,
                        wrappedPeriodEnabled: settings.wrappedPeriodEnabled ?? true,
                        wrappedStartMonth: settings.wrappedStartMonth ?? 12,
                        wrappedStartDay: settings.wrappedStartDay ?? 1,
                        wrappedEndMonth: settings.wrappedEndMonth ?? 1,
                        wrappedEndDay: settings.wrappedEndDay ?? 31,
                        pluginKeyRotationDays: settings.pluginKeyRotationDays ?? 90,
                        pluginAutoRotateEnabled: settings.pluginAutoRotateEnabled ?? false,
                        pluginKeyRotationGraceHours: settings.pluginKeyRotationGraceHours ?? 24,
                        pluginTelemetrySettings: settings.pluginTelemetrySettings ?? null,
                        authRememberThirtyDaysEnabled: settings.authRememberThirtyDaysEnabled ?? true,
                        authSessionsRevokedAt: settings.authSessionsRevokedAt ? new Date(String(settings.authSessionsRevokedAt)) : null,
                        resolutionThresholds: settings.resolutionThresholds ?? null,
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
