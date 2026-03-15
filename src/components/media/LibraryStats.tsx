"use client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useTranslations } from "next-intl";
import { Database, Package, Clock, ChevronDown, ChevronUp, Library, HardDrive, FileVideo, Music, BookText, Info } from "lucide-react";
import { useState } from "react";

interface LibraryDetail {
    name: string;
    size: string;
    duration: string;
    counts: string;
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
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className="space-y-4 mb-8">
            <div className="grid gap-4 md:grid-cols-3">
                <Card className="app-surface border-blue-500/20 shadow-lg shadow-blue-500/5 group hover:border-blue-500/40 transition-all duration-300">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center justify-between">
                            <span className="flex items-center gap-2"><HardDrive className="w-4 h-4" /> {t('statsVolume')}</span>
                            <div className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black tracking-tight text-white group-hover:scale-105 transition-transform origin-left duration-300">
                            {totalTB}
                        </div>
                        <p className="text-[10px] text-zinc-500 mt-2 font-medium flex items-center gap-1">
                            <Info className="w-3 h-3" /> {t('statsVolumeDesc')}
                        </p>
                    </CardContent>
                </Card>

                <Card className="app-surface border-purple-500/20 shadow-lg shadow-purple-500/5 group hover:border-purple-500/40 transition-all duration-300">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center justify-between">
                            <span className="flex items-center gap-2"><Library className="w-4 h-4" /> {t('statsContent')}</span>
                            <div className="h-1.5 w-1.5 rounded-full bg-purple-500 animate-pulse" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl font-bold tracking-tight text-white line-clamp-1 group-hover:scale-105 transition-transform origin-left duration-300">
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

                <Card className="app-surface border-emerald-500/20 shadow-lg shadow-emerald-500/5 group hover:border-emerald-500/40 transition-all duration-300">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center justify-between">
                            <span className="flex items-center gap-2"><Clock className="w-4 h-4" /> {t('statsTime')}</span>
                            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-black tracking-tight text-white group-hover:scale-105 transition-transform origin-left duration-300">
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
                    className="w-full px-6 py-3 flex items-center justify-between bg-zinc-900/40 hover:bg-zinc-900/60 transition-colors"
                >
                    <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-zinc-400" />
                        <span className="text-sm font-semibold text-zinc-300">Détails par Bibliothèque</span>
                        <span className="ml-2 text-[10px] bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded-full">{libraries.length}</span>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
                </button>

                {isExpanded && (
                    <CardContent className="p-0 border-t border-zinc-800/50">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 divide-x divide-y divide-zinc-800/50">
                            {libraries.map((lib, idx) => (
                                <div key={idx} className="p-4 hover:bg-white/5 transition-colors group">
                                    <div className="flex items-start justify-between mb-2">
                                        <h4 className="font-bold text-sm text-zinc-200 group-hover:text-primary transition-colors">{lib.name}</h4>
                                        <div className="text-[10px] font-mono bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">
                                            {lib.size}
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-[11px] text-zinc-500 flex items-center gap-2">
                                            <Package className="w-3 h-3" />
                                            {lib.counts}
                                        </div>
                                        <div className="text-[11px] text-zinc-500 flex items-center gap-2">
                                            <Clock className="w-3 h-3" />
                                            {lib.duration}
                                        </div>
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
