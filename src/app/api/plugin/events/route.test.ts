import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
    const prisma = {
        $transaction: vi.fn(),
        globalSettings: {
            upsert: vi.fn(),
        },
        activeStream: {
            findUnique: vi.fn(),
            upsert: vi.fn(),
            delete: vi.fn(),
            updateMany: vi.fn(),
        },
        user: {
            findFirst: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        },
        media: {
            findFirst: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
        playbackHistory: {
            findUnique: vi.fn(),
            findFirst: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            updateMany: vi.fn(),
        },
        telemetryEvent: {
            create: vi.fn(),
            createMany: vi.fn(),
            updateMany: vi.fn(),
        },
    };

    const redis = {
        get: vi.fn(),
        setex: vi.fn(),
        del: vi.fn(),
        incr: vi.fn(),
        expire: vi.fn(),
    };

    return {
        prisma,
        redis,
        sourceServer: {
            id: "server-db-1",
            jellyfinServerId: "jellyfin-main",
            name: "Jellyfin Main",
            url: "http://jellyfin.local",
        },
    };
});

vi.mock("@/lib/prisma", () => ({ default: mocks.prisma }));
vi.mock("@/lib/redis", () => ({ default: mocks.redis }));
vi.mock("@/lib/geoip", () => ({ getGeoLocation: vi.fn(() => ({ country: null, city: null })) }));
vi.mock("@/lib/mediaPolicy", () => ({
    inferLibraryKey: vi.fn(() => "movies"),
    isLibraryExcluded: vi.fn(() => false),
}));
vi.mock("@/lib/cleanup", () => ({ cleanupOrphanedSessions: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/systemHealth", () => ({
    appendHealthEvent: vi.fn(() => Promise.resolve()),
    markMonitorPoll: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/pluginEventRateLimit", () => ({
    consumePluginEventRateLimit: vi.fn(() => Promise.resolve({ allowed: true })),
}));
vi.mock("@/lib/adminAudit", () => ({ writeAdminAuditLog: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/pluginKeyManager", () => ({
    comparePluginApiKey: vi.fn(() => Promise.resolve(true)),
    getPluginKeySnapshot: vi.fn(() => Promise.resolve({
        snapshot: { currentKeyHash: "current-key-hash", previousKeyHash: null },
        autoRotated: false,
    })),
    isPreviousPluginKeyValid: vi.fn(() => false),
}));
vi.mock("@/lib/pluginServerKey", () => ({
    parsePluginApiKeyCandidate: vi.fn((rawKey: string | null) => ({
        rawKey,
        jellyfinServerId: null,
        scoped: false,
        scopedToken: null,
    })),
    verifyScopedPluginApiKey: vi.fn(() => ({ valid: false })),
}));
vi.mock("@/lib/webhookValidator", () => ({
    isValidDiscordWebhook: vi.fn(() => false),
    safeFetchWebhook: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/requestIp", () => ({
    getClientIp: vi.fn(() => "127.0.0.1"),
    normalizeIp: vi.fn((value: string | null) => value),
}));
vi.mock("@/lib/pluginTelemetrySettings", () => ({
    getCachedPluginIngestSettings: vi.fn(() => Promise.resolve({
        excludedLibraries: [],
        telemetry: {
            precisionProfile: "very_precise",
            playingProgressIntervalSeconds: 5,
            pausedProgressIntervalSeconds: 30,
            staleSessionTimeoutSeconds: 90,
            mergeWindowSeconds: 300,
            seekThresholdSeconds: 20,
            trackPauseResume: true,
            trackSeek: true,
            trackAudioSubtitleChanges: true,
            trackSessionEnded: true,
            retryQueueSize: 500,
            retryFlushBatchSize: 50,
        },
    })),
}));
vi.mock("@/lib/serverRegistry", () => ({
    buildLegacyStreamRedisKey: vi.fn((sessionId: string) => `stream:${sessionId}`),
    buildStreamRedisKey: vi.fn((serverId: string, sessionId: string) => `stream:${serverId}:${sessionId}`),
    extractServerIdentityFromPayload: vi.fn((payload: Record<string, unknown>) => ({
        jellyfinServerId: String(payload.serverId || "jellyfin-main"),
        name: "Jellyfin Main",
        url: "http://jellyfin.local",
    })),
    upsertServerRecord: vi.fn(() => Promise.resolve(mocks.sourceServer)),
}));

import { POST } from "./route";

