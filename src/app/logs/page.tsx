import { Fragment } from "react";
import { Users, ChevronLeft, ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LogFilters } from "./LogFilters";
import { LogTypeFilter } from "./LogTypeFilter";
import { ColumnToggle } from "./ColumnToggle";
import { FallbackImage } from "@/components/FallbackImage";
import LogRow from "./LogRow";
import LogsListClient from "./LogsListClient";
import prisma from "@/lib/prisma";
import { getTranslations, getLocale } from 'next-intl/server';

import Link from "next/link";

export const dynamic = "force-dynamic"; // Bypass statis rendering for real-time logs

const LOGS_PER_PAGE = 100;

// Column utilities — defined server-side to avoid client/server boundary issues
// Use a single combined `clientIp` column to avoid duplicated client/IP cells.
const ALL_COLUMNS = ['date', 'startedAt', 'endedAt', 'user', 'media', 'clientIp', 'country', 'status', 'codecs', 'duration', 'pauseCount', 'audioChanges', 'subtitleChanges'] as const;
type Column = typeof ALL_COLUMNS[number];
const DEFAULT_VISIBLE: Column[] = ['date', 'user', 'media', 'clientIp', 'country', 'status', 'duration'];

function parseVisibleColumns(colsParam: string | undefined): Column[] {
    if (!colsParam) return DEFAULT_VISIBLE;
    const parsed = colsParam.split(',').filter(c => ALL_COLUMNS.includes(c as Column)) as Column[];
    return parsed.length >= 2 ? parsed : DEFAULT_VISIBLE;
}

type JellyfinSubtitleMeta = {
    parentId: string | null;
    seriesName: string | null;
    seasonName: string | null;
    albumName: string | null;
    albumArtist: string | null;
    artist: string | null;
};

async function fetchJellyfinSubtitleMeta(itemIds: string[]): Promise<Map<string, JellyfinSubtitleMeta>> {
    const uniqueIds = Array.from(new Set(itemIds.filter(Boolean)));
    const metaMap = new Map<string, JellyfinSubtitleMeta>();
    if (uniqueIds.length === 0) return metaMap;

    const jellyfinUrl = process.env.JELLYFIN_URL;
    const jellyfinApiKey = process.env.JELLYFIN_API_KEY;
    if (!jellyfinUrl || !jellyfinApiKey) return metaMap;

    try {
        const ids = uniqueIds.map(encodeURIComponent).join(',');
        const url = `${jellyfinUrl}/Items?Ids=${ids}&Fields=ParentId,SeriesName,SeasonName,Album,AlbumArtist,AlbumArtists,Artists`;
        const res = await fetch(url, {
            headers: { "X-Emby-Token": jellyfinApiKey },
            next: { revalidate: 300 },
        });
        if (!res.ok) return metaMap;

        const data = await res.json();
        const items = Array.isArray(data?.Items) ? data.Items : [];
        for (const item of items) {
            const id = typeof item?.Id === 'string' ? item.Id : null;
            if (!id) continue;
            metaMap.set(id, {
                parentId: item?.ParentId || null,
                seriesName: item?.SeriesName || null,
                seasonName: item?.SeasonName || null,
                albumName: item?.Album || null,
                albumArtist: item?.AlbumArtist || item?.AlbumArtists?.[0]?.Name || item?.AlbumArtists?.[0] || null,
                artist: item?.Artists?.[0] || null,
            });
        }
    } catch {
        // Keep logs page resilient if Jellyfin metadata lookup fails.
    }

    return metaMap;
}

// --- Watch Party Detection Algorithm ---
// Groups sessions of the same media started by different users within a 5-minute window

function toValidTimestamp(value: unknown): number | null {
    const date = value instanceof Date ? value : new Date(String(value ?? ''));
    const ts = date.getTime();
    return Number.isFinite(ts) ? ts : null;
}

function detectWatchParties(logs: any[]): Map<string, string> {
    // Returns a map: logId -> partyId (only for logs that are part of a watch party)
    const WINDOW_MS = 5 * 60 * 1000; // 5 minutes

    // Group logs by mediaId
    const byMedia = new Map<string, Array<{ log: any; startedAtMs: number }>>();
    logs.forEach(log => {
        const mId = log.mediaId;
        const startedAtMs = toValidTimestamp(log.startedAt);
        if (!startedAtMs) return;
        if (!mId) return;
        if (!byMedia.has(mId)) byMedia.set(mId, []);
        byMedia.get(mId)!.push({ log, startedAtMs });
    });

    const partyMap = new Map<string, string>(); // logId -> partyId
    let partyCounter = 0;

    byMedia.forEach((mediaLogs) => {
        // Sort by startedAt
        const sorted = [...mediaLogs].sort((a, b) => a.startedAtMs - b.startedAtMs);

        let clusterStart = 0;
        for (let i = 1; i <= sorted.length; i++) {
            // End of cluster if gap > WINDOW_MS or end of array
            if (i === sorted.length || sorted[i].startedAtMs - sorted[i - 1].startedAtMs > WINDOW_MS) {
                const cluster = sorted.slice(clusterStart, i);
                // Only count as watch party if 2+ DIFFERENT users
                const uniqueUsers = new Set(cluster.map((item: any) => item.log.userId));
                if (uniqueUsers.size >= 2) {
                    partyCounter++;
                    const pid = `party-${partyCounter}`;
                    cluster.forEach((item: any) => partyMap.set(item.log.id, pid));
                }
                clusterStart = i;
            }
        }
    });

    return partyMap;
}

