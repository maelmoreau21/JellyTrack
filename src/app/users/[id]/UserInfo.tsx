import { Clock, Monitor, Smartphone, PlayCircle, Hash, Film, Calendar, Zap, Trophy, Percent, Layers } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import prisma from "@/lib/prisma";
import { getTranslations } from 'next-intl/server';
import { getCompletionMetrics } from "@/lib/mediaPolicy";
import { loadLibraryRules } from "@/lib/libraryRules";

export default async function UserInfo({ userId }: { userId: string }) {
    const user = await prisma.user.findUnique({
        where: { jellyfinUserId: userId },
        include: {
            playbackHistory: {
                select: {
                    durationWatched: true,
                    clientName: true,
                    deviceName: true,
                    startedAt: true,
                    media: {
                        select: { genres: true, type: true, durationMs: true, title: true, jellyfinMediaId: true }
                    }
                },
                orderBy: { startedAt: 'asc' },
            }
        }
    });

    if (!user) return null;

    const t = await getTranslations('userProfile');
    const rules = await loadLibraryRules();

    const clientCounts = new Map<string, number>();
    const deviceCounts = new Map<string, number>();
    const genreCounts = new Map<string, number>();
    const formatCounts = new Map<string, number>();
    const dayOfWeekCounts = new Map<number, number>();
    const hourCounts = new Map<number, number>();
    const mediaCounts = new Map<string, { title: string; id: string; seconds: number; count: number }>();
    const uniqueDates = new Set<string>();

    let totalSeconds = 0;
    let totalCompletions = 0;
    let completionCount = 0;
    let firstWatched: Date | null = null;

    user.playbackHistory.forEach((session: any) => {
        totalSeconds += session.durationWatched;
        if (session.clientName) clientCounts.set(session.clientName, (clientCounts.get(session.clientName) || 0) + 1);
        if (session.deviceName) deviceCounts.set(session.deviceName, (deviceCounts.get(session.deviceName) || 0) + 1);

        const date = new Date(session.startedAt);
        if (!firstWatched) firstWatched = date;

        // Day of week / hour tracking
        dayOfWeekCounts.set(date.getDay(), (dayOfWeekCounts.get(date.getDay()) || 0) + 1);
        hourCounts.set(date.getHours(), (hourCounts.get(date.getHours()) || 0) + 1);

        // Unique dates for streak
        const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        uniqueDates.add(dateKey);

        if (session.media?.genres) {
            session.media.genres.forEach((g: string) => {
                genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
            });
        }
        if (session.media?.type) {
            formatCounts.set(session.media.type, (formatCounts.get(session.media.type) || 0) + 1);
        }

        // Most watched media
        if (session.media?.jellyfinMediaId) {
            const mid = session.media.jellyfinMediaId;
            if (!mediaCounts.has(mid)) {
                mediaCounts.set(mid, { title: session.media.title, id: mid, seconds: 0, count: 0 });
            }
            const m = mediaCounts.get(mid)!;
            m.seconds += session.durationWatched;
            m.count += 1;
        }

        // Completion rate
        if (session.media?.durationMs) {
            const completion = getCompletionMetrics(session.media, session.durationWatched, rules);
            totalCompletions += completion.percent;
            completionCount++;
        }
    });

    const sessionCount = user.playbackHistory.length;
    const totalHours = parseFloat((totalSeconds / 3600).toFixed(1));
    const avgSessionMin = sessionCount > 0 ? Math.round(totalSeconds / sessionCount / 60) : 0;
    const avgCompletion = completionCount > 0 ? Math.round(totalCompletions / completionCount) : 0;

    const getTopItem = (map: Map<string, number>) => {
        if (map.size === 0) return "N/A";
        let topEntry = ["", 0];
        map.forEach((count, name) => {
            if (count > (topEntry[1] as number)) topEntry = [name, count];
        });
        return topEntry[0];
    };

    const getTop3Items = (map: Map<string, number>) => {
        return Array.from(map.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(entry => entry[0])
            .join(", ") || "N/A";
    };

    const topClient = getTopItem(clientCounts);
    const topDevice = getTopItem(deviceCounts);
    const topGenres = getTop3Items(genreCounts);
    const topFormat = getTopItem(formatCounts);

    // Peak day of week
    const dayNames = t('dayNames').split(',');
    let peakDay = "N/A";
    let peakDayCount = 0;
    dayOfWeekCounts.forEach((count, day) => {
        if (count > peakDayCount) { peakDayCount = count; peakDay = dayNames[day] || `${day}`; }
    });

    // Peak hour
    let peakHour = 0;
    let peakHourCount = 0;
    hourCounts.forEach((count, hour) => {
        if (count > peakHourCount) { peakHourCount = count; peakHour = hour; }
    });

    // Most watched
    const topMedia = Array.from(mediaCounts.values()).sort((a, b) => b.seconds - a.seconds)[0] || null;

    // Unique content count by type
    const uniqueMovies = new Set<string>();
    const uniqueSeries = new Set<string>();
    const uniqueMusic = new Set<string>();
    user.playbackHistory.forEach((session: any) => {
        if (session.media?.type === 'Movie') uniqueMovies.add(session.media.jellyfinMediaId);
        else if (session.media?.type === 'Episode') uniqueSeries.add(session.media.jellyfinMediaId);
        else if (session.media?.type === 'Audio') uniqueMusic.add(session.media.jellyfinMediaId);
    });

    // Calculate max streak (consecutive days)
    const sortedDates = Array.from(uniqueDates).map(d => {
        const [y, m, day] = d.split('-').map(Number);
        return new Date(y, m, day).getTime();
    }).sort((a, b) => a - b);
    let maxStreak = 0;
    let currentStreak = 1;
    for (let i = 1; i < sortedDates.length; i++) {
        const diff = (sortedDates[i] - sortedDates[i - 1]) / (1000 * 60 * 60 * 24);
        if (diff <= 1) currentStreak++;
        else currentStreak = 1;
        if (currentStreak > maxStreak) maxStreak = currentStreak;
    }
    if (sortedDates.length === 1) maxStreak = 1;

    return (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            <Card className="bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('playTime')}</CardTitle>
                    <Clock className="h-4 w-4 text-orange-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{totalHours}h</div>
                    <p className="text-xs text-muted-foreground">{t('cumulTotal')}</p>
                </CardContent>
            </Card>

            <Card className="bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('sessions')}</CardTitle>
                    <Hash className="h-4 w-4 text-emerald-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{sessionCount}</div>
                    <p className="text-xs text-muted-foreground">{t('avgPerSession', { min: avgSessionMin })}</p>
                </CardContent>
            </Card>

            <Card className="bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('topGenres')}</CardTitle>
                    <PlayCircle className="h-4 w-4 text-pink-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-lg font-bold truncate">{topGenres}</div>
                    <p className="text-xs text-muted-foreground">{t('mainPreferences')}</p>
                </CardContent>
            </Card>

            <Card className="bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('completionRate')}</CardTitle>
                    <Percent className="h-4 w-4 text-cyan-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{avgCompletion}%</div>
                    <p className="text-xs text-muted-foreground">{t('avgCompletion')}</p>
                </CardContent>
            </Card>

            <Card className="bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('peakActivity')}</CardTitle>
                    <Zap className="h-4 w-4 text-yellow-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-lg font-bold">{peakDay} · {peakHour}h</div>
                    <p className="text-xs text-muted-foreground">{t('mostActiveTime')}</p>
                </CardContent>
            </Card>

            <Card className="bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('bestStreak')}</CardTitle>
                    <Calendar className="h-4 w-4 text-red-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{maxStreak} {t('days')}</div>
                    <p className="text-xs text-muted-foreground">{t('consecutiveDays')}</p>
                </CardContent>
            </Card>

            <Card className="bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('uniqueContent')}</CardTitle>
                    <Layers className="h-4 w-4 text-teal-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-lg font-bold">{uniqueMovies.size + uniqueSeries.size + uniqueMusic.size}</div>
                    <p className="text-xs text-muted-foreground">🎬 {uniqueMovies.size} · 📺 {uniqueSeries.size} · 🎵 {uniqueMusic.size}</p>
                </CardContent>
            </Card>

            <Card className="bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('favFormat')}</CardTitle>
                    <Film className="h-4 w-4 text-indigo-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-xl font-bold truncate">{topFormat}</div>
                    <p className="text-xs text-muted-foreground">{t('mainMediaType')}</p>
                </CardContent>
            </Card>

            {topMedia && (
                <Card className="bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm col-span-2">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{t('mostWatched')}</CardTitle>
                        <Trophy className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-lg font-bold truncate">{topMedia.title}</div>
                        <p className="text-xs text-muted-foreground">{topMedia.count} sessions · {Math.round(topMedia.seconds / 60)} min</p>
                    </CardContent>
                </Card>
            )}

            <Card className="bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('favClient')}</CardTitle>
                    <Monitor className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-xl font-bold truncate">{topClient}</div>
                    <p className="text-xs text-muted-foreground">{t('mostUsedApp')}</p>
                </CardContent>
            </Card>

            <Card className="bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('favDevice')}</CardTitle>
                    <Smartphone className="h-4 w-4 text-purple-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-xl font-bold truncate">{topDevice}</div>
                    <p className="text-xs text-muted-foreground">{t('mostUsedPlatform')}</p>
                </CardContent>
            </Card>
        </div>
    );
}
