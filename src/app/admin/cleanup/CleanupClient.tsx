"use client";

import { useEffect, useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Ghost, HeartCrack, Clock, Film, Tv, Music, BookOpen, Search, CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import { formatDistanceToNow, type Locale } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { useTranslations, useLocale } from "next-intl";
import { cn } from "@/lib/utils";

const DATE_LOCALES: Record<string, Locale> = { fr, en: enUS };
const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

type PeriodValue = "all" | "30d" | "90d" | "180d" | "365d";
type DateValue = Date | string | null | undefined;

const PERIOD_TO_DAYS: Record<PeriodValue, number | null> = {
    all: null,
    "30d": 30,
    "90d": 90,
    "180d": 180,
    "365d": 365,
};

interface GhostMedia {
    id: string;
    jellyfinMediaId: string;
    title: string;
    type: string;
    createdAt: DateValue;
    dateAdded?: DateValue;
}

interface AbandonedMedia {
    id: string;
    jellyfinMediaId: string;
    title: string;
    type: string;
    maxCompletion: number;
    lastPlayed: DateValue;
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

function toDate(value: DateValue): Date | null {
    if (!value) return null;
    const parsed = value instanceof Date ? value : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeForSearch(value: string) {
    return value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}

function matchesPeriod(referenceDate: DateValue, period: PeriodValue) {
    const days = PERIOD_TO_DAYS[period];
    if (!days) return true;

    const date = toDate(referenceDate);
    if (!date) return false;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return date >= cutoff;
}

function paginateItems<T>(items: T[], page: number, pageSize: number) {
    const totalItems = items.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const currentPage = Math.max(1, Math.min(page, totalPages));
    const startIndex = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const endIndex = totalItems === 0 ? 0 : Math.min(currentPage * pageSize, totalItems);
    const pageItems = totalItems === 0 ? [] : items.slice(startIndex - 1, endIndex);

    return {
        totalItems,
        totalPages,
        currentPage,
        startIndex,
        endIndex,
        pageItems,
    };
}

export default function CleanupClient({ initialData }: { initialData: CleanupData }) {
    const t = useTranslations('cleanup');
    const tc = useTranslations('common');
    const tr = useTranslations('timeRange');
    const locale = useLocale();
    const dateFnsLocale = DATE_LOCALES[locale] || fr;

    const [searchValue, setSearchValue] = useState("");
    const [period, setPeriod] = useState<PeriodValue>("all");
    const [pageSize, setPageSize] = useState<number>(25);
    const [ghostFilter, setGhostFilter] = useState<string>("all");
    const [abandonFilter, setAbandonFilter] = useState<string>("all");
    const [ghostPage, setGhostPage] = useState(1);
    const [abandonedPage, setAbandonedPage] = useState(1);

    const searchQuery = normalizeForSearch(searchValue);

    const baseGhosts = useMemo(() => {
        return initialData.ghostMedia.filter((media) => {
            const title = normalizeForSearch(media.title);
            const matchesSearch = searchQuery.length === 0 || title.includes(searchQuery);
            const referenceDate = media.dateAdded || media.createdAt;
            return matchesSearch && matchesPeriod(referenceDate, period);
        });
    }, [initialData.ghostMedia, period, searchQuery]);

    const baseAbandoned = useMemo(() => {
        return initialData.abandonedMedia.filter((media) => {
            const title = normalizeForSearch(media.title);
            const matchesSearch = searchQuery.length === 0 || title.includes(searchQuery);
            return matchesSearch && matchesPeriod(media.lastPlayed, period);
        });
    }, [initialData.abandonedMedia, period, searchQuery]);

    const filteredGhosts = useMemo(() => {
        return ghostFilter === "all"
            ? baseGhosts
            : baseGhosts.filter((media) => media.type === ghostFilter);
    }, [baseGhosts, ghostFilter]);

    const filteredAbandoned = useMemo(() => {
        return abandonFilter === "all"
            ? baseAbandoned
            : baseAbandoned.filter((media) => media.type === abandonFilter);
    }, [abandonFilter, baseAbandoned]);

    const ghostPageData = useMemo(
        () => paginateItems(filteredGhosts, ghostPage, pageSize),
        [filteredGhosts, ghostPage, pageSize]
    );

    const abandonedPageData = useMemo(
        () => paginateItems(filteredAbandoned, abandonedPage, pageSize),
        [filteredAbandoned, abandonedPage, pageSize]
    );

    useEffect(() => {
        setGhostPage(1);
        setAbandonedPage(1);
    }, [searchQuery, period, pageSize]);

    useEffect(() => {
        setGhostPage(1);
    }, [ghostFilter]);

    useEffect(() => {
        setAbandonedPage(1);
    }, [abandonFilter]);

    useEffect(() => {
        if (ghostPage > ghostPageData.totalPages) {
            setGhostPage(ghostPageData.totalPages);
        }
    }, [ghostPage, ghostPageData.totalPages]);

    useEffect(() => {
        if (abandonedPage > abandonedPageData.totalPages) {
            setAbandonedPage(abandonedPageData.totalPages);
        }
    }, [abandonedPage, abandonedPageData.totalPages]);

    const ghostTypeCounts: Record<string, number> = { Movie: 0, Series: 0, MusicAlbum: 0 };
    baseGhosts.forEach(m => {
        if (m.type in ghostTypeCounts) {
            ghostTypeCounts[m.type] = (ghostTypeCounts[m.type] || 0) + 1;
        }
    });

    const abandonTypeCounts: Record<string, number> = { Movie: 0, Episode: 0, Audio: 0 };
    baseAbandoned.forEach(m => {
        if (m.type in abandonTypeCounts) {
            abandonTypeCounts[m.type] = (abandonTypeCounts[m.type] || 0) + 1;
        }
    });

    const periodOptions: Array<{ value: PeriodValue; label: string }> = [
        { value: "all", label: tr('allTime') },
        { value: "30d", label: tr('last30d') },
        { value: "90d", label: "90d" },
        { value: "180d", label: "180d" },
        { value: "365d", label: "365d" },
    ];

    const renderPagination = (
        pageData: ReturnType<typeof paginateItems>,
        onPrevious: () => void,
        onNext: () => void,
    ) => (
        <div className="flex flex-col gap-2 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
                {pageData.startIndex}-{pageData.endIndex} / {pageData.totalItems}
            </p>
            <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={onPrevious} disabled={pageData.currentPage <= 1}>
                    <ChevronLeft className="h-4 w-4" />
                    {tc('previous')}
                </Button>
                <span className="text-xs text-muted-foreground min-w-[90px] text-center">
                    {tc('page')} {pageData.currentPage}/{pageData.totalPages}
                </span>
                <Button size="sm" variant="outline" onClick={onNext} disabled={pageData.currentPage >= pageData.totalPages}>
                    {tc('next')}
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );

    const formatRelativeTime = (value: DateValue) => {
        const parsed = toDate(value);
        if (!parsed) return "-";
        return formatDistanceToNow(parsed, { addSuffix: true, locale: dateFnsLocale });
    };

    const filterChipClass = (isActive: boolean, theme: "red" | "orange") => cn(
        "text-xs px-3 py-1.5 rounded-full border transition-all",
        isActive
            ? theme === "red"
                ? "bg-red-500/20 border-red-500/40 text-red-300 shadow-sm shadow-red-500/10"
                : "bg-orange-500/20 border-orange-500/40 text-orange-300 shadow-sm shadow-orange-500/10"
            : "border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900/50"
    );

    return (
        <Tabs defaultValue="ghosts" className="w-full">
            <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
                <TabsTrigger value="ghosts" className="flex items-center gap-2">
                    <Ghost className="w-4 h-4" />
                    {t('ghostMedia')} ({baseGhosts.length})
                </TabsTrigger>
                <TabsTrigger value="abandoned" className="flex items-center gap-2">
                    <HeartCrack className="w-4 h-4" />
                    {t('abandonedMedia')} ({baseAbandoned.length})
                </TabsTrigger>
            </TabsList>

            <div className="mt-4 rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-background/40 backdrop-blur-sm p-3 sm:p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                        <Input
                            value={searchValue}
                            onChange={(event) => setSearchValue(event.target.value)}
                            placeholder={tc('searchPlaceholder')}
                            className="pl-9 bg-background/70"
                        />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Select value={period} onValueChange={(value) => setPeriod(value as PeriodValue)}>
                            <SelectTrigger className="w-[150px] bg-background/70 border-border">
                                <CalendarRange className="h-4 w-4 text-zinc-500" />
                                <SelectValue placeholder={tr('period')} />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border">
                                {periodOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
                            <SelectTrigger className="w-[120px] bg-background/70 border-border">
                                <SelectValue placeholder="25" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border">
                                {PAGE_SIZE_OPTIONS.map((value) => (
                                    <SelectItem key={value} value={String(value)}>{value}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            <TabsContent value="ghosts" className="mt-6">
                <Card className="app-surface-soft border-zinc-200/60 dark:border-zinc-800/50 backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle className="text-red-400">{t('ghostMedia')}</CardTitle>
                        <CardDescription>
                            {t('ghostDesc')}
                        </CardDescription>
                        <div className="flex flex-wrap gap-2 pt-2">
                            {[
                                { key: "all", label: t('allFilter') },
                                { key: "Movie", label: `${t('moviesFilter')} (${ghostTypeCounts.Movie})` },
                                { key: "Series", label: `${t('seriesFilter')} (${ghostTypeCounts.Series})` },
                                { key: "MusicAlbum", label: `${t('albumsFilter')} (${ghostTypeCounts.MusicAlbum})` },
                            ].map(f => (
                                <button key={f.key} onClick={() => setGhostFilter(f.key)}
                                    className={filterChipClass(ghostFilter === f.key, "red")}>
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border border-zinc-200 dark:border-zinc-800">
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-zinc-200 dark:border-zinc-800 hover:bg-transparent">
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
                                    {ghostPageData.pageItems.map((media) => (
                                        <TableRow key={media.id} className="border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100/50 dark:hover:bg-zinc-900/30 transition-colors">
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
                                                    {formatRelativeTime(media.dateAdded || media.createdAt)}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        {renderPagination(
                            ghostPageData,
                            () => setGhostPage((current) => Math.max(1, current - 1)),
                            () => setGhostPage((current) => Math.min(ghostPageData.totalPages, current + 1))
                        )}
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
                        <div className="flex flex-wrap gap-2 pt-2">
                            {[
                                { key: "all", label: t('allFilter') },
                                { key: "Movie", label: `${t('moviesFilter')} (${abandonTypeCounts.Movie})` },
                                { key: "Episode", label: `${t('episodesFilter')} (${abandonTypeCounts.Episode})` },
                                { key: "Audio", label: `${t('musicFilter')} (${abandonTypeCounts.Audio})` },
                            ].map(f => (
                                <button key={f.key} onClick={() => setAbandonFilter(f.key)}
                                    className={filterChipClass(abandonFilter === f.key, "orange")}>
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
                                    {abandonedPageData.pageItems.map((media) => (
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
                                                    <div className="w-24 h-2 bg-zinc-200 dark:bg-zinc-900 rounded-full overflow-hidden">
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
                                                {formatRelativeTime(media.lastPlayed)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        {renderPagination(
                            abandonedPageData,
                            () => setAbandonedPage((current) => Math.max(1, current - 1)),
                            () => setAbandonedPage((current) => Math.min(abandonedPageData.totalPages, current + 1))
                        )}
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
    );
}
