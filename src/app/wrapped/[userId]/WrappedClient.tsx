"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from 'next-intl';
import { ChevronRight, ChevronLeft, Share2, Play, Star, Calendar, Clock, X, Film, Tv, Music, BarChart3, TrendingUp, Headphones, BookOpen, Filter } from "lucide-react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";

interface CategoryBreakdown {
    totalSeconds: number;
    totalHours: number;
    topMedia: { title: string; seconds: number }[];
}

interface WrappedData {
    username: string;
    year: number;
    availableYears: number[];
    filterType: string;
    totalHours: number;
    topMedia: { title: string; seconds: number }[];
    topGenres: { name: string; count: number }[];
    topGenre: string;
    topDay: string;
    peakHour: string;
    peakHourSessions: number;
    monthlyHours: { name: string; hours: number }[];
    topSeries: { title: string; seconds: number }[];
    topArtists: { title: string; seconds: number }[];
    topAlbums: { title: string; seconds: number }[];
    topTracks: { title: string; seconds: number }[];
    totalSessions: number;
    categories: {
        movies: CategoryBreakdown;
        series: CategoryBreakdown;
        music: CategoryBreakdown;
        books: CategoryBreakdown;
    };
    topDevice: string;
}

function formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h${m > 0 ? ` ${m}min` : ""}`;
    return `${m}min`;
}

function RankedList({ items, gradient, noDataLabel }: { items: { title: string; seconds: number }[]; gradient: string; noDataLabel: string }) {
    if (items.length === 0) return <p className="text-zinc-400 text-center">{noDataLabel}</p>;
    const maxSeconds = items[0].seconds || 1;
    return (
        <div className="flex flex-col w-full gap-3">
            {items.map((m, i) => (
                <div key={i} className="relative p-4 bg-white/10 rounded-xl backdrop-blur-md overflow-hidden">
                    <div className={`absolute inset-0 ${gradient} opacity-10`} style={{ width: `${Math.round((m.seconds / maxSeconds) * 100)}%` }} />
                    <div className="flex items-center relative z-10">
                        <span className="text-2xl font-bold text-white/40 w-8 shrink-0">{i + 1}</span>
                        <span className="text-lg font-bold text-white truncate flex-1">{m.title}</span>
                        <span className="text-sm text-zinc-400 ml-2 shrink-0">{formatDuration(m.seconds)}</span>
                    </div>
                </div>
            ))}
        </div>
    );
}

function CategorySlide({ icon, breakdown, gradient, noDataLabel, ofLabel }: { icon: React.ReactNode; breakdown: CategoryBreakdown; gradient: string; noDataLabel: string; ofLabel: string }) {
    if (breakdown.totalSeconds === 0) {
        return (
            <div className="flex flex-col items-center gap-4">
                <p className="text-zinc-400">{noDataLabel}</p>
            </div>
        );
    }
    return (
        <div className="flex flex-col items-center gap-6 w-full max-w-md px-6">
            <div className="flex items-center gap-3">
                {icon}
                <span className={`text-3xl font-black text-transparent bg-clip-text ${gradient}`}>
                    {breakdown.totalHours}h
                </span>
                <span className="text-zinc-300 text-lg">{ofLabel}</span>
            </div>
            <RankedList items={breakdown.topMedia} gradient={gradient} noDataLabel={noDataLabel} />
        </div>
    );
}

function MonthlyChart({ data }: { data: { name: string; hours: number }[] }) {
    const maxHours = Math.max(...data.map(d => d.hours), 1);
    return (
        <div className="flex items-end gap-1.5 h-40 w-full max-w-md px-2">
            {data.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] text-zinc-400 font-bold">{d.hours > 0 ? `${d.hours}h` : ""}</span>
                    <div className="w-full rounded-t-md bg-gradient-to-t from-purple-500/80 to-fuchsia-400/80 transition-all duration-700"
                        style={{ height: `${Math.max(2, (d.hours / maxHours) * 100)}%` }} />
                    <span className="text-[9px] text-zinc-500">{d.name}</span>
                </div>
            ))}
        </div>
    );
}

function GenreChart({ genres }: { genres: { name: string; count: number }[] }) {
    if (genres.length === 0) return null;
    const maxCount = genres[0].count || 1;
    const colors = ["from-pink-500 to-rose-400", "from-purple-500 to-violet-400", "from-sky-500 to-blue-400", "from-emerald-500 to-green-400", "from-amber-500 to-yellow-400"];
    return (
        <div className="flex flex-col gap-3 w-full max-w-md px-6">
            {genres.map((g, i) => (
                <div key={g.name} className="flex items-center gap-3">
                    <span className="w-24 truncate text-sm font-medium text-zinc-200 text-right">{g.name}</span>
                    <div className="flex-1 h-6 bg-white/10 rounded-full overflow-hidden">
                        <div className={`h-full bg-gradient-to-r ${colors[i % colors.length]} rounded-full transition-all duration-700`}
                            style={{ width: `${Math.round((g.count / maxCount) * 100)}%` }} />
                    </div>
                    <span className="text-xs text-zinc-400 w-8">{g.count}</span>
                </div>
            ))}
        </div>
    );
}

export default function WrappedClient({ data }: { data: WrappedData }) {
    const [currentSlide, setCurrentSlide] = useState(0);
    const [showConfig, setShowConfig] = useState(false);
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const t = useTranslations('wrapped');

    // Translate month names in data
    const translatedMonthlyHours = data.monthlyHours.map(m => ({
        ...m,
        name: t.has(m.name as any) ? t(m.name as any) : m.name,
    }));

    // Translate day & genre
    const translatedTopDay = t.has(data.topDay as any) ? t(data.topDay as any) : data.topDay;
    const translatedTopGenre = data.topGenre === "unknown" ? t('unknown') : data.topGenre;
    const noDataLabel = t('noData');

    const updateParams = useCallback((newParams: Record<string, string>) => {
        const params = new URLSearchParams(searchParams.toString());
        Object.entries(newParams).forEach(([k, v]) => {
            if (v) params.set(k, v);
            else params.delete(k);
        });
        router.push(`${pathname}?${params.toString()}`);
        setShowConfig(false);
        setCurrentSlide(0);
    }, [router, pathname, searchParams]);

    const slides = [
        // 0 - Intro
        {
            title: `JellyTrack Wrapped ${data.year}`,
            subtitle: t('introSubtitle', { username: data.username }),
            icon: <Play className="w-16 h-16 mb-6 text-white animate-pulse" />,
            bgColor: "bg-gradient-to-br from-indigo-900 via-purple-900 to-black",
            content: (
                <div className="flex flex-col items-center gap-6">
                    <p className="text-xl text-center text-zinc-300 max-w-sm">{t('introContent')}</p>
                    <button 
                        onClick={() => setShowConfig(true)}
                        className="pointer-events-auto flex items-center gap-2 px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 transition backdrop-blur-md border border-white/20"
                    >
                        <Filter className="w-4 h-4" />
                        {t('customize')}
                    </button>
                </div>
            )
        },
        // 1 - Total watch time
        {
            title: t('totalTimeTitle'),
            subtitle: t('totalTimeSubtitle'),
            icon: <Clock className="w-16 h-16 mb-4 text-emerald-400" />,
            bgColor: "bg-gradient-to-br from-emerald-900 via-teal-900 to-black",
            content: (
                <div className="flex flex-col items-center">
                    <span className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 mb-2">
                        {data.totalHours}
                    </span>
                    <span className="text-2xl font-semibold text-zinc-200">{t('hours')}</span>
                    <p className="mt-4 text-zinc-400">{t.rich('acrossSessions', { count: data.totalSessions, bold: (chunks) => <span className="text-white font-bold">{chunks}</span> })}</p>
                </div>
            )
        },
        // 1b - Time in days (New!)
        ...(data.totalHours >= 24 ? [{
            title: t('totalTimeDays', { days: Math.floor(data.totalHours / 24), hours: data.totalHours % 24 }),
            subtitle: t('totalTimeDaysDesc'),
            icon: <Calendar className="w-16 h-16 mb-4 text-cyan-400" />,
            bgColor: "bg-gradient-to-br from-cyan-900 via-blue-900 to-black",
            content: (
                <div className="flex flex-col items-center">
                    <div className="relative w-32 h-32 mb-6">
                        <div className="absolute inset-0 bg-cyan-400/20 rounded-full animate-ping" />
                        <div className="relative flex items-center justify-center w-full h-full bg-cyan-400/20 rounded-full border-2 border-cyan-400">
                             <Clock className="w-12 h-12 text-cyan-400" />
                        </div>
                    </div>
                </div>
            )
        }] : []),
        // 2 - Monthly breakdown
        {
            title: t('monthlyTitle'),
            subtitle: t('monthlySubtitle'),
            icon: <BarChart3 className="w-16 h-16 mb-4 text-fuchsia-400" />,
            bgColor: "bg-gradient-to-br from-fuchsia-900 via-purple-900 to-black",
            content: (
                <div className="flex flex-col items-center gap-4 w-full">
                    <MonthlyChart data={translatedMonthlyHours} />
                    {(() => {
                        const best = translatedMonthlyHours.reduce((a, b) => b.hours > a.hours ? b : a, translatedMonthlyHours[0]);
                        return best && best.hours > 0
                            ? <p className="text-zinc-400 text-sm">{t.rich('bestMonth', { name: best.name, hours: best.hours, bold: (chunks) => <span className="text-white font-bold">{chunks}</span>, accent: (chunks) => <span className="text-fuchsia-400 font-bold">{chunks}</span> })}</p>
                            : null;
                    })()}
                </div>
            )
        },
        // 3 - Peak hour
        {
            title: t('peakTitle'),
            subtitle: t('peakSubtitle'),
            icon: <TrendingUp className="w-16 h-16 mb-4 text-orange-400" />,
            bgColor: "bg-gradient-to-br from-orange-900 via-red-900 to-black",
            content: (
                <div className="flex flex-col items-center">
                    <span className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-400 mb-2">
                        {data.peakHour}
                    </span>
                    <p className="mt-2 text-zinc-400 text-center max-w-sm">
                        {t.rich('peakContent', { count: data.peakHourSessions, hour: data.peakHour, bold: (chunks) => <span className="text-white font-bold">{chunks}</span> })}
                    </p>
                </div>
            )
        },
        // 3b - Top Device (New!)
        ...(data.topDevice !== "N/A" ? [{
            title: t('topDevice'),
            subtitle: t('topDeviceDesc', { device: data.topDevice }),
            icon: <Headphones className="w-16 h-16 mb-4 text-amber-400" />,
            bgColor: "bg-gradient-to-br from-amber-900 via-orange-900 to-black",
            content: (
                <div className="flex flex-col items-center">
                    <div className="p-8 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md">
                        <span className="text-4xl font-black text-amber-400 uppercase tracking-tighter">{data.topDevice}</span>
                    </div>
                </div>
            )
        }] : []),
        // 4 - Top genres
        {
            title: t('genresTitle'),
            subtitle: t('genresSubtitle'),
            icon: <Star className="w-16 h-16 mb-4 text-pink-400" />,
            bgColor: "bg-gradient-to-br from-pink-900 via-rose-900 to-black",
            content: (
                <div className="flex flex-col items-center gap-4 w-full">
                    <span className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-orange-400 mb-2 text-center uppercase tracking-wider">
                        {translatedTopGenre}
                    </span>
                    <p className="text-zinc-400 text-sm mb-2">{t('genreFirst')}</p>
                    <GenreChart genres={data.topGenres} />
                </div>
            )
        },
        // 5 - Top day
        {
            title: t('dayTitle'),
            subtitle: t('daySubtitle'),
            icon: <Calendar className="w-16 h-16 mb-4 text-amber-400" />,
            bgColor: "bg-gradient-to-br from-amber-900 via-orange-900 to-black",
            content: (
                <div className="flex flex-col items-center">
                    <span className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-400 mb-2">
                        {t('theDay', { day: translatedTopDay })}
                    </span>
                    <p className="mt-4 text-zinc-400 text-center max-w-sm">{t('dayContent')}</p>
                </div>
            )
        },
        // 6 - Top 5 all media
        {
            title: t('pantheonTitle'),
            subtitle: t('pantheonSubtitle'),
            icon: <Star className="w-12 h-12 mb-4 text-yellow-500" />,
            bgColor: "bg-gradient-to-br from-blue-900 via-indigo-900 to-black",
            content: (
                <div className="w-full max-w-md px-6">
                    <RankedList items={data.topMedia} gradient="bg-gradient-to-r from-indigo-500 to-blue-400" noDataLabel={noDataLabel} />
                </div>
            )
        },
        // 7 - Top Series (conditional)
        ...(data.topSeries.length > 0 ? [{
            title: t('bingeTitle'),
            subtitle: t('bingeSubtitle'),
            icon: <Tv className="w-16 h-16 mb-4 text-sky-400" />,
            bgColor: "bg-gradient-to-br from-sky-900 via-blue-900 to-black",
            content: (
                <div className="w-full max-w-md px-6">
                    <RankedList items={data.topSeries} gradient="bg-gradient-to-r from-sky-500 to-blue-400" noDataLabel={noDataLabel} />
                </div>
            )
        }] : []),
        // 8 - Top Songs (New!)
        ...(data.topTracks.length > 0 ? [{
            title: t('tracksTitle'),
            subtitle: t('tracksSubtitle'),
            icon: <Music className="w-16 h-16 mb-4 text-emerald-400" />,
            bgColor: "bg-gradient-to-br from-emerald-900 via-teal-900 to-black",
            content: (
                <div className="w-full max-w-md px-6">
                    <RankedList items={data.topTracks} gradient="bg-gradient-to-r from-emerald-500 to-teal-400" noDataLabel={noDataLabel} />
                </div>
            )
        }] : []),
        // 8b - Top Artists (New!)
        ...(data.topArtists.length > 0 ? [{
            title: t('artistsTitle'),
            subtitle: t('artistsSubtitle'),
            icon: <Headphones className="w-16 h-16 mb-4 text-purple-400" />,
            bgColor: "bg-gradient-to-br from-purple-900 via-indigo-900 to-black",
            content: (
                <div className="w-full max-w-md px-6">
                    <RankedList items={data.topArtists} gradient="bg-gradient-to-r from-purple-500 to-indigo-400" noDataLabel={noDataLabel} />
                </div>
            )
        }] : []),
        // 8c - Top Albums (New!)
        ...(data.topAlbums.length > 0 ? [{
            title: t('albumsTitle'),
            subtitle: t('albumsSubtitle'),
            icon: <Star className="w-16 h-16 mb-4 text-pink-400" />,
            bgColor: "bg-gradient-to-br from-pink-900 via-rose-900 to-black",
            content: (
                <div className="w-full max-w-md px-6">
                    <RankedList items={data.topAlbums} gradient="bg-gradient-to-r from-pink-500 to-rose-400" noDataLabel={noDataLabel} />
                </div>
            )
        }] : []),
        // Category slides
        ...(data.categories.movies.totalSeconds > 0 ? [{
            title: t('moviesTitle'),
            subtitle: t('moviesSubtitle'),
            icon: <Film className="w-16 h-16 mb-4 text-red-400" />,
            bgColor: "bg-gradient-to-br from-red-900 via-rose-900 to-black",
            content: <CategorySlide icon={<Film className="w-8 h-8 text-red-400" />} breakdown={data.categories.movies} gradient="bg-gradient-to-r from-red-400 to-orange-400" noDataLabel={t('noDataFor', { label: t('moviesLabel').toLowerCase() })} ofLabel={t('ofLabel', { label: t('moviesLabel') })} />
        }] : []),
        ...(data.categories.series.totalSeconds > 0 ? [{
            title: t('episodesTitle'),
            subtitle: t('episodesSubtitle'),
            icon: <Tv className="w-16 h-16 mb-4 text-sky-400" />,
            bgColor: "bg-gradient-to-br from-sky-900 via-blue-900 to-black",
            content: <CategorySlide icon={<Tv className="w-8 h-8 text-sky-400" />} breakdown={data.categories.series} gradient="bg-gradient-to-r from-sky-400 to-blue-400" noDataLabel={t('noDataFor', { label: t('episodesLabel').toLowerCase() })} ofLabel={t('ofLabel', { label: t('episodesLabel') })} />
        }] : []),
        ...(data.categories.music.totalSeconds > 0 ? [{
            title: t('musicTitle'),
            subtitle: t('musicSubtitle'),
            icon: <Music className="w-16 h-16 mb-4 text-green-400" />,
            bgColor: "bg-gradient-to-br from-green-900 via-emerald-900 to-black",
            content: <CategorySlide icon={<Music className="w-8 h-8 text-green-400" />} breakdown={data.categories.music} gradient="bg-gradient-to-r from-green-400 to-emerald-400" noDataLabel={t('noDataFor', { label: t('musicLabel').toLowerCase() })} ofLabel={t('ofLabel', { label: t('musicLabel') })} />
        }] : []),
        ...(data.categories.books.totalSeconds > 0 ? [{
            title: t('booksTitle'),
            subtitle: t('booksSubtitle'),
            icon: <BookOpen className="w-16 h-16 mb-4 text-amber-500" />,
            bgColor: "bg-gradient-to-br from-amber-900 via-yellow-900 to-black",
            content: <CategorySlide icon={<BookOpen className="w-8 h-8 text-amber-500" />} breakdown={data.categories.books} gradient="bg-gradient-to-r from-amber-400 to-yellow-400" noDataLabel={t('noDataFor', { label: t('booksLabel').toLowerCase() })} ofLabel={t('ofLabel', { label: t('booksLabel') })} />
        }] : []),
        // Share card
        {
            title: t('shareTitle'),
            subtitle: t('shareSubtitle'),
            icon: <Share2 className="w-16 h-16 mb-4 text-fuchsia-400" />,
            bgColor: "bg-gradient-to-br from-purple-900 via-fuchsia-900 to-black",
            content: (
                <div className="flex flex-col items-center gap-6">
                    <div className="p-6 bg-black/40 rounded-2xl border border-white/10 backdrop-blur-xl flex flex-col items-center text-center max-w-sm">
                        <p className="text-sm text-zinc-400 mb-1">{t('introTitle', { year: data.year })}</p>
                        <h3 className="text-2xl font-bold text-white mb-4">{data.username}</h3>
                        <p className="text-fuchsia-400 font-bold text-lg">{data.totalHours}h {t('streaming')}</p>
                        <p className="text-zinc-300 text-sm mt-1">{t('genreLabel', { genre: translatedTopGenre })}</p>
                        <p className="text-zinc-300 text-sm">{t('peakLabel', { hour: data.peakHour })}</p>
                        <p className="text-zinc-300 text-sm">{t('favDayLabel', { day: translatedTopDay })}</p>
                        <div className="flex gap-4 mt-3 text-xs text-zinc-400">
                            {data.categories.movies.totalHours > 0 && <span>🎬 {data.categories.movies.totalHours}h</span>}
                            {data.categories.series.totalHours > 0 && <span>📺 {data.categories.series.totalHours}h</span>}
                            {data.categories.music.totalHours > 0 && <span>🎵 {data.categories.music.totalHours}h</span>}
                            {data.categories.books.totalHours > 0 && <span>📚 {data.categories.books.totalHours}h</span>}
                        </div>
                    </div>
                    <p className="text-xs text-zinc-500">{t('captureScreen')}</p>
                </div>
            )
        }
    ];

    const nextSlide = () => {
        if (currentSlide < slides.length - 1) setCurrentSlide(c => c + 1);
    };

    const prevSlide = () => {
        if (currentSlide > 0) setCurrentSlide(c => c - 1);
    };

    // Auto-advance (stories)
    useEffect(() => {
        if (showConfig) return;
        const timer = setTimeout(() => {
            if (currentSlide < slides.length - 1) setCurrentSlide(c => c + 1);
        }, 8000);
        return () => clearTimeout(timer);
    }, [currentSlide, slides.length, showConfig]);

    const current = slides[currentSlide];

    return (
        <div className={`wrapped-effects fixed inset-0 z-50 flex flex-col text-white transition-colors duration-700 ease-in-out ${current.bgColor}`}>
            <style jsx global>{`
                @keyframes progress {
                    from { width: 0%; }
                    to { width: 100%; }
                }
            `}</style>

            {/* Config Overlay */}
            {showConfig && (
                <div className="absolute inset-0 z-[60] bg-black/90 backdrop-blur-xl animate-in fade-in duration-300 p-8 flex flex-col items-center justify-center pointer-events-auto">
                    <button onClick={() => setShowConfig(false)} className="absolute top-8 right-8 p-2 rounded-full bg-white/10 hover:bg-white/20 transition">
                        <X className="w-6 h-6" />
                    </button>
                    <div className="w-full max-w-sm space-y-8">
                        <div className="space-y-4">
                            <h3 className="text-xl font-bold flex items-center gap-2"><Calendar className="w-5 h-5 text-purple-400" /> {t('year')}</h3>
                            <div>
                                <Select defaultValue={data.year.toString()} onValueChange={(v) => updateParams({ year: v })}>
                                    <SelectTrigger className="w-full bg-background/70 border-border">
                                        <Calendar className="h-4 w-4 text-zinc-500" />
                                        <SelectValue placeholder={String(data.year)} />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card border-border">
                                        {data.availableYears.map(y => (
                                            <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-xl font-bold flex items-center gap-2"><Filter className="w-5 h-5 text-blue-400" /> {t('type')}</h3>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { label: t('all'), value: "" },
                                    { label: t('moviesLabel'), value: "Movies" },
                                    { label: t('musicLabel'), value: "Music" },
                                    { label: t('tv'), value: "TV" },
                                    { label: t('booksLabel'), value: "Books" }
                                ].map(v => (
                                    <button 
                                        key={v.value} 
                                        onClick={() => updateParams({ type: v.value })}
                                        className={`p-3 rounded-xl border transition-all ${data.filterType === (v.value || "general") ? 'bg-blue-600 border-blue-400 font-bold' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                                    >
                                        {v.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Progress Bars */}
            <div className="absolute top-0 left-0 right-0 p-4 flex gap-1.5 z-50">
                {slides.map((_, i) => (
                    <div key={i} className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden">
                        <div
                            key={`${i}-${currentSlide}-${data.year}-${data.filterType}`}
                            className={`h-full bg-white transition-all duration-100 ease-linear ${i === currentSlide && !showConfig ? 'w-full animate-[progress_8s_linear]' : i < currentSlide ? 'w-full' : 'w-0'}`}
                        />
                    </div>
                ))}
            </div>

            {/* Close */}
            <button onClick={() => router.back()} className="absolute top-8 right-4 p-2 z-50 rounded-full bg-white/10 hover:bg-white/20 transition backdrop-blur">
                <X className="w-5 h-5 text-white" />
            </button>

            {/* Tap areas */}
            <div className="absolute inset-0 z-40 flex">
                <div className="w-1/3 h-full cursor-pointer" onClick={prevSlide} />
                <div className="w-2/3 h-full cursor-pointer" onClick={nextSlide} />
            </div>

            {/* Content */}
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center z-30 pointer-events-none overflow-y-auto">
                <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 ease-out flex flex-col items-center w-full" key={`${currentSlide}-${data.year}-${data.filterType}`}>
                    {current.icon}
                    <h2 className="text-xl font-bold tracking-widest text-zinc-400 uppercase mb-2">{current.subtitle}</h2>
                    <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-8 leading-tight max-w-2xl">{current.title}</h1>
                    {current.content}
                </div>
            </div>

            {/* Bottom controls */}
            <div className="absolute bottom-6 left-0 right-0 flex justify-between items-center z-50 px-8">
                <button onClick={prevSlide} disabled={currentSlide === 0} className="disabled:opacity-20 hover:text-white transition group items-center gap-1 flex text-sm opacity-50 pointer-events-auto">
                    <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> {t('back')}
                </button>
                <div className="flex flex-col items-center">
                    <span className="text-xs text-zinc-500 font-bold">{data.year} • {data.filterType.toUpperCase()}</span>
                    <span className="text-[10px] text-zinc-600">{currentSlide + 1} / {slides.length}</span>
                </div>
                <button onClick={nextSlide} disabled={currentSlide === slides.length - 1} className="disabled:opacity-20 hover:text-white transition group items-center gap-1 flex text-sm opacity-50 pointer-events-auto">
                    {t('next')} <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
            </div>
        </div>
    );
}
