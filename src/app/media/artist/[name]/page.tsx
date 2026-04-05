import prisma from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock3, Disc3, Headphones, Music, PlayCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FallbackImage } from "@/components/FallbackImage";
import { getJellyfinImageUrl } from "@/lib/jellyfin";
import { ZAPPING_CONDITION } from "@/lib/statsUtils";
import { requireAuth, isAuthError } from "@/lib/auth";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

interface ArtistPageProps {
    params: Promise<{ name: string }>;
}

type AlbumRow = {
    id: string;
    serverId: string;
    jellyfinMediaId: string;
    title: string;
    parentId: string | null;
    artist: string | null;
    libraryName: string | null;
};

type TrackRow = {
    id: string;
    serverId: string;
    jellyfinMediaId: string;
    title: string;
    parentId: string | null;
    durationMs: bigint | null;
};

const buildAlbumKey = (serverId: string, jellyfinMediaId: string) => `${serverId}:${jellyfinMediaId}`;

function safeDecodeParam(value: string) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

export default async function ArtistProfilePage({ params }: ArtistPageProps) {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;

    const { name } = await params;
    const artistName = safeDecodeParam(name).trim();
    if (!artistName) notFound();

    const tProfile = await getTranslations("mediaProfile");

    const scopedLinkedIds = auth.linkedJellyfinUserIds.length > 0
        ? auth.linkedJellyfinUserIds
        : (auth.jellyfinUserId ? [auth.jellyfinUserId] : []);

    const scopedDbUserIds = !auth.isAdmin && scopedLinkedIds.length > 0
        ? (await prisma.user.findMany({
            where: { jellyfinUserId: { in: scopedLinkedIds } },
            select: { id: true },
        })).map((user) => user.id)
        : [];

    const [albumsByArtist, tracksByArtist] = await Promise.all([
        prisma.media.findMany({
            where: {
                type: "MusicAlbum",
                artist: { equals: artistName, mode: "insensitive" },
            },
            orderBy: { title: "asc" },
            select: {
                id: true,
                serverId: true,
                jellyfinMediaId: true,
                title: true,
                parentId: true,
                artist: true,
                libraryName: true,
            },
        }),
        prisma.media.findMany({
            where: {
                type: { in: ["Audio", "Track"] },
                artist: { equals: artistName, mode: "insensitive" },
            },
            orderBy: { title: "asc" },
            select: {
                id: true,
                serverId: true,
                jellyfinMediaId: true,
                title: true,
                parentId: true,
                durationMs: true,
            },
        }),
    ]);

    const albumMap = new Map<string, AlbumRow>();
    albumsByArtist.forEach((album) => {
        albumMap.set(buildAlbumKey(album.serverId, album.jellyfinMediaId), album);
    });

    const albumRefsFromTracks = new Map<string, { serverId: string; jellyfinMediaId: string }>();
    tracksByArtist.forEach((track) => {
        if (!track.parentId) return;
        const key = buildAlbumKey(track.serverId, track.parentId);
        albumRefsFromTracks.set(key, { serverId: track.serverId, jellyfinMediaId: track.parentId });
    });

    const missingAlbumRefs = Array.from(albumRefsFromTracks.values()).filter((ref) => {
        return !albumMap.has(buildAlbumKey(ref.serverId, ref.jellyfinMediaId));
    });

    if (missingAlbumRefs.length > 0) {
        const linkedAlbums = await prisma.media.findMany({
            where: {
                type: "MusicAlbum",
                OR: missingAlbumRefs.map((ref) => ({
                    serverId: ref.serverId,
                    jellyfinMediaId: ref.jellyfinMediaId,
                })),
            },
            orderBy: { title: "asc" },
            select: {
                id: true,
                serverId: true,
                jellyfinMediaId: true,
                title: true,
                parentId: true,
                artist: true,
                libraryName: true,
            },
        });

        linkedAlbums.forEach((album) => {
            albumMap.set(buildAlbumKey(album.serverId, album.jellyfinMediaId), album);
        });
    }

    const allAlbums = Array.from(albumMap.values());

    let tracksByAlbum: TrackRow[] = [];
    if (allAlbums.length > 0) {
        tracksByAlbum = await prisma.media.findMany({
            where: {
                type: { in: ["Audio", "Track"] },
                OR: allAlbums.map((album) => ({
                    serverId: album.serverId,
                    parentId: album.jellyfinMediaId,
                })),
            },
            orderBy: { title: "asc" },
            select: {
                id: true,
                serverId: true,
                jellyfinMediaId: true,
                title: true,
                parentId: true,
                durationMs: true,
            },
        });
    }

    const trackMap = new Map<string, TrackRow>();
    [...tracksByArtist, ...tracksByAlbum].forEach((track) => {
        trackMap.set(track.id, track);
    });
    const allTracks = Array.from(trackMap.values());

    if (allAlbums.length === 0 && allTracks.length === 0) {
        notFound();
    }

    const playbackWhere: {
        mediaId: { in: string[] };
        userId?: { in: string[] };
        endedAt?: { not: null };
        durationWatched?: { gt: number };
    } = {
        mediaId: { in: allTracks.map((track) => track.id) },
        ...ZAPPING_CONDITION,
    };

    if (!auth.isAdmin) {
        playbackWhere.userId = { in: scopedDbUserIds.length > 0 ? scopedDbUserIds : ["__none__"] };
    }

    const trackPlaybackAgg = allTracks.length > 0
        ? await prisma.playbackHistory.groupBy({
            by: ["mediaId"],
            where: playbackWhere,
            _count: { _all: true },
            _sum: { durationWatched: true },
        })
        : [];

    const trackStats = new Map<string, { plays: number; durationSeconds: number }>();
    trackPlaybackAgg.forEach((row) => {
        trackStats.set(row.mediaId, {
            plays: row._count._all ?? 0,
            durationSeconds: row._sum.durationWatched ?? 0,
        });
    });

    const albumStats = new Map<string, { plays: number; durationSeconds: number; tracks: number }>();
    allAlbums.forEach((album) => {
        albumStats.set(buildAlbumKey(album.serverId, album.jellyfinMediaId), {
            plays: 0,
            durationSeconds: 0,
            tracks: 0,
        });
    });

    allTracks.forEach((track) => {
        if (!track.parentId) return;
        const albumKey = buildAlbumKey(track.serverId, track.parentId);
        const stats = albumStats.get(albumKey);
        if (!stats) return;

        const trackStat = trackStats.get(track.id);
        stats.tracks += 1;
        stats.plays += trackStat?.plays ?? 0;
        stats.durationSeconds += trackStat?.durationSeconds ?? 0;
    });

    const totalPlays = allTracks.reduce((acc, track) => acc + (trackStats.get(track.id)?.plays ?? 0), 0);
    const totalSeconds = allTracks.reduce((acc, track) => acc + (trackStats.get(track.id)?.durationSeconds ?? 0), 0);
    const totalHours = parseFloat((totalSeconds / 3600).toFixed(1));

    const albumsWithStats = allAlbums
        .map((album) => {
            const key = buildAlbumKey(album.serverId, album.jellyfinMediaId);
            const stats = albumStats.get(key) || { plays: 0, durationSeconds: 0, tracks: 0 };
            return {
                ...album,
                trackCount: stats.tracks,
                plays: stats.plays,
                hours: parseFloat((stats.durationSeconds / 3600).toFixed(1)),
            };
        })
        .sort((a, b) => (b.plays - a.plays) || a.title.localeCompare(b.title));

    const trackRows = allTracks
        .map((track) => {
            const album = track.parentId
                ? albumMap.get(buildAlbumKey(track.serverId, track.parentId))
                : null;
            const stat = trackStats.get(track.id) || { plays: 0, durationSeconds: 0 };
            return {
                ...track,
                albumTitle: album?.title || null,
                albumJellyfinId: album?.jellyfinMediaId || null,
                plays: stat.plays,
                minutes: Math.max(0, Math.round(stat.durationSeconds / 60)),
            };
        })
        .sort((a, b) => (b.plays - a.plays) || a.title.localeCompare(b.title));

    const heroAlbum = albumsWithStats[0] || null;

    return (
        <div className="flex-col md:flex">
            <div className="flex-1 space-y-4 md:space-y-6 p-4 md:p-8 pt-4 md:pt-6 max-w-[1400px] mx-auto w-full">
                <nav className="flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400 flex-wrap">
                    <Link href="/media" className="flex items-center gap-1 hover:text-zinc-900 dark:hover:text-white transition-colors">
                        <ArrowLeft className="w-4 h-4" /> {tProfile('library')}
                    </Link>
                    <span className="text-zinc-400">/</span>
                    <span className="text-zinc-900 dark:text-white font-medium truncate max-w-xs">{artistName}</span>
                </nav>

                <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50">
                    <CardContent className="p-4 md:p-6">
                        <div className="flex flex-col md:flex-row gap-6">
                            <div className="relative w-40 h-40 rounded-xl overflow-hidden ring-1 ring-zinc-300/40 dark:ring-white/10 bg-zinc-200 dark:bg-zinc-900 shrink-0">
                                {heroAlbum ? (
                                    <FallbackImage
                                        src={getJellyfinImageUrl(heroAlbum.jellyfinMediaId, "Primary", heroAlbum.parentId || undefined)}
                                        alt={artistName}
                                        fill
                                        className="object-cover"
                                    />
                                ) : (
                                    <div className="h-full w-full flex items-center justify-center text-zinc-500">
                                        <Headphones className="w-10 h-10" />
                                    </div>
                                )}
                            </div>

                            <div className="flex-1">
                                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-zinc-500">
                                    <Headphones className="w-3.5 h-3.5" /> Artiste
                                </div>
                                <h1 className="text-3xl font-bold tracking-tight mt-1">{artistName}</h1>
                                <p className="text-sm text-zinc-500 mt-2">
                                    {albumsWithStats.length} album{albumsWithStats.length > 1 ? "s" : ""} • {allTracks.length} titre{allTracks.length > 1 ? "s" : ""}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                    <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Albums</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{albumsWithStats.length}</div>
                        </CardContent>
                    </Card>

                    <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Titres</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{allTracks.length}</div>
                        </CardContent>
                    </Card>

                    <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Lectures</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{totalPlays}</div>
                        </CardContent>
                    </Card>

                    <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Temps d'écoute</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{totalHours}h</div>
                        </CardContent>
                    </Card>
                </div>

                <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Disc3 className="w-5 h-5 text-purple-400" /> Albums</CardTitle>
                        <CardDescription>Retour rapide vers les albums de cet artiste.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {albumsWithStats.length === 0 ? (
                            <div className="text-sm text-zinc-500 italic">Aucun album detecte pour cet artiste.</div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                {albumsWithStats.map((album) => (
                                    <Link key={buildAlbumKey(album.serverId, album.jellyfinMediaId)} href={`/media/${album.jellyfinMediaId}`} className="group flex flex-col gap-2">
                                        <div className="relative aspect-square rounded-md overflow-hidden ring-1 ring-zinc-300/30 dark:ring-white/10 bg-zinc-200 dark:bg-zinc-900">
                                            <FallbackImage
                                                src={getJellyfinImageUrl(album.jellyfinMediaId, "Primary", album.parentId || undefined)}
                                                alt={album.title}
                                                fill
                                                className="object-cover transition-transform duration-300 group-hover:scale-105"
                                            />
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold truncate">{album.title}</p>
                                            <div className="text-xs text-zinc-500 flex items-center gap-2 mt-1">
                                                <span className="inline-flex items-center gap-1"><Music className="w-3 h-3" />{album.trackCount}</span>
                                                <span className="inline-flex items-center gap-1"><PlayCircle className="w-3 h-3" />{album.plays}</span>
                                                <span className="inline-flex items-center gap-1"><Clock3 className="w-3 h-3" />{album.hours}h</span>
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Music className="w-5 h-5 text-cyan-400" /> Titres</CardTitle>
                        <CardDescription>Top titres lies a cet artiste.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {trackRows.length === 0 ? (
                            <div className="text-sm text-zinc-500 italic">Aucun titre disponible.</div>
                        ) : (
                            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                                {trackRows.slice(0, 120).map((track) => (
                                    <div key={track.id} className="app-surface-soft rounded-lg border border-border p-3 flex items-center justify-between gap-4">
                                        <div className="min-w-0">
                                            <Link href={`/media/${track.jellyfinMediaId}`} className="text-sm font-semibold text-primary hover:underline truncate block">
                                                {track.title}
                                            </Link>
                                            <div className="mt-1 text-xs text-zinc-500 flex items-center gap-2">
                                                {track.albumJellyfinId ? (
                                                    <Link href={`/media/${track.albumJellyfinId}`} className="hover:text-primary transition-colors truncate">
                                                        {track.albumTitle || "Album"}
                                                    </Link>
                                                ) : (
                                                    <span className="truncate">{track.albumTitle || "Album inconnu"}</span>
                                                )}
                                                {track.durationMs && (
                                                    <Badge variant="secondary" className="text-[10px]">{Math.max(1, Math.round(Number(track.durationMs) / 1000 / 60))} min</Badge>
                                                )}
                                            </div>
                                        </div>

                                        <div className="text-xs text-zinc-500 shrink-0 text-right">
                                            <div className="font-semibold text-zinc-300">{track.plays} vues</div>
                                            <div>{track.minutes} min lues</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
