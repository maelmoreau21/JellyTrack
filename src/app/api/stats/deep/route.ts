import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin, isAuthError } from "@/lib/auth";
import { resolveSelectedServerIdsAsync } from "@/lib/serverScope.server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    try {
        const { searchParams } = new URL(req.url);
        const requestedServersParam = searchParams.get("servers");

        const serverRows = await prisma.server.findMany({
            select: { id: true, isActive: true },
            orderBy: { name: "asc" },
        });
        const jellytrackMode = (process.env.JELLYTRACK_MODE || "single").toLowerCase();
        const activeServerRows = serverRows.filter((server) => server.isActive);
        const selectableServerIds = (activeServerRows.length > 0 ? activeServerRows : serverRows).map((server) => server.id);
        const multiServerEnabled = jellytrackMode === "multi" && selectableServerIds.length > 1;
        const { selectedServerIds } = await resolveSelectedServerIdsAsync({
            multiServerEnabled,
            selectableServerIds,
            requestedServersParam,
            cookieServersParam: null,
        });
        const selectedServerScope = selectedServerIds.length > 0 ? { in: selectedServerIds } : undefined;

        const media = await prisma.media.findMany({
            where: {
                type: { in: ['Movie', 'Series'] },
                ...(selectedServerScope ? { serverId: selectedServerScope } : {}),
            },
            select: {
                directors: true,
                actors: true,
                studios: true,
            },
        });

        const stats = {
            directors: {} as Record<string, number>,
            actors: {} as Record<string, number>,
            studios: {} as Record<string, number>,
        };

        media.forEach((m) => {
            m.directors.forEach((d) => {
                stats.directors[d] = (stats.directors[d] || 0) + 1;
            });
            m.actors.forEach((a) => {
                stats.actors[a] = (stats.actors[a] || 0) + 1;
            });
            m.studios.forEach((s) => {
                stats.studios[s] = (stats.studios[s] || 0) + 1;
            });
        });

        const sortAndLimit = (rec: Record<string, number>) =>
            Object.entries(rec)
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 10);

        return NextResponse.json({
            topDirectors: sortAndLimit(stats.directors),
            topActors: sortAndLimit(stats.actors),
            topStudios: sortAndLimit(stats.studios),
        });
    } catch (error) {
        console.error("Failed to fetch deep stats:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