function resetMockTree(value: unknown) {
    if (!value || typeof value !== "object") return;
    for (const item of Object.values(value)) {
        if (typeof item === "function" && "mockReset" in item) {
            item.mockReset();
        } else {
            resetMockTree(item);
        }
    }
}

function requestFor(payload: Record<string, unknown>) {
    return new Request("http://localhost/api/plugin/events", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "x-api-key": "jt_test",
        },
        body: JSON.stringify(payload),
    });
}

const activeStream = {
    id: "active-1",
    sessionId: "session-1",
    userId: "user-db-1",
    mediaId: "media-db-1",
    playbackId: "playback-1",
};

const streamUser = {
    id: "user-db-1",
    username: "Alice",
    jellyfinUserId: "jf-user-1",
};

const streamMedia = {
    id: "media-db-1",
    title: "The Movie",
    type: "Movie",
    collectionType: "movies",
    durationMs: BigInt(600_000),
    artist: null,
    libraryName: "Films",
    parentId: null,
    size: null,
};

const activePlayback = {
    id: "playback-1",
    serverId: "server-db-1",
    userId: "user-db-1",
    mediaId: "media-db-1",
    startedAt: new Date(Date.now() - 60_000),
    endedAt: null,
    durationWatched: 0,
    clientName: "Jellyfin Web",
    media: streamMedia,
};

