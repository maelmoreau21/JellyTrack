import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { NextRequest } from "next/server";

vi.mock("@/lib/adminRequestGuard", () => ({
    requireAdminMutation: vi.fn().mockResolvedValue({ user: { id: "admin-1", isAdmin: true } }),
}));

vi.mock("@/lib/auth", () => ({
    isAuthError: vi.fn().mockReturnValue(false),
}));

describe("POST /api/jellyfin/send-message", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.JELLYFIN_URL = "http://jellyfin.test:8096";
        process.env.JELLYFIN_API_KEY = "test-api-key";
        global.fetch = vi.fn();
    });

    it("returns 400 when sessionId or message is missing", async () => {
        const req = new NextRequest("http://localhost:3000/api/jellyfin/send-message", {
            method: "POST",
            body: JSON.stringify({ sessionId: "" }),
        });

        const res = await POST(req);
        expect(res.status).toBe(400);
    });

    it("sends message successfully to Jellyfin API and returns 200", async () => {
        vi.mocked(global.fetch).mockResolvedValueOnce({
            ok: true,
            status: 204,
            text: async () => "",
        } as unknown as Response);

        const req = new NextRequest("http://localhost:3000/api/jellyfin/send-message", {
            method: "POST",
            body: JSON.stringify({
                sessionId: "session-123",
                message: "Maintenance dans 5 min",
                header: "Alerte Admin",
                timeoutMs: 5000,
            }),
        });

        const res = await POST(req);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);

        expect(global.fetch).toHaveBeenCalledWith(
            "http://jellyfin.test:8096/Sessions/session-123/Message",
            expect.objectContaining({
                method: "POST",
                headers: expect.objectContaining({
                    Authorization: 'MediaBrowser Token="test-api-key"',
                }),
                body: JSON.stringify({
                    Header: "Alerte Admin",
                    Text: "Maintenance dans 5 min",
                    TimeoutMs: 5000,
                }),
            })
        );
    });

    it("handles Jellyfin fetch failure gracefully", async () => {
        vi.mocked(global.fetch).mockResolvedValueOnce({
            ok: false,
            status: 500,
            text: async () => "Internal Server Error",
        } as unknown as Response);

        const req = new NextRequest("http://localhost:3000/api/jellyfin/send-message", {
            method: "POST",
            body: JSON.stringify({
                sessionId: "session-123",
                message: "Test message",
            }),
        });

        const res = await POST(req);
        expect(res.status).toBe(500);
        const data = await res.json();
        expect(data.error).toContain("Impossible de transmettre le message");
    });
});
