import prisma from "@/lib/prisma";
import { getTranslations } from 'next-intl/server';
import StatsDeepAnalysis from '@/components/dashboard/StatsDeepAnalysis';
import { GenreDistributionChart } from '@/components/charts/GenreDistributionChart';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export const dynamic = "force-dynamic";

export default async function AnalysisPage() {
    const t = await getTranslations('media');

    // Fetch media fields useful for the analysis
    const medias = await prisma.media.findMany({ select: { genres: true, resolution: true, durationMs: true, directors: true, libraryName: true }, where: {} });

    // Aggregate genres and resolutions
    const genreCounts = new Map<string, number>();
    const resolutionCounts = new Map<string, number>();
    const directorCounts = new Map<string, number>();
    const libraryCounts = new Map<string, number>();
    let durationSum = 0;
    let durationCount = 0;

    medias.forEach(m => {
        if (m.genres) m.genres.forEach((g: string) => genreCounts.set(g, (genreCounts.get(g) || 0) + 1));
        const nr = (m.resolution || 'SD');
        resolutionCounts.set(nr, (resolutionCounts.get(nr) || 0) + 1);
        if (m.directors) m.directors.forEach((d: string) => { if (d) directorCounts.set(d, (directorCounts.get(d) || 0) + 1); });
        if (m.libraryName) libraryCounts.set(m.libraryName, (libraryCounts.get(m.libraryName) || 0) + 1);
        if (m.durationMs !== null && m.durationMs !== undefined) {
            try {
                const v = typeof m.durationMs === 'bigint' ? Number(m.durationMs) : Number(m.durationMs);
                if (!Number.isNaN(v) && v > 0) { durationSum += v; durationCount += 1; }
            } catch { /* ignore */ }
        }
    });

    const topGenres = Array.from(genreCounts.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10);
    const topDirectors = Array.from(directorCounts.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10);
    const topLibraries = Array.from(libraryCounts.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);

    const res4K = resolutionCounts.get('4K') || 0;
    const res1080p = resolutionCounts.get('1080p') || 0;
    const res720p = resolutionCounts.get('720p') || 0;
    const resSD = resolutionCounts.get('SD') || 0;

    const totalMedia = medias.length;
    const uniqueGenres = Array.from(genreCounts.keys()).filter(Boolean).length;
    const avgDurationMs = durationCount ? Math.round(durationSum / durationCount) : 0;
    const avgDurationMinutes = Math.round(avgDurationMs / 60000);
    const formatDuration = (mins: number) => mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;

    return (
        <div className="p-6 max-w-[1200px] mx-auto">
            <h1 className="text-2xl font-bold mb-4">{t('deepAnalysisTitle')}</h1>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4">
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
                            <CardDescription>{t('deepStatsOverview')}</CardDescription>
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
                            <CardTitle>{t('deepStatsOverview')}</CardTitle>
                            <CardDescription>{t('deepStatsOverview')}</CardDescription>
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
                                { label: t('4kLabel') || "4K UHD", val: res4K, color: "bg-gradient-to-r from-yellow-400 to-orange-500", text: "text-transparent bg-clip-text" },
                                { label: "1080p FHD", val: res1080p, color: "text-blue-400" },
                                { label: "720p HD", val: res720p, color: "text-emerald-400" },
                                { label: t('standardOther'), val: resSD, color: "text-zinc-500" }
                            ].map((q, idx) => (
                                <div key={idx} className="app-surface-soft flex justify-between items-center p-3 rounded-lg border border-zinc-800/50">
                                    <span className={`font-semibold ${q.color} ${q.text || ""}`}>{q.label}</span>
                                    <span className="text-xl font-bold">{q.val}</span>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>{t('topDirectors')}</CardTitle>
                            <CardDescription>{t('topDirectors')}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                {topDirectors.length === 0 ? (
                                    <div className="text-sm text-muted-foreground">{t('noData') || 'No data'}</div>
                                ) : (
                                    topDirectors.slice(0, 8).map((d, i) => (
                                        <div key={i} className="flex items-center justify-between">
                                            <div className="text-sm">{d.name}</div>
                                            <div className="text-sm font-semibold">{d.count}</div>
                                        </div>
                                    ))
                                )}
                            </div>
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
