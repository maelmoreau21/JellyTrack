import { randomUUID } from "crypto";
import JSZip from "jszip";
import prisma from "@/lib/prisma";
import { replaceSystemHealthState } from "@/lib/systemHealth";
import { getMasterServerIdentityFromEnv } from "./serverRegistry";

export function safeBigInt(val: unknown): bigint | null {
    if (val === undefined || val === null || val === "") return null;
    try {
        if (typeof val === "bigint") return val;
        if (typeof val === "number") {
            if (!Number.isFinite(val)) return null;
            return BigInt(Math.floor(val));
        }
        const str = String(val).trim();
        if (!str) return null;
        if (str.includes(".")) {
            const parsedFloat = parseFloat(str);
            if (!Number.isFinite(parsedFloat)) return null;
            return BigInt(Math.floor(parsedFloat));
        }
        return BigInt(str);
    } catch {
        return null;
    }
}

export function safeDate(val: unknown): Date | null {
    if (!val) return null;
    try {
        const d = new Date(String(val));
        return isNaN(d.getTime()) ? null : d;
    } catch {
        return null;
    }
}

export function safeInt(val: unknown, fallback: number = 0): number {
    if (typeof val === "number" && Number.isFinite(val)) return Math.floor(val);
    if (typeof val === "string") {
        const p = parseInt(val, 10);
        if (!isNaN(p)) return p;
    }
    return fallback;
}

export function safeFloat(val: unknown): number | null {
    if (typeof val === "number" && Number.isFinite(val)) return val;
    if (typeof val === "string") {
        const p = parseFloat(val);
        if (!isNaN(p) && Number.isFinite(p)) return p;
    }
    return null;
}

