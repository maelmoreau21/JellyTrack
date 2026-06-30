import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import prisma from "@/lib/prisma";
import { getTranslations } from 'next-intl/server';
import { ZAPPING_CONDITION } from "@/lib/statsUtils";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import LogsListClient from "@/app/logs/LogsListClient";
import type { SafeLog, SafeTelemetryEvent } from '@/types/logs';

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

export default async function UserRecentMedia({ userId, userIds = [], userDbIds = [], page = 1 }: { userId: string; userIds?: string[]; userDbIds?: string[]; page?: number }) {
    const t = await getTranslations('userProfile');

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

    // Count total sessions for pagination
    const totalCount = await prisma.playbackHistory.count({
        where: { 
            userId: { in: userDbIdsToUse },
            ...ZAPPING_CONDITION
        },
    });

    if (totalCount === 0) {
        return (
            <Card className="app-surface mt-6">
                <CardHeader>
                    <CardTitle>{t('playbackHistory')}</CardTitle>
                    <CardDescription>{t('noHistory')}</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));
    const safePage = Math.min(Math.max(1, page), totalPages);

    // Fetch paginated sessions
    const sessions = await prisma.playbackHistory.findMany({
        where: { 
            userId: { in: userDbIdsToUse },
            ...ZAPPING_CONDITION
        },
        include: {
            user: { select: { id: true, username: true, jellyfinUserId: true } },
            media: { select: { id: true, serverId: true, jellyfinMediaId: true, title: true, type: true, parentId: true, artist: true, resolution: true } },
            telemetryEvents: {
                select: { eventType: true, positionMs: true, createdAt: true, metadata: true },
                orderBy: { createdAt: 'desc' },
                take: MAX_TELEMETRY_EVENTS_PER_SESSION,
            },
        },
        orderBy: { startedAt: "desc" },
        skip: (safePage - 1) * ITEMS_PER_PAGE,
        take: ITEMS_PER_PAGE,
    });

    const activePairs = await prisma.activeStream.findMany({
        where: { userId: { in: userDbIdsToUse } },
        select: { userId: true, mediaId: true }
    });
    const activePairSet = new Set(activePairs.map((entry) => `${entry.userId}:${entry.mediaId}`));

    // Build parent chain for enriched media titles
    const parentPairs = new Set<string>();
    sessions.forEach((s) => {
        if (s.media?.parentId && s.media?.serverId) {
            parentPairs.add(JSON.stringify([s.media.serverId, s.media.parentId]));
        }
    });
    const parentTargets = Array.from(parentPairs).map((pair) => {
        const parsed = JSON.parse(pair) as [string, string];
        return { serverId: parsed[0], jellyfinMediaId: parsed[1] };
    });
    const parentMedia = parentTargets.length > 0
        ? await prisma.media.findMany({
            where: {
                OR: parentTargets.map((target) => ({
                    serverId: target.serverId,
                    jellyfinMediaId: target.jellyfinMediaId,
                })),
            },
            select: { serverId: true, jellyfinMediaId: true, title: true, type: true, parentId: true, artist: true },
        })
        : [];
    const grandparentPairs = new Set<string>();
    parentMedia.forEach((pm) => {
        if (pm.parentId) grandparentPairs.add(JSON.stringify([pm.serverId, pm.parentId]));
    });
    const grandparentTargets = Array.from(grandparentPairs).map((pair) => {
        const parsed = JSON.parse(pair) as [string, string];
        return { serverId: parsed[0], jellyfinMediaId: parsed[1] };
    });
    const grandparentMedia = grandparentTargets.length > 0
        ? await prisma.media.findMany({
            where: {
                OR: grandparentTargets.map((target) => ({
                    serverId: target.serverId,
                    jellyfinMediaId: target.jellyfinMediaId,
                })),
            },
            select: { serverId: true, jellyfinMediaId: true, title: true, type: true, artist: true },
        })
        : [];
    const parentMap = new Map(parentMedia.map(pm => [`${pm.serverId}:${pm.jellyfinMediaId}`, pm]));
    const grandparentMap = new Map(grandparentMedia.map(gp => [`${gp.serverId}:${gp.jellyfinMediaId}`, gp]));

    function getMediaSubtitle(media?: MediaCompact | null): string | null {
        if (!media?.parentId) return null;
        const parent = parentMap.get(`${media.serverId}:${media.parentId}`);
        if (!parent) return null;
        if (media.type === 'Episode') {
            const gp = parent.parentId ? grandparentMap.get(`${media.serverId}:${parent.parentId}`) : null;
            if (gp) return `${gp.title} — ${parent.title}`;
            return parent.title;
        }
        if (media.type === 'Season') return parent.title;
        if (media.type === 'Audio') {
            const artistName = media.artist || parent.artist || null;
            if (artistName) return `${artistName} — ${parent.title}`;
            return parent.title;
        }
        return parent.title;
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
        };
    });

    // Build pagination URL
    const buildPageUrl = (p: number) => {
        const params = new URLSearchParams();
        if (p > 1) params.set("historyPage", String(p));
        const qs = params.toString();
        return `/users/${userId}${qs ? `?${qs}` : ""}`;
    };

    return (
        <Card className="app-surface mt-6">
            <CardHeader>
                <CardTitle>{t('playbackHistory')}</CardTitle>
                <CardDescription>
                    {t('aggregatedDesc')} — {totalCount} session{totalCount > 1 ? 's' : ''}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border overflow-x-auto w-full">
                    <LogsListClient serverLogs={safeLogs} visibleColumns={['date', 'media', 'client', 'country', 'status', 'duration']} />
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
