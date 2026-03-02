import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin, isAuthError } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/streams/telemetry?mediaId=<jellyfinMediaId>
 * Returns all telemetry events for a given media, grouped by playback session.
 * Admin only.
 */
export async function GET(req: NextRequest) {
    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const mediaId = req.nextUrl.searchParams.get("mediaId");
    if (!mediaId) {
        return NextResponse.json({ error: "mediaId is required" }, { status: 400 });
    }

    try {
        // Find the internal media record
        const media = await prisma.media.findUnique({
            where: { jellyfinMediaId: mediaId },
            select: { id: true, durationMs: true },
        });

        if (!media) {
            return NextResponse.json({ error: "Media not found" }, { status: 404 });
        }

        // Get all playback sessions first
        const sessions = await prisma.playbackHistory.findMany({
            where: { mediaId: media.id },
            select: {
                id: true,
                userId: true,
                durationWatched: true,
                startedAt: true,
                endedAt: true,
                user: { select: { username: true, jellyfinUserId: true } },
            },
            orderBy: { startedAt: "desc" },
        });

        const playbackIds = sessions.map((s) => s.id);
        const telemetryRows = playbackIds.length > 0
            ? await (prisma as any).telemetryEvent.findMany({
                where: { playbackId: { in: playbackIds } },
                orderBy: { positionMs: "asc" },
                select: {
                    id: true,
                    playbackId: true,
                    eventType: true,
                    positionMs: true,
                    metadata: true,
                    createdAt: true,
                },
            })
            : [];

        const eventsByPlaybackId = new Map<string, typeof telemetryRows>();
        for (const row of telemetryRows) {
            const list = eventsByPlaybackId.get(row.playbackId) || [];
            list.push(row);
            eventsByPlaybackId.set(row.playbackId, list);
        }

        // Serialize BigInt fields
        const serialized = sessions.map((s) => ({
            ...s,
            telemetryEvents: (eventsByPlaybackId.get(s.id) || []).map((e: any) => ({
                ...e,
                positionMs: Number(e.positionMs),
            })),
        }));

        return NextResponse.json({
            mediaId,
            durationMs: media.durationMs ? Number(media.durationMs) : null,
            sessions: serialized,
        });
    } catch (error) {
        console.error("[Telemetry API] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
