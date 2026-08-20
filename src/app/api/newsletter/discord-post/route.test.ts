import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
    prisma: {
        globalSettings: {
            findUnique: vi.fn(),
        },
        playbackHistory: {
            aggregate: vi.fn(),
            groupBy: vi.fn(),
        },
        media: {
            findUnique: vi.fn(),
        },
        user: {
            findUnique: vi.fn(),
        },
    },
}));

vi.mock("@/lib/prisma", () => ({
    default: mocks.prisma,
}));

vi.mock("@/lib/adminRequestGuard", () => ({
    requireAdminMutation: vi.fn().mockResolvedValue({ user: { id: "admin-1", isAdmin: true } }),
}));

vi.mock("@/lib/auth", () => ({
    isAuthError: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/webhookValidator", () => ({
    isValidDiscordWebhook: vi.fn().mockImplementation((url: string) => url.startsWith("https://discord.com/api/webhooks/")),
    safeFetchWebhook: vi.fn(),
}));

describe("POST /api/newsletter/discord-post", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns 400 when discord webhook URL is not configured", async () => {
        mocks.prisma.globalSettings.findUnique.mockResolvedValue({
            discordWebhookUrl: null,
            discordAlertsEnabled: false,
        });

        const req = new NextRequest("http://localhost:3000/api/newsletter/discord-post", { method: "POST" });
        const res = await POST(req);

        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toContain("Webhook Discord non configuré");
    });

    it("publishes newsletter embed successfully to Discord webhook", async () => {
        const { safeFetchWebhook } = await import("@/lib/webhookValidator");

        mocks.prisma.globalSettings.findUnique.mockResolvedValue({
            discordWebhookUrl: "https://discord.com/api/webhooks/12345/tokenabc",
            discordAlertsEnabled: true,
        });

        mocks.prisma.playbackHistory.aggregate.mockResolvedValue({
            _sum: { durationWatched: 36000 }, // 10 hours
            _count: { id: 25 },
        });

        mocks.prisma.playbackHistory.groupBy
            .mockResolvedValueOnce([{ mediaId: "m1", _sum: { durationWatched: 18000 } }]) // top media
            .mockResolvedValueOnce([{ userId: "u1", _sum: { durationWatched: 20000 } }]); // top user

        mocks.prisma.media.findUnique.mockResolvedValue({ title: "Inception", type: "Movie" });
        mocks.prisma.user.findUnique.mockResolvedValue({ username: "Alice" });

        vi.mocked(safeFetchWebhook).mockResolvedValueOnce({
            ok: true,
            status: 204,
            text: async () => "",
        } as unknown as Response);

        const req = new NextRequest("http://localhost:3000/api/newsletter/discord-post", { method: "POST" });
        const res = await POST(req);

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(safeFetchWebhook).toHaveBeenCalledWith(
            "https://discord.com/api/webhooks/12345/tokenabc",
            expect.objectContaining({
                method: "POST",
                body: expect.stringContaining("JellyTrack Rewind"),
            }),
            expect.any(Function)
        );
    });
});
