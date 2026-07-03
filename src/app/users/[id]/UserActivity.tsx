import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LazyUserActivityChart } from "@/components/charts/LazyCharts";
import type { ActivityData } from "@/components/charts/UserActivityChart";
import prisma from "@/lib/prisma";
import { getTranslations } from 'next-intl/server';

export default async function UserActivity({ userId, userIds = [], userDbIds = [] }: { userId: string; userIds?: string[]; userDbIds?: string[] }) {
    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 29);
    last30Days.setHours(0, 0, 0, 0);

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

    const sessions = await prisma.playbackHistory.findMany({
        where: {
            userId: { in: userIdsToUse },
            startedAt: { gte: last30Days },
        },
        select: { startedAt: true, durationWatched: true },
    });

    const t = await getTranslations('userProfile');

    const activityMap = new Map<string, number>();
    for (let i = 0; i < 30; i++) {
        const d = new Date();
        d.setDate(d.getDate() - (29 - i));
        activityMap.set(`${d.getDate()}/${d.getMonth() + 1}`, 0);
    }

    type SimpleSession = { startedAt: Date; durationWatched: number };
    sessions.forEach((session: SimpleSession) => {
        const d = new Date(session.startedAt);
        const key = `${d.getDate()}/${d.getMonth() + 1}`;
        if (activityMap.has(key)) {
            activityMap.set(key, activityMap.get(key)! + (session.durationWatched / 3600));
        }
    });

    const activityData: ActivityData[] = Array.from(activityMap.entries()).map(([date, hours]) => ({
        date,
        hours: parseFloat(hours.toFixed(1))
    }));

    return (
        <Card className="app-surface mt-6">
            <CardHeader className="pb-2">
                <CardTitle>{t('activity30d')}</CardTitle>
                <CardDescription className="whitespace-normal">{t('activity30dDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="h-[250px] w-full">
                    <LazyUserActivityChart data={activityData} />
                </div>
            </CardContent>
        </Card>
    );
}
