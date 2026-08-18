import { ChevronLeft, ChevronRight, ShieldAlert, AlertTriangle, Terminal, PlayCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogFilters } from "./LogFilters";
import LogSearchBar from "./LogSearchBar";
import { ColumnToggle } from "./ColumnToggle";
import { SavedFilters } from "@/components/SavedFilters";
import LogsListClient from "./LogsListClient";
import SystemLogsListClient, { SystemLogEntry } from "./SystemLogsListClient";
import { getRecentSystemLogs } from "@/lib/systemLogger";
import { ServerFilter } from "@/components/dashboard/ServerFilter";
import prisma from "@/lib/prisma";
import valkey from "@/lib/valkey";
import { getTranslations, getLocale } from 'next-intl/server';
import type { SafeLog, SafeMedia } from '@/types/logs';
import type { Prisma } from '@prisma/client';
import { ZAPPING_CONDITION } from "@/lib/statsUtils";
import { readSmartSecurityThresholdsFromResolutionSettings } from "@/lib/securitySmartThresholds";
import { cn } from "@/lib/utils";
import { normalizeBitrateToKbps } from "@/lib/bitrate";
import { buildJellyfinApiKeyHeaders } from "@/lib/jellyfinServers";
import { normalizeLanguageTag } from "@/lib/language";
import { formatMediaSubtitle } from "@/lib/mediaSubtitle";
import { buildStreamValkeyKey } from "@/lib/serverRegistry";

import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { GLOBAL_SERVER_SCOPE_COOKIE } from "@/lib/serverScope";
import { resolveSelectedServerIdsAsync } from "@/lib/serverScope.server";
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

type JellyfinMetaRequest = {
    itemId: string;
    serverId?: string | null;
};

type ActiveStreamLogMeta = {
    bitrate: number | null;
    audioCodec: string;
    audioStreamIndex: number | null;
};

function getMetaKey(serverId: string | null | undefined, itemId: string | null | undefined): string {
    return `${serverId || "default"}:${itemId || ""}`;
}

function normalizeComparableCodec(value: string | null | undefined): string | null {
    const normalized = String(value || "").trim().toLowerCase();
    return normalized || null;
}

function parseAudioStreamIndex(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function getStringField(record: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
        const value = record[key];
        if (typeof value === "string" && value.trim()) return value;
    }
    return null;
}

function parseJellyfinAudioStreams(item: Record<string, unknown>): JellyfinAudioStreamMeta[] {
    const streams = Array.isArray(item?.MediaStreams) ? item.MediaStreams : [];
    return streams
        .filter((stream): stream is Record<string, unknown> =>
            Boolean(stream) &&
            typeof stream === "object" &&
            String((stream as Record<string, unknown>).Type || (stream as Record<string, unknown>).type || "").toLowerCase() === "audio"
        )
        .map((stream) => ({
            index: parseAudioStreamIndex(stream.Index ?? stream.index),
            codec: getStringField(stream, ["Codec", "codec"]),
            language: getStringField(stream, ["Language", "DisplayLanguage", "language"]),
            bitRateKbps: normalizeBitrateToKbps(stream.BitRate ?? stream.Bitrate ?? stream.bitRate ?? stream.bitrate),
        }));
}

async function resolveJellyfinMetadataConnection(serverId: string | null) {
    const envBaseUrl = String(process.env.JELLYFIN_URL || "").trim().replace(/\/+$/, "");
    const envApiKey = String(process.env.JELLYFIN_API_KEY || "").trim();

    if (serverId) {
        const server = await prisma.server.findUnique({
            where: { id: serverId },
            select: { url: true, jellyfinApiKey: true },
        });

        if (server) {
            const baseUrl = String(server.url || "").trim().replace(/\/+$/, "") || envBaseUrl;
            const apiKey = String(server.jellyfinApiKey || "").trim() || envApiKey;
            if (baseUrl && apiKey) return { baseUrl, apiKey };
        }
    }

    if (!envBaseUrl || !envApiKey) return null;
    return { baseUrl: envBaseUrl, apiKey: envApiKey };
}

