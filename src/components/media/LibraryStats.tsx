"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslations } from "next-intl";
import { Database, Package, Clock, Library, HardDrive, FileVideo, Music, Info, TrendingUp, Sparkles, Calendar, Tv, Book, Search, ChevronDown, ChevronUp } from "lucide-react";
import Image from "next/image";
import { getJellyfinImageUrl } from "@/lib/jellyfin";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { useState, useMemo, useEffect } from "react";

interface LibraryDetail {
    name: string;
    collectionType?: string | null;
    size: string;
    duration: string;
    counts: string;
    topItem?: { title: string; plays: number; id: string } | null;
    lastAdded?: { title: string; date: Date | string | null; id: string } | null;
}

interface LibraryStatsProps {
    totalTB: string;
    movieCount: number;
    seriesCount: number;
    albumCount: number;
    bookCount: number;
    timeLabel: string;
    libraries: LibraryDetail[];
}

export default function LibraryStats({ totalTB, movieCount, seriesCount, albumCount, bookCount, timeLabel, libraries }: LibraryStatsProps) {
    const t = useTranslations('media');
    const tc = useTranslations('common');
    const [searchQuery, setSearchQuery] = useState("");
    const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});

    const filteredLibraries = useMemo(() => {
        if (!searchQuery) return libraries;
        return libraries.filter(lib => 
            lib.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            lib.counts.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [searchQuery, libraries]);

    // Initialize expanded/collapsed map based on library count.
    // Defer initialization to avoid synchronous setState inside an effect.
    useEffect(() => {
        const t = setTimeout(() => {
            // If many libraries, collapse extra ones to save space by default
            const init: Record<string, boolean> = {};
            const defaultExpanded = libraries.length <= 6; // expand all when few
            libraries.forEach((l, idx) => {
                init[l.name] = defaultExpanded || idx < 6;
            });
            setExpandedMap(init);
        }, 0);
        return () => clearTimeout(t);
    }, [libraries]);

    const toggleExpand = (name: string) => {
        setExpandedMap(prev => ({ ...prev, [name]: !prev[name] }));
    };

    const getIconPrefix = (collectionType?: string | null, name?: string) => {
        const type = collectionType?.toLowerCase() || "";
        const fallbackName = name?.toLowerCase() || "";
        if (type === 'movies' || fallbackName.includes('film')) return <FileVideo className="w-5 h-5 text-blue-400 shrink-0" />;
        if (type === 'tvshows' || fallbackName.includes('série')) return <Tv className="w-5 h-5 text-emerald-400 shrink-0" />;
        if (type === 'music' || fallbackName.includes('musique')) return <Music className="w-5 h-5 text-yellow-400 shrink-0" />;
        if (type === 'books' || fallbackName.includes('livre')) return <Book className="w-5 h-5 text-purple-400 shrink-0" />;
        return <Library className="w-5 h-5 text-zinc-400 shrink-0" />;
    };

    const getGradientType = (collectionType?: string | null, name?: string) => {
        const type = collectionType?.toLowerCase() || "";
        const fallbackName = name?.toLowerCase() || "";
        if (type === 'movies' || fallbackName.includes('film')) return "from-blue-500/20 via-transparent to-transparent";
        if (type === 'tvshows' || fallbackName.includes('série')) return "from-emerald-500/20 via-transparent to-transparent";
        if (type === 'music' || fallbackName.includes('musique')) return "from-yellow-500/20 via-transparent to-transparent";
        if (type === 'books' || fallbackName.includes('livre')) return "from-purple-500/20 via-transparent to-transparent";
        return "from-zinc-500/10 via-transparent to-transparent";
    };

    return (
        <div className="space-y-8 mb-10 mt-6">
            {/* KPI Banners */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card className="relative overflow-hidden bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50 backdrop-blur-sm group transition-all hover:shadow-lg hover:shadow-cyan-500/5">
                    <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                            <HardDrive className="w-4 h-4 text-cyan-400" /> {t('statsVolume')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="relative z-10">
                        <div className="text-4xl font-black tracking-tight text-zinc-900 dark:text-zinc-100 bg-clip-text">
                            {totalTB}
                        </div>
                        <p className="text-xs text-zinc-500 mt-2 font-medium flex items-center gap-1.5 opacity-80">
                            <Info className="w-3.5 h-3.5" /> {t('statsVolumeDesc')}
                        </p>
                    </CardContent>
                </Card>

                <Card className="relative overflow-hidden bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50 backdrop-blur-sm group transition-all hover:shadow-lg hover:shadow-purple-500/5">
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                            <Library className="w-4 h-4 text-purple-400" /> {t('statsContent')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="relative z-10">
                        <div className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 line-clamp-2 leading-snug h-10">
                            {[
                                movieCount > 0 && <span key="movies" className="text-blue-500">{movieCount} {tc('movies').toLowerCase()}</span>,
                                seriesCount > 0 && <span key="series" className="text-emerald-500">{seriesCount} {tc('series').toLowerCase()}</span>,
                                albumCount > 0 && <span key="music" className="text-yellow-500">{albumCount} albums</span>,
                                bookCount > 0 && <span key="books" className="text-purple-500">{bookCount} {tc('books').toLowerCase()}</span>
                            ].reduce((prev: any, curr: any, i: number) => prev === null ? [curr] : [...prev, <span key={`sep-${i}`} className="text-zinc-400 font-normal">, </span>, curr], null)}
                        </div>
                        <p className="text-xs text-zinc-500 mt-2 font-medium flex items-center gap-1.5 opacity-80">
                             <Info className="w-3.5 h-3.5" /> {t('statsContentDesc')}
                        </p>
                    </CardContent>
                </Card>

                <Card className="relative overflow-hidden bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50 backdrop-blur-sm group transition-all hover:shadow-lg hover:shadow-amber-500/5">
                    <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                            <Clock className="w-4 h-4 text-amber-400" /> {t('statsTime')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="relative z-10">
                        <div className="text-4xl font-black tracking-tight text-zinc-900 dark:text-zinc-100 bg-clip-text">
                            {timeLabel.replace('jours', 'j').replace('heures', 'h')}
                        </div>
                        <p className="text-xs text-zinc-500 mt-2 font-medium flex items-center gap-1.5 opacity-80">
                             <Info className="w-3.5 h-3.5" /> {t('statsTimeDesc')}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Library Details Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-8 pb-2 border-b border-zinc-200/50 dark:border-zinc-800/80">
                <div className="space-y-1">
                    <h3 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-3">
                        <Database className="w-7 h-7 text-primary" />
                        {t('libraryDetailsTitle') || 'Détails par Collection'}
                    </h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        {libraries.length} {t('libraries') || 'collections'} au total
                    </p>
                </div>
                <div className="relative w-full sm:w-[280px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <Input 
                        placeholder={t('searchLibrary') || 'Rechercher une collection...'}
                        className="pl-9 bg-white/50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 focus-visible:ring-primary/20 transition-all rounded-full h-10"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            {/* Premium Grid Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredLibraries.length === 0 ? (
                    <div className="col-span-1 md:col-span-2 lg:col-span-3 py-16 text-center border border-dashed rounded-2xl border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/20">
                        <Database className="w-12 h-12 text-zinc-400 mx-auto mb-4 opacity-30" />
                        <h4 className="text-lg font-semibold text-zinc-700 dark:text-zinc-300">{tc('noData')}</h4>
                        <p className="text-sm text-zinc-500 mt-1">Aucune collection ne correspond à votre recherche.</p>
                    </div>
                ) : filteredLibraries.map((lib, idx) => (
                    <Card key={idx} className="relative overflow-hidden bg-white/80 dark:bg-zinc-900/70 border-zinc-200/60 dark:border-zinc-800/60 backdrop-blur-md group hover:border-primary/30 transition-colors shadow-sm hover:shadow-xl hover:shadow-black/5 flex flex-col">
                        {/* Dynamic top-edge decoration based on content type */}
                        <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${getGradientType(lib.collectionType, lib.name)} via-primary/20 top-border-glow`} />
                        <div className={`absolute inset-x-0 top-0 h-32 bg-gradient-to-b ${getGradientType(lib.collectionType, lib.name)} opacity-50 pointer-events-none`} />
                        
                        <CardHeader className="relative z-10 p-5 pb-0">
                            <div className="flex items-start justify-between">
                                <div className="space-y-1 w-full">
                                    <div className="flex items-center justify-between gap-2 w-full">
                                        <div className="flex items-center gap-2 max-w-[70%]">
                                            {getIconPrefix(lib.collectionType, lib.name)}
                                            <CardTitle className="text-xl font-bold truncate pr-2 text-zinc-900 dark:text-zinc-100">{lib.name}</CardTitle>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="shrink-0 text-[10px] font-mono font-medium tracking-tighter bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 px-2 py-0.5 rounded-full">
                                                {lib.size}
                                            </span>
                                            <button aria-label={expandedMap[lib.name] ? 'Collapse' : 'Expand'} onClick={() => toggleExpand(lib.name)} className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800">
                                                {expandedMap[lib.name] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="relative z-10 p-5 pt-3 space-y-4 flex-1 flex flex-col">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200/50 dark:border-zinc-800/50 pb-3">
                                <div className="text-[11px] font-medium text-zinc-500 flex items-center gap-1.5 leading-snug">
                                    <Package className="w-3.5 h-3.5 text-primary/70 shrink-0" />
                                    <span className="line-clamp-1">{lib.counts}</span>
                                </div>
                                <div className="text-[11px] font-medium text-amber-600/80 dark:text-amber-400/80 flex items-center gap-1.5 shrink-0">
                                    <Clock className="w-3.5 h-3.5" />
                                    <span>{lib.duration}</span>
                                </div>
                            </div>

                            {expandedMap[lib.name] ? (
                                <div className="space-y-3 flex-1 flex flex-col">
                                    {/* Top Item */}
                                    {lib.topItem ? (
                                        <Link 
                                            href={`/media/${lib.topItem.id}`}
                                            className="flex-1 flex items-center gap-3 p-3 rounded-xl bg-white/50 dark:bg-zinc-950/40 border border-zinc-100 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md transition-all group/item"
                                        >
                                            <div className="relative w-12 h-16 aspect-[2/3] rounded-md overflow-hidden bg-zinc-200 dark:bg-zinc-800 shrink-0">
                                                <Image 
                                                    src={getJellyfinImageUrl(lib.topItem.id, 'Primary')}
                                                    alt={lib.topItem.title}
                                                    fill
                                                    className="object-cover group-hover/item:scale-110 transition-transform duration-500"
                                                    sizes="48px"
                                                    unoptimized
                                                />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 text-[9px] font-bold text-amber-500 uppercase tracking-widest mb-1">
                                                    <TrendingUp className="w-3 h-3" /> {t('topContent') || 'Leader'}
                                                </div>
                                                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-200 truncate group-hover/item:text-primary transition-colors">{lib.topItem.title}</div>
                                                <div className="text-xs text-zinc-400 mt-0.5">{lib.topItem.plays} {tc('views')}</div>
                                            </div>
                                        </Link>
                                    ) : (
                                        <div className="flex-1 flex items-center gap-3 p-3 rounded-xl bg-white/20 dark:bg-zinc-950/20 border border-dashed border-zinc-200 dark:border-zinc-800/60">
                                            <div className="w-12 h-16 rounded-md bg-zinc-100 dark:bg-zinc-900/50 flex items-center justify-center shrink-0">
                                                <TrendingUp className="w-5 h-5 text-zinc-300 dark:text-zinc-700" />
                                            </div>
                                            <div className="flex-1 text-xs text-zinc-400 font-medium">Aucune lecture enregistrée</div>
                                        </div>
                                    )}

                                    {/* Last Added */}
                                    {lib.lastAdded ? (
                                        <Link 
                                            href={`/media/${lib.lastAdded.id}`}
                                            className="flex-1 flex items-center gap-3 p-3 rounded-xl bg-white/50 dark:bg-zinc-950/40 border border-zinc-100 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md transition-all group/item"
                                        >
                                            <div className="relative w-12 h-16 aspect-[2/3] rounded-md overflow-hidden bg-zinc-200 dark:bg-zinc-800 shrink-0">
                                                <Image 
                                                    src={getJellyfinImageUrl(lib.lastAdded.id, 'Primary')}
                                                    alt={lib.lastAdded.title}
                                                    fill
                                                    className="object-cover group-hover/item:scale-110 transition-transform duration-500"
                                                    sizes="48px"
                                                    unoptimized
                                                />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 text-[9px] font-bold text-emerald-500 uppercase tracking-widest mb-1">
                                                    <Sparkles className="w-3 h-3" /> {t('lastAdded') || 'Nouveauté'}
                                                </div>
                                                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-200 truncate group-hover/item:text-primary transition-colors">{lib.lastAdded.title}</div>
                                                <div className="text-[11px] text-zinc-400 mt-0.5 flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" />
                                                    {lib.lastAdded.date ? new Date(lib.lastAdded.date).toLocaleDateString() : '-'}
                                                </div>
                                            </div>
                                        </Link>
                                    ) : (
                                        <div className="flex-1 flex items-center gap-3 p-3 rounded-xl bg-white/20 dark:bg-zinc-950/20 border border-dashed border-zinc-200 dark:border-zinc-800/60">
                                            <div className="w-12 h-16 rounded-md bg-zinc-100 dark:bg-zinc-900/50 flex items-center justify-center shrink-0">
                                                <Sparkles className="w-5 h-5 text-zinc-300 dark:text-zinc-700" />
                                            </div>
                                            <div className="flex-1 text-xs text-zinc-400 font-medium">Aucun contenu ajouté</div>
                                        </div>
                                    )}
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
