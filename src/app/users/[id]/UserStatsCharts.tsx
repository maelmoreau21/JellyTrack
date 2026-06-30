import prisma from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DayOfWeekChart, DayOfWeekData } from "@/components/charts/DayOfWeekChart";
import { CompletionRatioChart, CompletionData } from "@/components/charts/CompletionRatioChart";
import { ActivityByHourChart, ActivityHourData } from "@/components/charts/ActivityByHourChart";
import { GenreDistributionChart, GenreData } from "@/components/charts/GenreDistributionChart";
import { getTranslations } from 'next-intl/server';
import { getCumulativeCompletionEntries } from "@/lib/mediaPolicy";
import { normalizeBitrateToKbps } from "@/lib/bitrate";

export default async function UserStatsCharts({ userId, userIds = [], userDbIds = [] }: { userId: string; userIds?: string[]; userDbIds?: string[] }) {
    const t = await getTranslations('userProfile');
    const td = await getTranslations('dashboard');
    const tc = await getTranslations('common');

    const targetJellyfinIds = Array.from(new Set([userId, ...userIds].filter(Boolean)));
    const resolvedUserDbIds = Array.from(new Set(userDbIds.filter(Boolean)));

    const userIdsToUse = resolvedUserDbIds.length > 0
        ? resolvedUserDbIds
        : (await prisma.user.findMany({
            where: { jellyfinUserId: { in: targetJellyfinIds } },
            orderBy: { createdAt: "asc" },
            select: { id: true },
        })).map((u) => u.id);

    if (userIdsToUse.length === 0) return null;

    const histories = await prisma.playbackHistory.findMany({
        where: { userId: { in: userIdsToUse } },
        select: {
            startedAt: true,
            durationWatched: true,
            userId: true,
            mediaId: true,
            playMethod: true,
            clientName: true,
            deviceName: true,
            bitrate: true,
            media: {
                select: {
                    durationMs: true,
                    genres: true,
                    type: true,
                }
            }
        },
    });

    if (histories.length === 0) return null;

    const dayCounts = new Array(7).fill(0);
    const hourCounts = new Array(24).fill(0);
    let completed = 0;
    let partial = 0;
    let abandoned = 0;

    const genreCounts = new Map<string, number>();
    const clientCounts = new Map<string, number>();
    let directPlayCount = 0;
    let bitrateSum = 0;
    let bitrateCount = 0;

    type StatsSession = {
        startedAt: Date;
        durationWatched: number;
        userId?: string | null;
        mediaId?: string | null;
        playMethod?: string | null;
        clientName?: string | null;
        deviceName?: string | null;
        bitrate?: number | null;
        media?: {
            durationMs?: bigint | null;
            genres: string[];
            type: string;
        } | null;
    };

    histories.forEach((session: StatsSession) => {
        const startedAt = new Date(session.startedAt);
        const day = startedAt.getDay();
        const hour = startedAt.getHours();
        dayCounts[day]++;
        if (hour >= 0 && hour <= 23) hourCounts[hour]++;

        // Aggregate genres
        if (session.media?.genres) {
            session.media.genres.forEach((g: string) => {
                if (g) genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
            });
        }

        // Aggregate clients/devices
        const client = session.clientName || "Unknown Client";
        clientCounts.set(client, (clientCounts.get(client) || 0) + 1);

        // Direct play ratio
        if (session.playMethod === "DirectPlay") {
            directPlayCount++;
        }

        // Average bitrate
        const kbps = normalizeBitrateToKbps(session.bitrate);
        if (kbps && kbps > 0) {
            bitrateSum += kbps;
            bitrateCount++;
        }
    });

    getCumulativeCompletionEntries(histories).forEach(({ completion }) => {
        if (completion.bucket === 'completed') completed++;
        else if (completion.bucket === 'partial') partial++;
        else if (completion.bucket === 'abandoned') abandoned++;
    });

    const dayNames = t('dayNames').split(',');
    const dayData: DayOfWeekData[] = dayCounts.map((count, index) => ({
        day: dayNames[index] || String(index),
        count,
    }));
    const hasDayData = dayData.some((d) => (d.count ?? 0) > 0);

    const completionData: CompletionData[] = [
        { name: td('completed'), value: completed },
        { name: td('partial'), value: partial },
        { name: td('abandoned'), value: abandoned },
    ].filter((d) => d.value > 0);

    const hourData: ActivityHourData[] = hourCounts.map((count, hour) => ({
        hour: `${String(hour).padStart(2, '0')}:00`,
        count,
    }));

    const topGenres: GenreData[] = Array.from(genreCounts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    const topClient = Array.from(clientCounts.entries())
        .sort((a, b) => b[1] - a[1])[0]?.[0] || "Aucun";

    const directPlayRatio = histories.length > 0 ? Math.round((directPlayCount / histories.length) * 100) : 100;
    const avgBitrateKbps = bitrateCount > 0 ? Math.round(bitrateSum / bitrateCount) : null;

    return (
        <div className="space-y-6 mt-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Card className="app-surface">
                    <CardHeader>
                        <CardTitle>{td('dayOfWeekActivity')}</CardTitle>
                        <CardDescription>{td('dayOfWeekActivityDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[280px] w-full">
                            {hasDayData ? (
                                <DayOfWeekChart data={dayData} />
                            ) : (
                                <div className="h-full flex items-center justify-center text-sm text-zinc-500">{tc('noData')}</div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card className="app-surface">
                    <CardHeader>
                        <CardTitle>{td('completionRate')}</CardTitle>
                        <CardDescription>{td('completionRateDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[260px] w-full">
                            {completionData.length > 0 ? (
                                <CompletionRatioChart data={completionData} />
                            ) : (
                                <div className="h-full flex items-center justify-center text-sm text-zinc-500">{td('noDurationData')}</div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card className="app-surface md:col-span-2 xl:col-span-1">
                    <CardHeader>
                        <CardTitle>{td('hourlyActivity')}</CardTitle>
                        <CardDescription>{td('hourlyActivityDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[280px] w-full">
                            <ActivityByHourChart data={hourData} />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <Card className="app-surface">
                    <CardHeader>
                        <CardTitle>Genres préférés</CardTitle>
                        <CardDescription>Répartition des genres les plus visionnés par cet utilisateur.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px] w-full">
                            {topGenres.length > 0 ? (
                                <GenreDistributionChart data={topGenres} />
                            ) : (
                                <div className="h-full flex items-center justify-center text-sm text-zinc-500">{tc('noData')}</div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card className="app-surface">
                    <CardHeader>
                        <CardTitle>Fiche Technique</CardTitle>
                        <CardDescription>{"Indicateurs de lecture et appareils préférés de l'utilisateur."}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 flex flex-col justify-center h-[300px]">
                        <div className="app-surface-soft p-4 rounded-lg border border-border">
                            <div className="text-sm text-muted-foreground">Appareil ou client le plus utilisé</div>
                            <div className="text-2xl font-bold metric-glow-cyan truncate mt-1">{topClient}</div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="app-surface-soft p-4 rounded-lg border border-border">
                                <div className="text-sm text-muted-foreground">Direct Play</div>
                                <div className="text-2xl font-bold metric-glow-violet mt-1">{directPlayRatio}%</div>
                            </div>
                            <div className="app-surface-soft p-4 rounded-lg border border-border">
                                <div className="text-sm text-muted-foreground">Débit moyen</div>
                                <div className="text-2xl font-bold metric-glow-emerald mt-1">
                                    {avgBitrateKbps ? `${(avgBitrateKbps / 1000).toFixed(1)} Mbps` : "—"}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
