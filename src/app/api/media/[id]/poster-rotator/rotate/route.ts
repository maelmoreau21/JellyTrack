import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdminMutation } from "@/lib/adminRequestGuard";
import { compactJellyfinId, normalizeJellyfinId } from "@/lib/jellyfinId";
import { postJellyfinJson } from "@/lib/jellyfinImageServer";

type RouteContext = {
    params: Promise<{ id: string }> | { id: string };
};

type PosterRotatorResponse = {
    success?: boolean;
    message?: string;
    error?: string;
};

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

function isMissingPoolResponse(status: number, text: string, data: PosterRotatorResponse | null): boolean {
    const haystack = `${data?.error || ""} ${data?.message || ""} ${text || ""}`.toLowerCase();
    return status === 404
        || haystack.includes("pool")
        || haystack.includes("missing")
        || haystack.includes("empty")
        || haystack.includes("not found");
}

export async function POST(req: NextRequest, context: RouteContext) {
    const auth = await requireAdminMutation(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await context.params;
    const jellyfinMediaId = normalizeJellyfinId(id);
    if (!jellyfinMediaId) {
        return json({ success: false, code: "invalid_media_id" }, 400);
    }

    let body: Record<string, unknown> = {};
    try {
        body = await req.json();
    } catch {
        body = {};
    }

    const requestedServerId = typeof body.serverId === "string" ? body.serverId.trim() : "";
    const mediaCandidates = Array.from(new Set([jellyfinMediaId, compactJellyfinId(jellyfinMediaId)]));
    const media = await prisma.media.findFirst({
        where: {
            jellyfinMediaId: { in: mediaCandidates },
            ...(requestedServerId ? { serverId: requestedServerId } : {}),
        },
        orderBy: { createdAt: "asc" },
        select: { serverId: true, jellyfinMediaId: true, title: true },
    });

    if (!media) {
        return json({ success: false, code: "media_not_found" }, 404);
    }

    const result = await postJellyfinJson<PosterRotatorResponse>(
        `/PosterRotator/Pools/${encodeURIComponent(media.jellyfinMediaId)}/RotateNow`,
        media.serverId,
        {}
    );

    if (result.ok) {
        return json({
            success: true,
            code: "poster_rotated",
            message: result.data?.message || null,
            mediaId: media.jellyfinMediaId,
        });
    }

    if (isMissingPoolResponse(result.status, result.text, result.data)) {
        return json({
            success: false,
            code: "pool_missing",
            message: result.data?.message || result.data?.error || result.text || null,
        }, 404);
    }

    return json({
        success: false,
        code: "poster_rotator_error",
        status: result.status,
        message: result.data?.message || result.data?.error || result.text || null,
    }, 502);
}
