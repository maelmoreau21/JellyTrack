import prisma from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTranslations } from "next-intl/server";
import { ZAPPING_CONDITION } from "@/lib/statsUtils";
import { Film, Tv, Award, Play, Clock, Library, Video, Users, Building } from "lucide-react";
import Link from "next/link";
import { ServerFilter } from "@/components/dashboard/ServerFilter";
import { buildSelectableServerOptions } from "@/lib/selectableServers";
import { requireAdmin, isAuthError } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { GLOBAL_SERVER_SCOPE_COOKIE } from "@/lib/serverScope";
import { resolveSelectedServerIdsAsync } from "@/lib/serverScope.server";

export const dynamic = "force-dynamic";

export default async function PopularMediaPage({ searchParams: searchParamsPromise }: { searchParams?: Promise<{ servers?: string }> }) {
    const auth = await requireAdmin();
    if (isAuthError(auth)) redirect("/login");

    const searchParams = (await searchParamsPromise) || {};
    const t = await getTranslations("media");
    const td = await getTranslations("dashboard");
    const tc = await getTranslations("common");

    const serverRows = await prisma.server.findMany({
        select: { id: true, name: true, isActive: true, url: true, jellyfinServerId: true },
        orderBy: { name: "asc" },
    });

    const jellytrackMode = (process.env.JELLYTRACK_MODE || "single").toLowerCase();
    const selectableServerOptions = buildSelectableServerOptions(serverRows);
    const multiServerEnabled = jellytrackMode === "multi" && selectableServerOptions.length > 1;
    const cookieStore = await cookies();
    const persistedScopeCookie = cookieStore.get(GLOBAL_SERVER_SCOPE_COOKIE)?.value ?? null;
    const { selectedServerIds } = await resolveSelectedServerIdsAsync({
        multiServerEnabled,
        selectableServerIds: selectableServerOptions.map((server) => server.id),
        requestedServersParam: searchParams.servers,
        cookieServersParam: persistedScopeCookie,
    });
    const selectedServerScope = selectedServerIds.length > 0 ? { in: selectedServerIds } : undefined;

    // Build scoped playback where clause
    const playbackWhere: Record<string, unknown> = {
        ...ZAPPING_CONDITION,
    };
    if (selectedServerScope) {
        playbackWhere.serverId = selectedServerScope;
    }

    // 1. Top 5 Movies
    const moviePlaybackAgg = await prisma.playbackHistory.groupBy({
        by: ["mediaId"],
        where: {
            ...playbackWhere,
            media: { type: "Movie" },
        },
        _count: { _all: true },
        _sum: { durationWatched: true },
        orderBy: { _count: { mediaId: "desc" } },
        take: 5,
    });

    const movieDbIds = moviePlaybackAgg.map((r) => r.mediaId);
    const movieDetails = await prisma.media.findMany({
        where: { id: { in: movieDbIds } },
        select: { id: true, title: true, jellyfinMediaId: true },
    });
    const movieDetailMap = new Map(movieDetails.map((m) => [m.id, m]));

    const topMovies = moviePlaybackAgg.map((row) => {
        const detail = movieDetailMap.get(row.mediaId);
        return {
            id: detail?.jellyfinMediaId || row.mediaId,
            title: detail?.title || "Film Inconnu",
            plays: row._count._all ?? 0,
            hours: parseFloat(((row._sum.durationWatched ?? 0) / 3600).toFixed(1)),
        };
    });

    // 2. Top 5 Series (aggregated from Episode playbacks)
    const episodePlaybacks = await prisma.playbackHistory.findMany({
        where: {
            ...playbackWhere,
            media: { type: "Episode" },
        },
        select: {
            mediaId: true,
            durationWatched: true,
            media: {
                select: {
                    parentId: true, // Season ID
                },
            },
        },
    });

    const seasonJellyfinIds = Array.from(new Set(episodePlaybacks.map((ep) => ep.media?.parentId).filter(Boolean))) as string[];
    const seasons = await prisma.media.findMany({
        where: { jellyfinMediaId: { in: seasonJellyfinIds }, type: "Season" },
        select: { jellyfinMediaId: true, parentId: true },
    });
    const seasonToSeriesMap = new Map(seasons.map((s) => [s.jellyfinMediaId, s.parentId]));

    const seriesJellyfinIds = Array.from(new Set(seasons.map((s) => s.parentId).filter(Boolean))) as string[];
    const series = await prisma.media.findMany({
        where: { jellyfinMediaId: { in: seriesJellyfinIds }, type: "Series" },
        select: { jellyfinMediaId: true, title: true, directors: true, actors: true, studios: true },
    });
    const seriesMap = new Map(series.map((s) => [s.jellyfinMediaId, s.title]));

    const seriesStats = new Map<string, { title: string; plays: number; duration: number }>();
    episodePlaybacks.forEach((ep) => {
        const seasonId = ep.media?.parentId;
        if (!seasonId) return;
        const seriesId = seasonToSeriesMap.get(seasonId);
        if (!seriesId) return;
        const seriesTitle = seriesMap.get(seriesId) || "Série Inconnue";

        const existing = seriesStats.get(seriesId) || { title: seriesTitle, plays: 0, duration: 0 };
        existing.plays += 1;
        existing.duration += ep.durationWatched;
        seriesStats.set(seriesId, existing);
    });

    const topSeries = Array.from(seriesStats.entries())
        .map(([id, stats]) => ({
            id,
            title: stats.title,
            plays: stats.plays,
            hours: parseFloat((stats.duration / 3600).toFixed(1)),
        }))
        .sort((a, b) => b.plays - a.plays)
        .slice(0, 5);

    // 3. Top 5 Music (Albums/Tracks)
    const musicPlaybackAgg = await prisma.playbackHistory.groupBy({
        by: ["mediaId"],
        where: {
            ...playbackWhere,
            media: { type: { in: ["Audio", "Track"] } },
        },
        _count: { _all: true },
        _sum: { durationWatched: true },
        orderBy: { _count: { mediaId: "desc" } },
        take: 5,
    });

    const musicDbIds = musicPlaybackAgg.map((r) => r.mediaId);
    const musicDetails = await prisma.media.findMany({
        where: { id: { in: musicDbIds } },
        select: { id: true, title: true, artist: true, jellyfinMediaId: true },
    });
    const musicDetailMap = new Map(musicDetails.map((m) => [m.id, m]));

    const topMusic = musicPlaybackAgg.map((row) => {
        const detail = musicDetailMap.get(row.mediaId);
        return {
            id: detail?.jellyfinMediaId || row.mediaId,
            title: detail ? `${detail.artist ? `${detail.artist} - ` : ""}${detail.title}` : "Titre Inconnu",
            plays: row._count._all ?? 0,
            hours: parseFloat(((row._sum.durationWatched ?? 0) / 3600).toFixed(1)),
        };
    });

    // 4. Fetch all Movie playbacks with their directors, actors, studios
    const moviePlaybacks = await prisma.playbackHistory.findMany({
        where: {
            ...playbackWhere,
            media: { type: "Movie" },
        },
        select: {
            durationWatched: true,
            media: {
                select: {
                    directors: true,
                    actors: true,
                    studios: true,
                },
            },
        },
    });

    const seriesMetaMap = new Map(series.map((s) => [s.jellyfinMediaId, s]));

    // Aggregators
    const directorStats = new Map<string, { plays: number; duration: number }>();
    const actorStats = new Map<string, { plays: number; duration: number }>();
    const studioStats = new Map<string, { plays: number; duration: number }>();

    const addStats = (list: string[], duration: number, statsMap: Map<string, { plays: number; duration: number }>) => {
        list.forEach((name) => {
            if (!name) return;
            const existing = statsMap.get(name) || { plays: 0, duration: 0 };
            existing.plays += 1;
            existing.duration += duration;
            statsMap.set(name, existing);
        });
    };

    // Process movies
    moviePlaybacks.forEach((pb) => {
        if (!pb.media) return;
        const duration = pb.durationWatched;
        addStats(pb.media.directors, duration, directorStats);
        addStats(pb.media.actors, duration, actorStats);
        addStats(pb.media.studios, duration, studioStats);
    });

    // Process episodes
    episodePlaybacks.forEach((ep) => {
        const seasonId = ep.media?.parentId;
        if (!seasonId) return;
        const seriesId = seasonToSeriesMap.get(seasonId);
        if (!seriesId) return;
        const seriesMeta = seriesMetaMap.get(seriesId);
        if (!seriesMeta) return;
        const duration = ep.durationWatched;
        addStats(seriesMeta.directors, duration, directorStats);
        addStats(seriesMeta.actors, duration, actorStats);
        addStats(seriesMeta.studios, duration, studioStats);
    });

    const topDirectors = Array.from(directorStats.entries())
        .map(([name, stats]) => ({
            name,
            plays: stats.plays,
            hours: parseFloat((stats.duration / 3600).toFixed(1)),
        }))
        .sort((a, b) => b.plays - a.plays)
        .slice(0, 5);

    const topActors = Array.from(actorStats.entries())
        .map(([name, stats]) => ({
            name,
            plays: stats.plays,
            hours: parseFloat((stats.duration / 3600).toFixed(1)),
        }))
        .sort((a, b) => b.plays - a.plays)
        .slice(0, 5);

    const topStudios = Array.from(studioStats.entries())
        .map(([name, stats]) => ({
            name,
            plays: stats.plays,
            hours: parseFloat((stats.duration / 3600).toFixed(1)),
        }))
        .sort((a, b) => b.plays - a.plays)
        .slice(0, 5);

    return (
        <div className="p-6 max-w-[1400px] mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">Top Contenus</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Les films, séries et musiques les plus populaires de votre serveur.
                    </p>
                </div>
                <ServerFilter servers={selectableServerOptions} enabled={multiServerEnabled} showOutsideDashboard />
            </div>

            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {/* Top Movies Card */}
                <Card className="app-surface">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <div className="space-y-1">
                            <CardTitle className="flex items-center gap-2">
                                <Film className="w-5 h-5 text-blue-500" />
                                Top Films
                            </CardTitle>
                            <CardDescription>Les films les plus visionnés.</CardDescription>
                        </div>
                        <Award className="w-5 h-5 text-yellow-500" />
                    </CardHeader>
                    <CardContent className="space-y-4 mt-4">
                        {topMovies.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-6 text-center">{tc("noData")}</p>
                        ) : (
                            topMovies.map((movie, index) => (
                                <div key={movie.id} className="flex items-center gap-3 p-2 rounded-lg app-surface-soft border border-border/40 hover:border-blue-500/20 transition-all">
                                    <div className="w-8 h-8 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold text-sm shrink-0">
                                        #{index + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-foreground truncate">{movie.title}</p>
                                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                                            <span className="flex items-center gap-1">
                                                <Play className="w-3 h-3 fill-current" />
                                                {movie.plays} {movie.plays > 1 ? "lectures" : "lecture"}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {movie.hours}h
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>

                {/* Top Series Card */}
                <Card className="app-surface">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <div className="space-y-1">
                            <CardTitle className="flex items-center gap-2">
                                <Tv className="w-5 h-5 text-emerald-500" />
                                Top Séries
                            </CardTitle>
                            <CardDescription>Les séries les plus suivies.</CardDescription>
                        </div>
                        <Award className="w-5 h-5 text-yellow-500" />
                    </CardHeader>
                    <CardContent className="space-y-4 mt-4">
                        {topSeries.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-6 text-center">{tc("noData")}</p>
                        ) : (
                            topSeries.map((series, index) => (
                                <div key={series.id} className="flex items-center gap-3 p-2 rounded-lg app-surface-soft border border-border/40 hover:border-emerald-500/20 transition-all">
                                    <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold text-sm shrink-0">
                                        #{index + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-foreground truncate">{series.title}</p>
                                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                                            <span className="flex items-center gap-1">
                                                <Play className="w-3 h-3 fill-current" />
                                                {series.plays} {series.plays > 1 ? "épisodes" : "épisode"}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {series.hours}h
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>

                {/* Top Music Card */}
                <Card className="app-surface">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <div className="space-y-1">
                            <CardTitle className="flex items-center gap-2">
                                <Library className="w-5 h-5 text-amber-500" />
                                Top Titres Musicaux
                            </CardTitle>
                            <CardDescription>Les musiques les plus écoutées.</CardDescription>
                        </div>
                        <Award className="w-5 h-5 text-yellow-500" />
                    </CardHeader>
                    <CardContent className="space-y-4 mt-4">
                        {topMusic.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-6 text-center">{tc("noData")}</p>
                        ) : (
                            topMusic.map((music, index) => (
                                <div key={music.id} className="flex items-center gap-3 p-2 rounded-lg app-surface-soft border border-border/40 hover:border-amber-500/20 transition-all">
                                    <div className="w-8 h-8 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold text-sm shrink-0">
                                        #{index + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-foreground truncate">{music.title}</p>
                                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                                            <span className="flex items-center gap-1">
                                                <Play className="w-3 h-3 fill-current" />
                                                {music.plays} {music.plays > 1 ? "écoutes" : "écoute"}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {music.hours}h
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>

                {/* Top Directors Card */}
                <Card className="app-surface">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <div className="space-y-1">
                            <CardTitle className="flex items-center gap-2">
                                <Video className="w-5 h-5 text-indigo-500" />
                                Top Réalisateurs
                            </CardTitle>
                            <CardDescription>Les réalisateurs les plus visionnés.</CardDescription>
                        </div>
                        <Award className="w-5 h-5 text-yellow-500" />
                    </CardHeader>
                    <CardContent className="space-y-4 mt-4">
                        {topDirectors.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-6 text-center">{tc("noData")}</p>
                        ) : (
                            topDirectors.map((director, index) => (
                                <Link 
                                    key={director.name} 
                                    href={`/media/all?q=${encodeURIComponent(director.name)}`} 
                                    className="flex items-center gap-3 p-2 rounded-lg app-surface-soft border border-border/40 hover:border-indigo-500/20 hover:bg-zinc-500/5 transition-all"
                                >
                                    <div className="w-8 h-8 rounded-full bg-indigo-500/10 text-indigo-500 flex items-center justify-center font-bold text-sm shrink-0">
                                        #{index + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-foreground truncate">{director.name}</p>
                                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                                            <span className="flex items-center gap-1">
                                                <Play className="w-3 h-3 fill-current" />
                                                {director.plays} {director.plays > 1 ? "lectures" : "lecture"}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {director.hours}h
                                            </span>
                                        </div>
                                    </div>
                                </Link>
                            ))
                        )}
                    </CardContent>
                </Card>

                {/* Top Actors Card */}
                <Card className="app-surface">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <div className="space-y-1">
                            <CardTitle className="flex items-center gap-2">
                                <Users className="w-5 h-5 text-purple-500" />
                                Top Acteurs
                            </CardTitle>
                            <CardDescription>Les acteurs les plus visionnés.</CardDescription>
                        </div>
                        <Award className="w-5 h-5 text-yellow-500" />
                    </CardHeader>
                    <CardContent className="space-y-4 mt-4">
                        {topActors.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-6 text-center">{tc("noData")}</p>
                        ) : (
                            topActors.map((actor, index) => (
                                <Link 
                                    key={actor.name} 
                                    href={`/media/all?q=${encodeURIComponent(actor.name)}`} 
                                    className="flex items-center gap-3 p-2 rounded-lg app-surface-soft border border-border/40 hover:border-purple-500/20 hover:bg-zinc-500/5 transition-all"
                                >
                                    <div className="w-8 h-8 rounded-full bg-purple-500/10 text-purple-500 flex items-center justify-center font-bold text-sm shrink-0">
                                        #{index + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-foreground truncate">{actor.name}</p>
                                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                                            <span className="flex items-center gap-1">
                                                <Play className="w-3 h-3 fill-current" />
                                                {actor.plays} {actor.plays > 1 ? "lectures" : "lecture"}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {actor.hours}h
                                            </span>
                                        </div>
                                    </div>
                                </Link>
                            ))
                        )}
                    </CardContent>
                </Card>

                {/* Top Studios Card */}
                <Card className="app-surface">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <div className="space-y-1">
                            <CardTitle className="flex items-center gap-2">
                                <Building className="w-5 h-5 text-pink-500" />
                                Top Studios
                            </CardTitle>
                            <CardDescription>Les studios les plus populaires.</CardDescription>
                        </div>
                        <Award className="w-5 h-5 text-yellow-500" />
                    </CardHeader>
                    <CardContent className="space-y-4 mt-4">
                        {topStudios.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-6 text-center">{tc("noData")}</p>
                        ) : (
                            topStudios.map((studio, index) => (
                                <Link 
                                    key={studio.name} 
                                    href={`/media/all?q=${encodeURIComponent(studio.name)}`} 
                                    className="flex items-center gap-3 p-2 rounded-lg app-surface-soft border border-border/40 hover:border-pink-500/20 hover:bg-zinc-500/5 transition-all"
                                >
                                    <div className="w-8 h-8 rounded-full bg-pink-500/10 text-pink-500 flex items-center justify-center font-bold text-sm shrink-0">
                                        #{index + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-foreground truncate">{studio.name}</p>
                                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                                            <span className="flex items-center gap-1">
                                                <Play className="w-3 h-3 fill-current" />
                                                {studio.plays} {studio.plays > 1 ? "lectures" : "lecture"}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {studio.hours}h
                                            </span>
                                        </div>
                                    </div>
                                </Link>
                            ))
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