export type NormalizedBackupData = {
    servers: Array<{
        id: string;
        jellyfinServerId: string;
        name: string;
        url: string;
        jellyfinApiKey: string | null;
        allowAuthFallback: boolean;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
    }>;
    users: Array<{
        id: string;
        serverId: string;
        jellyfinUserId: string;
        username: string;
        isActive: boolean;
        lastActive: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    media: Array<{
        id: string;
        serverId: string;
        jellyfinMediaId: string;
        title: string;
        type: string;
        collectionType: string | null;
        libraryName: string | null;
        genres: string[];
        resolution: string | null;
        durationMs: bigint | null;
        size: bigint | null;
        directors: string[];
        actors: string[];
        studios: string[];
        parentId: string | null;
        artist: string | null;
        dateAdded: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    playbackHistory: Array<{
        id: string;
        serverId: string;
        userId: string | null;
        mediaId: string;
        playMethod: string;
        eventSource: string;
        sourceEventId: string | null;
        clientName: string | null;
        deviceName: string | null;
        ipAddress: string | null;
        country: string | null;
        city: string | null;
        durationWatched: number;
        startedAt: Date;
        endedAt: Date | null;
        audioLanguage: string | null;
        audioCodec: string | null;
        subtitleLanguage: string | null;
        subtitleCodec: string | null;
        bitrate: number | null;
        pauseCount: number;
        audioChanges: number;
        subtitleChanges: number;
        seekCount: number;
        rewatchCount: number;
        speedChangeCount: number;
        maxPlaybackRate: number | null;
    }>;
    telemetryEvents: Array<{
        id: string;
        serverId: string;
        playbackId: string;
        eventType: string;
        positionMs: bigint;
        metadata: string | null;
        createdAt: Date;
    }>;
    dailyStats: Array<{
        id: string;
        date: Date;
        userId: string | null;
        libraryName: string | null;
        mediaType: string | null;
        totalPlays: number;
        totalDuration: number;
        directPlays: number;
        transcodes: number;
        uniqueMedia: number;
        updatedAt: Date;
    }>;
    adminAuditLogs: Array<{
        id: string;
        action: string;
        actorUserId: string | null;
        actorUsername: string | null;
        target: string | null;
        ipAddress: string | null;
        details: any | null;
        createdAt: Date;
    }>;
    settings: Record<string, unknown> | null;
    systemHealth: any | null;
};

export function cleanJsonText(rawText: string): string {
    if (!rawText) return "";
    let text = rawText.trim();
    if (text.charCodeAt(0) === 0xFEFF) {
        text = text.slice(1).trim();
    }
    return text;
}

export async function batchCreateMany<T>(
    createFn: (batch: T[]) => Promise<unknown>,
    items: T[],
    chunkSize: number = 1000
): Promise<void> {
    if (!items || items.length === 0) return;
    for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        await createFn(chunk);
    }
}

export function extractBackupData(body: any): any {
    if (!body || typeof body !== "object") return null;

    let candidate = body;
    if (body.data && typeof body.data === "object" && !Array.isArray(body.data)) {
        candidate = body.data;
    }

    if (candidate && typeof candidate === "object") {
        if (!candidate.playbackHistory && candidate.playback_history) {
            candidate.playbackHistory = candidate.playback_history;
        }
        if (!candidate.telemetryEvents && candidate.telemetry_events) {
            candidate.telemetryEvents = candidate.telemetry_events;
        }
        if (!candidate.dailyStats && candidate.daily_stats) {
            candidate.dailyStats = candidate.daily_stats;
        }
        if (!candidate.adminAuditLogs && candidate.admin_audit_logs) {
            candidate.adminAuditLogs = candidate.admin_audit_logs;
        }
        if (!candidate.systemHealth && candidate.system_health) {
            candidate.systemHealth = candidate.system_health;
        }
        if (
            Array.isArray(candidate.servers) ||
            Array.isArray(candidate.playbackHistory) ||
            Array.isArray(candidate.media) ||
            Array.isArray(candidate.users) ||
            candidate.settings
        ) {
            return candidate;
        }
    }
    return null;
}

export function normalizeBackupData(rawBackupData: any): NormalizedBackupData {
    const masterIdentity = getMasterServerIdentityFromEnv();
    const rawServers = Array.isArray(rawBackupData?.servers) ? rawBackupData.servers : [];

    const servers = rawServers.length > 0
        ? rawServers.map((s: Record<string, unknown>, index: number) => ({
            id: (typeof s.id === "string" && s.id.trim()) ? s.id.trim() : randomUUID(),
            jellyfinServerId: (typeof s.jellyfinServerId === "string" && s.jellyfinServerId.trim())
                ? s.jellyfinServerId.trim()
                : `imported-server-${index + 1}`,
            name: (typeof s.name === "string" && s.name.trim()) ? s.name.trim() : `Imported Server ${index + 1}`,
            url: (typeof s.url === "string" && s.url.trim()) ? s.url.trim() : masterIdentity.url,
            jellyfinApiKey: typeof s.jellyfinApiKey === "string" ? s.jellyfinApiKey : null,
            allowAuthFallback: typeof s.allowAuthFallback === "boolean" ? s.allowAuthFallback : false,
            isActive: typeof s.isActive === "boolean" ? s.isActive : true,
            createdAt: safeDate(s.createdAt) ?? new Date(),
            updatedAt: safeDate(s.updatedAt) ?? new Date(),
        }))
        : [{
            id: randomUUID(),
            jellyfinServerId: masterIdentity.jellyfinServerId,
            name: masterIdentity.name,
            url: masterIdentity.url,
            jellyfinApiKey: null,
            allowAuthFallback: false,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        }];

    const validServerIds = new Set(servers.map((s: { id: string }) => s.id));
    const defaultServerId = servers[0].id;

    const rawUsers = Array.isArray(rawBackupData?.users) ? rawBackupData.users : [];
    const users = rawUsers.map((u: any, index: number) => ({
        id: (typeof u.id === "string" && u.id.trim()) ? u.id.trim() : randomUUID(),
        serverId: (typeof u.serverId === "string" && validServerIds.has(u.serverId.trim()))
            ? u.serverId.trim()
            : defaultServerId,
        jellyfinUserId: (typeof u.jellyfinUserId === "string" && u.jellyfinUserId.trim())
            ? u.jellyfinUserId.trim()
            : `imported-user-${index + 1}`,
        username: (typeof u.username === "string" && u.username.trim()) ? u.username.trim() : `User ${index + 1}`,
        isActive: typeof u.isActive === "boolean" ? u.isActive : true,
        lastActive: safeDate(u.lastActive),
        createdAt: safeDate(u.createdAt) ?? new Date(),
        updatedAt: safeDate(u.updatedAt) ?? new Date(),
    }));

    const validUserIds = new Set(users.map((u: { id: string }) => u.id));

    const rawMedia = Array.isArray(rawBackupData?.media) ? rawBackupData.media : [];
    const media = rawMedia.map((m: any, index: number) => ({
        id: (typeof m.id === "string" && m.id.trim()) ? m.id.trim() : randomUUID(),
        serverId: (typeof m.serverId === "string" && validServerIds.has(m.serverId.trim()))
            ? m.serverId.trim()
            : defaultServerId,
        jellyfinMediaId: (typeof m.jellyfinMediaId === "string" && m.jellyfinMediaId.trim())
            ? m.jellyfinMediaId.trim()
            : `imported-media-${index + 1}`,
        title: (typeof m.title === "string" && m.title.trim()) ? m.title.trim() : `Item ${index + 1}`,
        type: (typeof m.type === "string" && m.type.trim()) ? m.type.trim() : "Unknown",
        collectionType: m.collectionType ? String(m.collectionType) : null,
        libraryName: m.libraryName ? String(m.libraryName) : null,
        genres: Array.isArray(m.genres) ? m.genres.map(String) : [],
        resolution: m.resolution ? String(m.resolution) : null,
        durationMs: safeBigInt(m.durationMs),
        size: safeBigInt(m.size),
        directors: Array.isArray(m.directors) ? m.directors.map(String) : [],
        actors: Array.isArray(m.actors) ? m.actors.map(String) : [],
        studios: Array.isArray(m.studios) ? m.studios.map(String) : [],
        parentId: m.parentId ? String(m.parentId) : null,
        artist: m.artist ? String(m.artist) : null,
        dateAdded: safeDate(m.dateAdded),
        createdAt: safeDate(m.createdAt) ?? new Date(),
        updatedAt: safeDate(m.updatedAt) ?? new Date(),
    }));

    const validMediaIds = new Set(media.map((m: { id: string }) => m.id));

    const rawPlayback = Array.isArray(rawBackupData?.playbackHistory) ? rawBackupData.playbackHistory : [];
    const playbackHistory = rawPlayback
        .filter((ph: any) => ph && ph.mediaId && validMediaIds.has(String(ph.mediaId).trim()))
        .map((ph: any) => {
            const id = (typeof ph.id === "string" && ph.id.trim()) ? ph.id.trim() : randomUUID();
            const serverId = (typeof ph.serverId === "string" && validServerIds.has(ph.serverId.trim()))
                ? ph.serverId.trim()
                : defaultServerId;
            const userId = (ph.userId && validUserIds.has(String(ph.userId).trim()))
                ? String(ph.userId).trim()
                : null;
            return {
                id,
                serverId,
                userId,
                mediaId: String(ph.mediaId).trim(),
                playMethod: ph.playMethod ? String(ph.playMethod) : "DirectPlay",
                eventSource: ph.eventSource ? String(ph.eventSource) : "playback",
                sourceEventId: ph.sourceEventId ? String(ph.sourceEventId) : null,
                clientName: ph.clientName ? String(ph.clientName) : null,
                deviceName: ph.deviceName ? String(ph.deviceName) : null,
                ipAddress: ph.ipAddress ? String(ph.ipAddress) : null,
                country: ph.country ? String(ph.country) : null,
                city: ph.city ? String(ph.city) : null,
                durationWatched: safeInt(ph.durationWatched, 0),
                startedAt: safeDate(ph.startedAt) ?? new Date(),
                endedAt: safeDate(ph.endedAt),
                audioLanguage: ph.audioLanguage ? String(ph.audioLanguage) : null,
                audioCodec: ph.audioCodec ? String(ph.audioCodec) : null,
                subtitleLanguage: ph.subtitleLanguage ? String(ph.subtitleLanguage) : null,
                subtitleCodec: ph.subtitleCodec ? String(ph.subtitleCodec) : null,
                bitrate: safeInt(ph.bitrate, 0) || null,
                pauseCount: safeInt(ph.pauseCount, 0),
                audioChanges: safeInt(ph.audioChanges, 0),
                subtitleChanges: safeInt(ph.subtitleChanges, 0),
                seekCount: safeInt(ph.seekCount, 0),
                rewatchCount: safeInt(ph.rewatchCount, 0),
                speedChangeCount: safeInt(ph.speedChangeCount, 0),
                maxPlaybackRate: safeFloat(ph.maxPlaybackRate),
            };
        });

    const validPlaybackIds = new Set(playbackHistory.map((ph: { id: string }) => ph.id));
    const playbackServerMap = new Map<string, string>();
    for (const ph of playbackHistory) {
        playbackServerMap.set(ph.id, ph.serverId);
    }

    const rawTelemetry = Array.isArray(rawBackupData?.telemetryEvents) ? rawBackupData.telemetryEvents : [];
    const telemetryEvents = rawTelemetry
        .filter((ev: any) => ev && ev.playbackId && validPlaybackIds.has(String(ev.playbackId).trim()))
        .map((ev: any) => {
            const id = (typeof ev.id === "string" && ev.id.trim()) ? ev.id.trim() : randomUUID();
            const playbackId = String(ev.playbackId).trim();
            const serverId = (typeof ev.serverId === "string" && validServerIds.has(ev.serverId.trim()))
                ? ev.serverId.trim()
                : (playbackServerMap.get(playbackId) || defaultServerId);

            return {
                id,
                serverId,
                playbackId,
                eventType: ev.eventType ? String(ev.eventType) : "telemetry",
                positionMs: safeBigInt(ev.positionMs) ?? BigInt(0),
                metadata: ev.metadata != null ? (typeof ev.metadata === "object" ? JSON.stringify(ev.metadata) : String(ev.metadata)) : null,
                createdAt: safeDate(ev.createdAt) ?? new Date(),
            };
        });

    const rawDailyStats = Array.isArray(rawBackupData?.dailyStats) ? rawBackupData.dailyStats : [];
    const dailyStats = rawDailyStats.map((ds: any) => ({
        id: (typeof ds.id === "string" && ds.id.trim()) ? ds.id.trim() : randomUUID(),
        date: safeDate(ds.date) ?? new Date(),
        userId: ds.userId ? String(ds.userId).trim() : null,
        libraryName: ds.libraryName ? String(ds.libraryName).trim() : null,
        mediaType: ds.mediaType ? String(ds.mediaType).trim() : null,
        totalPlays: safeInt(ds.totalPlays, 0),
        totalDuration: safeInt(ds.totalDuration, 0),
        directPlays: safeInt(ds.directPlays, 0),
        transcodes: safeInt(ds.transcodes, 0),
        uniqueMedia: safeInt(ds.uniqueMedia, 0),
        updatedAt: safeDate(ds.updatedAt) ?? new Date(),
    }));

    const rawAdminLogs = Array.isArray(rawBackupData?.adminAuditLogs) ? rawBackupData.adminAuditLogs : [];
    const adminAuditLogs = rawAdminLogs.map((log: any) => ({
        id: (typeof log.id === "string" && log.id.trim()) ? log.id.trim() : randomUUID(),
        action: String(log.action || "unknown"),
        actorUserId: log.actorUserId ? String(log.actorUserId).trim() : null,
        actorUsername: log.actorUsername ? String(log.actorUsername).trim() : null,
        target: log.target ? String(log.target).trim() : null,
        ipAddress: log.ipAddress ? String(log.ipAddress).trim() : null,
        details: log.details ?? null,
        createdAt: safeDate(log.createdAt) ?? new Date(),
    }));

    return {
        servers,
        users,
        media,
        playbackHistory,
        telemetryEvents,
        dailyStats,
        adminAuditLogs,
        settings: (rawBackupData?.settings && typeof rawBackupData.settings === "object") ? rawBackupData.settings : null,
        systemHealth: rawBackupData?.systemHealth || null,
    };
}

/**
 * Formats a JS value into a valid PostgreSQL SQL literal.
 */
export function formatSqlValue(val: unknown): string {
    if (val === null || val === undefined) return "NULL";
    if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
    if (typeof val === "number") {
        if (!Number.isFinite(val)) return "NULL";
        return String(val);
    }
    if (typeof val === "bigint") return val.toString();
    if (val instanceof Date) {
        return `'${val.toISOString()}'::timestamptz`;
    }
    if (Array.isArray(val)) {
        if (val.length === 0) return "ARRAY[]::text[]";
        const escapedItems = val.map(item => `'${String(item).replace(/'/g, "''")}'`);
        return `ARRAY[${escapedItems.join(", ")}]::text[]`;
    }
    if (typeof val === "object") {
        const str = JSON.stringify(val).replace(/'/g, "''");
        return `'${str}'::jsonb`;
    }
    const str = String(val).replace(/'/g, "''");
    return `'${str}'`;
}

/**
 * Generates database.sql string containing ANSI/PostgreSQL DDL and DML statements.
 */
export function generateDatabaseSqlDump(data: NormalizedBackupData): string {
    const lines: string[] = [];
    lines.push(`-- JellyTrack PostgreSQL Database Backup Dump`);
    lines.push(`-- Created at ${new Date().toISOString()}`);
    lines.push(``);
    lines.push(`TRUNCATE TABLE "ActiveStream", "TelemetryEvent", "PlaybackHistory", "DailyStats", "Media", "User", "Server", "AdminAuditLog", "SystemHealthEvent", "SystemHealthState", "GlobalSettings" CASCADE;`);
    lines.push(``);

    // 1. Server
    if (data.servers.length > 0) {
        lines.push(`-- Table: Server`);
        for (let i = 0; i < data.servers.length; i += 500) {
            const batch = data.servers.slice(i, i + 500);
            const valueRows = batch.map(s => `(${formatSqlValue(s.id)}, ${formatSqlValue(s.jellyfinServerId)}, ${formatSqlValue(s.name)}, ${formatSqlValue(s.url)}, ${formatSqlValue(s.jellyfinApiKey)}, ${formatSqlValue(s.allowAuthFallback)}, ${formatSqlValue(s.isActive)}, ${formatSqlValue(s.createdAt)}, ${formatSqlValue(s.updatedAt)})`);
            lines.push(`INSERT INTO "Server" ("id", "jellyfinServerId", "name", "url", "jellyfinApiKey", "allowAuthFallback", "isActive", "createdAt", "updatedAt") VALUES\n${valueRows.join(",\n")};`);
        }
        lines.push(``);
    }

    // 2. User
    if (data.users.length > 0) {
        lines.push(`-- Table: User`);
        for (let i = 0; i < data.users.length; i += 500) {
            const batch = data.users.slice(i, i + 500);
            const valueRows = batch.map(u => `(${formatSqlValue(u.id)}, ${formatSqlValue(u.serverId)}, ${formatSqlValue(u.jellyfinUserId)}, ${formatSqlValue(u.username)}, ${formatSqlValue(u.isActive)}, ${formatSqlValue(u.lastActive)}, ${formatSqlValue(u.createdAt)}, ${formatSqlValue(u.updatedAt)})`);
            lines.push(`INSERT INTO "User" ("id", "serverId", "jellyfinUserId", "username", "isActive", "lastActive", "createdAt", "updatedAt") VALUES\n${valueRows.join(",\n")};`);
        }
        lines.push(``);
    }

    // 3. Media
    if (data.media.length > 0) {
        lines.push(`-- Table: Media`);
        for (let i = 0; i < data.media.length; i += 500) {
            const batch = data.media.slice(i, i + 500);
            const valueRows = batch.map(m => `(${formatSqlValue(m.id)}, ${formatSqlValue(m.serverId)}, ${formatSqlValue(m.jellyfinMediaId)}, ${formatSqlValue(m.title)}, ${formatSqlValue(m.type)}, ${formatSqlValue(m.collectionType)}, ${formatSqlValue(m.libraryName)}, ${formatSqlValue(m.genres)}, ${formatSqlValue(m.resolution)}, ${formatSqlValue(m.durationMs)}, ${formatSqlValue(m.size)}, ${formatSqlValue(m.directors)}, ${formatSqlValue(m.actors)}, ${formatSqlValue(m.studios)}, ${formatSqlValue(m.parentId)}, ${formatSqlValue(m.artist)}, ${formatSqlValue(m.dateAdded)}, ${formatSqlValue(m.createdAt)}, ${formatSqlValue(m.updatedAt)})`);
            lines.push(`INSERT INTO "Media" ("id", "serverId", "jellyfinMediaId", "title", "type", "collectionType", "libraryName", "genres", "resolution", "durationMs", "size", "directors", "actors", "studios", "parentId", "artist", "dateAdded", "createdAt", "updatedAt") VALUES\n${valueRows.join(",\n")};`);
        }
        lines.push(``);
    }

    // 4. PlaybackHistory
    if (data.playbackHistory.length > 0) {
        lines.push(`-- Table: PlaybackHistory`);
        for (let i = 0; i < data.playbackHistory.length; i += 500) {
            const batch = data.playbackHistory.slice(i, i + 500);
            const valueRows = batch.map(ph => `(${formatSqlValue(ph.id)}, ${formatSqlValue(ph.serverId)}, ${formatSqlValue(ph.userId)}, ${formatSqlValue(ph.mediaId)}, ${formatSqlValue(ph.playMethod)}, ${formatSqlValue(ph.eventSource)}, ${formatSqlValue(ph.sourceEventId)}, ${formatSqlValue(ph.clientName)}, ${formatSqlValue(ph.deviceName)}, ${formatSqlValue(ph.ipAddress)}, ${formatSqlValue(ph.country)}, ${formatSqlValue(ph.city)}, ${formatSqlValue(ph.durationWatched)}, ${formatSqlValue(ph.startedAt)}, ${formatSqlValue(ph.endedAt)}, ${formatSqlValue(ph.audioLanguage)}, ${formatSqlValue(ph.audioCodec)}, ${formatSqlValue(ph.subtitleLanguage)}, ${formatSqlValue(ph.subtitleCodec)}, ${formatSqlValue(ph.bitrate)}, ${formatSqlValue(ph.pauseCount)}, ${formatSqlValue(ph.audioChanges)}, ${formatSqlValue(ph.subtitleChanges)}, ${formatSqlValue(ph.seekCount)}, ${formatSqlValue(ph.rewatchCount)}, ${formatSqlValue(ph.speedChangeCount)}, ${formatSqlValue(ph.maxPlaybackRate)})`);
            lines.push(`INSERT INTO "PlaybackHistory" ("id", "serverId", "userId", "mediaId", "playMethod", "eventSource", "sourceEventId", "clientName", "deviceName", "ipAddress", "country", "city", "durationWatched", "startedAt", "endedAt", "audioLanguage", "audioCodec", "subtitleLanguage", "subtitleCodec", "bitrate", "pauseCount", "audioChanges", "subtitleChanges", "seekCount", "rewatchCount", "speedChangeCount", "maxPlaybackRate") VALUES\n${valueRows.join(",\n")};`);
        }
        lines.push(``);
    }

    // 5. TelemetryEvent
    if (data.telemetryEvents.length > 0) {
        lines.push(`-- Table: TelemetryEvent`);
        for (let i = 0; i < data.telemetryEvents.length; i += 500) {
            const batch = data.telemetryEvents.slice(i, i + 500);
            const valueRows = batch.map(te => `(${formatSqlValue(te.id)}, ${formatSqlValue(te.serverId)}, ${formatSqlValue(te.playbackId)}, ${formatSqlValue(te.eventType)}, ${formatSqlValue(te.positionMs)}, ${formatSqlValue(te.metadata)}, ${formatSqlValue(te.createdAt)})`);
            lines.push(`INSERT INTO "TelemetryEvent" ("id", "serverId", "playbackId", "eventType", "positionMs", "metadata", "createdAt") VALUES\n${valueRows.join(",\n")};`);
        }
        lines.push(``);
    }

    return lines.join("\n");
}

function safeJsonReplacer(_key: string, value: unknown) {
    if (typeof value === "bigint") {
        return value.toString();
    }
    return value;
}

/**
 * Creates a ZIP buffer containing database.json, settings.json, manifest.json, and database.sql.
 */
export async function createZipBackup(rawBackupData: any): Promise<Buffer> {
    const normalized = normalizeBackupData(extractBackupData(rawBackupData) || rawBackupData);
    const sqlDump = generateDatabaseSqlDump(normalized);

    const manifest = {
        generator: "JellyTrack Backup Engine v2.0",
        version: "2.0",
        format: "zip-json",
        exportDate: new Date().toISOString(),
        tables: {
            servers: normalized.servers.length,
            users: normalized.users.length,
            media: normalized.media.length,
            playbackHistory: normalized.playbackHistory.length,
            telemetryEvents: normalized.telemetryEvents.length,
            dailyStats: normalized.dailyStats.length,
            adminAuditLogs: normalized.adminAuditLogs.length,
        }
    };

    const databaseContent = {
        servers: normalized.servers,
        users: normalized.users,
        media: normalized.media,
        playbackHistory: normalized.playbackHistory,
        telemetryEvents: normalized.telemetryEvents,
        dailyStats: normalized.dailyStats,
        adminAuditLogs: normalized.adminAuditLogs,
    };

    const settingsContent = {
        version: "2.0",
        exportDate: manifest.exportDate,
        settings: normalized.settings,
        systemHealth: normalized.systemHealth,
    };

    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify(manifest, null, 2));
    zip.file("database.json", JSON.stringify(databaseContent, safeJsonReplacer, 2));
    zip.file("settings.json", JSON.stringify(settingsContent, null, 2));
    zip.file("database.sql", sqlDump);

    const zipArrayBuffer = await zip.generateAsync({
        type: "nodebuffer",
        compression: "DEFLATE",
        compressionOptions: { level: 6 }
    });

    return Buffer.from(zipArrayBuffer);
}

/**
 * Unpacks a ZIP backup buffer and returns database, settings, and manifest contents.
 */
export async function unpackBackupZip(buffer: Buffer): Promise<{ databaseData: any | null; sqlDump: string | null; settings: any | null; manifest: any | null } | null> {
    try {
        const zip = await JSZip.loadAsync(buffer);
        const manifestFile = zip.file("manifest.json");
        const databaseFile = zip.file("database.json");
        const settingsFile = zip.file("settings.json");
        const sqlFile = zip.file("database.sql");

        let manifest = null;
        if (manifestFile) {
            try {
                manifest = JSON.parse(await manifestFile.async("string"));
            } catch {}
        }

        let databaseData = null;
        if (databaseFile) {
            try {
                databaseData = JSON.parse(await databaseFile.async("string"));
            } catch {}
        }

        let settings = null;
        if (settingsFile) {
            try {
                settings = JSON.parse(await settingsFile.async("string"));
            } catch {}
        }

        const sqlDump = sqlFile ? await sqlFile.async("string") : null;

        return { databaseData, sqlDump, settings, manifest };
    } catch {
        return null;
    }
}

/**
 * High-level restoration procedure supporting ZIP archives and legacy JSON backups.
 * Executes transactional restoration using Prisma Client to ensure compatibility with all DB setups (internal/external).
 */
export async function restoreBackupBuffer(buffer: Buffer): Promise<{ success: boolean; mode: "zip" | "json" }> {
    const unpacked = await unpackBackupZip(buffer);

    let rawToRestore: any = null;
    let mode: "zip" | "json" = "zip";

    if (unpacked) {
        mode = "zip";
        if (unpacked.databaseData) {
            rawToRestore = {
                ...unpacked.databaseData,
                settings: unpacked.settings?.settings ?? null,
                systemHealth: unpacked.settings?.systemHealth ?? null,
            };
        } else if (unpacked.settings) {
            rawToRestore = {
                settings: unpacked.settings?.settings ?? null,
                systemHealth: unpacked.settings?.systemHealth ?? null,
            };
        }
    }

    if (!rawToRestore) {
        // Fallback for legacy raw JSON file
        try {
            const rawText = cleanJsonText(buffer.toString("utf-8"));
            const json = JSON.parse(rawText);
            rawToRestore = extractBackupData(json) || json;
            mode = "json";
        } catch {
            throw new Error("Format de sauvegarde invalide. Veuillez fournir un fichier .zip valide.");
        }
    }

    const normalized = normalizeBackupData(rawToRestore);

    await prisma.$transaction(async (tx) => {
        // 1. Clear tables in correct FK order
        await tx.activeStream.deleteMany();
        await tx.telemetryEvent.deleteMany();
        await tx.playbackHistory.deleteMany();
        await tx.dailyStats.deleteMany();
        await tx.media.deleteMany();
        await tx.user.deleteMany();
        await tx.server.deleteMany();
        await tx.adminAuditLog.deleteMany();
        await tx.systemHealthEvent.deleteMany();
        await tx.systemHealthState.deleteMany();
        await tx.globalSettings.deleteMany();

        // 2. Insert entities in correct FK order
        await batchCreateMany((batch) => tx.server.createMany({ data: batch }), normalized.servers, 1000);
        await batchCreateMany((batch) => tx.user.createMany({ data: batch }), normalized.users, 1000);
        await batchCreateMany((batch) => tx.media.createMany({ data: batch }), normalized.media, 1000);
        await batchCreateMany((batch) => tx.playbackHistory.createMany({ data: batch }), normalized.playbackHistory, 1000);
        await batchCreateMany((batch) => tx.telemetryEvent.createMany({ data: batch }), normalized.telemetryEvents, 1000);
        if (normalized.dailyStats.length > 0) {
            await batchCreateMany((batch) => tx.dailyStats.createMany({ data: batch }), normalized.dailyStats, 1000);
        }
        if (normalized.adminAuditLogs.length > 0) {
            await batchCreateMany((batch) => tx.adminAuditLog.createMany({ data: batch }), normalized.adminAuditLogs, 1000);
        }

        // 3. Restore all GlobalSettings
        const cs = (normalized.settings || {}) as Record<string, unknown>;
        await tx.globalSettings.create({
            data: {
                id: "global",
                discordWebhookUrl: (cs['discordWebhookUrl'] as string) ?? null,
                discordAlertCondition: (cs['discordAlertCondition'] as string) ?? "ALL",
                discordAlertsEnabled: (cs['discordAlertsEnabled'] as boolean) ?? false,
                maxConcurrentTranscodes: typeof cs['maxConcurrentTranscodes'] === "number" ? cs['maxConcurrentTranscodes'] : 0,
                excludedLibraries: Array.isArray(cs['excludedLibraries']) ? (cs['excludedLibraries'] as string[]) : [],
                syncCronHour: typeof cs['syncCronHour'] === "number" ? cs['syncCronHour'] : 3,
                syncCronMinute: typeof cs['syncCronMinute'] === "number" ? cs['syncCronMinute'] : 0,
                backupCronHour: typeof cs['backupCronHour'] === "number" ? cs['backupCronHour'] : 3,
                backupCronMinute: typeof cs['backupCronMinute'] === "number" ? cs['backupCronMinute'] : 30,
                defaultLocale: (cs['defaultLocale'] as string) ?? "en",
                timeFormat: (cs['timeFormat'] as string) ?? "24h",
                wrappedVisible: typeof cs['wrappedVisible'] === "boolean" ? cs['wrappedVisible'] : true,
                wrappedPeriodEnabled: typeof cs['wrappedPeriodEnabled'] === "boolean" ? cs['wrappedPeriodEnabled'] : true,
                wrappedStartMonth: typeof cs['wrappedStartMonth'] === "number" ? cs['wrappedStartMonth'] : 12,
                wrappedStartDay: typeof cs['wrappedStartDay'] === "number" ? cs['wrappedStartDay'] : 1,
                wrappedEndMonth: typeof cs['wrappedEndMonth'] === "number" ? cs['wrappedEndMonth'] : 1,
                wrappedEndDay: typeof cs['wrappedEndDay'] === "number" ? cs['wrappedEndDay'] : 31,
                pluginApiKey: (cs['pluginApiKey'] as string) ?? null,
                pluginPreviousApiKey: (cs['pluginPreviousApiKey'] as string) ?? null,
                pluginPreviousApiKeyExpiresAt: safeDate(cs['pluginPreviousApiKeyExpiresAt']),
                pluginKeyCreatedAt: safeDate(cs['pluginKeyCreatedAt']),
                pluginKeyExpiresAt: safeDate(cs['pluginKeyExpiresAt']),
                pluginKeyRotationDays: typeof cs['pluginKeyRotationDays'] === "number" ? cs['pluginKeyRotationDays'] : 90,
                pluginAutoRotateEnabled: typeof cs['pluginAutoRotateEnabled'] === "boolean" ? cs['pluginAutoRotateEnabled'] : false,
                pluginKeyRotationGraceHours: typeof cs['pluginKeyRotationGraceHours'] === "number" ? cs['pluginKeyRotationGraceHours'] : 24,
                pluginLastSeen: safeDate(cs['pluginLastSeen']),
                pluginVersion: (cs['pluginVersion'] as string) ?? null,
                pluginServerName: (cs['pluginServerName'] as string) ?? null,
                pluginTelemetrySettings: (cs['pluginTelemetrySettings'] as any) ?? null,
                authRememberThirtyDaysEnabled: typeof cs['authRememberThirtyDaysEnabled'] === "boolean" ? cs['authRememberThirtyDaysEnabled'] : true,
                authSessionsRevokedAt: safeDate(cs['authSessionsRevokedAt']),
                resolutionThresholds: (cs['resolutionThresholds'] as any) ?? null,
                ssoSettings: (cs['ssoSettings'] as any) ?? null,
            }
        });
    }, { timeout: 180000 });

    if (normalized.systemHealth) {
        await replaceSystemHealthState(normalized.systemHealth);
    }

    return { success: true, mode };
}
