import prisma from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DayOfWeekChart, DayOfWeekData } from "@/components/charts/DayOfWeekChart";
import { CompletionRatioChart, CompletionData } from "@/components/charts/CompletionRatioChart";
import { ActivityByHourChart, ActivityHourData } from "@/components/charts/ActivityByHourChart";
import { getTranslations } from 'next-intl/server';

export default async function UserStatsCharts({ userId }: { userId: string }) {
    const t = await getTranslations('userProfile');
    const td = await getTranslations('dashboard');

    const user = await prisma.user.findUnique({
        where: { jellyfinUserId: userId },
        select: {
            id: true,
            playbackHistory: {
                select: {
                    startedAt: true,
                    durationWatched: true,
                    media: { select: { durationMs: true } }
                }
            }
        }
    });

    if (!user || user.playbackHistory.length === 0) return null;

    const dayCounts = new Array(7).fill(0);
    const hourCounts = new Array(24).fill(0);
    let completed = 0;
    let partial = 0;
    let abandoned = 0;

    user.playbackHistory.forEach((session: any) => {
        const startedAt = new Date(session.startedAt);
        const day = startedAt.getDay();
        const hour = startedAt.getHours();
        dayCounts[day]++;
        if (hour >= 0 && hour <= 23) hourCounts[hour]++;

        const mediaDurS = session.media?.durationMs ? Number(session.media.durationMs) / 1000 : 0;
        if (mediaDurS <= 0 || session.durationWatched <= 0) {
            partial++;
            return;
        }

        const pct = session.durationWatched / mediaDurS;
        if (pct >= 0.8) completed++;
        else if (pct >= 0.2) partial++;
        else abandoned++;
    });

    const dayNames = t('dayNames').split(',');
    const dayData: DayOfWeekData[] = dayCounts.map((count, index) => ({
        day: dayNames[index] || String(index),
        count,
    }));

    const completionData: CompletionData[] = [
        { name: td('completed'), value: completed },
        { name: td('partial'), value: partial },
        { name: td('abandoned'), value: abandoned },
    ].filter((d) => d.value > 0);

    const hourData: ActivityHourData[] = hourCounts.map((count, hour) => ({
        hour: `${String(hour).padStart(2, '0')}:00`,
        count,
    }));

    return (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 mt-6">
            <Card className="bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm">
                <CardHeader>
                    <CardTitle>{td('dayOfWeekActivity')}</CardTitle>
                    <CardDescription>{td('dayOfWeekActivityDesc')}</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-[260px] w-full">
                        <DayOfWeekChart data={dayData} />
                    </div>
                </CardContent>
            </Card>

            <Card className="bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm">
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

            <Card className="bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm md:col-span-2 xl:col-span-1">
                <CardHeader>
                    <CardTitle>{td('hourlyActivity')}</CardTitle>
                    <CardDescription>{td('hourlyActivityDesc')}</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-[260px] w-full">
                        <ActivityByHourChart data={hourData} />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
