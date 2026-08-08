import { randomUUID } from "crypto";
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
    settings: Record<string, unknown> | null;
    systemHealth: any | null;
};

export function extractBackupData(body: any): any {
    if (!body || typeof body !== "object") return null;
    if (body.data && typeof body.data === "object") return body.data;
    if (Array.isArray(body.servers) || Array.isArray(body.playbackHistory) || Array.isArray(body.media) || Array.isArray(body.users)) {
        return body;
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
            isActive: typeof s.isActive === "boolean" ? s.isActive : true,
            createdAt: safeDate(s.createdAt) ?? new Date(),
            updatedAt: safeDate(s.updatedAt) ?? new Date(),
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

    return {
        servers,
        users,
        media,
        playbackHistory,
        telemetryEvents,
        settings: (rawBackupData?.settings && typeof rawBackupData.settings === "object") ? rawBackupData.settings : null,
        systemHealth: rawBackupData?.systemHealth || null,
    };
}
