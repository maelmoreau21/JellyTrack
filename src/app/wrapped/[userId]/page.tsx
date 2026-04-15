import prisma from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { ZAPPING_CONDITION } from "@/lib/statsUtils";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import WrappedClient from "./WrappedClient";

export const dynamic = "force-dynamic";

interface WrappedPageProps {
    params: Promise<{
        userId: string;
    }>;
    searchParams: Promise<{
        year?: string;
        type?: string;
    }>;
}

interface CategoryBreakdown {
    totalSeconds: number;
    totalHours: number;
    topMedia: { title: string; seconds: number }[];
}

export default async function WrappedPage({ params, searchParams }: WrappedPageProps) {
    const { userId } = await params;
    const { year, type: filterType } = await searchParams;

    const requestedYear = year ? parseInt(year) : new Date().getFullYear();
    const session = await getServerSession(authOptions);
    if (!session) {
        redirect("/login");
    }
    const sessionUserId = (session?.user as any)?.jellyfinUserId;
    const isAdmin = (session?.user as any)?.isAdmin === true;

    // Non-admins can only view their own Wrapped
    if (!isAdmin && sessionUserId !== userId) {
        redirect("/login");
    }

    const settings = await prisma.globalSettings.findUnique({ where: { id: "global" } }) as any;
    if (!isAdmin && settings?.wrappedVisible === false) {
        notFound();
    }

    // Availability Period Check for Current Year
    const now = new Date();
    const currentYear = now.getFullYear();
    if (!isAdmin && requestedYear === currentYear && settings && settings.wrappedPeriodEnabled !== false) {
        const start = new Date(currentYear, (settings.wrappedStartMonth || 12) - 1, settings.wrappedStartDay || 1);
        const end = new Date(currentYear + (settings.wrappedEndMonth < settings.wrappedStartMonth ? 1 : 0), (settings.wrappedEndMonth || 1) - 1, settings.wrappedEndDay || 31);
        
        // If end month is earlier than start month, it spans across New Year (e.g., Dec 1 to Jan 31)
        if (now < start || now > end) {
            notFound();
        }
    }

    let user = await prisma.user.findFirst({
        where: { jellyfinUserId: userId },
        orderBy: { createdAt: "asc" },
        include: {
            playbackHistory: {
                where: {
                    startedAt: {
                        gte: new Date(requestedYear, 0, 1),
                        lt: new Date(requestedYear + 1, 0, 1),
                    },
                    ...ZAPPING_CONDITION
                },
                include: {
                    media: true
                }
            }
        }
    });

    if (!user) {
        if (sessionUserId === userId) {
            user = await prisma.user.findFirst({
                where: { jellyfinUserId: userId },
                orderBy: { createdAt: "asc" },
                include: {
                    playbackHistory: {
                        where: { 
                            startedAt: { 
                                gte: new Date(requestedYear, 0, 1),
                                lt: new Date(requestedYear + 1, 0, 1)
                            },
                            ...ZAPPING_CONDITION
                        },
                        include: { media: true }
                    }
                }
            });
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
        Book: new Map(),
    };
    const categoryTotals: Record<string, number> = { Movie: 0, Episode: 0, Audio: 0, Book: 0 };
    const deviceCounts = new Map<string, number>();

    // Collect unique parent IDs for series/album resolution
    const parentIds = new Set<string>();
    user.playbackHistory.forEach((sessionItem: any) => {
        if (sessionItem.media?.parentId) parentIds.add(sessionItem.media.parentId);
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

    user.playbackHistory.forEach((sessionItem: any) => {
        // Filter by type if requested
        if (filterType) {
            const mType = sessionItem.media?.type;
            let shouldSkip = true;
            if (filterType === "Music" && (mType === "Audio" || mType === "Track")) {
                shouldSkip = false;
            } else if (filterType === "TV" && (mType === "Episode" || mType === "Series")) {
                shouldSkip = false;
            } else if (filterType === "Books" && mType === "Book") {
                shouldSkip = false;
            } else if (filterType === "Movies" && mType === "Movie") {
                shouldSkip = false;
            }
            if (shouldSkip) return;
        }

        totalSeconds += sessionItem.durationWatched;

        if (sessionItem.media) {
            mediaCounts.set(sessionItem.media.title, (mediaCounts.get(sessionItem.media.title) || 0) + sessionItem.durationWatched);

            if (sessionItem.media.genres) {
                sessionItem.media.genres.forEach((g: string) => {
                    genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
                });
            }

            // Track series (episodes → series name)
            if (sessionItem.media.type === "Episode" && sessionItem.media.parentId) {
                const parent = parentMap.get(sessionItem.media.parentId);
                if (parent?.parentId) {
                    const grandparent = grandparentMap.get(parent.parentId);
                    if (grandparent) {
                        seriesCounts.set(grandparent.title, (seriesCounts.get(grandparent.title) || 0) + sessionItem.durationWatched);
                    }
                } else if (parent) {
                    seriesCounts.set(parent.title, (seriesCounts.get(parent.title) || 0) + sessionItem.durationWatched);
                }
            }

            // Track artists (audio → album parent title as artist proxy)
            if (sessionItem.media.type === "Audio" && sessionItem.media.parentId) {
                const parent = parentMap.get(sessionItem.media.parentId);
                if (parent) {
                    artistCounts.set(parent.title, (artistCounts.get(parent.title) || 0) + sessionItem.durationWatched);
                }
            }

            // Categorize by media type
            const type = sessionItem.media.type;
            let category: string | null = null;
            if (type === "Movie") category = "Movie";
            else if (type === "Episode") category = "Episode";
            else if (type === "Audio" || type === "Track") category = "Audio";
            else if (type === "Book") category = "Book";

            if (category) {
                categoryTotals[category] += sessionItem.durationWatched;
                const map = categoryData[category];
                map.set(sessionItem.media.title, (map.get(sessionItem.media.title) || 0) + sessionItem.durationWatched);
            }
        }

        if (sessionItem.clientName) {
            deviceCounts.set(sessionItem.clientName, (deviceCounts.get(sessionItem.clientName) || 0) + sessionItem.durationWatched);
        }

        const date = new Date(sessionItem.startedAt);
        dayCounts.set(date.getDay(), (dayCounts.get(date.getDay()) || 0) + 1);
        hourCounts.set(date.getHours(), (hourCounts.get(date.getHours()) || 0) + 1);
        monthCounts.set(date.getMonth(), (monthCounts.get(date.getMonth()) || 0) + sessionItem.durationWatched);
    });

    const totalHours = Math.round(totalSeconds / 3600);

    const topMedia = Array.from(mediaCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([title, seconds]) => ({ title, seconds }));

    // Top device
    const topDeviceEntry = Array.from(deviceCounts.entries()).sort((a, b) => b[1] - a[1])[0];
    const topDevice = topDeviceEntry ? topDeviceEntry[0] : "N/A";

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

    // Top artists (now using dedicated artist field if available, or parent name as proxy)
    const topArtists = Array.from(artistCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([title, seconds]) => ({ title, seconds }));

    // Top albums
    const albumCounts = new Map<string, number>();
    const trackCounts = new Map<string, number>();
    user.playbackHistory.forEach((sessionItem: any) => {
        if (sessionItem.media?.type === "Audio") {
            trackCounts.set(sessionItem.media.title, (trackCounts.get(sessionItem.media.title) || 0) + sessionItem.durationWatched);
            if (sessionItem.media.parentId) {
                const parent = parentMap.get(sessionItem.media.parentId);
                if (parent) {
                    albumCounts.set(parent.title, (albumCounts.get(parent.title) || 0) + sessionItem.durationWatched);
                }
            }
        }
    });

    const topAlbums = Array.from(albumCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([title, seconds]) => ({ title, seconds }));

    const topTracks = Array.from(trackCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([title, seconds]) => ({ title, seconds }));

    // Determine available years by inspecting the oldest playback record
    const firstPlayback = await prisma.playbackHistory.findFirst({
        where: { userId: user.id },
        orderBy: { startedAt: "asc" },
        select: { startedAt: true },
    });
    const firstYear = firstPlayback ? firstPlayback.startedAt.getFullYear() : requestedYear;
    const startYear = Math.min(firstYear, requestedYear);
    const availableYears: number[] = [];
    for (let y = currentYear; y >= startYear; y--) availableYears.push(y);

    // Build category breakdowns
    const buildBreakdown = (key: string): CategoryBreakdown => {
        const map = categoryData[key];
        const secs = categoryTotals[key];
        const top = Array.from(map.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5) // Increased to 5 for music/other lists
            .map(([title, seconds]) => ({ title, seconds }));
        return { totalSeconds: secs, totalHours: Math.round(secs / 3600), topMedia: top };
    };

    const wrappedData = {
        username: user.username || "?",
        year: requestedYear,
        availableYears,
        filterType: filterType || "general",
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
        topAlbums,
        topTracks,
        totalSessions: user.playbackHistory.length,
        categories: {
            movies: buildBreakdown("Movie"),
            series: buildBreakdown("Episode"),
            music: buildBreakdown("Audio"),
            books: buildBreakdown("Book"),
        },
        topDevice,
    };

    return <WrappedClient data={wrappedData} />;
}
