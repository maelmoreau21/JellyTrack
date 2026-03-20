"use client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useTranslations } from "next-intl";
import { Database, Package, Clock, ChevronDown, ChevronUp, Library, HardDrive, FileVideo, Music, Info, TrendingUp, Sparkles, Calendar } from "lucide-react";
import { useState } from "react";
import Image from "next/image";
import { getJellyfinImageUrl } from "@/lib/jellyfin";
import Link from "next/link";

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
    const [isExpanded, setIsExpanded] = useState(true);

    return (
        <div className="space-y-4 mb-8">
            <div className="grid gap-4 md:grid-cols-3">
                <Card className="app-surface border-zinc-200/50 dark:border-zinc-800/50 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/80">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                            <HardDrive className="w-4 h-4" /> {t('statsVolume')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                            {totalTB}
                        </div>
                        <p className="text-[10px] text-zinc-500 mt-2 font-medium flex items-center gap-1">
                            <Info className="w-3 h-3" /> {t('statsVolumeDesc')}
                        </p>
                    </CardContent>
                </Card>

                <Card className="app-surface border-zinc-200/50 dark:border-zinc-800/50 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/80">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                            <Library className="w-4 h-4" /> {t('statsContent')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 line-clamp-1">
                            {[
                                movieCount > 0 && `${movieCount} ${tc('movies').toLowerCase()}`,
                                seriesCount > 0 && `${seriesCount} ${tc('series').toLowerCase()}`,
                                albumCount > 0 && `${albumCount} albums`,
                                bookCount > 0 && `${bookCount} ${tc('books').toLowerCase()}`
                            ].filter(Boolean).join(', ')}
                        </div>
                        <p className="text-[10px] text-zinc-500 mt-2 font-medium flex items-center gap-1">
                             <Info className="w-3 h-3" /> {t('statsContentDesc')}
                        </p>
                    </CardContent>
                </Card>

                <Card className="app-surface border-zinc-200/50 dark:border-zinc-800/50 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/80">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                            <Clock className="w-4 h-4" /> {t('statsTime')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                            {timeLabel}
                        </div>
                        <p className="text-[10px] text-zinc-500 mt-2 font-medium flex items-center gap-1">
                             <Info className="w-3 h-3" /> {t('statsTimeDesc')}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card className="app-surface border-zinc-800/50 overflow-hidden">
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full px-6 py-4 flex items-center justify-between bg-zinc-900/60 hover:bg-zinc-900/80 transition-all border-b border-zinc-800/50 group"
                >
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
                            <Database className="w-5 h-5 text-primary" />
                        </div>
                        <div className="text-left">
                            <span className="text-sm font-bold text-zinc-100 block">{t('libraryDetailsTitle') || 'Détails par Collection'}</span>
                            <span className="text-[10px] text-zinc-500 uppercase tracking-widest">{libraries.length} {t('libraries') || 'collections'}</span>
                        </div>
                    </div>
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-zinc-500" /> : <ChevronDown className="w-5 h-5 text-zinc-500" />}
                </button>

                {isExpanded && (
                    <CardContent className="p-0">
                        <div className="grid grid-cols-1 lg:grid-cols-2 divide-x divide-y divide-zinc-800/50">
                            {libraries.map((lib, idx) => (
                                <div key={idx} className="p-5 flex flex-col sm:flex-row gap-5 hover:bg-white/[0.02] transition-colors relative group overflow-hidden">
                                    <div className="flex-1 space-y-4">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <h4 className="font-black text-lg text-zinc-100 group-hover:text-primary transition-colors flex items-center gap-2">
                                                    {lib.name}
                                                    {(lib.collectionType === 'movies' || lib.name.toLowerCase().includes('film')) && <FileVideo className="w-4 h-4 opacity-50" />}
                                                    {(lib.collectionType === 'music' || lib.name.toLowerCase().includes('musique')) && <Music className="w-4 h-4 opacity-50" />}
                                                </h4>
                                                <div className="flex items-center gap-3 mt-1">
                                                    <span className="text-[10px] font-mono bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded border border-zinc-700/50">
                                                        {lib.size}
                                                    </span>
                                                    <span className="text-[10px] font-mono bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded border border-zinc-700/50">
                                                        {lib.duration}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                                            {/* Top Content */}
                                            {lib.topItem && (
                                                <Link 
                                                    href={`/media/${lib.topItem.id}`}
                                                    className="block p-3 rounded-lg bg-zinc-50/50 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-zinc-800/50 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors group/item"
                                                >
                                                    <div className="flex items-start gap-3">
                                                        <div className="relative w-12 h-18 aspect-[2/3] rounded overflow-hidden flex-shrink-0 shadow-lg">
                                                            <Image 
                                                                src={getJellyfinImageUrl(lib.topItem.id, 'Primary')}
                                                                alt={lib.topItem.title}
                                                                fill
                                                                className="object-cover"
                                                                unoptimized
                                                            />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-500 uppercase tracking-tighter mb-1">
                                                                <TrendingUp className="w-3 h-3" /> {t('topContent') || 'Plus regardé'}
                                                            </div>
                                                            <div className="text-xs font-bold text-zinc-200 truncate group-hover/item:text-primary transition-colors">{lib.topItem.title}</div>
                                                            <div className="text-[10px] text-zinc-500 mt-0.5">{lib.topItem?.plays || 0} {tc('views')}</div>
                                                        </div>
                                                    </div>
                                                </Link>
                                            )}

                                            {/* Last Added */}
                                            {lib.lastAdded && (
                                                <Link 
                                                    href={`/media/${lib.lastAdded.id}`}
                                                    className="block p-3 rounded-lg bg-zinc-50/50 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-zinc-800/50 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors group/item"
                                                >
                                                    <div className="flex items-start gap-3">
                                                        <div className="relative w-12 h-18 aspect-[2/3] rounded overflow-hidden flex-shrink-0 shadow-lg">
                                                            <Image 
                                                                src={getJellyfinImageUrl(lib.lastAdded.id, 'Primary')}
                                                                alt={lib.lastAdded.title}
                                                                fill
                                                                className="object-cover"
                                                                unoptimized
                                                            />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-500 uppercase tracking-tighter mb-1">
                                                                <Sparkles className="w-3 h-3" /> {t('lastAdded') || 'Dernier ajout'}
                                                            </div>
                                                            <div className="text-xs font-bold text-zinc-200 truncate group-hover/item:text-emerald-400 transition-colors">{lib.lastAdded.title}</div>
                                                            <div className="text-[10px] text-zinc-500 mt-0.5 flex items-center gap-1">
                                                                <Calendar className="w-2.5 h-2.5" />
                                                                {lib.lastAdded.date ? `${new Date(lib.lastAdded.date).getDate().toString().padStart(2, '0')}/${(new Date(lib.lastAdded.date).getMonth() + 1).toString().padStart(2, '0')}` : '-'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </Link>
                                            )}
                                        </div>
                                        
                                        <div className="text-[11px] text-zinc-500 flex items-center gap-2 pt-2">
                                            <Package className="w-4 h-4 text-zinc-600" />
                                            <span className="font-medium">{lib.counts}</span>
                                        </div>
                                    </div>
                                    
                                    {/* Subtle background decoration */}
                                    <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity">
                                        <Database className="w-24 h-24 rotate-12" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                )}
            </Card>
        </div>
    );
}

