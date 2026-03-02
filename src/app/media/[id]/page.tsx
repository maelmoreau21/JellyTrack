import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import { getJellyfinImageUrl } from "@/lib/jellyfin";
import { FallbackImage } from "@/components/FallbackImage";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Clock, Eye, Timer, ArrowLeft, ChevronRight, Pause, Languages, Headphones, Tv, Music, Disc3, Play, Film, ListMusic, Activity } from "lucide-react";
import Link from "next/link";
import MediaDropoffChart from "./MediaDropoffChart";
import TelemetryChart from "./TelemetryChart";
import MediaTimelineChart from "./MediaTimelineChart";
import type { TimelineEvent, SessionTimeline } from "./MediaTimelineChart";
import { getTranslations, getLocale } from 'next-intl/server';

export const dynamic = "force-dynamic";

interface MediaProfilePageProps {
    params: Promise<{ id: string }>;
}

export default async function MediaProfilePage({ params }: MediaProfilePageProps) {
    const { id } = await params;

    const media = await prisma.media.findUnique({
        where: { jellyfinMediaId: id },
        include: {
            playbackHistory: {
                include: { user: true },
                orderBy: { startedAt: "desc" },
            },
        },
    });

    if (!media) notFound();

    const t = await getTranslations('mediaProfile');
    const tc = await getTranslations('common');
    const locale = await getLocale();

    // Fetch metadata from Jellyfin API
    let overview = "";
    let communityRating: number | null = null;
    let productionYear: number | null = null;
    let seriesId: string | null = null;
    let seriesName: string | null = null;
    let seasonId: string | null = null;
    let seasonName: string | null = null;
    let albumId: string | null = null;
    let albumName: string | null = null;
    let albumArtist: string | null = null;

    try {
        const jellyfinUrl = process.env.JELLYFIN_URL;
        const jellyfinApiKey = process.env.JELLYFIN_API_KEY;
        if (jellyfinUrl && jellyfinApiKey) {
            const res = await fetch(
                `${jellyfinUrl}/Items/${encodeURIComponent(id)}`,
                {
                    headers: {
                        "X-Emby-Token": jellyfinApiKey,
                    },
                    next: { revalidate: 86400 },
                }
            );
            if (res.ok) {
                const data = await res.json();
                overview = data.Overview || "";
                communityRating = data.CommunityRating || null;
                productionYear = data.ProductionYear || null;
                seriesId = data.SeriesId || null;
                seriesName = data.SeriesName || null;
                seasonId = data.SeasonId || null;
                seasonName = data.SeasonName || null;
                albumId = data.AlbumId || null;
                albumName = data.Album || null;
                albumArtist = data.AlbumArtist || (data.AlbumArtists?.[0]?.Name || data.AlbumArtists?.[0] || null);
            }
        }
    } catch (err) {
        console.error("[Media Profile] Erreur récupération métadonnées Jellyfin:", err);
    }

    // Fetch children items (Seasons for Series, Episodes for Season, Tracks for MusicAlbum)
    const isParentType = ['Series', 'Season', 'MusicAlbum'].includes(media.type);
    let children: { jellyfinMediaId: string; title: string; type: string; resolution: string | null; durationMs: bigint | null; _count: number; _totalDuration: number }[] = [];
    if (isParentType) {
        const childMedia = await prisma.media.findMany({
            where: { parentId: media.jellyfinMediaId },
            include: {
                playbackHistory: {
                    select: { durationWatched: true },
                },
            },
            orderBy: { title: 'asc' },
        });
        children = childMedia.map(c => ({
            jellyfinMediaId: c.jellyfinMediaId,
            title: c.title,
            type: c.type,
            resolution: c.resolution,
            durationMs: c.durationMs,
            _count: c.playbackHistory.length,
            _totalDuration: c.playbackHistory.reduce((acc, h) => acc + h.durationWatched, 0),
        }));
    }

    // Global stats (include children's playback for parent items like Series/Season/Album)
    let totalViews = media.playbackHistory.length;
    let totalSeconds = media.playbackHistory.reduce((acc: number, h: any) => acc + h.durationWatched, 0);

    // For parent items, also aggregate stats from children
    if (isParentType && children.length > 0) {
        const childViews = children.reduce((acc, c) => acc + c._count, 0);
        const childSeconds = children.reduce((acc, c) => acc + c._totalDuration, 0);
        totalViews += childViews;
        totalSeconds += childSeconds;
    }

    const totalHours = parseFloat((totalSeconds / 3600).toFixed(1));
    const avgMinutes = totalViews > 0 ? Math.round(totalSeconds / totalViews / 60) : 0;

    // Telemetry aggregates
    const totalPauses = media.playbackHistory.reduce((acc: number, h: any) => acc + (h.pauseCount || 0), 0);
    const totalAudioChanges = media.playbackHistory.reduce((acc: number, h: any) => acc + (h.audioChanges || 0), 0);
    const totalSubChanges = media.playbackHistory.reduce((acc: number, h: any) => acc + (h.subtitleChanges || 0), 0);

    // Drop-off buckets
    const mediaDurationSeconds = media.durationMs ? Number(media.durationMs) / 1000 : null;
    const dropoffBuckets = Array.from({ length: 10 }, (_, i) => ({
        range: `${i * 10}-${(i + 1) * 10}%`,
        count: 0,
    }));
    if (mediaDurationSeconds && mediaDurationSeconds > 0) {
        media.playbackHistory.forEach((h: any) => {
            const pct = Math.min((h.durationWatched / mediaDurationSeconds) * 100, 100);
            const bucket = Math.min(Math.floor(pct / 10), 9);
            dropoffBuckets[bucket].count++;
        });
    }

    // Telemetry timeline: group pauses, audio & subtitle changes per session date
    const telemetryMap = new Map<string, { pauses: number; audioChanges: number; subtitleChanges: number }>();
    media.playbackHistory.forEach((h: any) => {
        const dateKey = new Date(h.startedAt).toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });
        const entry = telemetryMap.get(dateKey) || { pauses: 0, audioChanges: 0, subtitleChanges: 0 };
        entry.pauses += h.pauseCount || 0;
        entry.audioChanges += h.audioChanges || 0;
        entry.subtitleChanges += h.subtitleChanges || 0;
        telemetryMap.set(dateKey, entry);
    });
    const telemetryData = Array.from(telemetryMap.entries()).map(([date, v]) => ({ date, ...v }));
    const hasTelemetry = telemetryData.some(d => d.pauses > 0 || d.audioChanges > 0 || d.subtitleChanges > 0);

    // Fetch positional telemetry events for timeline chart
    const playbackIds = media.playbackHistory.map((h: any) => h.id);
    let timelineEvents: TimelineEvent[] = [];
    let sessionTimelines: SessionTimeline[] = [];
    if (playbackIds.length > 0 && mediaDurationSeconds && mediaDurationSeconds > 0) {
        const rawEvents = await prisma.telemetryEvent.findMany({
            where: { playbackId: { in: playbackIds } },
            select: { eventType: true, positionMs: true, playbackId: true },
        });
        // Aggregate by eventType + position bucket (each bucket = 1% of duration)
        const durationMs = mediaDurationSeconds * 1000;
        const bucketCount = 50;
        const bucketSize = durationMs / bucketCount;
        const aggMap = new Map<string, number>();
        for (const e of rawEvents) {
            const pos = Number(e.positionMs);
            const idx = Math.min(Math.floor(pos / bucketSize), bucketCount - 1);
            const key = `${e.eventType}:${idx}`;
            aggMap.set(key, (aggMap.get(key) || 0) + 1);
        }
        timelineEvents = Array.from(aggMap.entries()).map(([key, count]) => {
            const [eventType, idxStr] = key.split(":");
            const idx = parseInt(idxStr);
            return {
                eventType: eventType as TimelineEvent["eventType"],
                positionMs: Math.round((idx + 0.5) * bucketSize),
                count,
            };
        });

        // Build per-session timelines for detail view
        const eventsByPlayback = new Map<string, { eventType: string; positionMs: number }[]>();
        for (const e of rawEvents) {
            const list = eventsByPlayback.get(e.playbackId) || [];
            list.push({ eventType: e.eventType, positionMs: Number(e.positionMs) });
            eventsByPlayback.set(e.playbackId, list);
        }
        sessionTimelines = media.playbackHistory
            .filter((h: any) => eventsByPlayback.has(h.id))
            .map((h: any) => ({
                id: h.id,
                username: h.user?.username || "?",
                jellyfinUserId: h.user?.jellyfinUserId || "",
                durationWatched: h.durationWatched,
                startedAt: h.startedAt.toISOString(),
                events: (eventsByPlayback.get(h.id) || []).sort((a, b) => a.positionMs - b.positionMs),
            }));
    }
    const hasTimelineEvents = timelineEvents.length > 0;

    // Unique users who watched this
    const userMap = new Map<string, { username: string; jellyfinUserId: string; sessions: number; totalSeconds: number }>();
    media.playbackHistory.forEach((h: any) => {
        if (!h.user) return;
        const uid = h.user.jellyfinUserId;
        if (!userMap.has(uid)) {
            userMap.set(uid, { username: h.user.username || tc('deletedUser'), jellyfinUserId: uid, sessions: 0, totalSeconds: 0 });
        }
        const entry = userMap.get(uid)!;
        entry.sessions++;
        entry.totalSeconds += h.durationWatched;
    });
    const userList = Array.from(userMap.values()).sort((a, b) => b.totalSeconds - a.totalSeconds);

    // Audio & subtitle language distribution
    const audioLangCounts = new Map<string, number>();
    const subtitleLangCounts = new Map<string, number>();
    media.playbackHistory.forEach((h: any) => {
        if (h.audioLanguage) {
            const key = `${h.audioLanguage}${h.audioCodec ? ` (${h.audioCodec})` : ""}`;
            audioLangCounts.set(key, (audioLangCounts.get(key) || 0) + 1);
        }
        if (h.subtitleLanguage) {
            const key = `${h.subtitleLanguage}${h.subtitleCodec ? ` (${h.subtitleCodec})` : ""}`;
            subtitleLangCounts.set(key, (subtitleLangCounts.get(key) || 0) + 1);
        }
    });
    const audioLangs = Array.from(audioLangCounts.entries()).sort((a, b) => b[1] - a[1]);
    const subtitleLangs = Array.from(subtitleLangCounts.entries()).sort((a, b) => b[1] - a[1]);

    const genres = media.genres || [];
    const isMusic = ['Audio', 'MusicAlbum'].includes(media.type);

    return (
        <div className="flex-col md:flex">
            <div className="flex-1 space-y-6 p-8 pt-6 max-w-[1400px] mx-auto w-full">
                {/* Breadcrumb */}
                <nav className="flex items-center gap-1.5 text-sm text-zinc-400 flex-wrap">
                    <Link href="/media" className="flex items-center gap-1 hover:text-white transition-colors">
                        <ArrowLeft className="w-4 h-4" /> {t('library')}
                    </Link>
                    {seriesId && seriesName && (
                        <><ChevronRight className="w-3.5 h-3.5 text-zinc-600" /><Link href={`/media/${seriesId}`} className="hover:text-white transition-colors">{seriesName}</Link></>
                    )}
                    {seasonId && seasonName && (
                        <><ChevronRight className="w-3.5 h-3.5 text-zinc-600" /><Link href={`/media/${seasonId}`} className="hover:text-white transition-colors">{seasonName}</Link></>
                    )}
                    {albumArtist && (
                        <><ChevronRight className="w-3.5 h-3.5 text-zinc-600" /><span className="text-zinc-300">{albumArtist}</span></>
                    )}
                    {albumId && albumName && (
                        <><ChevronRight className="w-3.5 h-3.5 text-zinc-600" /><Link href={`/media/${albumId}`} className="hover:text-white transition-colors">{albumName}</Link></>
                    )}
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
                    <span className="text-white font-medium truncate max-w-xs">{media.title}</span>
                </nav>

                {/* Quick navigation for Episodes / Audio tracks */}
                {(seriesId || seasonId || albumId) && (
                    <div className="flex items-center gap-2 flex-wrap">
                        {seriesId && seriesName && (
                            <Link href={`/media/${seriesId}`} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/20 transition-colors text-sm font-medium">
                                <Tv className="w-4 h-4" /> {t('viewSeries', { name: seriesName })}
                            </Link>
                        )}
                        {seasonId && seasonName && (
                            <Link href={`/media/${seasonId}`} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-500/10 border border-violet-500/30 text-violet-400 hover:bg-violet-500/20 transition-colors text-sm font-medium">
                                <Disc3 className="w-4 h-4" /> {seasonName}
                            </Link>
                        )}
                        {albumId && albumName && (
                            <Link href={`/media/${albumId}`} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-400 hover:bg-purple-500/20 transition-colors text-sm font-medium">
                                <Music className="w-4 h-4" /> {t('viewAlbum', { name: albumName })}
                            </Link>
                        )}
                    </div>
                )}

                {/* Header */}
                <div className="flex flex-col md:flex-row gap-8">
                    <div className="relative w-48 aspect-[2/3] bg-zinc-900 rounded-lg overflow-hidden ring-1 ring-white/10 shadow-xl shrink-0">
                        <FallbackImage src={getJellyfinImageUrl(media.jellyfinMediaId, "Primary", media.parentId || undefined)} alt={media.title} fill className="object-cover" />
                    </div>
                    <div className="flex-1 space-y-4">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight">{media.title}</h1>
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                                <Badge variant="outline">{media.type}</Badge>
                                {media.resolution && <Badge variant="secondary">{media.resolution}</Badge>}
                                {mediaDurationSeconds && <Badge variant="secondary" className="bg-zinc-800 text-zinc-300">{Math.floor(mediaDurationSeconds / 60)} min</Badge>}
                                {productionYear && <Badge variant="secondary" className="bg-zinc-800 text-zinc-300">{productionYear}</Badge>}
                                {communityRating && <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30">★ {communityRating.toFixed(1)}</Badge>}
                            </div>
                            {genres.length > 0 && (
                                <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                                    {genres.map((g: string) => (<span key={g} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">{g}</span>))}
                                </div>
                            )}
                        </div>
                        {overview && <p className="text-sm text-zinc-400 leading-relaxed max-w-2xl line-clamp-5">{overview}</p>}
                    </div>
                </div>

                {/* KPI Cards */}
                <div className={`grid gap-4 grid-cols-2 ${isMusic ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>

                    {/* Children: Seasons / Episodes / Tracks */}
                    {children.length > 0 && (
                        <Card className="bg-zinc-900/50 border-zinc-800/50 col-span-full mb-2">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    {media.type === 'Series' ? <><Film className="w-5 h-5 text-indigo-400" /> {t('seasons', { count: children.length })}</> :
                                     media.type === 'Season' ? <><Play className="w-5 h-5 text-violet-400" /> {t('episodes', { count: children.length })}</> :
                                     <><ListMusic className="w-5 h-5 text-purple-400" /> {t('tracks', { count: children.length })}</>}
                                </CardTitle>
                                <CardDescription>
                                    {media.type === 'Series' ? t('seasonsDesc') :
                                     media.type === 'Season' ? t('episodesDesc') :
                                     t('tracksDesc')}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="border rounded-md overflow-x-auto border-zinc-800/50">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="border-zinc-800">
                                                <TableHead className="w-12">#</TableHead>
                                                <TableHead>{t('colTitle')}</TableHead>
                                                <TableHead className="text-center">{t('colType')}</TableHead>
                                                {media.type !== 'MusicAlbum' && <TableHead className="text-center">{t('colResolution')}</TableHead>}
                                                <TableHead className="text-center">{t('colSessions')}</TableHead>
                                                <TableHead className="text-right">{t('colTotalTime')}</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {children.map((child, idx) => (
                                                <TableRow key={child.jellyfinMediaId} className="border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                                                    <TableCell className="text-zinc-500 text-sm">{idx + 1}</TableCell>
                                                    <TableCell>
                                                        <Link
                                                            href={`/media/${child.jellyfinMediaId}`}
                                                            className="text-sm font-medium text-primary hover:underline flex items-center gap-2"
                                                        >
                                                            <div className="relative w-8 h-8 rounded overflow-hidden bg-zinc-800 shrink-0">
                                                                <FallbackImage
                                                                    src={getJellyfinImageUrl(child.jellyfinMediaId, "Primary", media.jellyfinMediaId)}
                                                                    alt={child.title}
                                                                    fill
                                                                    className="object-cover"
                                                                />
                                                            </div>
                                                            <span className="truncate max-w-xs">{child.title}</span>
                                                        </Link>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <Badge variant="outline" className="text-xs">{child.type}</Badge>
                                                    </TableCell>
                                                    {media.type !== 'MusicAlbum' && (
                                                        <TableCell className="text-center">
                                                            {child.resolution ? <Badge variant="secondary" className="text-xs">{child.resolution}</Badge> : <span className="text-zinc-500 text-xs">—</span>}
                                                        </TableCell>
                                                    )}
                                                    <TableCell className="text-center font-medium">
                                                        {child._count > 0 ? <span className="text-blue-400">{child._count}</span> : <span className="text-zinc-500">0</span>}
                                                    </TableCell>
                                                    <TableCell className="text-right whitespace-nowrap font-medium">
                                                        {child._totalDuration > 0
                                                            ? child._totalDuration >= 3600
                                                                ? `${(child._totalDuration / 3600).toFixed(1)}h`
                                                                : `${Math.round(child._totalDuration / 60)} min`
                                                            : <span className="text-zinc-500 text-xs">0 min</span>
                                                        }
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                    <Card className="bg-zinc-900/50 border-zinc-800/50">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">{t('totalTime')}</CardTitle><Clock className="h-4 w-4 text-orange-500" /></CardHeader>
                        <CardContent><div className="text-2xl font-bold">{totalHours}h</div><p className="text-xs text-muted-foreground mt-1">{t('cumulated')}</p></CardContent>
                    </Card>
                    <Card className="bg-zinc-900/50 border-zinc-800/50">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">{t('viewsTitle')}</CardTitle><Eye className="h-4 w-4 text-blue-500" /></CardHeader>
                        <CardContent><div className="text-2xl font-bold">{totalViews}</div><p className="text-xs text-muted-foreground mt-1">{t('uniqueSessions')}</p></CardContent>
                    </Card>
                    <Card className="bg-zinc-900/50 border-zinc-800/50">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">{t('avgDuration')}</CardTitle><Timer className="h-4 w-4 text-emerald-500" /></CardHeader>
                        <CardContent><div className="text-2xl font-bold">{avgMinutes} min</div><p className="text-xs text-muted-foreground mt-1">{t('perSession')}</p></CardContent>
                    </Card>
                    {isMusic && (
                        <Card className="bg-zinc-900/50 border-zinc-800/50">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">{t('pauses')}</CardTitle><Pause className="h-4 w-4 text-yellow-500" /></CardHeader>
                            <CardContent><div className="text-2xl font-bold">{totalPauses}</div><p className="text-xs text-muted-foreground mt-1">{t('total')}</p></CardContent>
                        </Card>
                    )}
                </div>

                {/* Telemetry Visual Summary (films/series only) */}
                {!isMusic && (
                    <Card className="bg-zinc-900/50 border-zinc-800/50">
                        <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="w-4 h-4" /> {t('telemetrySummary')}</CardTitle><CardDescription>{t('telemetryDesc')}</CardDescription></CardHeader>
                        <CardContent>
                            <div className="grid gap-4 md:grid-cols-3">
                                {[
                                    { label: t('pausesLabel'), value: totalPauses, color: 'bg-yellow-500', icon: <Pause className="h-4 w-4 text-yellow-500" /> },
                                    { label: t('audioChanges'), value: totalAudioChanges, color: 'bg-purple-500', icon: <Headphones className="h-4 w-4 text-purple-500" /> },
                                    { label: t('subtitleChanges'), value: totalSubChanges, color: 'bg-cyan-500', icon: <Languages className="h-4 w-4 text-cyan-500" /> },
                                ].map((metric) => {
                                    const maxVal = Math.max(totalPauses, totalAudioChanges, totalSubChanges, 1);
                                    const pct = Math.round((metric.value / maxVal) * 100);
                                    return (
                                        <div key={metric.label} className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2 text-sm font-medium">{metric.icon}{metric.label}</div>
                                                <span className="text-lg font-bold">{metric.value}</span>
                                            </div>
                                            <div className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden">
                                                <div className={`h-full ${metric.color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Users + Language Distribution */}
                <div className={`grid gap-4 ${isMusic ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
                    <Card className="bg-zinc-900/50 border-zinc-800/50">
                        <CardHeader><CardTitle>{t('viewers', { count: userList.length })}</CardTitle><CardDescription>{t('viewersDesc')}</CardDescription></CardHeader>
                        <CardContent>
                            <div className="space-y-3 max-h-[300px] overflow-y-auto">
                                {userList.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">{t('noViewers')}</p> :
                                    userList.map((u) => (
                                        <div key={u.jellyfinUserId} className="flex items-center justify-between">
                                            <Link href={`/users/${u.jellyfinUserId}`} className="text-sm font-medium text-primary hover:underline truncate max-w-[120px]">{u.username}</Link>
                                            <div className="flex items-center gap-3 text-xs text-zinc-400">
                                                <span>{u.sessions} session{u.sessions > 1 ? 's' : ''}</span>
                                                <span className="font-medium">{(u.totalSeconds / 3600).toFixed(1)}h</span>
                                            </div>
                                        </div>
                                    ))
                                }
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-zinc-900/50 border-zinc-800/50">
                        <CardHeader><CardTitle className="flex items-center gap-2"><Headphones className="w-4 h-4" /> {t('audioLanguages')}</CardTitle></CardHeader>
                        <CardContent>
                            <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                {audioLangs.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">{t('noDataSmall')}</p> :
                                    audioLangs.map(([lang, count]) => (
                                        <div key={lang} className="flex items-center justify-between">
                                            <span className="font-mono text-xs bg-zinc-800 px-2 py-1 rounded">{lang}</span>
                                            <div className="flex items-center gap-2">
                                                <div className="w-24 h-2 bg-zinc-800 rounded-full overflow-hidden"><div className="h-full bg-purple-500 rounded-full" style={{ width: `${Math.round((count / totalViews) * 100)}%` }} /></div>
                                                <span className="text-xs text-zinc-400 w-8 text-right">{count}</span>
                                            </div>
                                        </div>
                                    ))
                                }
                            </div>
                        </CardContent>
                    </Card>
                    {!isMusic && (
                        <Card className="bg-zinc-900/50 border-zinc-800/50">
                            <CardHeader><CardTitle className="flex items-center gap-2"><Languages className="w-4 h-4" /> {t('subtitlesTitle')}</CardTitle></CardHeader>
                            <CardContent>
                                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                    {subtitleLangs.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">{t('none')}</p> :
                                        subtitleLangs.map(([lang, count]) => (
                                            <div key={lang} className="flex items-center justify-between">
                                                <span className="font-mono text-xs bg-zinc-800 px-2 py-1 rounded">{lang}</span>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-24 h-2 bg-zinc-800 rounded-full overflow-hidden"><div className="h-full bg-cyan-500 rounded-full" style={{ width: `${Math.round((count / totalViews) * 100)}%` }} /></div>
                                                    <span className="text-xs text-zinc-400 w-8 text-right">{count}</span>
                                                </div>
                                            </div>
                                        ))
                                    }
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Drop-off Chart */}
                {mediaDurationSeconds && mediaDurationSeconds > 0 && (
                    <Card className="bg-zinc-900/50 border-zinc-800/50">
                        <CardHeader><CardTitle>{t('completionDist')}</CardTitle><CardDescription>{t('completionDistDesc')}</CardDescription></CardHeader>
                        <CardContent><div className="h-[350px] w-full"><MediaDropoffChart data={dropoffBuckets} /></div></CardContent>
                    </Card>
                )}

                {/* Positional Telemetry Timeline */}
                {hasTimelineEvents && mediaDurationSeconds && (
                    <Card className="bg-zinc-900/50 border-zinc-800/50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Activity className="w-4 h-4" /> {t('timelineTitle')}</CardTitle>
                            <CardDescription>{t('timelineDesc')}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <MediaTimelineChart events={timelineEvents} durationMs={mediaDurationSeconds * 1000} sessions={sessionTimelines} />
                        </CardContent>
                    </Card>
                )}

                {/* Telemetry Timeline Chart */}
                {hasTelemetry && (
                    <Card className="bg-zinc-900/50 border-zinc-800/50">
                        <CardHeader>
                            <CardTitle>{t('telemetryTimeline')}</CardTitle>
                            <CardDescription>{isMusic ? t('telemetryTimelineMusicDesc') : t('telemetryTimelineVideoDesc')}</CardDescription>
                        </CardHeader>
                        <CardContent><div className="h-[300px] w-full"><TelemetryChart data={isMusic ? telemetryData.map((d: any) => ({ ...d, audioChanges: 0, subtitleChanges: 0 })) : telemetryData} /></div></CardContent>
                    </Card>
                )}

                {/* Detailed History */}
                <Card className="bg-zinc-900/50 border-zinc-800/50">
                    <CardHeader><CardTitle>{t('detailedHistory')}</CardTitle><CardDescription>{t('sessionsTotal', { count: totalViews })}</CardDescription></CardHeader>
                    <CardContent>
                        <div className="border rounded-md overflow-x-auto border-zinc-800/50">
                            <Table className="min-w-[900px]">
                                <TableHeader>
                                    <TableRow className="border-zinc-800">
                                        <TableHead>{t('colUser')}</TableHead><TableHead>{t('colDate')}</TableHead><TableHead>{t('colMethod')}</TableHead><TableHead>{t('colAudio')}</TableHead>{!isMusic && <TableHead>{t('colSubtitles')}</TableHead>}<TableHead className="text-center">{t('colPauses')}</TableHead><TableHead className="text-right">{t('colDuration')}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {media.playbackHistory.length === 0 ? (
                                        <TableRow><TableCell colSpan={isMusic ? 6 : 7} className="text-center h-24 text-muted-foreground">{t('noSession')}</TableCell></TableRow>
                                    ) : media.playbackHistory.map((h: any) => {
                                        const isTranscode = h.playMethod?.toLowerCase().includes("transcode");
                                        return (
                                            <TableRow key={h.id} className="border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                                                <TableCell className="font-medium text-primary">
                                                    {h.user ? <Link href={`/users/${h.user.jellyfinUserId}`} className="hover:underline">{h.user.username || tc('deletedUser')}</Link> : <span className="text-zinc-500">{tc('deletedUser')}</span>}
                                                </TableCell>
                                                <TableCell className="text-sm text-zinc-400 whitespace-nowrap">{new Date(h.startedAt).toLocaleString(locale, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</TableCell>
                                                <TableCell><Badge variant={isTranscode ? "destructive" : "default"} className={isTranscode ? "bg-amber-500/10 text-amber-500" : "bg-emerald-500/10 text-emerald-500"}>{h.playMethod || "DirectPlay"}</Badge></TableCell>
                                                <TableCell className="text-sm">{h.audioLanguage ? <span className="font-mono text-xs bg-zinc-800 px-1.5 py-0.5 rounded">{h.audioLanguage}{h.audioCodec ? ` (${h.audioCodec})` : ""}</span> : <span className="text-zinc-500 text-xs">—</span>}</TableCell>
                                                {!isMusic && <TableCell className="text-sm">{h.subtitleLanguage ? <span className="font-mono text-xs bg-zinc-800 px-1.5 py-0.5 rounded">{h.subtitleLanguage}{h.subtitleCodec ? ` (${h.subtitleCodec})` : ""}</span> : <span className="text-zinc-500 text-xs">—</span>}</TableCell>}
                                                <TableCell className="text-center">{(h.pauseCount || 0) > 0 ? <span className="text-yellow-400 font-medium">{h.pauseCount}</span> : <span className="text-zinc-500">0</span>}</TableCell>
                                                <TableCell className="text-right whitespace-nowrap font-medium">{h.durationWatched > 0 ? `${Math.floor(h.durationWatched / 60)} min` : <span className="text-zinc-500 text-xs">0 min</span>}</TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