describe("/api/plugin/events schema v3 ingestion", () => {
    beforeEach(() => {
        resetMockTree(mocks.prisma);
        resetMockTree(mocks.redis);

        mocks.prisma.globalSettings.upsert.mockResolvedValue({});
        mocks.prisma.telemetryEvent.create.mockResolvedValue({});
        mocks.prisma.telemetryEvent.createMany.mockResolvedValue({ count: 0 });
        mocks.prisma.playbackHistory.update.mockImplementation(async ({ where, data }) => ({
            ...activePlayback,
            id: where.id,
            ...data,
        }));
        mocks.prisma.activeStream.delete.mockResolvedValue({});
        mocks.prisma.activeStream.upsert.mockResolvedValue({});
        mocks.prisma.user.update.mockResolvedValue(streamUser);
        mocks.redis.get.mockResolvedValue(null);
        mocks.redis.setex.mockResolvedValue("OK");
        mocks.redis.del.mockResolvedValue(1);
    });

    it("records pause, resume, and seek state changes immediately for schema v3", async () => {
        mocks.prisma.activeStream.findUnique.mockResolvedValue(activeStream);

        const pauseResponse = await POST(requestFor({
            event: "PlaybackStateChanged",
            eventSchemaVersion: 3,
            serverId: "jellyfin-main",
            sessionId: "session-1",
            changeType: "pause",
            positionTicks: 100_000_000,
            user: { jellyfinUserId: "jf-user-1" },
            media: { jellyfinMediaId: "jf-media-1" },
        }));

        const resumeResponse = await POST(requestFor({
            event: "PlaybackStateChanged",
            eventSchemaVersion: 3,
            serverId: "jellyfin-main",
            sessionId: "session-1",
            changeType: "resume",
            positionTicks: 120_000_000,
            user: { jellyfinUserId: "jf-user-1" },
            media: { jellyfinMediaId: "jf-media-1" },
        }));
        const seekResponse = await POST(requestFor({
            event: "PlaybackStateChanged",
            eventSchemaVersion: 3,
            serverId: "jellyfin-main",
            sessionId: "session-1",
            changeType: "seek",
            positionTicks: 300_000_000,
            user: { jellyfinUserId: "jf-user-1" },
            media: { jellyfinMediaId: "jf-media-1" },
            metadata: { fromTicks: 120_000_000, toTicks: 300_000_000, direction: "forward" },
        }));

        expect(pauseResponse.status).toBe(200);
        expect(resumeResponse.status).toBe(200);
        expect(seekResponse.status).toBe(200);
        expect(mocks.prisma.telemetryEvent.create).toHaveBeenCalledTimes(3);
        expect(mocks.prisma.telemetryEvent.create.mock.calls.map(([arg]) => arg.data.eventType)).toEqual(["pause", "resume", "seek"]);
        expect(mocks.prisma.playbackHistory.update).toHaveBeenCalledWith({
            where: { id: "playback-1" },
            data: { pauseCount: { increment: 1 } },
        });
    });

    it("finalizes once from SessionEnded and ignores a duplicate close", async () => {
        mocks.prisma.activeStream.findUnique
            .mockResolvedValueOnce({ ...activeStream, positionTicks: BigInt(150_000_000) })
            .mockResolvedValueOnce(null);
        mocks.prisma.playbackHistory.findUnique.mockResolvedValue(activePlayback);

        const first = await POST(requestFor({
            event: "SessionEnded",
            eventSchemaVersion: 3,
            serverId: "jellyfin-main",
            sessionId: "session-1",
            user: { jellyfinUserId: "jf-user-1" },
            session: { positionTicks: 150_000_000, clientName: "Jellyfin Web" },
        }));
        const duplicate = await POST(requestFor({
            event: "SessionEnded",
            eventSchemaVersion: 3,
            serverId: "jellyfin-main",
            sessionId: "session-1",
            user: { jellyfinUserId: "jf-user-1" },
            session: { positionTicks: 150_000_000, clientName: "Jellyfin Web" },
        }));

        expect(first.status).toBe(200);
        expect(duplicate.status).toBe(200);
        expect(mocks.prisma.telemetryEvent.create).toHaveBeenCalledTimes(1);
        expect(mocks.prisma.telemetryEvent.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                playbackId: "playback-1",
                eventType: "session_end",
                positionMs: BigInt(15_000),
            }),
        }));
        expect(mocks.prisma.playbackHistory.update).toHaveBeenCalledTimes(1);
        expect(mocks.prisma.activeStream.delete).toHaveBeenCalledTimes(1);
    });

    it("does not double-finalize when PlaybackStop is followed by SessionEnded", async () => {
        mocks.prisma.user.findFirst.mockResolvedValue({ id: "user-db-1" });
        mocks.prisma.activeStream.findUnique
            .mockResolvedValueOnce({ ...activeStream, positionTicks: BigInt(200_000_000) })
            .mockResolvedValueOnce(null);
        mocks.prisma.playbackHistory.findUnique.mockResolvedValue(activePlayback);

        const stop = await POST(requestFor({
            event: "PlaybackStop",
            eventSchemaVersion: 3,
            serverId: "jellyfin-main",
            sessionId: "session-1",
            positionTicks: 200_000_000,
            user: { jellyfinUserId: "jf-user-1" },
            media: { jellyfinMediaId: "jf-media-1" },
        }));
        const sessionEnded = await POST(requestFor({
            event: "SessionEnded",
            eventSchemaVersion: 3,
            serverId: "jellyfin-main",
            sessionId: "session-1",
            user: { jellyfinUserId: "jf-user-1" },
            session: { positionTicks: 200_000_000, clientName: "Jellyfin Web" },
        }));

        expect(stop.status).toBe(200);
        expect(sessionEnded.status).toBe(200);
        expect(mocks.prisma.telemetryEvent.create).toHaveBeenCalledTimes(1);
        expect(mocks.prisma.telemetryEvent.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                playbackId: "playback-1",
                eventType: "stop",
                positionMs: BigInt(20_000),
            }),
        }));
        expect(mocks.prisma.playbackHistory.update).toHaveBeenCalledTimes(1);
    });

    it("uses the session fast path for schema v2 PlaybackProgress", async () => {
        mocks.prisma.media.findFirst.mockResolvedValue(streamMedia);
        mocks.prisma.activeStream.findUnique.mockResolvedValue({
            ...activeStream,
            clientName: "Jellyfin Web",
            deviceName: "Chrome",
            playMethod: "DirectPlay",
            ipAddress: "127.0.0.1",
            user: streamUser,
            media: streamMedia,
        });
        mocks.prisma.playbackHistory.findUnique.mockResolvedValue(activePlayback);

        const response = await POST(requestFor({
            event: "PlaybackProgress",
            eventSchemaVersion: 2,
            serverId: "jellyfin-main",
            sessionId: "session-1",
            positionTicks: 50_000_000,
            isPaused: false,
            user: { jellyfinUserId: "jf-user-1", username: "Alice" },
            media: {
                jellyfinMediaId: "jf-media-1",
                title: "The Movie",
                type: "Movie",
                collectionType: "movies",
                durationMs: 600_000,
            },
            session: {
                clientName: "Jellyfin Web",
                deviceName: "Chrome",
                playMethod: "DirectPlay",
                ipAddress: "127.0.0.1",
            },
        }));

        expect(response.status).toBe(200);
        expect(mocks.prisma.user.update).toHaveBeenCalledWith({
            where: { id: "user-db-1" },
            data: { lastActive: expect.any(Date) },
        });
        expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
        expect(mocks.prisma.activeStream.upsert).toHaveBeenCalledWith(expect.objectContaining({
            update: expect.objectContaining({ playbackId: "playback-1" }),
            create: expect.objectContaining({ playbackId: "playback-1" }),
        }));
    });
});
