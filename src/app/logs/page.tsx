import { Fragment } from "react";
import { Users, ChevronLeft, ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LogFilters } from "./LogFilters";
import { ColumnToggle } from "./ColumnToggle";
import { FallbackImage } from "@/components/FallbackImage";
import LogRow from "./LogRow";
import LogsListClient from "./LogsListClient";
import prisma from "@/lib/prisma";
import { getTranslations, getLocale } from 'next-intl/server';
import type { SafeLog, SafeMedia, SafeTelemetryEvent } from '@/types/logs';
import type { Prisma } from '@prisma/client';
import { ZAPPING_CONDITION } from "@/lib/statsUtils";

import Link from "next/link";

export const dynamic = "force-dynamic"; // Bypass statis rendering for real-time logs

const LOGS_PER_PAGE = 100;

// Column utilities — defined server-side to avoid client/server boundary issues
// Restore separate `client` and `ip` columns while keeping client-side features.
const ALL_COLUMNS = ['date', 'startedAt', 'endedAt', 'user', 'media', 'client', 'ip', 'country', 'status', 'resolution', 'audioBitrate', 'codecs', 'duration', 'pauseCount', 'audioChanges', 'subtitleChanges'] as const;
type Column = typeof ALL_COLUMNS[number];
const DEFAULT_VISIBLE: Column[] = ['date', 'user', 'media', 'client', 'resolution', 'audioBitrate', 'status', 'duration'];

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

