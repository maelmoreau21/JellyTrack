import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import prisma from "@/lib/prisma";
import { getTranslations, getLocale } from 'next-intl/server';
import { ZAPPING_CONDITION } from "@/lib/statsUtils";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import LogsListClient from "@/app/logs/LogsListClient";
import LogSearchBar from "@/app/logs/LogSearchBar";
import { LogFilters } from "@/app/logs/LogFilters";
import { ColumnToggle } from "@/app/logs/ColumnToggle";
import { SavedFilters } from "@/components/SavedFilters";
import { formatMediaSubtitle } from "@/lib/mediaSubtitle";
import type { SafeLog, SafeTelemetryEvent } from '@/types/logs';
import type { Prisma } from '@prisma/client';

const ITEMS_PER_PAGE = 50;
const MAX_TELEMETRY_EVENTS_PER_SESSION = 200;

type MediaCompact = {
    serverId: string;
    jellyfinMediaId: string;
    title?: string | null;
    type?: string | null;
    parentId?: string | null;
    artist?: string | null;
    durationMs?: bigint | null;
};

interface UserRecentMediaProps {
    userId: string;
    userIds?: string[];
    userDbIds?: string[];
    page?: number;
    filterParams?: {
        query?: string;
        sort?: string;
        type?: string;
        client?: string;
        audio?: string;
        subtitle?: string;
        dateFrom?: string;
        dateTo?: string;
        resolution?: string;
        playMethod?: string;
        hideZapped?: string;
        cols?: string;
        page?: string;
    };
}

const ALL_COLUMNS = ['date', 'startedAt', 'endedAt', 'user', 'media', 'client', 'ip', 'country', 'status', 'resolution', 'audioBitrate', 'codecs', 'duration', 'pauseCount', 'audioChanges', 'subtitleChanges'] as const;
type Column = typeof ALL_COLUMNS[number];
const DEFAULT_VISIBLE: Column[] = ['date', 'media', 'client', 'resolution', 'audioBitrate', 'status', 'duration'];

function parseVisibleColumns(colsParam: string | undefined): Column[] {
    if (!colsParam) return DEFAULT_VISIBLE;
    const parsed = colsParam.split(',').filter(c => ALL_COLUMNS.includes(c as Column)) as Column[];
    return parsed.length >= 2 ? parsed : DEFAULT_VISIBLE;
}

