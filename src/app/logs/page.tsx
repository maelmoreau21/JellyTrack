import { Fragment } from "react";
import { PlayCircle, Search, ArrowUpDown, ChevronDown, Users, ChevronLeft, ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LogFilters } from "./LogFilters";
import { FallbackImage } from "@/components/FallbackImage";
import prisma from "@/lib/prisma";
import { getTranslations, getLocale } from 'next-intl/server';

import Link from "next/link";

export const dynamic = "force-dynamic"; // Bypass statis rendering for real-time logs

const LOGS_PER_PAGE = 100;

// --- Watch Party Detection Algorithm ---
// Groups sessions of the same media started by different users within a 5-minute window
interface WatchPartyGroup {
    partyId: string;
    mediaTitle: string;
    mediaId: string;
    members: string[];
    logs: any[];
}

function detectWatchParties(logs: any[]): Map<string, string> {
    // Returns a map: logId -> partyId (only for logs that are part of a watch party)
    const WINDOW_MS = 5 * 60 * 1000; // 5 minutes

    // Group logs by mediaId
    const byMedia = new Map<string, any[]>();
    logs.forEach(log => {
        const mId = log.mediaId;
        if (!byMedia.has(mId)) byMedia.set(mId, []);
        byMedia.get(mId)!.push(log);
    });

    const partyMap = new Map<string, string>(); // logId -> partyId
    let partyCounter = 0;

    byMedia.forEach((mediaLogs, mediaId) => {
        // Sort by startedAt
        const sorted = [...mediaLogs].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());

        let clusterStart = 0;
        for (let i = 1; i <= sorted.length; i++) {
            // End of cluster if gap > WINDOW_MS or end of array
            if (i === sorted.length || sorted[i].startedAt.getTime() - sorted[i - 1].startedAt.getTime() > WINDOW_MS) {
                const cluster = sorted.slice(clusterStart, i);
                // Only count as watch party if 2+ DIFFERENT users
                const uniqueUsers = new Set(cluster.map((l: any) => l.userId));
                if (uniqueUsers.size >= 2) {
                    partyCounter++;
                    const pid = `party-${partyCounter}`;
                    cluster.forEach((l: any) => partyMap.set(l.id, pid));
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
    searchParams: Promise<{ query?: string, sort?: string, page?: string, type?: string }>
}) {
    const params = await searchParams;
    const tl = await getTranslations('logs');
    const tc = await getTranslations('common');
    const locale = await getLocale();
    const query = params.query?.toLowerCase() || "";
    const sort = params.sort || "date_desc";
    const currentPage = Math.max(1, parseInt(params.page || "1", 10) || 1);
    const typeFilter = params.type || "";

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
            user: true,
            media: true,
        },
        orderBy: orderBy,
        skip: (safePage - 1) * LOGS_PER_PAGE,
        take: LOGS_PER_PAGE,
    });

    // Build parent chain map for enriched media titles (Episode → Season → Series, Track → Album → Artist)
    const parentIds = new Set<string>();
    logs.forEach((log: any) => {
        if (log.media?.parentId) parentIds.add(log.media.parentId);
    });
    const parentMedia = parentIds.size > 0
        ? await prisma.media.findMany({ where: { jellyfinMediaId: { in: Array.from(parentIds) } }, select: { jellyfinMediaId: true, title: true, type: true, parentId: true, artist: true } })
        : [];
    // Also fetch grandparent IDs (Season → Series)
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
        if (!media?.parentId) return null;
        const parent = parentMap.get(media.parentId);
        if (!parent) return null;
        if (media.type === 'Episode') {
            // Episode → parent=Season → grandparent=Series
            const grandparent = parent.parentId ? grandparentMap.get(parent.parentId) : null;
            if (grandparent) return `${grandparent.title} — ${parent.title}`;
            return parent.title;
        }
        if (media.type === 'Season') {
            return parent.title; // Season → Series
        }
        if (media.type === 'Audio') {
            // Audio → parent=Album. Show "Artist — Album" if artist is available
            const artistName = media.artist || parent.artist || null;
            if (artistName) return `${artistName} — ${parent.title}`;
            return parent.title;
        }
        return parent.title;
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
        if (page > 1) p.set("page", String(page));
        const qs = p.toString();
        return `/logs${qs ? `?${qs}` : ""}`;
    };

    // Detect Watch Parties
    const watchPartyMap = detectWatchParties(logs);

    // Build party info for badges
    const partyInfo = new Map<string, { members: Set<string>, mediaTitle: string }>();
    logs.forEach((log: any) => {
        const pid = watchPartyMap.get(log.id);
        if (pid) {
            if (!partyInfo.has(pid)) partyInfo.set(pid, { members: new Set(), mediaTitle: log.media?.title || "" });
            partyInfo.get(pid)!.members.add(log.user?.username || "?");
        }
    });

    // Track which partyId has already shown the banner
    const shownPartyBanners = new Set<string>();

    return (
        <div className="flex-col md:flex">
            <div className="flex-1 space-y-6 p-8 pt-6 max-w-[1400px] mx-auto w-full">
                <div className="flex items-center justify-between space-y-2">
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight">{tl('title')}</h2>
                        <p className="text-muted-foreground mr-12 mt-2">
                            {tl('description')}
                            {totalCount > 0 && <span className="text-zinc-500"> — {totalCount} {tl('totalEntries')}</span>}
                        </p>
                    </div>
                </div>

                <Card className="bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle>{tl('searchFilters')}</CardTitle>
                        <CardDescription>{tl('searchFiltersDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <LogFilters initialQuery={query} initialSort={sort} />

                        {typeFilter && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-zinc-400">{tl('activeFilter')}</span>
                                <Badge variant="default" className="bg-purple-500/10 text-purple-400 hover:bg-purple-500/20">
                                    {typeFilter === 'Movie' ? tl('moviesFilter') : typeFilter === 'Episode' ? tl('seriesFilter') : typeFilter === 'Audio' ? tl('musicFilter') : typeFilter === 'AudioBook' ? tl('booksFilter') : typeFilter}
                                </Badge>
                                <Link href="/logs" className="text-xs text-zinc-500 hover:text-zinc-300 underline">
                                    {tl('removeFilter')}
                                </Link>
                            </div>
                        )}

                        <div className="border rounded-md overflow-x-auto w-full mt-6">
                            <Table className="min-w-[1000px] table-fixed">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[130px]">{tl('colDate')}</TableHead>
                                        <TableHead className="w-[120px]">{tl('colUser')}</TableHead>
                                        <TableHead className="w-[250px]">{tl('colMedia')}</TableHead>
                                        <TableHead className="w-[160px]">{tl('colClientIp')}</TableHead>
                                        <TableHead className="w-[130px]">{tl('colStatus')}</TableHead>
                                        <TableHead className="w-[100px]">{tl('colCodecs')}</TableHead>
                                        <TableHead className="w-[80px] text-right">{tl('colDuration')}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {logs.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center h-24 text-muted-foreground">
                                                {tl('noResults')}
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        logs.map((log: any) => {
                                            const isTranscode = log.playMethod?.toLowerCase().includes("transcode");
                                            const partyId = watchPartyMap.get(log.id);
                                            const isParty = !!partyId;
                                            const party = partyId ? partyInfo.get(partyId) : null;
                                            const isFirstOfParty = partyId && !shownPartyBanners.has(partyId);
                                            if (isFirstOfParty && partyId) shownPartyBanners.add(partyId);

                                            return (
                                                <Fragment key={log.id}>
                                                    {/* Watch Party Banner — first log of each party */}
                                                    {isFirstOfParty && party && (
                                                        <TableRow key={`party-banner-${partyId}`} className="border-none">
                                                            <TableCell colSpan={7} className="py-1.5 px-3">
                                                                <div className="flex items-center gap-2 bg-gradient-to-r from-violet-500/10 via-fuchsia-500/10 to-violet-500/10 border border-violet-500/20 rounded-lg px-4 py-2 animate-pulse-slow">
                                                                    <span className="text-lg" role="img" aria-label="Watch Party">🍿</span>
                                                                    <span className="font-bold text-sm bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
                                                                        Watch Party
                                                                    </span>
                                                                    <span className="text-xs text-zinc-400 ml-1">
                                                                        {party.members.size} {tc('viewers')} — <span className="font-medium text-zinc-300">{party.mediaTitle}</span>
                                                                    </span>
                                                                    <div className="ml-auto flex items-center gap-1">
                                                                        {Array.from(party.members).slice(0, 4).map((m, i) => (
                                                                            <span key={i} className="text-[10px] bg-violet-500/20 text-violet-300 px-1.5 py-0.5 rounded-full">{m}</span>
                                                                        ))}
                                                                        {party.members.size > 4 && (
                                                                            <span className="text-[10px] text-zinc-500">+{party.members.size - 4}</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    )}
                                                    <TableRow key={log.id} className={`even:bg-zinc-900/30 hover:bg-zinc-800/50 border-zinc-800/50 transition-colors ${isParty ? 'border-l-2 border-l-violet-500/40' : ''}`}>
                                                        {/* Date */}
                                                        <TableCell className="font-medium whitespace-nowrap">
                                                            <div className="flex items-center gap-1.5">
                                                                {isParty && (
                                                                    <Users className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                                                                )}
                                                                <span>
                                                                    {log.startedAt.toLocaleString(locale, {
                                                                        day: '2-digit', month: '2-digit', year: 'numeric',
                                                                        hour: '2-digit', minute: '2-digit'
                                                                    })}
                                                                </span>
                                                            </div>
                                                        </TableCell>

                                                        {/* Utilisateur */}
                                                        <TableCell className="font-semibold text-primary">
                                                            {log.user ? (
                                                                <Link href={`/users/${log.user.jellyfinUserId}`} className="hover:underline">{log.user.username}</Link>
                                                            ) : tc('deletedUser')}
                                                        </TableCell>

                                                        {/* Média */}
                                                        <TableCell className="overflow-hidden">
                                                            <div className="flex items-center gap-3 w-full overflow-hidden" title={log.media.title}>
                                                                <div className="relative w-12 aspect-[2/3] bg-muted rounded-md shrink-0 overflow-hidden ring-1 ring-white/10">
                                                                    <FallbackImage
                                                                        src={`/api/jellyfin/image?itemId=${log.media.jellyfinMediaId}&type=Primary${log.media.parentId ? `&fallbackId=${log.media.parentId}` : ''}`}
                                                                        alt={log.media.title}
                                                                        fill
                                                                        className="object-cover"
                                                                    />
                                                                </div>
                                                                <div className="flex flex-col min-w-0 flex-1">
                                                                    <Link href={`/media/${log.media.jellyfinMediaId}`} className="truncate font-medium text-zinc-100 hover:underline" title={log.media.title}>{log.media.title}</Link>
                                                                    {(() => {
                                                                        const subtitle = getMediaSubtitle(log.media);
                                                                        const typeInfo = getMediaTypeLabel(log.media.type);
                                                                        if (subtitle) {
                                                                            return (
                                                                                <span className="text-xs text-zinc-400 truncate flex items-center gap-1" title={subtitle}>
                                                                                    {typeInfo && <span>{typeInfo.icon}</span>}
                                                                                    {subtitle}
                                                                                </span>
                                                                            );
                                                                        }
                                                                        return typeInfo
                                                                            ? <span className="text-xs text-zinc-500">{typeInfo.icon} {typeInfo.label}</span>
                                                                            : <span className="text-xs text-zinc-500">{log.media.type}</span>;
                                                                    })()}
                                                                </div>
                                                            </div>
                                                        </TableCell>

                                                        {/* Client & IP */}
                                                        <TableCell>
                                                            <div className="flex flex-col">
                                                                <span className="text-sm font-semibold">{log.clientName || tc('unknown')}</span>
                                                                <span className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded-sm w-fit mt-0.5">
                                                                    {log.ipAddress || tc('local')}
                                                                </span>
                                                                {log.country && log.country !== "Unknown" && (
                                                                    <span className="text-xs text-muted-foreground mt-0.5">
                                                                        {log.city}, {log.country}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </TableCell>

                                                        {/* Statut (Méthode) */}
                                                        <TableCell>
                                                            <Badge variant={isTranscode ? "destructive" : "default"} className={`shadow-sm ${isTranscode ? 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20' : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'}`}>
                                                                {log.playMethod || "DirectPlay"}
                                                            </Badge>
                                                        </TableCell>

                                                        {/* Codecs */}
                                                        <TableCell>
                                                            {isTranscode && log.videoCodec ? (
                                                                <div className="flex flex-col text-xs text-muted-foreground font-mono">
                                                                    <span>V: {log.videoCodec}</span>
                                                                    {log.audioCodec && <span>A: {log.audioCodec}</span>}
                                                                </div>
                                                            ) : (
                                                                <span className="text-xs text-muted-foreground italic">{tc('source')}</span>
                                                            )}
                                                        </TableCell>

                                                        {/* Durée */}
                                                        <TableCell className="text-right whitespace-nowrap">
                                                            {log.durationWatched
                                                                ? `${Math.floor(log.durationWatched / 60)} min`
                                                                : (
                                                                    <span className="text-amber-500/80 animate-pulse text-xs uppercase tracking-wider font-semibold flex flex-row items-center justify-end gap-1"><span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>{tc('active')}</span>
                                                                )
                                                            }
                                                        </TableCell>
                                                    </TableRow>
                                                </Fragment>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-center gap-2 mt-6 pt-4 border-t border-zinc-800/50">
                                {safePage > 1 && (
                                    <Link href={buildPageUrl(safePage - 1)} className="flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium transition-colors border border-zinc-700 hover:bg-zinc-800">
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
                                                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                                        item === safePage
                                                            ? "bg-primary text-primary-foreground"
                                                            : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                                                    }`}
                                                >
                                                    {item}
                                                </Link>
                                            )
                                        )}
                                </div>
                                {safePage < totalPages && (
                                    <Link href={buildPageUrl(safePage + 1)} className="flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium transition-colors border border-zinc-700 hover:bg-zinc-800">
                                        {tc('next')} <ChevronRight className="w-4 h-4" />
                                    </Link>
                                )}
                                <span className="text-xs text-muted-foreground ml-4">
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