function detectWatchParties(logs: SafeLog[]): Map<string, string> {
    // Returns a map: logId -> partyId (only for logs that are part of a watch party)
    const WINDOW_MS = 5 * 60 * 1000; // 5 minutes

    // Group logs by mediaId
    const byMedia = new Map<string, Array<{ log: SafeLog; startedAtMs: number }>>();
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
                const uniqueUsers = new Set(cluster.map((item: { log: SafeLog; startedAtMs: number }) => item.log.userId));
                if (uniqueUsers.size >= 2) {
                    partyCounter++;
                    const pid = `party-${partyCounter}`;
                    cluster.forEach((item: { log: SafeLog; startedAtMs: number }) => partyMap.set(item.log.id, pid));
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
    searchParams: Promise<{ query?: string, sort?: string, page?: string, type?: string, cols?: string, colsState?: string, hideZapped?: string, client?: string, audio?: string, subtitle?: string, dateFrom?: string, dateTo?: string }>
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
    const typeFilters = (typeof typeFilter === 'string' && typeFilter) ? typeFilter.split(',').map(s => s.trim()).filter(Boolean) : [];
    const visibleColumns = parseVisibleColumns(params.cols);
    const hideZapped = params.hideZapped !== 'false'; // default true

    const clientParams = params.client?.trim() || "";
    const audioParams = params.audio?.trim() || "";
    const subtitleParams = params.subtitle?.trim() || "";
    const dateFromParam = params.dateFrom || "";
    const dateToParam = params.dateTo || "";

    // Build the non-fuzzy exact search constraint
    const whereClause: Prisma.PlaybackHistoryWhereInput = {} as Prisma.PlaybackHistoryWhereInput;
    const conditions: Prisma.PlaybackHistoryWhereInput[] = [];

    if (hideZapped) {
        conditions.push(ZAPPING_CONDITION);
    }

    if (query) {
        conditions.push({
            OR: [
                { user: { username: { contains: query, mode: "insensitive" } } },
                { media: { title: { contains: query, mode: "insensitive" } } },
                { ipAddress: { contains: query, mode: "insensitive" } },
                { clientName: { contains: query, mode: "insensitive" } },
            ]
        });
    }

    if (typeFilters.length === 1) {
        conditions.push({ media: { type: typeFilters[0] } });
    } else if (typeFilters.length > 1) {
        conditions.push({ media: { type: { in: typeFilters } } });
    }

    if (clientParams) conditions.push({ clientName: { contains: clientParams, mode: "insensitive" } });
    if (audioParams) conditions.push({ OR: [{audioCodec: { contains: audioParams, mode: "insensitive" }}, {audioLanguage: { contains: audioParams, mode: "insensitive" }}] });
    if (subtitleParams) conditions.push({ OR: [{subtitleCodec: { contains: subtitleParams, mode: "insensitive" }}, {subtitleLanguage: { contains: subtitleParams, mode: "insensitive" }}] });

    if (dateFromParam || dateToParam) {
        const dateFilter: Prisma.DateTimeFilter = {} as Prisma.DateTimeFilter;
        if (dateFromParam) {
            const fd = new Date(dateFromParam);
            if (!isNaN(fd.getTime())) dateFilter.gte = fd;
        }
        if (dateToParam) {
            const td = new Date(dateToParam);
            td.setHours(23, 59, 59, 999);
            if (!isNaN(td.getTime())) dateFilter.lte = td;
        }
        if (Object.keys(dateFilter).length > 0) {
            conditions.push({ startedAt: dateFilter });
        }
    }

    if (conditions.length > 0) {
        whereClause.AND = conditions;
    }

    // Determine the sorting order
    let orderBy: Record<string, "asc" | "desc"> = { startedAt: "desc" };
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
    const activeStreams = await prisma.activeStream.findMany({
        select: { userId: true, mediaId: true, bitrate: true }
    });
    const activeStreamMap = new Map(activeStreams.map((entry) => [`${entry.userId}:${entry.mediaId}`, entry.bitrate ?? null] as [string, number | null]));
    const activePairSet = new Set(activeStreams.map((entry) => `${entry.userId}:${entry.mediaId}`));

    // Sanitize logs to plain objects (avoids BigInt/Date serialization issues in RSC)
    const safeLogs: SafeLog[] = logs.map((log) => ({
        ...log,
        startedAt: log.startedAt instanceof Date ? log.startedAt.toISOString() : String(log.startedAt ?? ''),
        endedAt: log.endedAt instanceof Date ? log.endedAt.toISOString() : log.endedAt ? String(log.endedAt) : null,
        media: log.media ? { ...log.media } : null,
        user: log.user ? { ...log.user } : null,
        telemetryEvents: Array.isArray(log.telemetryEvents) ? log.telemetryEvents.map((e) => {
            const rec = e as Record<string, unknown>;
            const createdAt = rec.createdAt instanceof Date ? (rec.createdAt as Date).toISOString() : String(rec.createdAt ?? '');
            const posVal = rec.positionMs;
            const positionMs = typeof posVal === 'bigint' || typeof posVal === 'number' ? String(posVal) : (typeof posVal === 'string' ? posVal : null);
            return {
                eventType: typeof rec.eventType === 'string' ? rec.eventType : undefined,
                positionMs: positionMs as string | null,
                createdAt,
                metadata: (rec as Record<string, unknown>).metadata ?? undefined,
            } as SafeTelemetryEvent;
        }) : [],
        isActuallyActive: !log.endedAt && activePairSet.has(`${log.userId}:${log.mediaId}`),
        bitrate: activeStreamMap.get(`${log.userId}:${log.mediaId}`) ?? null,
    }));

    const mediaIds = safeLogs
        .map((log) => log.media?.jellyfinMediaId)
        .filter((id: string | null | undefined): id is string => Boolean(id));
    const jellyfinMetaMap = await fetchJellyfinSubtitleMeta(mediaIds);

    // Build parent chain map for enriched media titles (Episode â†’ Season â†’ Series, Track â†’ Album â†’ Artist)
    const parentIds = new Set<string>();
    safeLogs.forEach((log) => {
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
    function getMediaSubtitle(media: SafeMedia | null): string | null {
        if (!media) return null;
        const metadata = media.jellyfinMediaId ? jellyfinMetaMap.get(media.jellyfinMediaId) : null;
        const resolvedParentId = media.parentId || metadata?.parentId || null;
        const parent = resolvedParentId ? parentMap.get(resolvedParentId) : null;

        const cleanStr = (s: string | null | undefined) => (s && s !== 'Unknown') ? s.trim() : null;

        if (media.type === 'Episode') {
            const fallbackSeriesName = cleanStr(metadata?.seriesName);
            const fallbackSeasonName = cleanStr(metadata?.seasonName);
            if (fallbackSeriesName && fallbackSeasonName) {
                return `${fallbackSeriesName} - ${fallbackSeasonName}`;
            }
            if (fallbackSeriesName) {
                return fallbackSeriesName;
            }
            if (!parent) return null;
            const gpTitle = cleanStr(parent.parentId ? grandparentMap.get(parent.parentId)?.title : null);
            const pTitle = cleanStr(parent.title);
            if (gpTitle && pTitle) return `${gpTitle} - ${pTitle}`;
            return pTitle || gpTitle;
        }
        if (media.type === 'Season') {
            const sName = cleanStr(metadata?.seriesName);
            if (sName) return sName;
            if (!parent) return null;
            return cleanStr(parent.title);
        }
        if (media.type === 'Audio') {
            const metaAlbumName = cleanStr(metadata?.albumName);
            const metaArtistName = cleanStr(metadata?.albumArtist || metadata?.artist);
            if (metaAlbumName || metaArtistName) {
                if (metaArtistName && metaAlbumName) return `${metaArtistName} - ${metaAlbumName}`;
                return metaArtistName || metaAlbumName;
            }
            const artistName = cleanStr(media.artist || parent?.artist);
            const pTitle = cleanStr(parent?.title);
            if (artistName && pTitle) return `${artistName} - ${pTitle}`;
            return artistName || pTitle;
        }
        if (media.type === 'MusicAlbum') {
            return cleanStr(metadata?.albumArtist || metadata?.artist || media.artist);
        }
        return parent ? cleanStr(parent.title) : null;
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
        if (params.hideZapped === 'false') p.set("hideZapped", "false");
        if (clientParams) p.set("client", clientParams);
        if (audioParams) p.set("audio", audioParams);
        if (subtitleParams) p.set("subtitle", subtitleParams);
        if (dateFromParam) p.set("dateFrom", dateFromParam);
        if (dateToParam) p.set("dateTo", dateToParam);
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
    safeLogs.forEach((log) => {
        const pid = watchPartyMap.get(log.id);
        if (pid) {
            if (!partyInfo.has(pid)) partyInfo.set(pid, { members: new Set(), mediaTitle: log.media?.title || "" });
            partyInfo.get(pid)!.members.add(log.user?.username || "?");
        }
    });

    // Track which partyId has already shown the banner
    const shownPartyBanners = new Set<string>();

    // Parse optional `colsState` query param (format: key:width,key2:width2)
    const rawColsState = typeof params.colsState === 'string' ? params.colsState : '';
    const initialColumns = rawColsState ? rawColsState.split(',').map((s: string) => {
        const [k, w] = s.split(':');
        return { key: (k || '').trim(), width: Number(w || 0) || 0 };
    }).filter((c: { key: string; width: number }) => c.key && visibleColumns.includes(c.key as Column)) : undefined;

    return (
        <div className="flex-col md:flex dashboard-page">
            <div className="flex-1 space-y-4 md:space-y-6 p-4 md:p-8 pt-4 md:pt-6 max-w-[1800px] mx-auto w-full">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-3">
                            <Users className="w-8 h-8 text-primary" />
                            {tl('title')}
                        </h1>
                        <p className="text-muted-foreground mt-2">
                            {tl('description')}
                            {totalCount > 0 && <span className="text-zinc-500"> — {totalCount} {tl('totalEntries')}</span>}
                        </p>
                    </div>
                </div>

                <div className="space-y-4">
                    <Card className="border-0 shadow-sm bg-white dark:bg-zinc-900 ring-1 ring-zinc-200 dark:ring-zinc-800">
                        <CardContent className="space-y-4">
                            <div className="flex items-start gap-2 flex-wrap">
                                <div className="flex-1 w-full relative z-10">
                                    <LogFilters 
                                        initialQuery={query} 
                                        initialSort={sort} 
                                        initialHideZapped={hideZapped}
                                        initialType={typeFilter}
                                        initialClient={clientParams}
                                        initialAudio={audioParams}
                                        initialSubtitle={subtitleParams}
                                        initialDateFrom={dateFromParam}
                                        initialDateTo={dateToParam}
                                    />
                                </div>
                                <ColumnToggle visibleColumns={visibleColumns} />
                            </div>
                        </CardContent>
                    </Card>

        <div className="app-surface-soft border rounded-md overflow-x-auto w-full mt-6">
                            <LogsListClient 
                                serverLogs={safeLogs.map(log => ({ ...log, mediaSubtitle: getMediaSubtitle(log.media ?? null) }))} 
                                visibleColumns={visibleColumns as string[]} 
                                initialColumns={initialColumns} 
                            />
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
                    </div>
            </div>
        </div>
    );
}
