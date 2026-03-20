import prisma from "@/lib/prisma";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Clock, Monitor } from "lucide-react";
import { getTranslations, getLocale } from 'next-intl/server';
import { isZapped } from "@/lib/mediaPolicy";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
    const t = await getTranslations('users');
    const tc = await getTranslations('common');
    const locale = await getLocale();
    // Récupérer tous les utilisateurs
    const users = await prisma.user.findMany({
        include: {
            playbackHistory: {
                select: {
                    durationWatched: true,
                    clientName: true,
                    deviceName: true,
                    startedAt: true,
                    media: { select: { type: true } }
                },
                orderBy: { startedAt: "desc" }
            }
        }
    });

    // Calculer les statistiques par utilisateur
    const userStats = users.map(user => {
        let totalSeconds = 0;
        let lastActive: Date | null = null;
        const clientCounts = new Map<string, number>();

        user.playbackHistory.forEach((session: any) => {
            if (isZapped(session)) return;
            totalSeconds += session.durationWatched;
            if (!lastActive || new Date(session.startedAt) > lastActive) {
                lastActive = new Date(session.startedAt);
            }
            if (session.clientName) {
                clientCounts.set(session.clientName, (clientCounts.get(session.clientName) || 0) + 1);
            }
        });

        // Trouver le client préféré
        let topClient = tc('unknown');
        let topClientCount = 0;
        clientCounts.forEach((count, name) => {
            if (count > topClientCount) {
                topClientCount = count;
                topClient = name;
            }
        });

        return {
            id: user.id,
            jellyfinUserId: user.jellyfinUserId,
            username: user.username || tc('deletedUser'),
            totalHours: parseFloat((totalSeconds / 3600).toFixed(1)),
            sessionsCount: user.playbackHistory.filter(s => !isZapped(s)).length,
            lastActive: lastActive,
            favoriteClient: topClient
        };
    }).sort((a, b) => b.totalHours - a.totalHours); // Trier par temps de visionnage global

    return (
        <div className="flex-col md:flex">
            <div className="flex-1 space-y-4 md:space-y-6 p-4 md:p-8 pt-4 md:pt-6 max-w-[1200px] mx-auto w-full">
                <div className="flex items-center justify-between space-y-2 mb-6">
                    <div>
                        <h2 className="text-2xl md:text-3xl font-bold tracking-tight">{t('title')}</h2>
                        <p className="text-muted-foreground text-sm mt-1">
                            {t('description')}
                        </p>
                    </div>
                </div>

                <Card className="app-surface">
                    <CardHeader>
                        <CardTitle>{t('leaderboard')}</CardTitle>
                        <CardDescription>
                            {t('leaderboardDesc')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {userStats.length === 0 ? (
                            <div className="text-center py-10 text-muted-foreground">
                                {t('noUsers')}
                            </div>
                        ) : (
                            <div className="app-surface-soft rounded-md border border-zinc-200/50 dark:border-zinc-700/50 overflow-x-auto">
                                <Table className="min-w-[700px]">
                                    <TableHeader className="app-field">
                                        <TableRow className="border-zinc-200 dark:border-zinc-800">
                                            <TableHead className="w-[80px]">{t('colRank')}</TableHead>
                                            <TableHead>{t('colUser')}</TableHead>
                                            <TableHead>{t('colTotalTime')}</TableHead>
                                            <TableHead>{t('colFavPlatform')}</TableHead>
                                            <TableHead>{t('colLastActive')}</TableHead>
                                            <TableHead className="text-right">{t('colSessions')}</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {userStats.map((stat, index) => {
                                            const rankColor = 
                                                index === 0 ? "text-yellow-500 font-bold text-lg" :
                                                index === 1 ? "text-slate-300 font-bold" :
                                                index === 2 ? "text-amber-700 font-bold" : 
                                                "text-muted-foreground";

                                            return (
                                                <TableRow key={stat.id} className="border-zinc-200/50 dark:border-zinc-700/50 hover:bg-zinc-100/50 dark:hover:bg-slate-800/50 transition-colors">
                                                    <TableCell className={rankColor}>#{index + 1}</TableCell>
                                                    <TableCell className="font-medium">
                                                        <Link 
                                                            href={`/users/${stat.jellyfinUserId}`} 
                                                            className="hover:text-primary transition-colors flex items-center gap-2"
                                                        >
                                                            {stat.username}
                                                        </Link>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-1.5 font-semibold text-emerald-400">
                                                            <Clock className="w-4 h-4" />
                                                            {stat.totalHours} h
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground">
                                                        <div className="flex items-center gap-1.5">
                                                            <Monitor className="w-4 h-4 opacity-70" />
                                                            {stat.favoriteClient}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-zinc-300 text-sm">
                                                        {stat.lastActive 
                                                            ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(stat.lastActive)
                                                            : t('never')
                                                        }
                                                    </TableCell>
                                                    <TableCell className="text-right font-medium text-zinc-300">
                                                        {stat.sessionsCount}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
