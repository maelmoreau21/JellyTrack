"use client";

import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Ghost, HeartCrack, Clock, Film, Tv, Music, BookOpen } from "lucide-react";
import { formatDistanceToNow, type Locale } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { useTranslations, useLocale } from "next-intl";

const DATE_LOCALES: Record<string, Locale> = { fr, en: enUS };

interface GhostMedia {
    id: string;
    jellyfinMediaId: string;
    title: string;
    type: string;
    createdAt: Date;
    dateAdded?: Date | null;
}

interface AbandonedMedia {
    id: string;
    jellyfinMediaId: string;
    title: string;
    type: string;
    maxCompletion: number;
    lastPlayed: Date;
}

interface CleanupData {
    ghostMedia: GhostMedia[];
    abandonedMedia: AbandonedMedia[];
}

function getTypeIcon(type: string) {
    switch (type) {
        case "Movie": return <Film className="w-3.5 h-3.5 text-blue-400" />;
        case "Series": return <Tv className="w-3.5 h-3.5 text-green-400" />;
        case "MusicAlbum": return <Music className="w-3.5 h-3.5 text-yellow-400" />;
        case "Episode": return <Tv className="w-3.5 h-3.5 text-emerald-400" />;
        case "Audio": return <Music className="w-3.5 h-3.5 text-orange-400" />;
        default: return <BookOpen className="w-3.5 h-3.5 text-zinc-400" />;
    }
}

function getTypeLabel(type: string, t: (key: string) => string) {
    switch (type) {
        case "Movie": return t('movieType');
        case "Series": return t('seriesType');
        case "MusicAlbum": return t('albumType');
        case "Episode": return t('episodeType');
        case "Audio": return t('trackType');
        default: return type;
    }
}

function getCompletionColor(pct: number) {
    if (pct < 10) return "text-red-400";
    if (pct < 25) return "text-orange-400";
    if (pct < 50) return "text-yellow-400";
    return "text-amber-400";
}

function getCompletionLabel(pct: number, t: (key: string) => string) {
    if (pct < 10) return t('skipped');
    if (pct < 25) return t('tried');
    if (pct < 50) return t('halfWay');
    return t('almost');
}

