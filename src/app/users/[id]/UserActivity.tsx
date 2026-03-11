import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserActivityChart, ActivityData } from "@/components/charts/UserActivityChart";
import prisma from "@/lib/prisma";
import { getTranslations } from 'next-intl/server';

export default async function UserActivity({ userId }: { userId: string }) {
    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 29);
    last30Days.setHours(0, 0, 0, 0);

    // RequÃªte Prisma limitÃ©e aux 30 derniers jours pour Ã©viter de surcharger
    const user = await prisma.user.findUnique({
        where: { jellyfinUserId: userId },
        include: {
            playbackHistory: {
                where: { startedAt: { gte: last30Days } },
                select: { startedAt: true, durationWatched: true }
            }
        }
    });

    if (!user) return null;

    const t = await getTranslations('userProfile');

    const activityMap = new Map<string, number>();
    for (let i = 0; i < 30; i++) {
        const d = new Date();
        d.setDate(d.getDate() - (29 - i));
        activityMap.set(`${d.getDate()}/${d.getMonth() + 1}`, 0);
    }

    user.playbackHistory.forEach((session: any) => {
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
        <Card className="bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm mt-6">
            <CardHeader className="pb-2">
                <CardTitle>{t('activity30d')}</CardTitle>
                <CardDescription>{t('activity30dDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="h-[250px] w-full">
                    <UserActivityChart data={activityData} />
                </div>
            </CardContent>
        </Card>
    );
}
