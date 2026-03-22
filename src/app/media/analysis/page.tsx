import prisma from "@/lib/prisma";
import { getTranslations } from 'next-intl/server';
import StatsDeepAnalysis from '@/components/dashboard/StatsDeepAnalysis';
import { GenreDistributionChart } from '@/components/charts/GenreDistributionChart';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export const dynamic = "force-dynamic";

export default async function AnalysisPage() {
    const t = await getTranslations('media');
    const tc = await getTranslations('common');

    // Collect genres and resolutions
    const medias = await prisma.media.findMany({ select: { genres: true, resolution: true }, where: {} });
    const genreCounts = new Map<string, number>();
    const resolutionCounts = new Map<string, number>();
    medias.forEach(m => {
        if (m.genres) m.genres.forEach((g: string) => genreCounts.set(g, (genreCounts.get(g) || 0) + 1));
        const nr = (m.resolution || 'SD');
        resolutionCounts.set(nr, (resolutionCounts.get(nr) || 0) + 1);
    });

    const topGenres = Array.from(genreCounts.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10);
    const res4K = resolutionCounts.get('4K') || 0;
    const res1080p = resolutionCounts.get('1080p') || 0;
    const res720p = resolutionCounts.get('720p') || 0;
    const resSD = resolutionCounts.get('SD') || 0;

    return (
        <div className="p-6 max-w-[1200px] mx-auto">
            <h1 className="text-2xl font-bold mb-4">{t('deepAnalysisTitle') || 'Analyse profonde'}</h1>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    <Card className="mb-4">
                        <CardHeader>
                            <CardTitle>{t('genreDiversity')}</CardTitle>
                            <CardDescription>{t('genreDiversityDesc')}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[300px]"><GenreDistributionChart data={topGenres} /></div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>{t('deepStatsOverview') || 'Statistiques profondes'}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <StatsDeepAnalysis />
                        </CardContent>
                    </Card>
                </div>

                <div>
                    <Card>
                        <CardHeader>
                            <CardTitle>{t('videoQuality')}</CardTitle>
                            <CardDescription>{t('videoQualityDesc')}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4 mt-4">
                            {[
                                { label: "4K UHD", val: res4K, color: "bg-gradient-to-r from-yellow-400 to-orange-500", text: "text-transparent bg-clip-text" },
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
                </div>
            </div>
        </div>
    );
}
