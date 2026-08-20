import prisma from "@/lib/prisma";
import { getTranslations } from 'next-intl/server';
import StatsDeepAnalysis from '@/components/dashboard/StatsDeepAnalysis';
import { LazyGenreDistributionChart } from '@/components/charts/LazyCharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { normalizeLibraryKey } from '@/lib/mediaPolicy';
import { normalizeResolution } from '@/lib/utils';
import { ServerFilter } from '@/components/dashboard/ServerFilter';
import { cookies } from 'next/headers';
import { GLOBAL_SERVER_SCOPE_COOKIE } from '@/lib/serverScope';
import { resolveSelectedServerIdsAsync } from '@/lib/serverScope.server';
import { buildSelectableServerOptions } from '@/lib/selectableServers';

export const dynamic = "force-dynamic";

import { requireAdmin, isAuthError } from "@/lib/auth";
import { redirect } from 'next/navigation';
import { getBingeWatchingStats } from "@/lib/bingeTracker";
import { getTasteInsights } from "@/lib/tasteInsights";
import { Flame, Lightbulb, TrendingUp, Sparkles, Film, Tv, Award } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default async function AnalysisPage({ searchParams }: { searchParams?: Promise<{ servers?: string }> }) {
    const auth = await requireAdmin();
    if (isAuthError(auth)) redirect("/login");

    const t = await getTranslations('media');
    const tc = await getTranslations('common');
    const resolvedSearchParams = searchParams ? await searchParams : {};

    const [settings, serverRows, bingeStats, tasteInsights] = await Promise.all([
        prisma.globalSettings.findUnique({ where: { id: 'global' } }),
        prisma.server.findMany({
            select: { id: true, name: true, isActive: true, url: true, jellyfinServerId: true },
            orderBy: { name: 'asc' },
        }),
        getBingeWatchingStats(30),
        getTasteInsights(30),
    ]);
    const excludedLibraries = settings?.excludedLibraries || [];
    const { buildExcludedMediaClause } = await import('@/lib/mediaPolicy');
    const excludedClause = buildExcludedMediaClause(excludedLibraries);

    const jellytrackMode = (process.env.JELLYTRACK_MODE || 'single').toLowerCase();
    const selectableServerOptions = buildSelectableServerOptions(serverRows);
    const multiServerEnabled = jellytrackMode === 'multi' && selectableServerOptions.length > 1;
    const cookieStore = await cookies();
    const persistedScopeCookie = cookieStore.get(GLOBAL_SERVER_SCOPE_COOKIE)?.value ?? null;
    const { selectedServerIds, selectedServerIdsParam: serversParam } = await resolveSelectedServerIdsAsync({
        multiServerEnabled,
        selectableServerIds: selectableServerOptions.map((server) => server.id),
        requestedServersParam: resolvedSearchParams.servers,
        cookieServersParam: persistedScopeCookie,
    });
    const selectedServerScope = selectedServerIds.length > 0 ? { in: selectedServerIds } : undefined;

    // Fetch media fields useful for the analysis
    // Respect same exclusions as the all media page
    const baseTypes = ['Movie', 'Series', 'MusicAlbum'];
    const medias = await prisma.media.findMany({ 
        select: { id: true, parentId: true, genres: true, resolution: true, durationMs: true, directors: true, libraryName: true, type: true, collectionType: true }, 
        where: {
            type: { in: baseTypes },
            ...(selectedServerScope ? { serverId: selectedServerScope } : {}),
            ...(excludedClause ? { AND: [excludedClause] } : {})
        } 
    });

    // Aggregate genres and resolutions. For resolutions, we use Sets to track unique parent entities
    const genreCounts = new Map<string, number>();
    const resolutionCounts = new Map<string, Set<string>>();
    const directorCounts = new Map<string, number>();
    const libraryStatsMap = new Map<string, { name: string, count: number }>();
    let durationSum = 0;
    let durationCount = 0;

    interface MediaLike {
        id: string;
        parentId: string | null;
        genres: string[];
        resolution: string | null;
        durationMs: bigint | number | null;
        directors: string[];
        libraryName: string | null;
        type: string | null;
        collectionType: string | null;
    }

    // Consider only video-like media for resolution counting
    const VIDEO_TYPES = new Set(['Movie', 'Series']);

    medias.forEach((m: MediaLike) => {
        if (m.genres) m.genres.forEach((g: string) => genreCounts.set(g, (genreCounts.get(g) || 0) + 1));
        const isVideo = VIDEO_TYPES.has((m.type || '').toString());
        
        if (isVideo) {
            const nr = normalizeResolution(m.resolution);
            if (nr && nr !== 'Unknown') {
                if (!resolutionCounts.has(nr)) resolutionCounts.set(nr, new Set<string>());
                const set = resolutionCounts.get(nr)!;
                set.add(m.id);
            }
        }
        if (m.directors) m.directors.forEach((d: string) => { if (d) directorCounts.set(d, (directorCounts.get(d) || 0) + 1); });
        
        // Count library items - focus on main items
        if (m.libraryName) {
            const key = normalizeLibraryKey(m.collectionType || m.libraryName) || m.libraryName;
            const existing = libraryStatsMap.get(key);
            if (existing) {
                existing.count += 1;
            } else {
                let displayName = m.libraryName;
                const libNorm = normalizeLibraryKey(m.libraryName);
                if (libNorm) {
                    try {
                        const translated = tc(libNorm);
                        if (translated && !translated.includes('.')) {
                            displayName = translated;
                        }
                    } catch { /* ignore */ }
                }
                libraryStatsMap.set(key, { name: displayName, count: 1 });
            }
        }

        if (m.durationMs !== null && m.durationMs !== undefined) {
            try {
                const v = typeof m.durationMs === 'bigint' ? Number(m.durationMs) : Number(m.durationMs);
                if (!Number.isNaN(v) && v > 0) { durationSum += v; durationCount += 1; }
            } catch { /* ignore */ }
        }
    });

    const topGenres = Array.from(genreCounts.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10);
    const topLibraries = Array.from(libraryStatsMap.values()).sort((a, b) => b.count - a.count).slice(0, 8);

    const countFor = (k: string) => resolutionCounts.get(k)?.size || 0;
    const res4K = countFor('4K');
    const res1440p = countFor('1440p');
    const res1080p = countFor('1080p');
    const res720p = countFor('720p');
    const resSD = countFor('SD');

    const totalMedia = medias.length;
    const uniqueGenres = Array.from(genreCounts.keys()).filter(Boolean).length;
    const avgDurationMs = durationCount ? Math.round(durationSum / durationCount) : 0;
    const avgDurationMinutes = Math.round(avgDurationMs / 60000);
    const formatDuration = (mins: number) => mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
    const buildAllMediaResolutionUrl = (resolutionKey: string) => {
        const params = new URLSearchParams({ resolution: resolutionKey });
        if (serversParam) params.set('servers', serversParam);
        return `/media/all?${params.toString()}`;
    };

    return (
        <div className="p-6 max-w-[1200px] mx-auto">
            <h1 className="text-2xl font-bold mb-4">{t('deepAnalysisTitle')}</h1>
            <div className="mb-4">
                <ServerFilter
                    servers={selectableServerOptions}
                    enabled={multiServerEnabled}
                    showOutsideDashboard
                />
            </div>

            <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>{t('statsContent')}</CardTitle>
                        <CardDescription>{t('statsContentDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            <div className="app-surface-soft p-3 rounded-lg border">
                                <div className="text-sm text-muted-foreground">{t('totalMedia')}</div>
                                <div className="text-2xl font-bold metric-glow-cyan">{totalMedia}</div>
                                <div className="text-xs text-muted-foreground mt-1">{t('totalMediaDesc')}</div>
                            </div>

                            <div className="app-surface-soft p-3 rounded-lg border">
                                <div className="text-sm text-muted-foreground">{t('uniqueGenres')}</div>
                                <div className="text-2xl font-bold metric-glow-violet">{uniqueGenres}</div>
                            </div>

                            <div className="app-surface-soft p-3 rounded-lg border">
                                <div className="text-sm text-muted-foreground">{t('avgDuration')}</div>
                                <div className="text-2xl font-bold metric-glow-emerald">{formatDuration(avgDurationMinutes)}</div>
                                <div className="text-xs text-muted-foreground mt-1">{t('avgDurationDesc')}</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>{t('videoQuality')}</CardTitle>
                        <CardDescription>{t('videoQualityDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4 mt-4">
                        {[
                            { label: t('4kLabel') || "4K UHD", val: res4K, key: '4K', color: "bg-gradient-to-r from-yellow-400 to-orange-500", text: "text-transparent bg-clip-text" },
                            { label: "1440p QHD", val: res1440p, key: '1440p', color: "text-sky-400" },
                            { label: "1080p FHD", val: res1080p, key: '1080p', color: "text-blue-400" },
                            { label: "720p HD", val: res720p, key: '720p', color: "text-emerald-400" },
                            { label: t('standardOther'), val: resSD, key: 'SD', color: "text-zinc-500" }
                        ].map((q) => (
                            <a key={q.key} href={buildAllMediaResolutionUrl(q.key)} className="block">
                                <div className="app-surface-soft flex justify-between items-center p-3 rounded-lg border border-border hover:border-primary/35 hover:shadow-md hover:scale-[1.01] transition-transform">
                                    <span className={`font-semibold ${q.color} ${q.text || ""}`}>{q.label}</span>
                                    <span className="text-xl font-bold">{q.val}</span>
                                </div>
                            </a>
                        ))}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>{t('libraryCollections')}</CardTitle>
                        <CardDescription>{t('statsContentDesc') || ''}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {topLibraries.slice(0, 6).map((l, i) => (
                                <div key={i} className="flex items-center justify-between">
                                    <div className="text-sm">{l.name}</div>
                                    <div className="text-sm font-semibold">{l.count}</div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="space-y-4">
                <Card>
                    <CardHeader>
                        <CardTitle>{t('genreDiversity')}</CardTitle>
                        <CardDescription>{t('genreDiversityDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[340px]"><LazyGenreDistributionChart data={topGenres} /></div>
                    </CardContent>
                </Card>

                {/* 1. Binge-Watching Tracker Card */}
                <Card className="app-surface border border-border shadow-sm">
                    <CardHeader>
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <div>
                                <CardTitle className="text-xl flex items-center gap-2 text-foreground">
                                    <Flame className="w-5 h-5 text-orange-500 animate-pulse" />
                                    Binge-Watching Tracker (Marathons de Séries)
                                </CardTitle>
                                <CardDescription>
                                    Détection automatique des séries dévorées d&apos;une traite (sessions de 3 épisodes consécutifs ou plus).
                                </CardDescription>
                            </div>
                            <Badge variant="outline" className="border-orange-500/30 text-orange-400 bg-orange-500/10">
                                30 derniers jours
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Summary highlight banner */}
                        {bingeStats.mostBingedSeries ? (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="app-surface-soft border border-orange-500/20 rounded-xl p-4 bg-orange-500/5">
                                    <span className="text-xs text-muted-foreground font-semibold">Série N°1 des marathons</span>
                                    <div className="text-lg font-bold text-foreground truncate mt-1">
                                        {bingeStats.mostBingedSeries.seriesTitle}
                                    </div>
                                    <div className="text-xs text-orange-400 mt-1 font-medium">
                                        {bingeStats.mostBingedSeries.totalBingeSessions} marathons enregistrés
                                    </div>
                                </div>

                                <div className="app-surface-soft border border-border rounded-xl p-4">
                                    <span className="text-xs text-muted-foreground font-semibold">Intensité moyenne</span>
                                    <div className="text-2xl font-black text-foreground mt-1 metric-glow-emerald">
                                        {bingeStats.mostBingedSeries.avgEpisodesPerSession} <span className="text-xs font-normal text-muted-foreground">épisodes / session</span>
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1">
                                        Record : {bingeStats.mostBingedSeries.maxEpisodesInSingleRun} épisodes d&apos;affilée
                                    </div>
                                </div>

                                <div className="app-surface-soft border border-border rounded-xl p-4">
                                    <span className="text-xs text-muted-foreground font-semibold">Marathons globaux (30j)</span>
                                    <div className="text-2xl font-black text-foreground mt-1 metric-glow-violet">
                                        {bingeStats.totalBingeSessionsMonth} <span className="text-xs font-normal text-muted-foreground">sessions</span>
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1 truncate">
                                        Top binger : {bingeStats.mostBingedSeries.topBingerUsername}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-6 text-sm text-muted-foreground">
                                Aucun marathon détecté sur les 30 derniers jours (minimum 3 épisodes consécutifs).
                            </div>
                        )}

                        {/* Top Binged Series List */}
                        {bingeStats.allBingedSeries.length > 0 && (
                            <div className="space-y-2">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                    Classement des séries les plus marathonées
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {bingeStats.allBingedSeries.slice(0, 4).map((s, idx) => (
                                        <div
                                            key={s.seriesId}
                                            className="app-surface-soft border border-border/80 rounded-xl p-3.5 flex items-center justify-between gap-3 hover:border-primary/30 transition-colors"
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center font-bold text-sm shrink-0">
                                                    #{idx + 1}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-bold text-sm text-foreground truncate">{s.seriesTitle}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        Moy. {s.avgEpisodesPerSession} épisodes • Max {s.maxEpisodesInSingleRun}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <span className="text-sm font-bold text-emerald-400 font-mono">{s.totalHoursBunged}h</span>
                                                <span className="block text-[10px] text-muted-foreground">{s.totalBingeSessions} sessions</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* 2. Smart Insights & Acquisition Suggestions Card */}
                <Card className="app-surface border border-border shadow-sm">
                    <CardHeader>
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <div>
                                <CardTitle className="text-xl flex items-center gap-2 text-foreground">
                                    <Lightbulb className="w-5 h-5 text-yellow-400" />
                                    Suggestions d&apos;Acquisitions & Tendances (Smart Insights)
                                </CardTitle>
                                <CardDescription>
                                    Recommandations basées sur les genres, réalisateurs et acteurs les plus consommés pour optimiser vos ajouts dans la bibliothèque.
                                </CardDescription>
                            </div>
                            <Badge variant="outline" className="border-yellow-500/30 text-yellow-400 bg-yellow-500/10">
                                IA JellyTrack
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Recommendations Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {tasteInsights.acquisitionSuggestions.map((sug, i) => (
                                <div
                                    key={i}
                                    className="app-surface-soft border border-border rounded-xl p-4 flex flex-col justify-between hover:border-yellow-500/30 transition-colors"
                                >
                                    <div>
                                        <div className="flex items-center justify-between gap-2 mb-2">
                                            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                                                {sug.category}
                                            </span>
                                            <Badge variant="secondary" className="text-[10px] bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
                                                {sug.badge}
                                            </Badge>
                                        </div>
                                        <h4 className="font-bold text-sm text-foreground mb-1.5">{sug.title}</h4>
                                        <p className="text-xs text-muted-foreground leading-relaxed">{sug.reason}</p>
                                    </div>
                                    <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">Indice d&apos;intérêt</span>
                                        <span className="font-bold text-yellow-400">{sug.scorePercent}%</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Top Genres Breakdown Bar */}
                        {tasteInsights.topGenres.length > 0 && (
                            <div className="space-y-2">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                    Genres dominants en temps de visionnage
                                </h4>
                                <div className="space-y-2">
                                    {tasteInsights.topGenres.slice(0, 4).map((g) => (
                                        <div key={g.name} className="space-y-1">
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="font-medium text-foreground">{g.name}</span>
                                                <span className="text-muted-foreground font-mono">{g.totalHours}h ({g.percentage}%)</span>
                                            </div>
                                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                                <div
                                                    className="h-full rounded-full bg-gradient-to-r from-yellow-500 to-amber-400"
                                                    style={{ width: `${Math.max(4, g.percentage)}%` }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>{t('deepStatsOverview')}</CardTitle>
                        <CardDescription>{t('deepStatsOverviewDesc') || 'Advanced analysis of your media collection.'}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div>
                            <StatsDeepAnalysis />
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
