import prisma from "@/lib/prisma";
import { getTranslations } from 'next-intl/server';
import StatsDeepAnalysis from '@/components/dashboard/StatsDeepAnalysis';
import { GenreDistributionChart } from '@/components/charts/GenreDistributionChart';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { normalizeLibraryKey } from '@/lib/mediaPolicy';
import { normalizeResolution } from '@/lib/utils';

export const dynamic = "force-dynamic";

export default async function AnalysisPage() {
    const t = await getTranslations('media');
    const tc = await getTranslations('common');

    const settings = await prisma.globalSettings.findUnique({ where: { id: 'global' } });
    const excludedLibraries = settings?.excludedLibraries || [];
    const { buildExcludedMediaClause } = await import('@/lib/mediaPolicy');
    const excludedClause = buildExcludedMediaClause(excludedLibraries);

    // Fetch media fields useful for the analysis
    // Respect same exclusions as the all media page
    const baseTypes = ['Movie', 'Series', 'MusicAlbum'];
    const medias = await prisma.media.findMany({ 
        select: { id: true, parentId: true, genres: true, resolution: true, durationMs: true, directors: true, libraryName: true, type: true, collectionType: true }, 
        where: {
            type: { in: baseTypes },
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

    // Consider only video-like media for resolution counting
    const VIDEO_TYPES = new Set(['Movie', 'Series']);
    const AUDIO_TYPES = new Set(['MusicAlbum', 'Track']);
    const MAIN_TYPES = new Set(['Movie', 'Series', 'MusicAlbum']);

    medias.forEach(m => {
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

    return (
        <div className="p-6 max-w-[1200px] mx-auto">
            <h1 className="text-2xl font-bold mb-4">{t('deepAnalysisTitle')}</h1>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-3 space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>{t('genreDiversity')}</CardTitle>
                            <CardDescription>{t('genreDiversityDesc')}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[340px]"><GenreDistributionChart data={topGenres} /></div>
                        </CardContent>
                    </Card>



                    <Card>
                        <CardHeader>
                            <CardTitle>{t('deepStatsOverview')}</CardTitle>
                            <CardDescription>{t('deepStatsOverviewDesc') || 'Analyses avancées de votre collection multimédia.'}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div>
                                <StatsDeepAnalysis />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>{t('statsContent')}</CardTitle>
                            <CardDescription>{t('statsContentDesc')}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                <div className="app-surface-soft p-3 rounded-lg border">
                                    <div className="text-sm text-zinc-400">{t('totalMedia')}</div>
                                    <div className="text-2xl font-bold">{totalMedia}</div>
                                    <div className="text-xs text-muted-foreground mt-1">{t('totalMediaDesc')}</div>
                                </div>

                                <div className="app-surface-soft p-3 rounded-lg border">
                                    <div className="text-sm text-zinc-400">{t('uniqueGenres')}</div>
                                    <div className="text-2xl font-bold">{uniqueGenres}</div>
                                </div>

                                <div className="app-surface-soft p-3 rounded-lg border">
                                    <div className="text-sm text-zinc-400">{t('avgDuration')}</div>
                                    <div className="text-2xl font-bold">{formatDuration(avgDurationMinutes)}</div>
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
                            ].map((q, idx) => (
                                <a key={q.key} href={`/media/all?resolution=${encodeURIComponent(q.key)}`} className="block">
                                    <div className="app-surface-soft flex justify-between items-center p-3 rounded-lg border border-zinc-800/50 hover:shadow-md hover:scale-[1.01] transition-transform">
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
            </div>
        </div>
    );
}
