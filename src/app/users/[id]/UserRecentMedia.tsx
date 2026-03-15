import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import prisma from "@/lib/prisma";
import { getJellyfinImageUrl } from "@/lib/jellyfin";
import { FallbackImage } from "@/components/FallbackImage";
import { getTranslations, getLocale } from 'next-intl/server';
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

const ITEMS_PER_PAGE = 50;

export default async function UserRecentMedia({ userId, page = 1 }: { userId: string; page?: number }) {
    const t = await getTranslations('userProfile');
    const locale = await getLocale();

    const user = await prisma.user.findUnique({
        where: { jellyfinUserId: userId },
        select: { id: true },
    });

    if (!user) {
        return (
            <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50 backdrop-blur-sm mt-6">
                <CardHeader>
                    <CardTitle>{t('playbackHistory')}</CardTitle>
                    <CardDescription>{t('noHistory')}</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    // Count total sessions for pagination
    const totalCount = await prisma.playbackHistory.count({
        where: { userId: user.id },
    });

    if (totalCount === 0) {
        return (
            <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50 backdrop-blur-sm mt-6">
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
        where: { userId: user.id },
        include: { media: true },
        orderBy: { startedAt: "desc" },
        skip: (safePage - 1) * ITEMS_PER_PAGE,
        take: ITEMS_PER_PAGE,
    });

    // Build parent chain for enriched media titles (Episode â†’ Series — Season, Audio â†’ Artist — Album)
    const parentIds = new Set<string>();
    sessions.forEach((s: any) => {
        if (s.media?.parentId) parentIds.add(s.media.parentId);
    });
    const parentMedia = parentIds.size > 0
        ? await prisma.media.findMany({
            where: { jellyfinMediaId: { in: Array.from(parentIds) } },
            select: { jellyfinMediaId: true, title: true, type: true, parentId: true, artist: true },
        })
        : [];
    const grandparentIds = new Set<string>();
    parentMedia.forEach(pm => { if (pm.parentId) grandparentIds.add(pm.parentId); });
    const grandparentMedia = grandparentIds.size > 0
        ? await prisma.media.findMany({
            where: { jellyfinMediaId: { in: Array.from(grandparentIds) } },
            select: { jellyfinMediaId: true, title: true, type: true, artist: true },
        })
        : [];
    const parentMap = new Map(parentMedia.map(pm => [pm.jellyfinMediaId, pm]));
    const grandparentMap = new Map(grandparentMedia.map(gp => [gp.jellyfinMediaId, gp]));

    function getMediaSubtitle(media: any): string | null {
        if (!media?.parentId) return null;
        const parent = parentMap.get(media.parentId);
        if (!parent) return null;
        if (media.type === 'Episode') {
            const gp = parent.parentId ? grandparentMap.get(parent.parentId) : null;
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

    // Build pagination URL
    const buildPageUrl = (p: number) => {
        const params = new URLSearchParams();
        if (p > 1) params.set("historyPage", String(p));
        const qs = params.toString();
        return `/users/${userId}${qs ? `?${qs}` : ""}`;
    };

    return (
        <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50 backdrop-blur-sm mt-6">
            <CardHeader>
                <CardTitle>{t('playbackHistory')}</CardTitle>
                <CardDescription>
                    {t('aggregatedDesc')} — {totalCount} session{totalCount > 1 ? 's' : ''}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border overflow-x-auto">
                    <Table className="min-w-[560px] md:min-w-[800px]">
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[280px]">{t('colMedia')}</TableHead>
                                <TableHead className="w-[140px]">{t('colDate')}</TableHead>
                                <TableHead className="w-[80px] hidden md:table-cell">{t('colDuration')}</TableHead>
                                <TableHead className="w-[120px] hidden lg:table-cell">{t('colClient')}</TableHead>
                                <TableHead className="w-[120px] hidden lg:table-cell">{t('colDevice')}</TableHead>
                                <TableHead className="w-[100px] hidden md:table-cell">{t('colMethod')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sessions.map((session: any) => {
                                const minutes = Math.floor(session.durationWatched / 60);
                                const dateFormat = new Intl.DateTimeFormat(locale, {
                                    dateStyle: "medium",
                                    timeStyle: "short",
                                }).format(new Date(session.startedAt));
                                const isTranscode = session.playMethod?.toLowerCase().includes("transcode");
                                const subtitle = getMediaSubtitle(session.media);

                                let progress = 0;
                                if (session.media?.durationMs) {
                                    const mediaSec = Number(session.media.durationMs) / 1000;
                                    if (mediaSec > 0) {
                                        progress = Math.min(100, Math.round((session.durationWatched / mediaSec) * 100));
                                    }
                                }

                                return (
                                    <TableRow key={session.id} className="even:bg-zinc-100/50 dark:even:bg-zinc-900/30 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 border-zinc-200/50 dark:border-zinc-800/50 transition-colors">
                                        <TableCell className="font-medium">
                                            <Link href={`/media/${session.media.jellyfinMediaId}`} className="flex items-center gap-3 group">
                                                <div className={`relative w-10 ${['Audio', 'MusicAlbum'].includes(session.media.type) ? 'aspect-square' : 'aspect-[2/3]'} bg-muted rounded shrink-0 overflow-hidden ring-1 ring-white/10`}>
                                                    <FallbackImage
                                                        src={getJellyfinImageUrl(session.media.jellyfinMediaId, 'Primary', session.media.parentId || undefined)}
                                                        alt={session.media.title}
                                                        fill
                                                        className="object-cover"
                                                    />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="truncate group-hover:underline text-zinc-800 dark:text-zinc-100">{session.media.title}</div>
                                                    {subtitle ? (
                                                        <div className="text-xs text-zinc-400 truncate" title={subtitle}>
                                                            {session.media.type === 'Episode' ? '📺' : session.media.type === 'Audio' ? '🎵' : ''} {subtitle}
                                                        </div>
                                                    ) : (
                                                        <div className="text-xs text-zinc-500">{session.media.type}</div>
                                                    )}
                                                    {progress > 0 && (
                                                        <div className="w-full max-w-[120px] h-1 bg-zinc-800 rounded-full mt-1 overflow-hidden">
                                                            <div className={`h-full rounded-full ${progress >= 80 ? 'bg-emerald-500' : progress >= 40 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${progress}%` }} />
                                                        </div>
                                                    )}
                                                    <div className="md:hidden mt-1 flex items-center gap-1.5 text-[10px] text-zinc-400 truncate">
                                                        <span className={`px-1.5 py-0.5 rounded ${isTranscode ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                                                            {session.playMethod || "DirectPlay"}
                                                        </span>
                                                        <span className="truncate">{session.clientName || "N/A"}</span>
                                                        <span className="text-zinc-500">·</span>
                                                        <span>{minutes} min</span>
                                                    </div>
                                                </div>
                                            </Link>
                                        </TableCell>
                                        <TableCell className="text-sm whitespace-nowrap">
                                            {dateFormat}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap hidden md:table-cell">{minutes} min</TableCell>
                                        <TableCell className="text-sm hidden lg:table-cell">
                                            <span className="truncate max-w-[120px] inline-block">{session.clientName || "N/A"}</span>
                                        </TableCell>
                                        <TableCell className="text-sm hidden lg:table-cell">
                                            <span className="truncate max-w-[120px] inline-block">{session.deviceName || "N/A"}</span>
                                        </TableCell>
                                        <TableCell className="hidden md:table-cell">
                                            <Badge variant={isTranscode ? "destructive" : "default"} className={`shadow-sm ${isTranscode ? 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20' : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'}`}>
                                                {session.playMethod || "DirectPlay"}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-4 pt-3 border-t border-zinc-200 dark:border-zinc-800/50">
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
                                        <span key={`ellipsis-${idx}`} className="px-2 text-zinc-500">â€¦</span>
                                    ) : (
                                        <Link
                                            key={item}
                                            href={buildPageUrl(item as number)}
                                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                                item === safePage
                                                    ? "bg-primary text-primary-foreground"
                                                    : "text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-zinc-800 dark:text-zinc-100"
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