export default async function UserRecentMedia({
    userId,
    userIds = [],
    userDbIds = [],
    page = 1,
    filterParams = {}
}: UserRecentMediaProps) {
    const t = await getTranslations('userProfile');
    const locale = await getLocale();

    const query = filterParams.query?.toLowerCase() || "";
    const sort = filterParams.sort || "date_desc";
    const hideZapped = filterParams.hideZapped !== 'false';
    const typeFilter = filterParams.type || "";
    const typeFilters = (typeof typeFilter === 'string' && typeFilter) ? typeFilter.split(',').map(s => s.trim()).filter(Boolean) : [];
    const visibleColumns = parseVisibleColumns(filterParams.cols);

    const clientParams = filterParams.client?.trim() || "";
    const audioParams = filterParams.audio?.trim() || "";
    const subtitleParams = filterParams.subtitle?.trim() || "";
    const dateFromParam = filterParams.dateFrom || "";
    const dateToParam = filterParams.dateTo || "";
    const resolutionParam = filterParams.resolution || "";
    const playMethodParam = filterParams.playMethod || "";

    const targetJellyfinIds = Array.from(new Set([userId, ...userIds].filter(Boolean)));
    const resolvedUserDbIds = Array.from(new Set(userDbIds.filter(Boolean)));

    const userDbIdsToUse = resolvedUserDbIds.length > 0
        ? resolvedUserDbIds
        : (await prisma.user.findMany({
            where: { jellyfinUserId: { in: targetJellyfinIds } },
            orderBy: { createdAt: "asc" },
            select: { id: true },
        })).map((u) => u.id);

    if (userDbIdsToUse.length === 0) {
        return (
            <Card className="app-surface mt-6">
                <CardHeader>
                    <CardTitle>{t('playbackHistory')}</CardTitle>
                    <CardDescription>{t('noHistory')}</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    // Build filtering condition
    const whereClause: Prisma.PlaybackHistoryWhereInput = {
        userId: { in: userDbIdsToUse }
    };
    const conditions: Prisma.PlaybackHistoryWhereInput[] = [];

    if (hideZapped) conditions.push(ZAPPING_CONDITION);
    if (query) {
        conditions.push({
            OR: [
                { media: { title: { contains: query, mode: "insensitive" } } },
                { ipAddress: { contains: query, mode: "insensitive" } },
                { clientName: { contains: query, mode: "insensitive" } },
            ]
        });
    }
    if (typeFilters.length > 0) conditions.push({ media: { type: { in: typeFilters } } });
    if (clientParams) conditions.push({ clientName: { contains: clientParams, mode: "insensitive" } });
    if (audioParams) conditions.push({ OR: [{ audioCodec: { contains: audioParams, mode: "insensitive" } }, { audioLanguage: { contains: audioParams, mode: "insensitive" } }] });
    if (subtitleParams) conditions.push({ OR: [{ subtitleCodec: { contains: subtitleParams, mode: "insensitive" } }, { subtitleLanguage: { contains: subtitleParams, mode: "insensitive" } }] });
    if (resolutionParam) conditions.push({ media: { resolution: { contains: resolutionParam, mode: "insensitive" } } });
    if (playMethodParam) conditions.push({ playMethod: { equals: playMethodParam, mode: 'insensitive' } });
    if (dateFromParam || dateToParam) {
        const dateFilter: Prisma.DateTimeFilter = {};
        if (dateFromParam) dateFilter.gte = new Date(dateFromParam);
        if (dateToParam) {
            const td = new Date(dateToParam);
            td.setHours(23, 59, 59, 999);
            dateFilter.lte = td;
        }
        conditions.push({ startedAt: dateFilter });
    }
    if (conditions.length > 0) whereClause.AND = conditions;

    let orderBy: Record<string, "asc" | "desc"> = { startedAt: "desc" };
    if (sort === "date_asc") orderBy = { startedAt: "asc" };
    else if (sort === "duration_desc") orderBy = { durationWatched: "desc" };
    else if (sort === "duration_asc") orderBy = { durationWatched: "asc" };

    // Count total sessions for pagination
    const totalCount = await prisma.playbackHistory.count({ where: whereClause });

    if (totalCount === 0 && !query && typeFilters.length === 0 && !clientParams && !dateFromParam && !dateToParam) {
        return (
            <Card className="app-surface mt-6">
                <CardHeader>
                    <CardTitle>{t('playbackHistory')}</CardTitle>
                    <CardDescription>{t('noHistory')}</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    const currentPage = Math.max(1, parseInt(filterParams.page || String(page), 10) || 1);
    const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));
    const safePage = Math.min(currentPage, totalPages);

    // Fetch paginated sessions
    const sessions = await prisma.playbackHistory.findMany({
        where: whereClause,
        include: {
            user: { select: { id: true, username: true, jellyfinUserId: true } },
            media: { select: { id: true, serverId: true, jellyfinMediaId: true, title: true, type: true, parentId: true, artist: true, resolution: true } },
            telemetryEvents: {
                select: { eventType: true, positionMs: true, createdAt: true, metadata: true },
                orderBy: { createdAt: 'desc' },
                take: MAX_TELEMETRY_EVENTS_PER_SESSION,
            },
        },
        orderBy,
        skip: (safePage - 1) * ITEMS_PER_PAGE,
        take: ITEMS_PER_PAGE,
    });

    const activePairs = await prisma.activeStream.findMany({
        where: { userId: { in: userDbIdsToUse } },
        select: { userId: true, mediaId: true }
    });
    const activePairSet = new Set(activePairs.map((entry) => `${entry.userId}:${entry.mediaId}`));

    // Build parent chain for enriched media titles
    const parentTargetsMap = new Map<string, { serverId: string | null; jellyfinMediaId: string }>();
    sessions.forEach((s) => {
        if (s.media?.parentId) {
            const key = `${s.media.serverId || ''}:${s.media.parentId}`;
            parentTargetsMap.set(key, { serverId: s.media.serverId || null, jellyfinMediaId: s.media.parentId });
        }
    });
    const parentMedia = parentTargetsMap.size > 0
        ? await prisma.media.findMany({
            where: {
                OR: Array.from(parentTargetsMap.values()).map((target) => ({
                    ...(target.serverId ? { serverId: target.serverId } : {}),
                    jellyfinMediaId: target.jellyfinMediaId,
                })),
            },
            select: { serverId: true, jellyfinMediaId: true, title: true, type: true, parentId: true, artist: true },
        })
        : [];

    const grandparentTargetsMap = new Map<string, { serverId: string | null; jellyfinMediaId: string }>();
    parentMedia.forEach((pm) => {
        if (pm.parentId) {
            const key = `${pm.serverId || ''}:${pm.parentId}`;
            grandparentTargetsMap.set(key, { serverId: pm.serverId || null, jellyfinMediaId: pm.parentId });
        }
    });
    const grandparentMedia = grandparentTargetsMap.size > 0
        ? await prisma.media.findMany({
            where: {
                OR: Array.from(grandparentTargetsMap.values()).map((target) => ({
                    ...(target.serverId ? { serverId: target.serverId } : {}),
                    jellyfinMediaId: target.jellyfinMediaId,
                })),
            },
            select: { serverId: true, jellyfinMediaId: true, title: true, type: true, artist: true },
        })
        : [];

    const parentMap = new Map(parentMedia.map(pm => [`${pm.serverId || ''}:${pm.jellyfinMediaId}`, pm]));
    const grandparentMap = new Map(grandparentMedia.map(gp => [`${gp.serverId || ''}:${gp.jellyfinMediaId}`, gp]));

    function getMediaSubtitle(media?: MediaCompact | null): string | null {
        if (!media) return null;
        const parent = media.parentId ? parentMap.get(`${media.serverId || ''}:${media.parentId}`) : null;
        const gp = parent?.parentId ? grandparentMap.get(`${media.serverId || ''}:${parent.parentId}`) : null;

        return formatMediaSubtitle({
            type: media.type,
            parentTitle: parent?.title || null,
            grandparentTitle: gp?.title || null,
            artist: media.artist || parent?.artist || null,
            parentArtist: parent?.artist || null,
        }, locale);
    }

    const reconnectionSet = new Set<string>();
    for (let i = 0; i < sessions.length; i++) {
        const s1 = sessions[i];
        const t1 = s1.startedAt.getTime();
        for (let j = 0; j < sessions.length; j++) {
            if (i === j) continue;
            const s2 = sessions[j];
            if (s1.userId === s2.userId && s1.mediaId === s2.mediaId) {
                const t2End = s2.endedAt ? s2.endedAt.getTime() : s1.startedAt.getTime();
                const diff = Math.abs(t1 - t2End);
                if (diff >= 0 && diff <= 30000) {
                    reconnectionSet.add(s1.id);
                    break;
                }
            }
        }
    }

    const safeLogs: SafeLog[] = sessions.map((log) => {
        const subtitle = getMediaSubtitle(log.media);

        return {
            ...log,
            startedAt: log.startedAt instanceof Date ? log.startedAt.toISOString() : String(log.startedAt ?? ''),
            endedAt: log.endedAt instanceof Date ? log.endedAt.toISOString() : log.endedAt ? String(log.endedAt) : null,
            mediaSubtitle: subtitle,
            media: log.media ? { ...log.media } : null,
            user: log.user ? { ...log.user } : null,
            telemetryEvents: Array.isArray(log.telemetryEvents) ? log.telemetryEvents.map((e) => {
                const createdAt = e.createdAt instanceof Date ? (e.createdAt as Date).toISOString() : String(e.createdAt ?? '');
                const posVal = e.positionMs;
                const positionMs = typeof posVal === 'bigint' || typeof posVal === 'number' ? String(posVal) : (typeof posVal === 'string' ? posVal : null);
                return {
                    eventType: e.eventType,
                    positionMs,
                    createdAt,
                    metadata: e.metadata ?? undefined,
                } as SafeTelemetryEvent;
            }) : [],
            isActuallyActive: !log.endedAt && activePairSet.has(`${log.userId}:${log.mediaId}`),
            isReconnection: reconnectionSet.has(log.id),
        };
    });

    // Build pagination URL
    const buildPageUrl = (p: number) => {
        const params = new URLSearchParams();
        if (query) params.set("query", query);
        if (sort !== "date_desc") params.set("sort", sort);
        if (typeFilter) params.set("type", typeFilter);
        if (filterParams.cols) params.set("cols", filterParams.cols);
        if (filterParams.hideZapped === 'false') params.set("hideZapped", "false");
        if (clientParams) params.set("client", clientParams);
        if (audioParams) params.set("audio", audioParams);
        if (subtitleParams) params.set("subtitle", subtitleParams);
        if (dateFromParam) params.set("dateFrom", dateFromParam);
        if (dateToParam) params.set("dateTo", dateToParam);
        if (resolutionParam) params.set("resolution", resolutionParam);
        if (playMethodParam) params.set("playMethod", playMethodParam);
        if (p > 1) params.set("page", String(p));
        const qs = params.toString();
        return `/users/${userId}${qs ? `?${qs}` : ""}`;
    };

    const exportParams = new URLSearchParams();
    exportParams.set("userId", userDbIdsToUse.join(","));
    if (query) exportParams.set("query", query);
    if (typeFilter) exportParams.set("type", typeFilter);
    if (clientParams) exportParams.set("client", clientParams);
    if (audioParams) exportParams.set("audio", audioParams);
    if (subtitleParams) exportParams.set("subtitle", subtitleParams);
    if (dateFromParam) exportParams.set("dateFrom", dateFromParam);
    if (dateToParam) exportParams.set("dateTo", dateToParam);
    if (resolutionParam) exportParams.set("resolution", resolutionParam);
    if (playMethodParam) exportParams.set("playMethod", playMethodParam);
    if (!hideZapped) exportParams.set("hideZapped", "false");

    return (
        <Card className="app-surface mt-6">
            <CardHeader className="space-y-1">
                <CardTitle>{t('playbackHistory')}</CardTitle>
                <CardDescription>
                    {t('aggregatedDesc')} — {totalCount} session{totalCount > 1 ? 's' : ''}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Search & Filters */}
                <div className="space-y-4 pb-2">
                    <div className="flex items-start gap-2 flex-wrap">
                        <div className="flex-1 w-full relative z-10">
                            <LogSearchBar initialQuery={query} />
                        </div>
                        <div className="flex items-center gap-2">
                            <SavedFilters />
                            <ColumnToggle visibleColumns={visibleColumns as any} />
                            <div className="flex items-center gap-1">
                                <a
                                    href={`/api/logs/export?${exportParams.toString()}`}
                                    className="flex items-center justify-center gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium px-2.5 py-1.5 rounded-l-md hover:bg-emerald-500/20 transition-colors text-xs whitespace-nowrap border border-emerald-500/20"
                                    title="Exporter l'historique de cet utilisateur en CSV"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    <span>CSV</span>
                                </a>
                                <a
                                    href={`/api/logs/export?${exportParams.toString()}&format=json`}
                                    className="flex items-center justify-center gap-1.5 bg-sky-500/10 text-sky-600 dark:text-sky-400 font-medium px-2.5 py-1.5 rounded-r-md hover:bg-sky-500/20 transition-colors text-xs whitespace-nowrap border border-sky-500/20 border-l-0"
                                    title="Exporter l'historique de cet utilisateur en JSON"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    <span>JSON</span>
                                </a>
                            </div>
                        </div>
                    </div>

                    <div className="pt-2 border-t border-border/70">
                        <LogFilters 
                            initialQuery={query} initialSort={sort} initialHideZapped={hideZapped} initialType={typeFilter}
                            initialClient={clientParams} initialAudio={audioParams} initialSubtitle={subtitleParams}
                            initialDateFrom={dateFromParam} initialDateTo={dateToParam} hideSearch={true} hideExport={true}
                        />
                    </div>
                </div>

                <div className="rounded-md border overflow-x-auto w-full">
                    <LogsListClient serverLogs={safeLogs} visibleColumns={visibleColumns as string[]} />
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-4 pt-3 border-t border-border/50">
                        {safePage > 1 && (
                            <Link href={buildPageUrl(safePage - 1)} className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                                <ChevronLeft className="w-4 h-4" />
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
                                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                                item === safePage
                                                    ? "bg-primary text-primary-foreground"
                                                    : "text-muted-foreground hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-zinc-800 dark:text-zinc-100"
                                            }`}
                                        >
                                            {item}
                                        </Link>
                                    )
                                )}
                        </div>
                        {safePage < totalPages && (
                            <Link href={buildPageUrl(safePage + 1)} className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                                <ChevronRight className="w-4 h-4" />
                            </Link>
                        )}
                        <span className="text-xs text-muted-foreground ml-3">
                            Page {safePage} / {totalPages}
                        </span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