export default function CleanupClient({ initialData }: { initialData: CleanupData }) {
    const t = useTranslations('cleanup');
    const locale = useLocale();
    const dateFnsLocale = DATE_LOCALES[locale] || fr;
    const [ghostFilter, setGhostFilter] = useState<string>("all");
    const [abandonFilter, setAbandonFilter] = useState<string>("all");

    const filteredGhosts = ghostFilter === "all"
        ? initialData.ghostMedia
        : initialData.ghostMedia.filter(m => m.type === ghostFilter);

    const filteredAbandoned = abandonFilter === "all"
        ? initialData.abandonedMedia
        : initialData.abandonedMedia.filter(m => m.type === abandonFilter);

    const ghostTypeCounts: Record<string, number> = { Movie: 0, Series: 0, MusicAlbum: 0 };
    initialData.ghostMedia.forEach(m => {
        if (m.type in ghostTypeCounts) {
            ghostTypeCounts[m.type] = (ghostTypeCounts[m.type] || 0) + 1;
        }
    });

    const abandonTypeCounts: Record<string, number> = { Movie: 0, Episode: 0, Audio: 0 };
    initialData.abandonedMedia.forEach(m => {
        if (m.type in abandonTypeCounts) {
            abandonTypeCounts[m.type] = (abandonTypeCounts[m.type] || 0) + 1;
        }
    });

    return (
        <Tabs defaultValue="ghosts" className="w-full">
            <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
                <TabsTrigger value="ghosts" className="flex items-center gap-2">
                    <Ghost className="w-4 h-4" />
                    {t('ghostMedia')} ({initialData.ghostMedia.length})
                </TabsTrigger>
                <TabsTrigger value="abandoned" className="flex items-center gap-2">
                    <HeartCrack className="w-4 h-4" />
                    {t('abandonedMedia')} ({initialData.abandonedMedia.length})
                </TabsTrigger>
            </TabsList>

            <TabsContent value="ghosts" className="mt-6">
                <Card className="app-surface-soft border-zinc-200/60 dark:border-zinc-800/50 backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle className="text-red-400">{t('ghostMedia')}</CardTitle>
                        <CardDescription>
                            {t('ghostDesc')}
                        </CardDescription>
                        <div className="flex gap-2 pt-2">
                            {[
                                { key: "all", label: t('allFilter') },
                                { key: "Movie", label: `${t('moviesFilter')} (${ghostTypeCounts.Movie})` },
                                { key: "Series", label: `${t('seriesFilter')} (${ghostTypeCounts.Series})` },
                                { key: "MusicAlbum", label: `${t('albumsFilter')} (${ghostTypeCounts.MusicAlbum})` },
                            ].map(f => (
                                <button key={f.key} onClick={() => setGhostFilter(f.key)}
                                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${ghostFilter === f.key ? 'bg-red-500/20 border-red-500/40 text-red-300' : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border border-zinc-200 dark:border-zinc-800">
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-800/50">
                                        <TableHead>{t('colTitle')}</TableHead>
                                        <TableHead className="w-[100px]">{t('colType')}</TableHead>
                                        <TableHead className="w-[150px]">{t('colAdded')}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredGhosts.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={3} className="h-24 text-center text-zinc-500">
                                                {t('noGhosts')}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    {filteredGhosts.map((media) => (
                                        <TableRow key={media.id} className="border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-800/20">
                                            <TableCell className="font-medium text-foreground">{media.title}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="border-zinc-200 dark:border-zinc-700 flex items-center gap-1.5 w-fit">
                                                    {getTypeIcon(media.type)}
                                                    {getTypeLabel(media.type, t)}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground text-sm">
                                                <div className="flex items-center gap-2">
                                                    <Clock className="w-3 h-3" />
                                                    {formatDistanceToNow(new Date(media.dateAdded || media.createdAt), { addSuffix: true, locale: dateFnsLocale })}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="abandoned" className="mt-6">
                <Card className="app-surface-soft border-zinc-200/60 dark:border-zinc-800/50 backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle className="text-orange-400">{t('abandonedMedia')}</CardTitle>
                        <CardDescription>
                            {t('abandonedDesc')}
                        </CardDescription>
                        <div className="flex gap-2 pt-2">
                            {[
                                { key: "all", label: t('allFilter') },
                                { key: "Movie", label: `${t('moviesFilter')} (${abandonTypeCounts.Movie})` },
                                { key: "Episode", label: `${t('episodesFilter')} (${abandonTypeCounts.Episode})` },
                                { key: "Audio", label: `${t('musicFilter')} (${abandonTypeCounts.Audio})` },
                            ].map(f => (
                                <button key={f.key} onClick={() => setAbandonFilter(f.key)}
                                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${abandonFilter === f.key ? 'bg-orange-500/20 border-orange-500/40 text-orange-300' : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border border-zinc-200 dark:border-zinc-800">
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-800/50">
                                        <TableHead>{t('colTitle')}</TableHead>
                                        <TableHead className="w-[100px]">{t('colType')}</TableHead>
                                        <TableHead className="w-[180px]">{t('colMaxCompletion')}</TableHead>
                                        <TableHead className="w-[150px]">{t('colLastAttempt')}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredAbandoned.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={4} className="h-24 text-center text-zinc-500">
                                                {t('noAbandoned')}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    {filteredAbandoned.map((media) => (
                                        <TableRow key={media.id} className="border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-800/20">
                                            <TableCell className="font-medium text-foreground max-w-[300px] truncate" title={media.title}>{media.title}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="border-zinc-200 dark:border-zinc-700 flex items-center gap-1.5 w-fit">
                                                    {getTypeIcon(media.type)}
                                                    {getTypeLabel(media.type, t)}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-24 h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-orange-500 rounded-full"
                                                            style={{ width: `${Math.min(media.maxCompletion, 100)}%` }}
                                                        />
                                                    </div>
                                                    <span className={`text-sm font-medium ${getCompletionColor(media.maxCompletion)}`}>
                                                        {Math.round(media.maxCompletion)}%
                                                    </span>
                                                    <span className="text-[10px] text-zinc-500">
                                                        {getCompletionLabel(media.maxCompletion, t)}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground text-sm">
                                                {formatDistanceToNow(new Date(media.lastPlayed), { addSuffix: true, locale: dateFnsLocale })}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
    );
}
