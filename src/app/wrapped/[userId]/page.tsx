import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import WrappedClient from "./WrappedClient";

export const dynamic = "force-dynamic";

interface WrappedPageProps {
    params: Promise<{
        userId: string;
    }>;
}

interface CategoryBreakdown {
    totalSeconds: number;
    totalHours: number;
    topMedia: { title: string; seconds: number }[];
}

export default async function WrappedPage({ params }: WrappedPageProps) {
    const { userId } = await params;

    // SECURITY: Verify the requesting user can access this Wrapped page
    const session = await getServerSession(authOptions);
    const sessionUserId = (session?.user as any)?.jellyfinUserId;
    const isAdmin = (session?.user as any)?.isAdmin === true;

    // Non-admins can only view their own Wrapped
    if (!isAdmin && sessionUserId !== userId) {
        notFound();
    }

    let user = await prisma.user.findUnique({
        where: { jellyfinUserId: userId },
        include: {
            playbackHistory: {
                where: {
                    startedAt: {
                        gte: new Date(new Date().getFullYear(), 0, 1),
                    },
                },
                include: {
                    media: true
                }
            }
        }
    });

    // Fallback : si aucune session cette année, charger toutes les données (all-time)
    if (user && user.playbackHistory.length === 0) {
        user = await prisma.user.findUnique({
            where: { jellyfinUserId: userId },
            include: {
                playbackHistory: {
                    include: { media: true }
                }
            }
        });
    }

    // Auto-create the user in Prisma if they authenticated via Jellyfin but
    // were never synced/imported.
    if (!user) {
        const session = await getServerSession(authOptions);
        const sessionUserId = (session?.user as any)?.jellyfinUserId;

        if (session?.user && sessionUserId === userId) {
            user = await prisma.user.create({
                data: {
                    jellyfinUserId: userId,
                    username: session.user.name || "?",
                },
            }) as any;
            user = await prisma.user.findUnique({
                where: { jellyfinUserId: userId },
                include: {
                    playbackHistory: {
                        where: { startedAt: { gte: new Date(new Date().getFullYear(), 0, 1) } },
                        include: { media: true }
                    }
                }
            });
            if (user && user.playbackHistory.length === 0) {
                user = await prisma.user.findUnique({
                    where: { jellyfinUserId: userId },
                    include: {
                        playbackHistory: {
                            include: { media: true }
                        }
                    }
                });
            }
        }
    }

    if (!user) notFound();

    // Computing the Wrapped Data
    let totalSeconds = 0;
    const mediaCounts = new Map<string, number>();
    const genreCounts = new Map<string, number>();
    const dayCounts = new Map<number, number>(); // 0 = Sunday, 1 = Monday...
    const hourCounts = new Map<number, number>(); // 0-23
    const monthCounts = new Map<number, number>(); // 0-11

    // Series tracking (aggregate episodes by parentId → series title)
    const seriesCounts = new Map<string, number>(); // seriesTitle → totalSeconds
    // Artist tracking (aggregate audio by parentId → album/artist)
    const artistCounts = new Map<string, number>(); // artist → totalSeconds

    // Category breakdowns
    const categoryData: Record<string, Map<string, number>> = {
        Movie: new Map(),
        Episode: new Map(),
        Audio: new Map(),
    };
    const categoryTotals: Record<string, number> = { Movie: 0, Episode: 0, Audio: 0 };

    // Collect unique parent IDs for series/album resolution
    const parentIds = new Set<string>();
    user.playbackHistory.forEach((session: any) => {
        if (session.media?.parentId) parentIds.add(session.media.parentId);
    });

    // Resolve parent → grandparent chain for episode → season → series
    const parentMedia = parentIds.size > 0
        ? await prisma.media.findMany({ where: { jellyfinMediaId: { in: Array.from(parentIds) } }, select: { jellyfinMediaId: true, title: true, parentId: true, type: true } })
        : [];
    const parentMap = new Map(parentMedia.map(m => [m.jellyfinMediaId, m]));

    const grandparentIds = new Set<string>();
    parentMedia.forEach(m => { if (m.parentId) grandparentIds.add(m.parentId); });
    const grandparentMedia = grandparentIds.size > 0
        ? await prisma.media.findMany({ where: { jellyfinMediaId: { in: Array.from(grandparentIds) } }, select: { jellyfinMediaId: true, title: true, type: true } })
        : [];
    const grandparentMap = new Map(grandparentMedia.map(m => [m.jellyfinMediaId, m]));

    user.playbackHistory.forEach((session: any) => {
        totalSeconds += session.durationWatched;

        if (session.media) {
            mediaCounts.set(session.media.title, (mediaCounts.get(session.media.title) || 0) + session.durationWatched);

            if (session.media.genres) {
                session.media.genres.forEach((g: string) => {
                    genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
                });
            }

            // Track series (episodes → series name)
            if (session.media.type === "Episode" && session.media.parentId) {
                const parent = parentMap.get(session.media.parentId);
                if (parent?.parentId) {
                    const grandparent = grandparentMap.get(parent.parentId);
                    if (grandparent) {
                        seriesCounts.set(grandparent.title, (seriesCounts.get(grandparent.title) || 0) + session.durationWatched);
                    }
                } else if (parent) {
                    seriesCounts.set(parent.title, (seriesCounts.get(parent.title) || 0) + session.durationWatched);
                }
            }

            // Track artists (audio → album parent title as artist proxy)
            if (session.media.type === "Audio" && session.media.parentId) {
                const parent = parentMap.get(session.media.parentId);
                if (parent) {
                    artistCounts.set(parent.title, (artistCounts.get(parent.title) || 0) + session.durationWatched);
                }
            }

            // Categorize by media type
            const type = session.media.type;
            let category: string | null = null;
            if (type === "Movie") category = "Movie";
            else if (type === "Episode") category = "Episode";
            else if (type === "Audio") category = "Audio";

            if (category) {
                categoryTotals[category] += session.durationWatched;
                const map = categoryData[category];
                map.set(session.media.title, (map.get(session.media.title) || 0) + session.durationWatched);
            }
        }

        const date = new Date(session.startedAt);
        dayCounts.set(date.getDay(), (dayCounts.get(date.getDay()) || 0) + 1);
        hourCounts.set(date.getHours(), (hourCounts.get(date.getHours()) || 0) + 1);
        monthCounts.set(date.getMonth(), (monthCounts.get(date.getMonth()) || 0) + session.durationWatched);
    });

    const totalHours = Math.round(totalSeconds / 3600);

    const topMedia = Array.from(mediaCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([title, seconds]) => ({ title, seconds }));

    const topGenres = Array.from(genreCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

    const topGenre = topGenres[0]?.name || "unknown";

    const topDayNumber = Array.from(dayCounts.entries())
        .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;

    const dayKeys = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const topDay = dayKeys[topDayNumber];

    // Peak hour
    const peakHourEntry = Array.from(hourCounts.entries()).sort((a, b) => b[1] - a[1])[0];
    const peakHour = peakHourEntry ? `${peakHourEntry[0]}h` : "N/A";
    const peakHourSessions = peakHourEntry?.[1] || 0;

    // Monthly hours (0-11)
    const monthKeys = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const monthlyHours = monthKeys.map((name, i) => ({
        name,
        hours: Math.round((monthCounts.get(i) || 0) / 3600),
    }));

    // Top series
    const topSeries = Array.from(seriesCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([title, seconds]) => ({ title, seconds }));

    // Top artists/albums
    const topArtists = Array.from(artistCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([title, seconds]) => ({ title, seconds }));

    const currentYear = new Date().getFullYear();

    // Build category breakdowns
    const buildBreakdown = (key: string): CategoryBreakdown => {
        const map = categoryData[key];
        const secs = categoryTotals[key];
        const top = Array.from(map.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([title, seconds]) => ({ title, seconds }));
        return { totalSeconds: secs, totalHours: Math.round(secs / 3600), topMedia: top };
    };

    const wrappedData = {
        username: user.username || "?",
        year: currentYear,
        totalHours,
        topMedia,
        topGenres,
        topGenre,
        topDay,
        peakHour,
        peakHourSessions,
        monthlyHours,
        topSeries,
        topArtists,
        totalSessions: user.playbackHistory.length,
        categories: {
            movies: buildBreakdown("Movie"),
            series: buildBreakdown("Episode"),
            music: buildBreakdown("Audio"),
        },
    };

    return <WrappedClient data={wrappedData} />;
}
