import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin, isAuthError } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    try {
        const media = await prisma.media.findMany({
            where: { type: { in: ['Movie', 'Series'] } },
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
