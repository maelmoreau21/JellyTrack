import prisma from "@/lib/prisma";
import { requireAdmin, isAuthError } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ServerFilter } from "@/components/dashboard/ServerFilter";
import { getTranslations } from 'next-intl/server';
import { cookies } from "next/headers";
import { GLOBAL_SERVER_SCOPE_COOKIE, resolveSelectedServerIdsAsync } from "@/lib/serverScope";
import { buildSelectableServerOptions } from "@/lib/selectableServers";
import { Activity, ArrowUpRight, Gauge, Server, Zap } from "lucide-react";

export const dynamic = "force-dynamic";

type CompareSearchParams = {
    servers?: string;
};

type ServerMetric = {
    id: string;
    name: string;
    activeStreams: number;
    transcodes: number;
    staleStreams: number;
    avgBitrateKbps: number | null;
    plays24h: number;
    watchHours24h: number;
    heartbeatGapSec: number;
    healthScore: number;
};

function formatBitrateKbps(value: number | null): string {
    if (value === null || !Number.isFinite(value)) return "-";
    if (value >= 1000) return `${(value / 1000).toFixed(1)} Mbps`;
    return `${Math.round(value)} kbps`;
}

function formatHeartbeatGap(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h`;
}

function heartbeatBadge(seconds: number): { label: string; className: string } {
    if (seconds <= 120) {
        return { label: "healthy", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
    }
    if (seconds <= 600) {
        return { label: "degraded", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
    }
    return { label: "stale", className: "bg-red-500/15 text-red-400 border-red-500/30" };
}

export default async function ServerComparePage({
    searchParams,
}: {
    searchParams?: Promise<CompareSearchParams>;
}) {
    const auth = await requireAdmin();
    if (isAuthError(auth)) redirect("/login");
    const t = await getTranslations('dashboard');

    const params = (await searchParams) || {};

    const [serverRows, cookieStore] = await Promise.all([
        prisma.server.findMany({
            select: { id: true, name: true, isActive: true, updatedAt: true, url: true, jellyfinServerId: true },
            orderBy: { name: "asc" },
        }),
        cookies(),
    ]);

    const jellytrackMode = (process.env.JELLYTRACK_MODE || "single").toLowerCase();
    const selectableServerOptions = buildSelectableServerOptions(serverRows);
    const multiServerEnabled = jellytrackMode === "multi" && selectableServerOptions.length > 1;

    const persistedScopeCookie = cookieStore.get(GLOBAL_SERVER_SCOPE_COOKIE)?.value ?? null;
    const { selectedServerIds, selectedServerIdsParam: serversParam } = await resolveSelectedServerIdsAsync({
        multiServerEnabled,
        selectableServerIds: selectableServerOptions.map((server) => server.id),
        requestedServersParam: params.servers,
        cookieServersParam: persistedScopeCookie,
    });

    if (!multiServerEnabled) {
        return (
            <div className="flex-col md:flex">
                <div className="flex-1 space-y-6 p-4 md:p-8 pt-4 md:pt-6 max-w-[1400px] mx-auto w-full">
                    <Card className="app-surface border-border/60">
                        <CardHeader>
                            <CardTitle>{t('multiServerComparator.title')}</CardTitle>
                            <CardDescription>{t('multiServerComparator.disabled')}</CardDescription>
                        </CardHeader>
                    </Card>
                </div>
            </div>
        );
    }

    const selectedServerScope = selectedServerIds.length > 0 ? { in: selectedServerIds } : undefined;
    // Date.now is intentionally called once during render to compute thresholds.
    // eslint-disable-next-line react-hooks/purity
    const nowMs = Date.now();
    const dayAgo = new Date(nowMs - 24 * 60 * 60 * 1000);
    const staleThreshold = new Date(nowMs - 5 * 60 * 1000);

    const auditModel = (prisma as any).adminAuditLog;

    const [activeAgg, transcodeAgg, staleAgg, bitrateAgg, playbackAgg, pluginErrors24h] = await Promise.all([
        prisma.activeStream.groupBy({
            by: ["serverId"],
            where: {
                ...(selectedServerScope ? { serverId: selectedServerScope } : {}),
                lastPingAt: { gte: staleThreshold },
            },
            _count: { _all: true },
        }),
        prisma.activeStream.groupBy({
            by: ["serverId"],
            where: {
                ...(selectedServerScope ? { serverId: selectedServerScope } : {}),
                lastPingAt: { gte: staleThreshold },
                playMethod: "Transcode",
            },
            _count: { _all: true },
        }),
        prisma.activeStream.groupBy({
            by: ["serverId"],
            where: {
                ...(selectedServerScope ? { serverId: selectedServerScope } : {}),
                lastPingAt: { lt: staleThreshold },
            },
            _count: { _all: true },
        }),
        prisma.activeStream.groupBy({
            by: ["serverId"],
            where: {
                ...(selectedServerScope ? { serverId: selectedServerScope } : {}),
                lastPingAt: { gte: staleThreshold },
                bitrate: { not: null },
            },
            _avg: { bitrate: true },
        }),
        prisma.playbackHistory.groupBy({
            by: ["serverId"],
            where: {
                ...(selectedServerScope ? { serverId: selectedServerScope } : {}),
                startedAt: { gte: dayAgo },
            },
            _count: { _all: true },
            _sum: { durationWatched: true },
        }),
        auditModel?.count
            ? auditModel.count({
                where: {
                    action: {
                        in: [
                            "plugin.events.unauthorized",
                            "plugin.events.rate_limited",
                            "plugin.events.payload_too_large",
                            "plugin.events.invalid_payload",
                            "plugin.events.invalid_content_type",
                        ],
                    },
                    createdAt: { gte: dayAgo },
                },
            })
            : Promise.resolve(0),
    ]);

    const activeMap = new Map(activeAgg.map((row) => [row.serverId, row._count._all]));
    const transcodeMap = new Map(transcodeAgg.map((row) => [row.serverId, row._count._all]));
    const staleMap = new Map(staleAgg.map((row) => [row.serverId, row._count._all]));
    const bitrateMap = new Map(
        bitrateAgg.map((row) => [row.serverId, row._avg.bitrate !== null ? Number(row._avg.bitrate) : null])
    );
    const playbackMap = new Map(
        playbackAgg.map((row) => [
            row.serverId,
            {
                plays24h: row._count._all,
                watchHours24h: Number(row._sum.durationWatched || 0) / 3600,
            },
        ])
    );

    const scopedServers = selectedServerIds.length > 0
        ? selectableServerOptions.filter((server) => selectedServerIds.includes(server.id))
        : selectableServerOptions;

    const serverMetaById = new Map(serverRows.map((server) => [server.id, server]));

    const metrics: ServerMetric[] = scopedServers
        .map((server) => {
            const playback = playbackMap.get(server.id);
            const updatedAt = serverMetaById.get(server.id)?.updatedAt ?? new Date(0);
            const heartbeatGapSec = Math.max(0, Math.floor((nowMs - updatedAt.getTime()) / 1000));
            const activeStreams = activeMap.get(server.id) ?? 0;
            const transcodes = transcodeMap.get(server.id) ?? 0;
            const staleStreams = staleMap.get(server.id) ?? 0;
            const plays24h = playback?.plays24h ?? 0;
            const watchHours24h = playback?.watchHours24h ?? 0;
            const healthScore = Math.round(
                (plays24h * 0.15) +
                (activeStreams * 2) -
                (transcodes * 1.5) -
                (staleStreams * 3) -
                (heartbeatGapSec > 600 ? 5 : 0)
            );

            return {
                id: server.id,
                name: server.name,
                activeStreams,
                transcodes,
                staleStreams,
                avgBitrateKbps: bitrateMap.get(server.id) ?? null,
                plays24h,
                watchHours24h,
                heartbeatGapSec,
                healthScore,
            };
        })
        .sort((a, b) => b.healthScore - a.healthScore);

    const maxActiveStreams = Math.max(1, ...metrics.map((metric) => metric.activeStreams));
    const totalActiveStreams = metrics.reduce((sum, metric) => sum + metric.activeStreams, 0);
    const totalPlays24h = metrics.reduce((sum, metric) => sum + metric.plays24h, 0);
    const totalWatchHours24h = metrics.reduce((sum, metric) => sum + metric.watchHours24h, 0);

    return (
        <div className="flex-col md:flex">
            <div className="flex-1 space-y-6 p-4 md:p-8 pt-4 md:pt-6 max-w-[1400px] mx-auto w-full">
                <header className="space-y-2">
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <Server className="w-7 h-7 text-primary" />
                        {t('multiServerComparator.title')}
                    </h1>
                    <p className="text-sm text-muted-foreground max-w-3xl">
                        {t('multiServerComparator.desc')}
                    </p>
                </header>

                <ServerFilter
                    servers={selectableServerOptions}
                    enabled={multiServerEnabled}
                    showOutsideDashboard
                />

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    <Card className="app-surface-soft border-border/60">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
                                <Activity className="w-4 h-4 text-cyan-400" />
                                Active streams
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{totalActiveStreams}</div>
                            <p className="text-xs text-muted-foreground mt-1">Across {metrics.length} server(s)</p>
                        </CardContent>
                    </Card>

                    <Card className="app-surface-soft border-border/60">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
                                <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                                Plays (24h)
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{totalPlays24h}</div>
                            <p className="text-xs text-muted-foreground mt-1">{totalWatchHours24h.toFixed(1)} watch hours</p>
                        </CardContent>
                    </Card>

                    <Card className="app-surface-soft border-border/60">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
                                <Zap className="w-4 h-4 text-amber-400" />
                                Plugin errors (24h)
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{pluginErrors24h}</div>
                            <p className="text-xs text-muted-foreground mt-1">Security and ingest validation failures</p>
                        </CardContent>
                    </Card>

                    <Card className="app-surface-soft border-border/60">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
                                <Gauge className="w-4 h-4 text-violet-400" />
                                Scope
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-lg font-semibold truncate">{serversParam || "all servers"}</div>
                            <p className="text-xs text-muted-foreground mt-1">URL/global selection fingerprint</p>
                        </CardContent>
                    </Card>
                </div>

                <Card className="app-surface border-border/60">
                    <CardHeader>
                        <CardTitle>Server ranking</CardTitle>
                        <CardDescription>
                            Higher score means more steady activity with fewer stale sessions and lower transcode pressure.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Server</TableHead>
                                    <TableHead className="text-right">Active</TableHead>
                                    <TableHead className="text-right">Transcodes</TableHead>
                                    <TableHead className="text-right">Avg bitrate</TableHead>
                                    <TableHead className="text-right">Plays (24h)</TableHead>
                                    <TableHead className="text-right">Heartbeat</TableHead>
                                    <TableHead className="text-right">Score</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {metrics.map((metric) => {
                                    const loadPercent = Math.round((metric.activeStreams / maxActiveStreams) * 100);
                                    const beat = heartbeatBadge(metric.heartbeatGapSec);
                                    return (
                                        <TableRow key={metric.id}>
                                            <TableCell>
                                                <div className="space-y-1">
                                                    <div className="font-medium">{metric.name}</div>
                                                    <div className="h-1.5 w-44 max-w-full rounded-full bg-zinc-200/40 dark:bg-zinc-800/70 overflow-hidden">
                                                        <div
                                                            className="h-full bg-cyan-500/80"
                                                            style={{ width: `${loadPercent}%` }}
                                                        />
                                                    </div>
                                                    <div className="text-[11px] text-muted-foreground">Load index: {loadPercent}%</div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right font-semibold">{metric.activeStreams}</TableCell>
                                            <TableCell className="text-right">
                                                <span className="font-semibold">{metric.transcodes}</span>
                                                {metric.staleStreams > 0 && (
                                                    <span className="block text-[11px] text-amber-500">{metric.staleStreams} stale</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">{formatBitrateKbps(metric.avgBitrateKbps)}</TableCell>
                                            <TableCell className="text-right">
                                                <span className="font-semibold">{metric.plays24h}</span>
                                                <span className="block text-[11px] text-muted-foreground">{metric.watchHours24h.toFixed(1)}h</span>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Badge className={beat.className}>{beat.label}</Badge>
                                                <span className="block text-[11px] text-muted-foreground mt-1">{formatHeartbeatGap(metric.heartbeatGapSec)} ago</span>
                                            </TableCell>
                                            <TableCell className="text-right font-bold">{metric.healthScore}</TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
