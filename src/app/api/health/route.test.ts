import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
    prisma: {
        $queryRaw: vi.fn(),
        globalSettings: {
            findFirst: vi.fn(),
        },
    },
    valkey: {
        get: vi.fn(),
    },
    requireAdmin: vi.fn(),
    getConfiguredJellyfinServers: vi.fn(),
    fetchJellyfinSystemInfo: vi.fn(),
    resolveServerApiKey: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ default: mocks.prisma }));
vi.mock("@/lib/valkey", () => ({ default: mocks.valkey }));
vi.mock("@/lib/auth", () => ({
    requireAdmin: mocks.requireAdmin,
    isAuthError: (res: any) => res instanceof NextResponse,
}));
vi.mock("@/lib/jellyfinServers", () => ({
    getConfiguredJellyfinServers: mocks.getConfiguredJellyfinServers,
    fetchJellyfinSystemInfo: mocks.fetchJellyfinSystemInfo,
    resolveServerApiKey: mocks.resolveServerApiKey,
}));

import { GET } from "./route";

describe("/api/health", () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        vi.resetAllMocks();
        process.env = { ...originalEnv };
        // Default happy path mocks
        mocks.prisma.$queryRaw = vi.fn().mockResolvedValue([{ 1: 1 }]);
        mocks.valkey.get.mockResolvedValue("pong");
        mocks.getConfiguredJellyfinServers.mockResolvedValue([]);
    });

    it("returns public minimal response when not authenticated as admin (happy path)", async () => {
        // Return an auth error (representing unauthenticated caller)
        mocks.requireAdmin.mockResolvedValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));

        const response = await GET();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual({ status: "up" });
    });

    it("returns public minimal response with 503 status code when database or valkey is down", async () => {
        // Return an auth error
        mocks.requireAdmin.mockResolvedValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
        // Mock database failure
        mocks.prisma.$queryRaw.mockRejectedValue(new Error("Database connection timeout. URL: postgresql://postgres:mypassword@localhost:5432/db"));

        const response = await GET();
        const body = await response.json();

        expect(response.status).toBe(503);
        expect(body).toEqual({ status: "down" });
    });

    it("returns detailed diagnostic response when authenticated as admin", async () => {
        mocks.requireAdmin.mockResolvedValue({ isAdmin: true });
        mocks.getConfiguredJellyfinServers.mockResolvedValue([
            { id: "server-1", name: "Jellyfin Server 1", url: "http://myjellyfin:8096" }
        ]);
        mocks.resolveServerApiKey.mockReturnValue("secret_apikey_token_123");
        mocks.fetchJellyfinSystemInfo.mockResolvedValue({ serverId: "jf-id-1", serverName: "Jellyfin Server 1" });

        const response = await GET();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.status).toBe("up");
        expect(body.services).toEqual({
            database: "up",
            valkey: "up",
            jellyfin: "up",
        });
        expect(body.jellyfinServers).toEqual({
            "Jellyfin Server 1": "up",
        });
        expect(body.errors).toBeUndefined();
    });

    it("redacts credentials from database errors for admin", async () => {
        mocks.requireAdmin.mockResolvedValue({ isAdmin: true });
        mocks.prisma.$queryRaw.mockRejectedValue(new Error("Failed to connect to postgresql://user123:secret_pass_999@db.host:5432/jellytrack"));

        const response = await GET();
        const body = await response.json();

        expect(response.status).toBe(503);
        expect(body.errors.database).toContain("[REDACTED]");
        expect(body.errors.database).not.toContain("secret_pass_999");
        expect(body.errors.database).not.toContain("user123");
    });

    it("redacts credentials from valkey errors for admin", async () => {
        mocks.requireAdmin.mockResolvedValue({ isAdmin: true });
        process.env.valkey_URL = "valkey://:secret_valkey_key_777@valkey.host:6379";
        mocks.valkey.get.mockRejectedValue(new Error("Failed connection to valkey://:secret_valkey_key_777@valkey.host:6379"));

        const response = await GET();
        const body = await response.json();

        expect(response.status).toBe(503);
        expect(body.errors.valkey).toContain("[REDACTED]");
        expect(body.errors.valkey).not.toContain("secret_valkey_key_777");
    });

    it("redacts API keys and URLs from jellyfin errors for admin", async () => {
        mocks.requireAdmin.mockResolvedValue({ isAdmin: true });
        mocks.getConfiguredJellyfinServers.mockResolvedValue([
            { id: "server-1", name: "Jellyfin Server 1", url: "http://myjellyfin:8096", apiKey: "secret_api_key_555" }
        ]);
        mocks.resolveServerApiKey.mockReturnValue("secret_api_key_555");
        mocks.fetchJellyfinSystemInfo.mockRejectedValue(new Error("Unreachable URL: http://myjellyfin:8096 API Key: secret_api_key_555"));

        const response = await GET();
        const body = await response.json();

        expect(response.status).toBe(503);
        expect(body.errors.jellyfin).toContain("[REDACTED]");
        expect(body.errors.jellyfin).not.toContain("secret_api_key_555");
    });
});