async function fetchJellyfinSubtitleMeta(requests: JellyfinMetaRequest[]): Promise<Map<string, JellyfinSubtitleMeta>> {
    const metaMap = new Map<string, JellyfinSubtitleMeta>();
    const grouped = new Map<string, { serverId: string | null; itemIds: Set<string> }>();

    for (const request of requests) {
        if (!request.itemId) continue;
        const key = request.serverId || "default";
        if (!grouped.has(key)) grouped.set(key, { serverId: request.serverId || null, itemIds: new Set<string>() });
        grouped.get(key)!.itemIds.add(request.itemId);
    }

    for (const group of grouped.values()) {
        const uniqueIds = Array.from(group.itemIds);
        if (uniqueIds.length === 0) continue;

        const connection = await resolveJellyfinMetadataConnection(group.serverId);
        if (!connection) continue;

        try {
            const ids = uniqueIds.map(encodeURIComponent).join(',');
            const url = `${connection.baseUrl}/Items?Ids=${ids}&Fields=ParentId,SeriesName,SeasonName,IndexNumber,ParentIndexNumber,Album,AlbumArtist,AlbumArtists,Artists,MediaStreams`;
            const res = await fetch(url, {
                headers: buildJellyfinApiKeyHeaders(connection.apiKey),
                next: { revalidate: 300 },
            });
            if (!res.ok) continue;

            const data = await res.json();
            const items = Array.isArray(data?.Items) ? data.Items : [];
            for (const item of items) {
                const id = typeof item?.Id === 'string' ? item.Id : null;
                if (!id) continue;
                metaMap.set(getMetaKey(group.serverId, id), {
                    parentId: item?.ParentId || null,
                    seriesName: item?.SeriesName || null,
                    seasonName: item?.SeasonName || null,
                    indexNumber: typeof item?.IndexNumber === 'number' ? item.IndexNumber : null,
                    parentIndexNumber: typeof item?.ParentIndexNumber === 'number' ? item.ParentIndexNumber : null,
                    albumName: item?.Album || null,
                    albumArtist: item?.AlbumArtist || item?.AlbumArtists?.[0]?.Name || item?.AlbumArtists?.[0] || null,
                    artist: item?.Artists?.[0] || null,
                    audioStreams: parseJellyfinAudioStreams(item),
                });
            }
        } catch {
        }
    }

    return metaMap;
}

function resolveAudioBitrateKbps(log: SafeLog, metadata: JellyfinSubtitleMeta | null, active: ActiveStreamLogMeta | null): number | null {
    const audioStreams = (metadata?.audioStreams || []).filter((stream) => stream.bitRateKbps !== null);
    if (audioStreams.length > 0) {
        if (active?.audioStreamIndex !== null && active?.audioStreamIndex !== undefined) {
            const byIndex = audioStreams.find((stream) => stream.index !== null && stream.index === active.audioStreamIndex);
            if (byIndex?.bitRateKbps) return byIndex.bitRateKbps;
        }

        const logLanguage = normalizeLanguageTag(log.audioLanguage);
        const logCodec = normalizeComparableCodec(log.audioCodec || active?.audioCodec || null);
        const byLanguageAndCodec = audioStreams.find((stream) => {
            const streamLanguage = normalizeLanguageTag(stream.language);
            const streamCodec = normalizeComparableCodec(stream.codec);
            return logLanguage && logCodec && streamLanguage === logLanguage && streamCodec === logCodec;
        });
        if (byLanguageAndCodec?.bitRateKbps) return byLanguageAndCodec.bitRateKbps;

        const byLanguage = audioStreams.find((stream) => {
            const streamLanguage = normalizeLanguageTag(stream.language);
            return logLanguage && streamLanguage === logLanguage;
        });
        if (byLanguage?.bitRateKbps) return byLanguage.bitRateKbps;

        const byCodec = audioStreams.find((stream) => {
            const streamCodec = normalizeComparableCodec(stream.codec);
            return logCodec && streamCodec === logCodec;
        });
        if (byCodec?.bitRateKbps) return byCodec.bitRateKbps;

        if (audioStreams.length === 1) return audioStreams[0].bitRateKbps;
    }

    return normalizeBitrateToKbps(log.bitrate ?? active?.bitrate ?? null);
}

