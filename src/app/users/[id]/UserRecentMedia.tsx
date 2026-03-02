import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import prisma from "@/lib/prisma";
import { getJellyfinImageUrl } from "@/lib/jellyfin";
import { FallbackImage } from "@/components/FallbackImage";
import { getTranslations, getLocale } from 'next-intl/server';

export default async function UserRecentMedia({ userId }: { userId: string }) {
    const t = await getTranslations('userProfile');
    const locale = await getLocale();

    const user = await prisma.user.findUnique({
        where: { jellyfinUserId: userId },
        include: {
            playbackHistory: {
                include: { media: true },
                orderBy: { startedAt: "desc" },
            },
        },
    });

    if (!user || user.playbackHistory.length === 0) {
        return (
            <Card className="bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm mt-6">
                <CardHeader>
                    <CardTitle>{t('playbackHistory')}</CardTitle>
                    <CardDescription>{t('noHistory')}</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    const groupedHistory = new Map<string, any>();

    user.playbackHistory.forEach((session: any) => {
        const mId = session.mediaId;
        if (!groupedHistory.has(mId)) {
            groupedHistory.set(mId, {
                ...session,
                totalDurationWatched: session.durationWatched,
                lastSessionAt: session.startedAt,
                playCount: 1,
            });
        } else {
            const existing = groupedHistory.get(mId);
            existing.totalDurationWatched += session.durationWatched;
            existing.playCount += 1;
            if (new Date(session.startedAt) > new Date(existing.lastSessionAt)) {
                existing.lastSessionAt = session.startedAt;
                existing.playMethod = session.playMethod;
                existing.deviceName = session.deviceName;
                existing.clientName = session.clientName;
                existing.ipAddress = session.ipAddress;
            }
        }
    });

    const uniqueHistory = Array.from(groupedHistory.values())
        .sort((a, b) => new Date(b.lastSessionAt).getTime() - new Date(a.lastSessionAt).getTime())
        .slice(0, 50); // Maintien perfs: on affiche les 50 derniers max de l'historique agrégé pour cette page

    return (
        <Card className="bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm mt-6">
            <CardHeader>
                <CardTitle>{t('playbackHistory')}</CardTitle>
                <CardDescription>{t('aggregatedDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t('colMedia')}</TableHead>
                                <TableHead>{t('colDate')}</TableHead>
                                <TableHead>{t('colDuration')}</TableHead>
                                <TableHead>{t('colClient')}</TableHead>
                                <TableHead>{t('colDevice')}</TableHead>
                                <TableHead>{t('colIp')}</TableHead>
                                <TableHead>{t('colMethod')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {uniqueHistory.map((session: any) => {
                                const minutes = Math.floor(session.totalDurationWatched / 60);
                                const dateFormat = new Intl.DateTimeFormat(locale, {
                                    dateStyle: "medium",
                                    timeStyle: "short",
                                }).format(new Date(session.lastSessionAt));

                                const isTranscode = session.playMethod?.toLowerCase().includes("transcode");

                                let progress = 0;
                                if (session.media?.durationMs) {
                                    const mediaSec = Number(session.media.durationMs) / 1000;
                                    if (mediaSec > 0) {
                                        progress = Math.min(100, Math.round((session.totalDurationWatched / mediaSec) * 100));
                                    }
                                }

                                return (
                                    <TableRow key={session.id} className="even:bg-zinc-900/30 hover:bg-zinc-800/50 border-zinc-800/50 transition-colors">
                                        <TableCell className="font-medium">
                                            <div className="flex items-center gap-3">
                                                <div className="relative w-12 aspect-[2/3] bg-muted rounded shrink-0 overflow-hidden ring-1 ring-white/10">
                                                    <FallbackImage
                                                        src={getJellyfinImageUrl(session.media.jellyfinMediaId, 'Primary')}
                                                        alt={session.media.title}
                                                        fill
                                                        className="object-cover"
                                                    />
                                                </div>
                                                <div>
                                                    {session.media.title}
                                                    <div className="text-xs text-muted-foreground hidden sm:block">
                                                        {session.media.type}
                                                    </div>
                                                    {progress > 0 && (
                                                        <div className="w-full h-1.5 bg-zinc-800 rounded-full mt-1.5 overflow-hidden">
                                                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${progress}%` }} />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-sm border-l border-zinc-900/50">
                                            <div className="flex flex-col">
                                                <span>{dateFormat}</span>
                                                <span className="text-xs text-muted-foreground">{session.playCount} session(s)</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="border-l border-zinc-900/50">{minutes} min</TableCell>
                                        <TableCell className="text-sm border-l border-zinc-900/50">
                                            <span className="truncate max-w-[120px] inline-block">
                                                {session.clientName || "N/A"}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-sm border-l border-zinc-900/50">
                                            <span className="truncate max-w-[120px] inline-block">
                                                {session.deviceName || "N/A"}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-sm border-l border-zinc-900/50">
                                            <span className="truncate max-w-[130px] inline-block font-mono text-xs text-zinc-400">
                                                {session.ipAddress || "—"}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={isTranscode ? "destructive" : "default"} className={`shadow-sm ${isTranscode ? 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20' : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'}`}>
                                                {session.playMethod || "DirectPlay"}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}
