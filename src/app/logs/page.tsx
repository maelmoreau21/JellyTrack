import { Users, ChevronLeft, ChevronRight, ShieldAlert, AlertTriangle, Terminal, PlayCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogFilters } from "./LogFilters";
import LogSearchBar from "./LogSearchBar";
import { ColumnToggle } from "./ColumnToggle";
import { FiltersCollapse } from "./FiltersCollapse";
import { SavedFilters } from "@/components/SavedFilters";
import LogsListClient from "./LogsListClient";
import SystemLogsListClient, { SystemLogEntry } from "./SystemLogsListClient";
import { ServerFilter } from "@/components/dashboard/ServerFilter";
import prisma from "@/lib/prisma";
import { getTranslations, getLocale } from 'next-intl/server';
import type { SafeLog, SafeMedia, SafeTelemetryEvent } from '@/types/logs';
import type { Prisma } from '@prisma/client';
import { ZAPPING_CONDITION } from "@/lib/statsUtils";
import { readSmartSecurityThresholdsFromResolutionSettings } from "@/lib/securitySmartThresholds";
import { cn } from "@/lib/utils";

import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { GLOBAL_SERVER_SCOPE_COOKIE, resolveSelectedServerIdsAsync } from "@/lib/serverScope";
import { buildSelectableServerOptions } from "@/lib/selectableServers";

export const dynamic = "force-dynamic";

const LOGS_PER_PAGE = 50;
const MAX_TELEMETRY_EVENTS_PER_LOG = 200;

// Column utilities
const ALL_COLUMNS = ['date', 'startedAt', 'endedAt', 'user', 'media', 'client', 'ip', 'country', 'status', 'resolution', 'audioBitrate', 'codecs', 'duration', 'pauseCount', 'audioChanges', 'subtitleChanges'] as const;
type Column = typeof ALL_COLUMNS[number];
const DEFAULT_VISIBLE: Column[] = ['date', 'user', 'media', 'client', 'resolution', 'audioBitrate', 'status', 'duration'];

function parseVisibleColumns(colsParam: string | undefined): Column[] {
    if (!colsParam) return DEFAULT_VISIBLE;
    const parsed = colsParam.split(',').filter(c => ALL_COLUMNS.includes(c as Column)) as Column[];
    return parsed.length >= 2 ? parsed : DEFAULT_VISIBLE;
}

// ... helper functions (fetchJellyfinSubtitleMeta, detectWatchParties) remain the same ...

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
    }

    return metaMap;
}

function toValidTimestamp(value: unknown): number | null {
    const date = value instanceof Date ? value : new Date(String(value ?? ''));
    const ts = date.getTime();
    return Number.isFinite(ts) ? ts : null;
}

function detectWatchParties(logs: SafeLog[]): Map<string, string> {
    const WINDOW_MS = 5 * 60 * 1000;
    const byMedia = new Map<string, Array<{ log: SafeLog; startedAtMs: number }>>();
    logs.forEach(log => {
        const mId = log.mediaId;
        const startedAtMs = toValidTimestamp(log.startedAt);
        if (!startedAtMs || !mId) return;
        if (!byMedia.has(mId)) byMedia.set(mId, []);
        byMedia.get(mId)!.push({ log, startedAtMs });
    });
    const partyMap = new Map<string, string>();
    let partyCounter = 0;
    byMedia.forEach((mediaLogs) => {
        const sorted = [...mediaLogs].sort((a, b) => a.startedAtMs - b.startedAtMs);
        let clusterStart = 0;
        for (let i = 1; i <= sorted.length; i++) {
            if (i === sorted.length || sorted[i].startedAtMs - sorted[i - 1].startedAtMs > WINDOW_MS) {
                const cluster = sorted.slice(clusterStart, i);
                const uniqueUsers = new Set(cluster.map((item) => item.log.userId));
                if (uniqueUsers.size >= 2) {
                    partyCounter++;
                    const pid = `party-${partyCounter}`;
                    cluster.forEach((item) => partyMap.set(item.log.id, pid));
                }
                clusterStart = i;
            }
        }
    });
    return partyMap;
}

type JellyfinSubtitleMeta = {
    parentId: string | null;
    seriesName: string | null;
    seasonName: string | null;
    albumName: string | null;
    albumArtist: string | null;
    artist: string | null;
};