function toValidTimestamp(value: unknown): number | null {
    const date = value instanceof Date ? value : new Date(String(value ?? ''));
    const ts = date.getTime();
    return Number.isFinite(ts) ? ts : null;
}


type JellyfinSubtitleMeta = {
    parentId: string | null;
    seriesName: string | null;
    seasonName: string | null;
    indexNumber: number | null;
    parentIndexNumber: number | null;
    albumName: string | null;
    albumArtist: string | null;
    artist: string | null;
    audioStreams: JellyfinAudioStreamMeta[];
};

type JellyfinAudioStreamMeta = {
    index: number | null;
    codec: string | null;
    language: string | null;
    bitRateKbps: number | null;
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
                    select: { eventType: true, positionMs: true, createdAt: true, metadata: true },
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
            // eslint-disable-next-line react-hooks/purity
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

        const activeStreams = await prisma.activeStream.findMany({
            select: { serverId: true, sessionId: true, userId: true, mediaId: true, bitrate: true, audioCodec: true },
        });
        const activeStreamMap = new Map<string, ActiveStreamLogMeta>();
        await Promise.all(activeStreams.map(async (stream) => {
            let audioStreamIndex: number | null = null;
            try {
                const scopedPayload = await valkey.get(buildStreamValkeyKey(stream.serverId, stream.sessionId));
                if (scopedPayload) {
                    const parsed = JSON.parse(scopedPayload) as Record<string, unknown>;
                    audioStreamIndex = parseAudioStreamIndex(parsed.audioStreamIndex ?? parsed.AudioStreamIndex);
                }
            } catch {
            }

            activeStreamMap.set(`${stream.userId}:${stream.mediaId}`, {
                bitrate: stream.bitrate ?? null,
                audioCodec: stream.audioCodec ?? "",
                audioStreamIndex,
            });
        }));
        const activePairSet = new Set(activeStreams.map(e => `${e.userId}:${e.mediaId}`));

        const reconnectionLogIds = new Set<string>();
        for (let i = 0; i < logs.length; i++) {
            const l1 = logs[i];
            const t1 = l1.startedAt.getTime();
            for (let j = 0; j < logs.length; j++) {
                if (i === j) continue;
                const l2 = logs[j];
                if (l1.userId === l2.userId && l1.mediaId === l2.mediaId) {
                    const t2End = l2.endedAt ? l2.endedAt.getTime() : l2.startedAt.getTime();
                    const diff = Math.abs(t1 - t2End);
                    if (diff >= 0 && diff <= 30000) {
                        reconnectionLogIds.add(l1.id);
                        break;
                    }
                }
            }
        }

        safeLogs = logs.map(log => ({
            ...log,
            serverId: log.serverId,
            startedAt: log.startedAt.toISOString(),
            endedAt: log.endedAt?.toISOString() || null,
            media: log.media ? { ...log.media, serverId: log.serverId, durationMs: log.media.durationMs ? String(log.media.durationMs) : null } : null,
            telemetryEvents: log.telemetryEvents.map(e => ({ ...e, positionMs: String(e.positionMs), createdAt: e.createdAt.toISOString() })),
            isActuallyActive: !log.endedAt && activePairSet.has(`${log.userId}:${log.mediaId}`),
            bitrate: normalizeBitrateToKbps(log.bitrate),
            anomalyFlags: Array.from(anomalyFlagsByLogId.get(log.id) || []),
            isReconnection: reconnectionLogIds.has(log.id),
        }));

        const metaRequests: JellyfinMetaRequest[] = safeLogs.flatMap((log) =>
            log.media?.jellyfinMediaId
                ? [{ itemId: log.media.jellyfinMediaId, serverId: log.serverId }]
                : []
        );
        jellyfinMetaMap = await fetchJellyfinSubtitleMeta(metaRequests);

        safeLogs = safeLogs.map((log) => {
            const metadata = log.media?.jellyfinMediaId ? jellyfinMetaMap.get(getMetaKey(log.serverId, log.media.jellyfinMediaId)) || null : null;
            const active = activeStreamMap.get(`${log.userId}:${log.mediaId}`) || null;
            return {
                ...log,
                fallbackImageParentId: log.media?.type === 'MusicAlbum' ? null : (log.media?.parentId || metadata?.parentId || null),
                bitrate: resolveAudioBitrateKbps(log, metadata, active),
            };
        });
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

        const fileLogs = getRecentSystemLogs(100);

        const combined: SystemLogEntry[] = [
            ...fileLogs.map(l => ({
                id: l.id,
                type: (l.level === 'AUDIT' ? 'audit' : 'health') as 'audit' | 'health',
                level: l.level,
                source: l.source,
                kind: l.level.toLowerCase(),
                message: l.message,
                createdAt: l.timestamp,
                details: l.details,
            })),
            ...auditLogs.map(l => ({ 
                id: l.id, 
                type: 'audit' as const, 
                level: 'AUDIT',
                action: l.action, 
                actorUsername: l.actorUsername ?? undefined,
                ipAddress: l.ipAddress ?? undefined,
                createdAt: l.createdAt.toISOString(), 
                details: l.details 
            })),
            ...healthLogs.map(l => ({ 
                id: l.id, 
                type: 'health' as const, 
                level: l.kind.toUpperCase(),
                source: l.source, 
                kind: l.kind, 
                message: l.message, 
                createdAt: l.createdAt.toISOString(), 
                details: l.details 
            })),
        ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        systemLogs = combined.slice(0, LOGS_PER_PAGE * 2);
    }

    const totalPages = Math.ceil(totalCount / LOGS_PER_PAGE) || 1;
    const safePage = Math.min(currentPage, totalPages);

    // Metadata Helpers for Application tab
    const parentTargets = new Map<string, { serverId: string | null; jellyfinMediaId: string }>();
    safeLogs.forEach(log => {
        const metadata = log.media?.jellyfinMediaId ? jellyfinMetaMap.get(getMetaKey(log.serverId, log.media.jellyfinMediaId)) : null;
        const parentId = log.media?.parentId || metadata?.parentId || null;
        if (parentId) parentTargets.set(getMetaKey(log.serverId, parentId), { serverId: log.serverId || null, jellyfinMediaId: parentId });
    });
    const parentMedia = parentTargets.size > 0 ? await prisma.media.findMany({
        where: {
            OR: Array.from(parentTargets.values()).map((target) => ({
                ...(target.serverId ? { serverId: target.serverId } : {}),
                jellyfinMediaId: target.jellyfinMediaId,
            })),
        },
        select: { serverId: true, jellyfinMediaId: true, title: true, type: true, parentId: true, artist: true },
    }) : [];
    const parentMap = new Map(parentMedia.map(pm => [getMetaKey(pm.serverId, pm.jellyfinMediaId), pm]));
    
    function getMediaSubtitle(media: SafeMedia | null, serverId: string | null | undefined): string | null {
        if (!media) return null;
        const metadata = media.jellyfinMediaId ? jellyfinMetaMap.get(getMetaKey(serverId, media.jellyfinMediaId)) : null;
        const parent = media.parentId ? parentMap.get(getMetaKey(serverId, media.parentId)) : null;

        return formatMediaSubtitle({
            type: media.type,
            seriesName: metadata?.seriesName || null,
            seasonName: metadata?.seasonName || (parent?.type === 'Season' ? parent.title : null),
            indexNumber: metadata?.indexNumber ?? null,
            parentIndexNumber: metadata?.parentIndexNumber ?? null,
            albumName: metadata?.albumName || (parent?.type === 'MusicAlbum' ? parent.title : null),
            albumArtist: metadata?.albumArtist || null,
            artist: metadata?.artist || media.artist || parent?.artist || null,
            parentTitle: parent?.title || null,
            parentArtist: parent?.artist || null,
        }, locale);
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
                    <div className="app-surface-soft flex items-center p-1 rounded-lg shadow-inner">
                        <Link
                            href={buildPageUrl(1, 'application')}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all",
                                activeTab === 'application'
                                    ? "bg-primary/15 text-primary shadow-sm border border-primary/25"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
                                    ? "bg-primary/15 text-primary shadow-sm border border-primary/25"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                        >
                            <Terminal className="w-4 h-4" />
                            {tl('tabSystem')}
                        </Link>
                    </div>
                </div>

                <div className="space-y-4">
                    {activeTab === 'application' && (newCountryAlerts > 0 || topHotIps.length > 0) && (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 shadow-sm space-y-3">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-2">
                                    <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
                                    <h3 className="text-sm font-bold text-amber-500 tracking-tight flex items-center gap-2">
                                        {tl('smartAlertsTitle')}
                                    </h3>
                                </div>
                                <span className="text-xs text-muted-foreground">
                                    ℹ Disparaît automatiquement après 24h sans activité anormale (fenêtre glissante)
                                </span>
                            </div>

                            <div className="flex items-center gap-3 flex-wrap text-xs">
                                {newCountryAlerts > 0 && (
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10">
                                        <span className="font-semibold text-amber-400">{newCountryAlerts}</span>
                                        <span className="text-muted-foreground">{tl('smartNewCountryLabel')}</span>
                                    </div>
                                )}

                                {topHotIps.map(({ ipAddress, attempts }: { ipAddress: string; attempts: number }) => (
                                    <Link
                                        key={ipAddress}
                                        href={buildPageUrl(1, activeTab) + (buildPageUrl(1, activeTab).includes('?') ? '&' : '?') + `query=${encodeURIComponent(ipAddress)}`}
                                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-300 transition-colors cursor-pointer group"
                                        title={`Cliquer pour filtrer les journaux sur l'IP ${ipAddress}`}
                                    >
                                        <AlertTriangle className="w-3.5 h-3.5 text-red-400 group-hover:scale-110 transition-transform" />
                                        <span className="font-mono font-bold text-red-400">{ipAddress}</span>
                                        <span className="text-red-300/80">({attempts} req/24h)</span>
                                        <span className="text-[10px] underline ml-1 text-red-400">Filtrer</span>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}

                    <Card className="app-surface shadow-sm ring-1 ring-border/70">
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
                                <div className="pt-2 border-t border-border/70 space-y-4">
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
                                serverLogs={safeLogs.map(log => ({ ...log, mediaSubtitle: getMediaSubtitle(log.media ?? null, log.serverId) }))}
                                visibleColumns={visibleColumns as string[]} 
                            />
                        ) : (
                            <SystemLogsListClient logs={systemLogs} locale={locale} />
                        )}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 mt-4 md:mt-6 pt-3 md:pt-4 border-t border-border/70 flex-wrap">
                            {safePage > 1 && (
                                <Link href={buildPageUrl(safePage - 1)} className="app-field flex items-center gap-1 px-2.5 md:px-3 py-1.5 md:py-2 rounded-md text-xs md:text-sm font-medium transition-colors hover:bg-muted">
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
                                                        : "text-foreground/75 hover:bg-muted hover:text-foreground"
                                                    }`}
                                            >
                                                {item}
                                            </Link>
                                        )
                                    )}
                            </div>
                            {safePage < totalPages && (
                                <Link href={buildPageUrl(safePage + 1)} className="app-field flex items-center gap-1 px-2.5 md:px-3 py-1.5 md:py-2 rounded-md text-xs md:text-sm font-medium transition-colors hover:bg-muted">
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

