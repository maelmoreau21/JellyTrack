import prisma from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { unstable_cache } from "next/cache";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StandardAreaChart, StandardBarChart, StandardPieChart } from "@/components/charts/StandardMetricsCharts";
import { TranscodeHourlyChart } from "@/components/charts/TranscodeHourlyChart";
import { getTranslations } from 'next-intl/server';
import { normalizeResolution } from '@/lib/utils';

const getNetworkData = unstable_cache(
    async (type: string | undefined, timeRange: string, excludedLibraries: string[]) => {
        let currentStartDate = new Date();
        if (timeRange === "24h") currentStartDate.setDate(currentStartDate.getDate() - 1);
        else if (timeRange === "7d") currentStartDate.setDate(currentStartDate.getDate() - 7);
        else if (timeRange === "30d") currentStartDate.setDate(currentStartDate.getDate() - 30);
        else currentStartDate = new Date(0);

        const history = await prisma.playbackHistory.findMany({
            where: { startedAt: { gte: currentStartDate } },
            select: {
                id: true,
                playMethod: true,
                clientName: true,
                deviceName: true,
                audioCodec: true,
                subtitleLanguage: true,
                subtitleCodec: true,
                startedAt: true,
                durationWatched: true,
                media: { select: { title: true, type: true, resolution: true } }
            },
            orderBy: { startedAt: 'asc' }
        });

        // --- 1. DirectPlay vs Transcode by Hour (AreaChart) ---
        const hourlyMethodMap = new Map<string, { time: string; DirectPlay: number; Transcode: number; DirectStream: number }>();
        for (let i = 0; i < 24; i++) {
            const h = i.toString().padStart(2, '0') + "h";
            hourlyMethodMap.set(h, { time: h, DirectPlay: 0, Transcode: 0, DirectStream: 0 });
        }

        // --- 2. Stats globales ---
        let totalSessions = 0;
        let transcodeSessions = 0;
        let directPlaySessions = 0;
        let directStreamSessions = 0;
        let totalTranscodeDuration = 0;

        // --- 3. "Coupable" table: most transcoded media with probable reasons ---
        const transcodedMediaMap = new Map<string, {
            title: string;
            resolution: string;
            count: number;
            totalDuration: number;
            reasons: Map<string, number>;
            clients: Map<string, number>;
        }>();

        // --- 4. Transcode by client ---
        const clientTranscodeMap = new Map<string, { total: number; transcode: number }>();

        history.forEach(h => {
            if (!h.media) return;
            totalSessions++;

            const method = h.playMethod?.toLowerCase() || "directplay";
            const hourKey = new Date(h.startedAt).getHours().toString().padStart(2, '0') + "h";
            const hourEntry = hourlyMethodMap.get(hourKey);

            const clientName = h.clientName || "?";

            // Track client transcode stats
            if (!clientTranscodeMap.has(clientName)) clientTranscodeMap.set(clientName, { total: 0, transcode: 0 });
            clientTranscodeMap.get(clientName)!.total++;

            if (method.includes("transcode")) {
                transcodeSessions++;
                totalTranscodeDuration += h.durationWatched;
                if (hourEntry) hourEntry.Transcode++;
                clientTranscodeMap.get(clientName)!.transcode++;

                // Infer transcode reasons
                const reasons: string[] = [];
                if (h.subtitleLanguage && h.subtitleCodec) {
                    // Subtitle burn-in is a very common transcode cause
                    const burninCodecs = ['ass', 'ssa', 'pgssub', 'dvdsub', 'dvbsub', 'pgs'];
                    if (burninCodecs.includes(h.subtitleCodec.toLowerCase())) {
                        reasons.push("subtitlesBurnIn");
                    } else {
                        reasons.push("subtitlesActive");
                    }
                }
                if (h.audioCodec) {
                    const heavyAudioCodecs = ['truehd', 'dts', 'dts-hd', 'eac3', 'flac'];
                    if (heavyAudioCodecs.some(c => h.audioCodec!.toLowerCase().includes(c))) {
                        reasons.push("audioHDNotSupported");
                    }
                }
                const normalizedRes = normalizeResolution(h.media?.resolution);
                if (normalizedRes === "4K") {
                    reasons.push("resolution4K");
                }
                if (reasons.length === 0) {
                    reasons.push("clientCompat");
                }

                // Aggregate by media title
                const mediaKey = h.media.title;
                if (!transcodedMediaMap.has(mediaKey)) {
                    transcodedMediaMap.set(mediaKey, {
                        title: mediaKey,
                        resolution: normalizeResolution(h.media?.resolution) || "?",
                        count: 0,
                        totalDuration: 0,
                        reasons: new Map(),
                        clients: new Map()
                    });
                }
                const entry = transcodedMediaMap.get(mediaKey)!;
                entry.count++;
                entry.totalDuration += h.durationWatched;
                reasons.forEach(r => entry.reasons.set(r, (entry.reasons.get(r) || 0) + 1));
                entry.clients.set(clientName, (entry.clients.get(clientName) || 0) + 1);

            } else if (method.includes("directstream")) {
                directStreamSessions++;
                if (hourEntry) hourEntry.DirectStream++;
            } else {
                directPlaySessions++;
                if (hourEntry) hourEntry.DirectPlay++;
            }
        });

        const hourlyData = Array.from(hourlyMethodMap.values());

        // Most transcoded media (top 10)
        const coupableTable = Array.from(transcodedMediaMap.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, 10)
            .map(m => ({
                title: m.title.length > 35 ? m.title.substring(0, 35) + "…" : m.title,
                fullTitle: m.title,
                resolution: m.resolution,
                count: m.count,
                durationMin: Math.round(m.totalDuration / 60),
                mainReason: Array.from(m.reasons.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "?",
                allReasons: Array.from(m.reasons.entries()).map(([r, c]) => `${r} (×${c})`),
                topClient: Array.from(m.clients.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "?"
            }));

        // Client transcode ratio (top 8)
        const clientTranscodeData = Array.from(clientTranscodeMap.entries())
            .filter(([_, v]) => v.total >= 2)
            .map(([name, v]) => ({
                name: name.length > 15 ? name.substring(0, 15) + "…" : name,
                fullName: name,
                total: v.total,
                transcodePercent: Math.round((v.transcode / v.total) * 100),
                transcodeCount: v.transcode,
            }))
            .sort((a, b) => b.transcodePercent - a.transcodePercent)
            .slice(0, 8);

        // Transcode method pie for overview
        const methodPie = [
            { name: "DirectPlay", value: directPlaySessions },
            { name: "Transcode", value: transcodeSessions },
            { name: "DirectStream", value: directStreamSessions },
        ].filter(m => m.value > 0);

        return {
            hourlyData,
            coupableTable,
            clientTranscodeData,
            methodPie,
            stats: {
                totalSessions,
                transcodeSessions,
                directPlaySessions,
                directStreamSessions,
                totalTranscodeDuration,
                transcodePercent: totalSessions > 0 ? Math.round((transcodeSessions / totalSessions) * 100) : 0,
            }
        };
    },
    ['JellyTrack-network-analysis-v1'],
    { revalidate: 300 }
);

export async function NetworkAnalysis({ type, timeRange, excludedLibraries }: { type?: string, timeRange: string, excludedLibraries: string[] }) {
    const data = await getNetworkData(type, timeRange, excludedLibraries);
    const t = await getTranslations('network');

    return (
        <div className="space-y-6">
            {/* Stats row */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50 backdrop-blur-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-zinc-400">{t('totalSessions')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{data.stats.totalSessions}</div>
                        <p className="text-xs text-emerald-500 font-medium mt-1">{data.stats.directPlaySessions} DirectPlay</p>
                    </CardContent>
                </Card>
                <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50 backdrop-blur-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-zinc-400">{t('transcodeRate')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-amber-500">{data.stats.transcodePercent}%</div>
                        <p className="text-xs text-muted-foreground mt-1">{data.stats.transcodeSessions} {t('transcodedSessions')}</p>
                    </CardContent>
                </Card>
                <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50 backdrop-blur-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-zinc-400">DirectStream</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-500">{data.stats.directStreamSessions}</div>
                        <p className="text-xs text-muted-foreground mt-1">{t('remuxed')}</p>
                    </CardContent>
                </Card>
                <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50 backdrop-blur-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-zinc-400">{t('transcodeDuration')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-500">{Math.round(data.stats.totalTranscodeDuration / 3600)}h</div>
                        <p className="text-xs text-muted-foreground mt-1">{t('transcodeDurationDesc')}</p>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Row */}
            <div className="grid gap-4 md:grid-cols-2">
                <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50 backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle>{t('directVsTranscodeByHour')}</CardTitle>
                        <CardDescription>{t('directVsTranscodeByHourDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <TranscodeHourlyChart data={data.hourlyData} />
                    </CardContent>
                </Card>

                <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50 backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle>{t('transcodeByClient')}</CardTitle>
                        <CardDescription>{t('transcodeByClientDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <StandardBarChart
                            data={data.clientTranscodeData}
                            dataKey="transcodePercent"
                            fill="#f97316"
                            name="% Transcoded"
                            horizontal
                            xAxisKey="name"
                        />
                    </CardContent>
                </Card>
            </div>

            {/* Coupable Table */}
            <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50 backdrop-blur-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        {t('mostTranscoded')}
                    </CardTitle>
                    <CardDescription>{t('mostTranscodedDesc')}</CardDescription>
                </CardHeader>
                <CardContent>
                    {data.coupableTable.length === 0 ? (
                        <p className="text-center text-sm text-muted-foreground py-8">{t('noTranscodedSessions')}</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[250px]">{t('colMedia')}</TableHead>
                                        <TableHead className="w-[80px]">{t('colResolution')}</TableHead>
                                        <TableHead className="w-[80px] text-center">{t('colSessions')}</TableHead>
                                        <TableHead className="w-[80px] text-center">{t('colDuration')}</TableHead>
                                        <TableHead className="w-[200px]">{t('colCause')}</TableHead>
                                        <TableHead className="w-[130px]">{t('colClient')}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.coupableTable.map((row, i) => (
                                        <TableRow key={i} className="even:bg-zinc-100/50 dark:even:bg-zinc-900/30 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 border-zinc-200/50 dark:border-zinc-800/50">
                                            <TableCell className="font-medium" title={row.fullTitle}>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-zinc-500 text-xs w-4">{i + 1}.</span>
                                                    <span className="truncate">{row.title}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={`text-xs ${
                                                    row.resolution === "4K" ? 'border-amber-500/30 text-amber-400' :
                                                    row.resolution === "1080p" ? 'border-blue-500/30 text-blue-400' :
                                                    'border-zinc-600 text-zinc-400'
                                                }`}>
                                                    {row.resolution}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-center font-semibold text-amber-500">{row.count}</TableCell>
                                            <TableCell className="text-center text-sm">{row.durationMin} min</TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap gap-1">
                                                    <Badge className="bg-red-500/10 text-red-400 hover:bg-red-500/20 text-[11px]">
                                                        {t.has(row.mainReason) ? t(row.mainReason) : row.mainReason}
                                                    </Badge>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-sm font-medium text-zinc-300" title={row.topClient}>{row.topClient}</span>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