export default async function LogsPage({
    searchParams
}: {
    searchParams: Promise<{ 
        query?: string, 
        sort?: string, 
        page?: string, 
        type?: string, 
        cols?: string, 
        colsState?: string, 
        hideZapped?: string, 
        client?: string, 
        audio?: string, 
        subtitle?: string, 
        dateFrom?: string, 
        dateTo?: string, 
        resolution?: string, 
        playMethod?: string, 
        hour?: string, 
        day?: string, 
        servers?: string,
        tab?: string 
    }>
}) {
    const params = await searchParams;

    const session = await getServerSession(authOptions);
    if (!session?.user?.isAdmin) {
        redirect("/login");
    }

    const tl = await getTranslations('logs');
    const tc = await getTranslations('common');
    const locale = await getLocale();
    const activeTab = params.tab || 'application';
    
    const query = params.query?.toLowerCase() || "";
    const sort = params.sort || "date_desc";
    const currentPage = Math.max(1, parseInt(params.page || "1", 10) || 1);
    const typeFilter = params.type || "";
    const typeFilters = (typeof typeFilter === 'string' && typeFilter) ? typeFilter.split(',').map(s => s.trim()).filter(Boolean) : [];
    const visibleColumns = parseVisibleColumns(params.cols);
    const hideZapped = params.hideZapped !== 'false';

    const clientParams = params.client?.trim() || "";
    const audioParams = params.audio?.trim() || "";
    const subtitleParams = params.subtitle?.trim() || "";
    const dateFromParam = params.dateFrom || "";
    const dateToParam = params.dateTo || "";
    const resolutionParam = params.resolution || "";
    const playMethodParam = params.playMethod || "";
    const serversParam = params.servers || "";

    const buildPageUrl = (page: number, tab?: string) => {
        const p = new URLSearchParams();
        const currentTab = tab || activeTab;
        if (currentTab !== 'application') p.set("tab", currentTab);
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
        if (resolutionParam) p.set("resolution", resolutionParam);
        if (playMethodParam) p.set("playMethod", playMethodParam);
        if (serversParam) p.set("servers", serversParam);
        if (page > 1) p.set("page", String(page));
        const qs = p.toString();
        return `/logs${qs ? `?${qs}` : ""}`;
    };

    let totalCount = 0;
    let safeLogs: SafeLog[] = [];
    let systemLogs: SystemLogEntry[] = [];
    let jellyfinMetaMap = new Map<string, JellyfinSubtitleMeta>();
    let selectableServerOptions: any[] = [];
    let multiServerEnabled = false;
    let newCountryAlerts = 0;
    let topHotIps: any[] = [];

    if (activeTab === 'application') {
        // --- Application Logs Logic (Playback History) ---
        const [serverRows, smartSettingsSource] = await Promise.all([
            prisma.server.findMany({
                select: { id: true, name: true, isActive: true, url: true, jellyfinServerId: true },
                orderBy: { name: "asc" },
            }),
            prisma.globalSettings.findUnique({
                where: { id: "global" },
                select: { resolutionThresholds: true },
            }),
        ]);
        
        const smartThresholds = readSmartSecurityThresholdsFromResolutionSettings(smartSettingsSource?.resolutionThresholds);
        const newCountryMatchWindowMs = smartThresholds.newCountryGraceMinutes * 60 * 1000;
        const hotIpWindowMs = smartThresholds.ipWindowMinutes * 60 * 1000;
        const hotIpThreshold = smartThresholds.ipAttemptThreshold;
        
        const jellytrackMode = (process.env.JELLYTRACK_MODE || "single").toLowerCase();
        selectableServerOptions = buildSelectableServerOptions(serverRows);
        multiServerEnabled = jellytrackMode === "multi" && selectableServerOptions.length > 1;
        const cookieStore = await cookies();
        const persistedScopeCookie = cookieStore.get(GLOBAL_SERVER_SCOPE_COOKIE)?.value ?? null;
        const { selectedServerIds } = await resolveSelectedServerIdsAsync({
            multiServerEnabled,
            selectableServerIds: selectableServerOptions.map((server) => server.id),
            requestedServersParam: params.servers,
            cookieServersParam: persistedScopeCookie,
        });

        const whereClause: Prisma.PlaybackHistoryWhereInput = {};
        const conditions: Prisma.PlaybackHistoryWhereInput[] = [];
        if (hideZapped) conditions.push(ZAPPING_CONDITION);
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
        if (typeFilters.length > 0) conditions.push({ media: { type: { in: typeFilters } } });
        if (selectedServerIds.length > 0) conditions.push({ serverId: { in: selectedServerIds } });
        if (clientParams) conditions.push({ clientName: { contains: clientParams, mode: "insensitive" } });
        if (audioParams) conditions.push({ OR: [{audioCodec: { contains: audioParams, mode: "insensitive" }}, {audioLanguage: { contains: audioParams, mode: "insensitive" }}] });
        if (subtitleParams) conditions.push({ OR: [{subtitleCodec: { contains: subtitleParams, mode: "insensitive" }}, {subtitleLanguage: { contains: subtitleParams, mode: "insensitive" }}] });
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

        totalCount = await prisma.playbackHistory.count({ where: whereClause });
        const skip = (currentPage - 1) * LOGS_PER_PAGE;
        const logs = await prisma.playbackHistory.findMany({
            where: whereClause,
            include: {
                user: { select: { id: true, username: true, jellyfinUserId: true } },
                media: { select: { id: true, jellyfinMediaId: true, title: true, type: true, parentId: true, artist: true, resolution: true, durationMs: true } },
                telemetryEvents: {
                    select: { eventType: true, positionMs: true, createdAt: true },
                    orderBy: { createdAt: 'desc' },
                    take: MAX_TELEMETRY_EVENTS_PER_LOG,
                },
            },
            orderBy: orderBy,
            skip,
            take: LOGS_PER_PAGE,
        });

        // --- Anomaly Flags Logic ---
        const anomalyFlagsByLogId = new Map<string, Set<string>>();
        const hotIpCountByIp = new Map<string, number>();
        const candidateUserIds = Array.from(new Set(logs.map(l => l.userId).filter((v): v is string => !!v)));
        const candidateCountries = Array.from(new Set(logs.map(l => l.country).filter((v): v is string => !!v && v !== "Unknown")));

        if (candidateUserIds.length > 0 && candidateCountries.length > 0) {
            const firstSeenRows = await prisma.playbackHistory.groupBy({
                by: ["userId", "country"],
                where: { userId: { in: candidateUserIds }, country: { in: candidateCountries } },
                _min: { startedAt: true },
            });
            const firstSeenByPair = new Map<string, number>();
            firstSeenRows.forEach(row => {
                if (row.userId && row.country && row._min.startedAt) firstSeenByPair.set(`${row.userId}:${row.country}`, row._min.startedAt.getTime());
            });
            logs.forEach(log => {
                if (!log.userId || !log.country || log.country === "Unknown") return;
                const firstSeenTs = firstSeenByPair.get(`${log.userId}:${log.country}`);
                if (firstSeenTs && Math.abs(log.startedAt.getTime() - firstSeenTs) <= newCountryMatchWindowMs) {
                    const flags = anomalyFlagsByLogId.get(log.id) || new Set<string>();
                    flags.add("new_country");
                    anomalyFlagsByLogId.set(log.id, flags);
                    newCountryAlerts++;
                }
            });
        }

        const candidateIps = Array.from(new Set(logs.map(l => l.ipAddress).filter((v): v is string => !!v)));
        if (candidateIps.length > 0) {
            const hotIpSince = new Date(Date.now() - hotIpWindowMs);
            const hotIpRows = await prisma.playbackHistory.groupBy({
                by: ["ipAddress"],
                where: { ipAddress: { in: candidateIps }, startedAt: { gte: hotIpSince } },
                _count: { _all: true },
            });
            hotIpRows.forEach(row => {
                if (row.ipAddress && row._count._all >= hotIpThreshold) hotIpCountByIp.set(row.ipAddress, row._count._all);
            });
            logs.forEach(log => {
                if (log.ipAddress && (hotIpCountByIp.get(log.ipAddress) || 0) >= hotIpThreshold) {
                    const flags = anomalyFlagsByLogId.get(log.id) || new Set<string>();
                    flags.add("ip_burst");
                    anomalyFlagsByLogId.set(log.id, flags);
                }
            });
        }
        topHotIps = Array.from(hotIpCountByIp.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([ip, count]) => ({ ipAddress: ip, attempts: count }));

        const activeStreams = await prisma.activeStream.findMany({ select: { userId: true, mediaId: true, bitrate: true } });
        const activeStreamMap = new Map(activeStreams.map(e => [`${e.userId}:${e.mediaId}`, e.bitrate ?? null]));
        const activePairSet = new Set(activeStreams.map(e => `${e.userId}:${e.mediaId}`));

        safeLogs = logs.map(log => ({
            ...log,
            startedAt: log.startedAt.toISOString(),
            endedAt: log.endedAt?.toISOString() || null,
            media: log.media ? { ...log.media, durationMs: log.media.durationMs ? String(log.media.durationMs) : null } : null,
            telemetryEvents: log.telemetryEvents.map(e => ({ ...e, positionMs: String(e.positionMs), createdAt: e.createdAt.toISOString() })),
            isActuallyActive: !log.endedAt && activePairSet.has(`${log.userId}:${log.mediaId}`),
            bitrate: activeStreamMap.get(`${log.userId}:${log.mediaId}`) ?? null,
            anomalyFlags: Array.from(anomalyFlagsByLogId.get(log.id) || []),
        }));

        jellyfinMetaMap = await fetchJellyfinSubtitleMeta(safeLogs.map(l => l.media?.jellyfinMediaId).filter((id): id is string => !!id));
    } else {
        // --- System Logs Logic (Audit & Health) ---
        const whereAudit: Prisma.AdminAuditLogWhereInput = {};
        const whereHealth: Prisma.SystemHealthEventWhereInput = { kind: { not: 'monitor_ping' } };
        
        if (query) {
            whereAudit.OR = [
                { action: { contains: query, mode: 'insensitive' } },
                { actorUsername: { contains: query, mode: 'insensitive' } },
                { ipAddress: { contains: query, mode: 'insensitive' } },
            ];
            whereHealth.OR = [
                { message: { contains: query, mode: 'insensitive' } },
                { source: { contains: query, mode: 'insensitive' } },
                { kind: { contains: query, mode: 'insensitive' } },
            ];
        }

        const [auditCount, healthCount] = await Promise.all([
            prisma.adminAuditLog.count({ where: whereAudit }),
            prisma.systemHealthEvent.count({ where: whereHealth }),
        ]);
        totalCount = auditCount + healthCount;

        const [auditLogs, healthLogs] = await Promise.all([
            prisma.adminAuditLog.findMany({
                where: whereAudit,
                orderBy: { createdAt: 'desc' },
                take: LOGS_PER_PAGE,
                skip: (currentPage - 1) * LOGS_PER_PAGE,
            }),
            prisma.systemHealthEvent.findMany({
                where: whereHealth,
                orderBy: { createdAt: 'desc' },
                take: LOGS_PER_PAGE,
                skip: (currentPage - 1) * LOGS_PER_PAGE,
            }),
        ]);

        const combined = [
            ...auditLogs.map(l => ({ 
                id: l.id, 
                type: 'audit' as const, 
                action: l.action, 
                actorUsername: l.actorUsername, 
                ipAddress: l.ipAddress, 
                createdAt: l.createdAt.toISOString(), 
                details: l.details 
            })),
            ...healthLogs.map(l => ({ 
                id: l.id, 
                type: 'health' as const, 
                source: l.source, 
                kind: l.kind, 
                message: l.message, 
                createdAt: l.createdAt.toISOString(), 
                details: l.details 
            })),
        ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        systemLogs = combined.slice(0, LOGS_PER_PAGE);
    }

    const totalPages = Math.ceil(totalCount / LOGS_PER_PAGE) || 1;
    const safePage = Math.min(currentPage, totalPages);

    // Metadata Helpers for Application tab
    const parentIds = new Set<string>();
    safeLogs.forEach(log => {
        const metadata = log.media?.jellyfinMediaId ? jellyfinMetaMap.get(log.media.jellyfinMediaId) : null;
        if (log.media?.parentId || metadata?.parentId) parentIds.add(log.media?.parentId || metadata!.parentId!);
    });
    const [parentMedia, grandparentMediaRows] = await Promise.all([
        parentIds.size > 0 ? prisma.media.findMany({ where: { jellyfinMediaId: { in: Array.from(parentIds) } }, select: { jellyfinMediaId: true, title: true, type: true, parentId: true, artist: true } }) : [],
        parentIds.size > 0 ? prisma.media.findMany({ where: { parentId: { in: Array.from(parentIds) } }, select: { parentId: true, jellyfinMediaId: true, title: true, type: true } }) : [],
    ]);
    const parentMap = new Map(parentMedia.map(pm => [pm.jellyfinMediaId, pm]));
    
    function getMediaSubtitle(media: SafeMedia | null): string | null {
        if (!media) return null;
        const metadata = media.jellyfinMediaId ? jellyfinMetaMap.get(media.jellyfinMediaId) : null;
        if (media.type === 'Episode') return metadata?.seriesName || parentMap.get(media.parentId || '')?.title || null;
        if (media.type === 'Audio' || media.type === 'Track') return metadata?.albumArtist || metadata?.artist || media.artist || null;
        return null;
    }

    return (
        <div className="flex-col md:flex dashboard-page">
            <div className="flex-1 space-y-4 md:space-y-6 p-4 md:p-8 pt-4 md:pt-6 max-w-[1800px] mx-auto w-full">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-3">
                            <Terminal className="w-8 h-8 text-primary" />
                            {tl('title')}
                        </h1>
                        <p className="text-muted-foreground mt-2">
                            {tl('description')}
                            {totalCount > 0 && <span className="text-zinc-500"> — {totalCount} {tl('totalEntries')}</span>}
                        </p>
                    </div>

                    {/* Tab Switcher moved to header */}
                    <div className="flex items-center p-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg shadow-inner">
                        <Link
                            href={buildPageUrl(1, 'application')}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all",
                                activeTab === 'application'
                                    ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 shadow-sm"
                                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
                            )}
                        >
                            <PlayCircle className="w-4 h-4" />
                            {tl('tabApplication')}
                        </Link>
                        <Link
                            href={buildPageUrl(1, 'system')}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all",
                                activeTab === 'system'
                                    ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 shadow-sm"
                                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
                            )}
                        >
                            <Terminal className="w-4 h-4" />
                            {tl('tabSystem')}
                        </Link>
                    </div>
                </div>

                <div className="space-y-4">
                    {activeTab === 'application' && (newCountryAlerts > 0 || topHotIps.length > 0) && (
                        <Card className="border-amber-500/30 bg-amber-500/5">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                                    {tl('smartAlertsTitle')}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid gap-2 md:grid-cols-2">
                                    <div className="rounded-md border border-zinc-200/70 dark:border-zinc-800/70 p-3">
                                        <div className="text-xs text-muted-foreground">{tl('smartNewCountryLabel')}</div>
                                        <div className="mt-1 text-lg font-semibold text-amber-400">{newCountryAlerts}</div>
                                    </div>
                                    <div className="rounded-md border border-zinc-200/70 dark:border-zinc-800/70 p-3">
                                        <div className="text-xs text-muted-foreground">{tl('smartIpBurstLabel')}</div>
                                        <div className="mt-1 flex items-center gap-2">
                                            <AlertTriangle className="w-4 h-4 text-red-400" />
                                            <span className="text-lg font-semibold text-red-400">{topHotIps.length}</span>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    <Card className="border-0 shadow-sm bg-white dark:bg-zinc-900 ring-1 ring-zinc-200 dark:ring-zinc-800">
                        <CardContent className="space-y-4 pt-6">
                            <div className="flex items-start gap-2 flex-wrap">
                                <div className="flex-1 w-full relative z-10">
                                    <LogSearchBar initialQuery={query} />
                                </div>
                                {activeTab === 'application' && (
                                    <div className="flex items-center gap-2">
                                        <SavedFilters />
                                        <ColumnToggle visibleColumns={visibleColumns} />
                                    </div>
                                )}
                            </div>

                            {activeTab === 'application' && (
                                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-4">
                                    <ServerFilter servers={selectableServerOptions} enabled={multiServerEnabled} showOutsideDashboard />
                                    <LogFilters 
                                        initialQuery={query} initialSort={sort} initialHideZapped={hideZapped} initialType={typeFilter}
                                        initialClient={clientParams} initialAudio={audioParams} initialSubtitle={subtitleParams}
                                        initialDateFrom={dateFromParam} initialDateTo={dateToParam} initialServers={serversParam}
                                        serverOptions={selectableServerOptions} multiServerEnabled={multiServerEnabled} hideSearch={true}
                                    />
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <div className="app-surface-soft border rounded-md overflow-x-auto w-full mt-6">
                        {activeTab === 'application' ? (
                            <LogsListClient 
                                serverLogs={safeLogs.map(log => ({ ...log, mediaSubtitle: getMediaSubtitle(log.media) }))} 
                                visibleColumns={visibleColumns as string[]} 
                            />
                        ) : (
                            <SystemLogsListClient logs={systemLogs} locale={locale} />
                        )}
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

