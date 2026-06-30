import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
    prisma: {
        media: {
            findFirst: vi.fn(),
        },
    },
    requireAdminMutation: vi.fn(),
    postJellyfinJson: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ default: mocks.prisma }));
vi.mock("@/lib/adminRequestGuard", () => ({ requireAdminMutation: mocks.requireAdminMutation }));
vi.mock("@/lib/jellyfinImageServer", () => ({ postJellyfinJson: mocks.postJellyfinJson }));

import { POST } from "./route";

function requestFor(body: Record<string, unknown> = {}) {
    return new NextRequest("http://localhost/api/media/jf-media-1/poster-rotator/rotate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

describe("/api/media/[id]/poster-rotator/rotate", () => {
    beforeEach(() => {
        mocks.prisma.media.findFirst.mockReset();
        mocks.requireAdminMutation.mockReset();
        mocks.postJellyfinJson.mockReset();
        mocks.requireAdminMutation.mockResolvedValue({ isAdmin: true });
    });

    it("proxies RotateNow to the media server for admins", async () => {
        mocks.prisma.media.findFirst.mockResolvedValue({
            serverId: "server-db-1",
            jellyfinMediaId: "jf-media-1",
            title: "The Movie",
        });
        mocks.postJellyfinJson.mockResolvedValue({ ok: true, status: 200, data: { success: true, message: "ok" }, text: "{\"success\":true}" });

        const response = await POST(requestFor({ serverId: "server-db-1" }), { params: { id: "jf-media-1" } });
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual(expect.objectContaining({ success: true, code: "poster_rotated" }));
        expect(mocks.postJellyfinJson).toHaveBeenCalledWith(
            "/PosterRotator/Pools/jf-media-1/RotateNow",
            "server-db-1",
            {}
        );
    });

    it("returns a clear pool_missing code when Poster Rotator has no pool", async () => {
        mocks.prisma.media.findFirst.mockResolvedValue({
            serverId: "server-db-1",
            jellyfinMediaId: "jf-media-1",
            title: "The Movie",
        });
        mocks.postJellyfinJson.mockResolvedValue({ ok: false, status: 404, data: { error: "pool not found" }, text: "pool not found" });

        const response = await POST(requestFor({ serverId: "server-db-1" }), { params: { id: "jf-media-1" } });
        const body = await response.json();

        expect(response.status).toBe(404);
        expect(body).toEqual(expect.objectContaining({ success: false, code: "pool_missing" }));
    });

    it("does not call Jellyfin when the media is unknown", async () => {
        mocks.prisma.media.findFirst.mockResolvedValue(null);

        const response = await POST(requestFor({ serverId: "server-db-1" }), { params: { id: "jf-media-1" } });
        const body = await response.json();

        expect(response.status).toBe(404);
        expect(body).toEqual(expect.objectContaining({ success: false, code: "media_not_found" }));
        expect(mocks.postJellyfinJson).not.toHaveBeenCalled();
    });

    it("returns poster_rotator_error when Jellyfin rejects the rotate request", async () => {
        mocks.prisma.media.findFirst.mockResolvedValue({
            serverId: "server-db-1",
            jellyfinMediaId: "jf-media-1",
            title: "The Movie",
        });
        mocks.postJellyfinJson.mockResolvedValue({ ok: false, status: 500, data: { error: "boom" }, text: "boom" });

        const response = await POST(requestFor({ serverId: "server-db-1" }), { params: { id: "jf-media-1" } });
        const body = await response.json();

        expect(response.status).toBe(502);
        expect(body).toEqual(expect.objectContaining({ success: false, code: "poster_rotator_error", status: 500 }));
    });

    it("returns the admin guard response for non-admin users", async () => {
        mocks.requireAdminMutation.mockResolvedValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));

        const response = await POST(requestFor({ serverId: "server-db-1" }), { params: { id: "jf-media-1" } });
        const body = await response.json();

        expect(response.status).toBe(403);
        expect(body).toEqual({ error: "Forbidden" });
        expect(mocks.prisma.media.findFirst).not.toHaveBeenCalled();
        expect(mocks.postJellyfinJson).not.toHaveBeenCalled();
    });
});