export default async function LogsPage({
    searchParams
}: {
    searchParams: Promise<{ query?: string, sort?: string, page?: string, type?: string, cols?: string }>
}) {
    const params = await searchParams;
    const tl = await getTranslations('logs');
    const tc = await getTranslations('common');
    const locale = await getLocale();
    const safeLocale = typeof locale === 'string' && locale.trim().length > 0 ? locale : 'fr';
    const query = params.query?.toLowerCase() || "";
    const sort = params.sort || "date_desc";
    const currentPage = Math.max(1, parseInt(params.page || "1", 10) || 1);
    const typeFilter = params.type || "";
    const visibleColumns = parseVisibleColumns(params.cols);

    // Build the non-fuzzy exact search constraint
    const whereClause: any = {};

    if (query) {
        whereClause.OR = [
            { user: { username: { contains: query, mode: "insensitive" } } },
            { media: { title: { contains: query, mode: "insensitive" } } },
            { ipAddress: { contains: query, mode: "insensitive" } },
            { clientName: { contains: query, mode: "insensitive" } },
        ];
    }

    if (typeFilter) {
        whereClause.media = { type: typeFilter };
    }

    // Determine the sorting order
    let orderBy: any = { startedAt: "desc" };
    if (sort === "date_asc") orderBy = { startedAt: "asc" };
    else if (sort === "duration_desc") orderBy = { durationWatched: "desc" };
    else if (sort === "duration_asc") orderBy = { durationWatched: "asc" };

    const totalCount = await prisma.playbackHistory.count({ where: whereClause });
    const totalPages = Math.max(1, Math.ceil(totalCount / LOGS_PER_PAGE));
    const safePage = Math.min(currentPage, totalPages);

    const logs = await prisma.playbackHistory.findMany({
        where: whereClause,
        include: {
            user: { select: { id: true, username: true, jellyfinUserId: true } },
            media: { select: { id: true, jellyfinMediaId: true, title: true, type: true, parentId: true, artist: true, resolution: true } },
            telemetryEvents: { select: { eventType: true, positionMs: true, createdAt: true } },
        },
        orderBy: orderBy,
        skip: (safePage - 1) * LOGS_PER_PAGE,
        take: LOGS_PER_PAGE,
    });
    const activePairs = await prisma.activeStream.findMany({
        select: { userId: true, mediaId: true }
    });
    const activePairSet = new Set(activePairs.map((entry) => `${entry.userId}:${entry.mediaId}`));

    // Sanitize logs to plain objects (avoids BigInt/Date serialization issues in RSC)
    const safeLogs = logs.map((log: any) => ({
        ...log,
        startedAt: log.startedAt instanceof Date ? log.startedAt.toISOString() : String(log.startedAt ?? ''),
        endedAt: log.endedAt instanceof Date ? log.endedAt.toISOString() : log.endedAt ? String(log.endedAt) : null,
        media: log.media ? { ...log.media } : null,
        user: log.user ? { ...log.user } : null,
        telemetryEvents: Array.isArray(log.telemetryEvents) ? log.telemetryEvents.map((e: any) => ({
            ...e,
            createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : String(e.createdAt ?? ''),
            positionMs: typeof e.positionMs === 'bigint' || typeof e.positionMs === 'number' ? String(e.positionMs) : e.positionMs,
        })) : [],
        isActuallyActive: !log.endedAt && activePairSet.has(`${log.userId}:${log.mediaId}`),
    }));

    const mediaIds = safeLogs
        .map((log: any) => log.media?.jellyfinMediaId)
        .filter((id: string | null | undefined): id is string => Boolean(id));
    const jellyfinMetaMap = await fetchJellyfinSubtitleMeta(mediaIds);

    // Build parent chain map for enriched media titles (Episode â†’ Season â†’ Series, Track â†’ Album â†’ Artist)
    const parentIds = new Set<string>();
    safeLogs.forEach((log: any) => {
        const metadata = log.media?.jellyfinMediaId ? jellyfinMetaMap.get(log.media.jellyfinMediaId) : null;
        const resolvedParentId = log.media?.parentId || metadata?.parentId;
        if (resolvedParentId) parentIds.add(resolvedParentId);
    });
    const parentMedia = parentIds.size > 0
        ? await prisma.media.findMany({ where: { jellyfinMediaId: { in: Array.from(parentIds) } }, select: { jellyfinMediaId: true, title: true, type: true, parentId: true, artist: true } })
        : [];
    // Also fetch grandparent IDs (Season â†’ Series)
    const grandparentIds = new Set<string>();
    parentMedia.forEach(pm => { if (pm.parentId) grandparentIds.add(pm.parentId); });
    const grandparentMedia = grandparentIds.size > 0
        ? await prisma.media.findMany({ where: { jellyfinMediaId: { in: Array.from(grandparentIds) } }, select: { jellyfinMediaId: true, title: true, type: true, artist: true } })
        : [];
    const parentMap = new Map<string, { title: string; type: string; parentId: string | null; artist: string | null }>();
    parentMedia.forEach(pm => parentMap.set(pm.jellyfinMediaId, { title: pm.title, type: pm.type, parentId: pm.parentId, artist: pm.artist }));
    const grandparentMap = new Map<string, { title: string; type: string; artist: string | null }>();
    grandparentMedia.forEach(gp => grandparentMap.set(gp.jellyfinMediaId, { title: gp.title, type: gp.type, artist: gp.artist }));

    // Helper: build subtitle line for a media (e.g., "Série — Saison" or "Artist — Album")
    function getMediaSubtitle(media: any): string | null {
        if (!media) return null;
        const metadata = media.jellyfinMediaId ? jellyfinMetaMap.get(media.jellyfinMediaId) : null;
        const resolvedParentId = media.parentId || metadata?.parentId || null;
        const parent = resolvedParentId ? parentMap.get(resolvedParentId) : null;

        if (media.type === 'Episode') {
            const fallbackSeriesName = metadata?.seriesName || null;
            const fallbackSeasonName = metadata?.seasonName || null;
            if (fallbackSeriesName && fallbackSeasonName) {
                return `${fallbackSeriesName} — ${fallbackSeasonName}`;
            }
            if (fallbackSeriesName) {
                return fallbackSeriesName;
            }
            if (!parent) return null;
            // Episode â†’ parent=Season â†’ grandparent=Series
            const grandparent = parent.parentId ? grandparentMap.get(parent.parentId) : null;
            if (grandparent) return `${grandparent.title} — ${parent.title}`;
            return parent.title;
        }
        if (media.type === 'Season') {
            if (!parent) return null;
            return parent.title; // Season â†’ Series
        }
        if (media.type === 'Audio') {
            // Audio â†’ parent=Album. Show "Artist — Album" if artist is available
            const metaAlbumName = metadata?.albumName || null;
            const metaArtistName = metadata?.albumArtist || metadata?.artist || null;
            if (metaAlbumName || metaArtistName) {
                if (metaArtistName && metaAlbumName) return `${metaArtistName} — ${metaAlbumName}`;
                return metaArtistName || metaAlbumName;
            }
            const artistName = media.artist || parent?.artist || null;
            if (!parent) return artistName;
            if (artistName) return `${artistName} — ${parent.title}`;
            return parent.title;
        }
        return parent ? parent.title : null;
    }

    // Helper: get the media type icon prefix
    function getMediaTypeLabel(type: string): { icon: string; label: string } | null {
        switch (type) {
            case 'Episode': return { icon: '📺', label: tl('episodeType') };
            case 'Audio': return { icon: '🎵', label: tl('musicType') };
            case 'Movie': return { icon: '🎬', label: tl('movieType') };
            case 'Season': return { icon: '📺', label: tl('seasonType') };
            default: return null;
        }
    }

    // Build pagination URL helper
    const buildPageUrl = (page: number) => {
        const p = new URLSearchParams();
        if (query) p.set("query", query);
        if (sort !== "date_desc") p.set("sort", sort);
        if (typeFilter) p.set("type", typeFilter);
        if (params.cols) p.set("cols", params.cols);
        if (page > 1) p.set("page", String(page));
        const qs = p.toString();
        return `/logs${qs ? `?${qs}` : ""}`;
    };

    // Detect Watch Parties
    let watchPartyMap = new Map<string, string>();
    try {
        watchPartyMap = detectWatchParties(safeLogs);
    } catch {
        watchPartyMap = new Map<string, string>();
    }

    // Build party info for badges
    const partyInfo = new Map<string, { members: Set<string>, mediaTitle: string }>();
    safeLogs.forEach((log: any) => {
        const pid = watchPartyMap.get(log.id);
        if (pid) {
            if (!partyInfo.has(pid)) partyInfo.set(pid, { members: new Set(), mediaTitle: log.media?.title || "" });
            partyInfo.get(pid)!.members.add(log.user?.username || "?");
        }
    });

    // Track which partyId has already shown the banner
    const shownPartyBanners = new Set<string>();

    return (
        <div className="flex-col md:flex dashboard-page">
            <div className="flex-1 space-y-4 md:space-y-6 p-4 md:p-8 pt-4 md:pt-6 max-w-[1400px] mx-auto w-full">
                <div className="flex items-center justify-between space-y-2">
                    <div>
                        <h2 className="text-2xl md:text-3xl font-bold tracking-tight">{tl('title')}</h2>
                        <p className="text-muted-foreground md:mr-12 mt-2 text-sm md:text-base">
                            {tl('description')}
                            {totalCount > 0 && <span className="text-zinc-500"> — {totalCount} {tl('totalEntries')}</span>}
                        </p>
                    </div>
                </div>

                <LogTypeFilter currentType={typeFilter} />

                <Card className="app-surface">
                    <CardHeader>
                        <CardTitle>{tl('searchFilters')}</CardTitle>
                        <CardDescription>{tl('searchFiltersDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-start gap-2 flex-wrap">
                            <div className="flex-1">
                                <LogFilters initialQuery={query} initialSort={sort} />
                            </div>
                            <ColumnToggle visibleColumns={visibleColumns} />
                        </div>

                        {typeFilter && (
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-zinc-400">{tl('activeFilter')}</span>
                                <Badge variant="default" className="app-chip border-violet-500/35 bg-violet-500/15 text-violet-300 hover:bg-violet-500/25">
                                    {typeFilter === 'Movie' ? tl('moviesFilter') : typeFilter === 'Episode' ? tl('seriesFilter') : typeFilter === 'Audio' ? tl('musicFilter') : typeFilter === 'AudioBook' ? tl('booksFilter') : typeFilter}
                                </Badge>
                                <Link href="/logs" className="text-xs text-zinc-500 hover:text-zinc-300 underline">
                                    {tl('removeFilter')}
                                </Link>
                            </div>
                        )}

                        <div className="app-surface-soft border rounded-md overflow-x-auto w-full mt-6">
                            <LogsListClient serverLogs={safeLogs} visibleColumns={visibleColumns as string[]} />
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-center gap-2 mt-4 md:mt-6 pt-3 md:pt-4 border-t border-zinc-200/50 dark:border-zinc-700/50 flex-wrap">
                                {safePage > 1 && (
                                    <Link href={buildPageUrl(safePage - 1)} className="app-field flex items-center gap-1 px-2.5 md:px-3 py-1.5 md:py-2 rounded-md text-xs md:text-sm font-medium transition-colors hover:bg-zinc-100 dark:hover:bg-slate-700/50">
                                        <ChevronLeft className="w-4 h-4" /> {tc('previous')}
                                    </Link>
                                )}
                                <div className="flex items-center gap-1">
                                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                                        .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 2)
                                        .reduce<(number | string)[]>((acc, p, idx, arr) => {
                                            if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                                            acc.push(p);
                                            return acc;
                                        }, [])
                                        .map((item, idx) =>
                                            item === "..." ? (
                                                <span key={`ellipsis-${idx}`} className="px-2 text-zinc-500">…</span>
                                            ) : (
                                                <Link
                                                    key={item}
                                                    href={buildPageUrl(item as number)}
                                                    className={`px-2.5 md:px-3 py-1.5 rounded-md text-xs md:text-sm font-medium transition-colors ${item === safePage
                                                            ? "bg-primary text-primary-foreground"
                                                            : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-slate-700/50 hover:text-zinc-900 dark:hover:text-zinc-100"
                                                        }`}
                                                >
                                                    {item}
                                                </Link>
                                            )
                                        )}
                                </div>
                                {safePage < totalPages && (
                                    <Link href={buildPageUrl(safePage + 1)} className="app-field flex items-center gap-1 px-2.5 md:px-3 py-1.5 md:py-2 rounded-md text-xs md:text-sm font-medium transition-colors hover:bg-zinc-100 dark:hover:bg-slate-700/50">
                                        {tc('next')} <ChevronRight className="w-4 h-4" />
                                    </Link>
                                )}
                                <span className="text-xs text-muted-foreground ml-0 md:ml-4 w-full md:w-auto text-center md:text-left">
                                    Page {safePage} / {totalPages}
                                </span>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
