import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractBearerToken, verifyPluginAuth, corsJson, CORS_HEADERS } from "./pluginAuth";

const mocks = vi.hoisted(() => ({
    getPluginKeySnapshot: vi.fn(),
    comparePluginApiKey: vi.fn(),
    isPreviousPluginKeyValid: vi.fn(),
    parsePluginApiKeyCandidate: vi.fn(),
    verifyScopedPluginApiKey: vi.fn(),
}));

vi.mock("@/lib/pluginKeyManager", () => ({
    getPluginKeySnapshot: mocks.getPluginKeySnapshot,
    comparePluginApiKey: mocks.comparePluginApiKey,
    isPreviousPluginKeyValid: mocks.isPreviousPluginKeyValid,
}));

vi.mock("@/lib/pluginServerKey", () => ({
    parsePluginApiKeyCandidate: mocks.parsePluginApiKeyCandidate,
    verifyScopedPluginApiKey: mocks.verifyScopedPluginApiKey,
}));

describe("pluginAuth", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("extractBearerToken", () => {
        it("extracts token from Bearer header", () => {
            expect(extractBearerToken("Bearer my-secret-token")).toBe("my-secret-token");
            expect(extractBearerToken("bearer my-secret-token")).toBe("my-secret-token");
        });

        it("returns null for non-bearer or empty values", () => {
            expect(extractBearerToken(null)).toBeNull();
            expect(extractBearerToken("Basic 12345")).toBeNull();
            expect(extractBearerToken("Bearer ")).toBeNull();
        });
    });

    describe("corsJson", () => {
        it("adds CORS headers to response", async () => {
            const res = corsJson({ ok: true }, { status: 200 });
            expect(res.status).toBe(200);
            expect(res.headers.get("Access-Control-Allow-Methods")).toBe(CORS_HEADERS["Access-Control-Allow-Methods"]);
        });
    });

    describe("verifyPluginAuth", () => {
        it("authorizes valid current API key", async () => {
            mocks.getPluginKeySnapshot.mockResolvedValue({
                snapshot: { currentKeyHash: "hash-curr", previousKeyHash: null },
                autoRotated: false,
            });
            mocks.parsePluginApiKeyCandidate.mockReturnValue({ scoped: false, scopedToken: null, rawKey: "raw-curr" });
            mocks.verifyScopedPluginApiKey.mockReturnValue({ valid: false, jellyfinServerId: null });
            mocks.comparePluginApiKey.mockResolvedValue(true);

            const req = new Request("http://localhost/api/plugin/events", {
                headers: { "x-api-key": "raw-curr" },
            });

            const result = await verifyPluginAuth(req);
            expect(result.authorized).toBe(true);
            expect(result.usedPreviousKey).toBe(false);
            expect(result.scopeServerId).toBeNull();
        });

        it("rejects invalid API key", async () => {
            mocks.getPluginKeySnapshot.mockResolvedValue({
                snapshot: { currentKeyHash: "hash-curr", previousKeyHash: null },
                autoRotated: false,
            });
            mocks.parsePluginApiKeyCandidate.mockReturnValue({ scoped: false, scopedToken: null, rawKey: "wrong-key" });
            mocks.verifyScopedPluginApiKey.mockReturnValue({ valid: false, jellyfinServerId: null });
            mocks.comparePluginApiKey.mockResolvedValue(false);
            mocks.isPreviousPluginKeyValid.mockReturnValue(false);

            const req = new Request("http://localhost/api/plugin/events", {
                headers: { "x-api-key": "wrong-key" },
            });

            const result = await verifyPluginAuth(req);
            expect(result.authorized).toBe(false);
        });
    });
});
