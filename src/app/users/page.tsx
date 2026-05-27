import prisma from "@/lib/prisma";
import Link from "next/link";
import { SearchBar } from "@/components/SearchBar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, ChevronRight, Clock, Monitor } from "lucide-react";
import { getTranslations, getLocale } from 'next-intl/server';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 25;
const ZAPPING_MIN_SECONDS = 60;

function parsePage(rawPage: string | undefined): number {
    const parsed = Number.parseInt(rawPage || "1", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parsePageSize(rawPageSize: string | undefined): (typeof PAGE_SIZE_OPTIONS)[number] {
    const parsed = Number.parseInt(rawPageSize || `${DEFAULT_PAGE_SIZE}`, 10);
    return PAGE_SIZE_OPTIONS.includes(parsed as (typeof PAGE_SIZE_OPTIONS)[number])
        ? (parsed as (typeof PAGE_SIZE_OPTIONS)[number])
        : DEFAULT_PAGE_SIZE;
}

export default async function UsersPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string; pageSize?: string }>;
}) {
    const sessionAuth = await getServerSession(authOptions);
    if (!sessionAuth?.user?.isAdmin) {
        redirect("/login");
    }

    const params = await searchParams;
    const requestedPage = parsePage(params.page);
    const pageSize = parsePageSize(params.pageSize);

    const t = await getTranslations('users');
    const tc = await getTranslations('common');
    const locale = await getLocale();

    const [users, usageRows] = await Promise.all([
        prisma.user.findMany({
            select: {
                id: true,
                jellyfinUserId: true,
                username: true,
                lastActive: true,
            },
        }),
        prisma.playbackHistory.groupBy({
            by: ["userId"],
            where: {
                userId: { not: null },
                durationWatched: { gte: ZAPPING_MIN_SECONDS },
            },
            _sum: { durationWatched: true },
            _count: { _all: true },
        }),
    ]);

    const usageByUserId = new Map<string, { totalSeconds: number; sessionsCount: number }>();
    for (const row of usageRows) {
        if (!row.userId) continue;
        usageByUserId.set(row.userId, {
            totalSeconds: row._sum.durationWatched ?? 0,
            sessionsCount: row._count._all ?? 0,
        });
    }

    const rankedUsers = users
        .map((user) => {
            const usage = usageByUserId.get(user.id);
            return {
                ...user,
                totalSeconds: usage?.totalSeconds ?? 0,
                sessionsCount: usage?.sessionsCount ?? 0,
            };
        })
        .sort((a, b) => {
            if (b.totalSeconds !== a.totalSeconds) {
                return b.totalSeconds - a.totalSeconds;
            }

            if (b.sessionsCount !== a.sessionsCount) {
                return b.sessionsCount - a.sessionsCount;
            }

            const safeA = a.username || "";
            const safeB = b.username || "";
            const byName = safeA.localeCompare(safeB, locale, { sensitivity: "base" });
            if (byName !== 0) {
                return byName;
            }

            return a.jellyfinUserId.localeCompare(b.jellyfinUserId, locale, { sensitivity: "base" });
        });

    const totalUsers = rankedUsers.length;
    const totalPages = Math.max(1, Math.ceil(totalUsers / pageSize));
    const safePage = Math.min(requestedPage, totalPages);
    const startIndex = (safePage - 1) * pageSize;
    const pagedUsers = rankedUsers.slice(startIndex, startIndex + pageSize);
    const pagedUserIds = pagedUsers.map((u) => u.id);

    const clientRows = pagedUserIds.length
        ? await prisma.playbackHistory.groupBy({
            by: ["userId", "clientName"],
            where: {
                userId: { in: pagedUserIds },
                durationWatched: { gte: ZAPPING_MIN_SECONDS },
                clientName: { not: null },
            },
            _count: { _all: true },
        })
        : [];

    const favoriteClientByUserId = new Map<string, string>();
    const favoriteClientCountByUserId = new Map<string, number>();
    for (const row of clientRows) {
        if (!row.userId || !row.clientName) continue;
        const currentBest = favoriteClientCountByUserId.get(row.userId) ?? 0;
        const nextCount = row._count._all ?? 0;
        const currentName = favoriteClientByUserId.get(row.userId);

        if (
            nextCount > currentBest ||
            (nextCount === currentBest && currentName && row.clientName.localeCompare(currentName, locale, { sensitivity: "base" }) < 0)
        ) {
            favoriteClientCountByUserId.set(row.userId, nextCount);
            favoriteClientByUserId.set(row.userId, row.clientName);
        }
    }

    const userStats = pagedUsers.map((user, index) => ({
        id: user.id,
        rank: startIndex + index + 1,
        jellyfinUserId: user.jellyfinUserId,
        username: user.username || tc('deletedUser'),
        totalHours: parseFloat((user.totalSeconds / 3600).toFixed(1)),
        sessionsCount: user.sessionsCount,
        lastActive: user.lastActive,
        favoriteClient: favoriteClientByUserId.get(user.id) || tc('unknown'),
    }));

    const buildPageUrl = (page: number, nextPageSize: number = pageSize) => {
        const qs = new URLSearchParams();
        if (page > 1) qs.set("page", String(page));
        if (nextPageSize !== DEFAULT_PAGE_SIZE) qs.set("pageSize", String(nextPageSize));
        const query = qs.toString();
        return `/users${query ? `?${query}` : ""}`;
    };

    return (
        <div className="flex-col md:flex">
            <div className="flex-1 space-y-4 md:space-y-6 p-4 md:p-8 pt-4 md:pt-6 max-w-[1200px] mx-auto w-full">
                <div className="flex items-center justify-between space-y-2 mb-6">
                    <div>
                        <h2 className="text-2xl md:text-3xl font-bold tracking-tight">{t('title')}</h2>
                        <p className="text-muted-foreground text-sm mt-1">{t('description')}</p>
                    </div>
                    <div className="w-full max-w-xs">
                        <SearchBar />
                    </div>
                </div>

                <Card className="app-surface">
                    <CardHeader>
                        <CardTitle>{t('leaderboard')}</CardTitle>
                        <CardDescription className="flex flex-wrap items-center justify-between gap-3">
                            {t('leaderboardDesc')}
                            <span className="flex items-center gap-1.5 text-xs">
                                {PAGE_SIZE_OPTIONS.map((option) => (
                                    <Link
                                        key={option}
                                        href={buildPageUrl(1, option)}
                                        className={`rounded border px-2 py-1 transition-colors ${option === pageSize
                                            ? "border-primary bg-primary/10 text-primary"
                                            : "border-border text-muted-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800/40"
                                            }`}
                                    >
                                        {option}
                                    </Link>
                                ))}
                            </span>
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {userStats.length === 0 ? (
                            <div className="text-center py-10 text-muted-foreground">
                                {t('noUsers')}
                            </div>
                        ) : (
                            <div className="app-surface-soft rounded-md border border-zinc-200/50 dark:border-zinc-700/50 overflow-x-auto">
                                <Table className="min-w-[700px]">
                                    <TableHeader className="app-field">
                                        <TableRow className="border-border">
                                            <TableHead className="w-[80px]">{t('colRank')}</TableHead>
                                            <TableHead>{t('colUser')}</TableHead>
                                            <TableHead>{t('colTotalTime')}</TableHead>
                                            <TableHead>{t('colFavPlatform')}</TableHead>
                                            <TableHead>{t('colLastActive')}</TableHead>
                                            <TableHead className="text-right">{t('colSessions')}</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {userStats.map((stat) => {
                                            const rankColor = 
                                                stat.rank === 1 ? "text-yellow-500 font-bold text-lg" :
                                                stat.rank === 2 ? "text-slate-300 font-bold" :
                                                stat.rank === 3 ? "text-amber-700 font-bold" : 
                                                "text-muted-foreground";

                                            return (
                                                <TableRow key={stat.id} className="border-zinc-200/50 dark:border-zinc-800/40 hover:bg-zinc-100/50 dark:hover:bg-zinc-900/40 transition-colors">
                                                    <TableCell className={rankColor}>#{stat.rank}</TableCell>
                                                    <TableCell className="font-medium">
                                                        <Link 
                                                            href={`/users/${stat.jellyfinUserId}`} 
                                                            className="hover:text-primary transition-colors flex items-center gap-2"
                                                        >
                                                            {stat.username}
                                                        </Link>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-1.5 font-semibold text-emerald-400">
                                                            <Clock className="w-4 h-4" />
                                                            {stat.totalHours} h
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground">
                                                        <div className="flex items-center gap-1.5">
                                                            <Monitor className="w-4 h-4 opacity-70" />
                                                            {stat.favoriteClient}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground text-sm">
                                                        {stat.lastActive 
                                                            ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(stat.lastActive)
                                                            : t('never')
                                                        }
                                                    </TableCell>
                                                    <TableCell className="text-right font-medium text-muted-foreground">
                                                        {stat.sessionsCount}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        )}

                        {totalPages > 1 && (
                            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 border-t border-zinc-200/50 pt-4 text-sm dark:border-zinc-700/50">
                                {safePage > 1 && (
                                    <Link
                                        href={buildPageUrl(safePage - 1)}
                                        className="app-field flex items-center gap-1 rounded-md px-3 py-1.5 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                        {tc('previous')}
                                    </Link>
                                )}

                                <span className="px-2 text-xs text-muted-foreground">
                                    {tc('page')} {safePage} / {totalPages} ({totalUsers})
                                </span>

                                {safePage < totalPages && (
                                    <Link
                                        href={buildPageUrl(safePage + 1)}
                                        className="app-field flex items-center gap-1 rounded-md px-3 py-1.5 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
                                    >
                                        {tc('next')}
                                        <ChevronRight className="h-4 w-4" />
                                    </Link>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
