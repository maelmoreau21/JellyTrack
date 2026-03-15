"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslations } from "next-intl";

interface LibraryStatsProps {
    totalTB: string;
    movieCount: number;
    seriesCount: number;
    timeLabel: string;
}

export default function LibraryStats({ totalTB, movieCount, seriesCount, timeLabel }: LibraryStatsProps) {
    const t = useTranslations('media');
    const tc = useTranslations('common');

    return (
        <div className="grid gap-4 md:grid-cols-3 mb-6">
            <Card className="app-surface border-blue-500/20">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-zinc-400 flex items-center justify-between">
                        {t('statsVolume')}
                        <div className="h-2 w-2 rounded-full bg-blue-500" />
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold tracking-tight text-zinc-100">{totalTB} To</div>
                    <p className="text-xs text-zinc-500 mt-1">{t('statsVolumeDesc')}</p>
                </CardContent>
            </Card>
            <Card className="app-surface border-purple-500/20">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-zinc-400 flex items-center justify-between">
                        {t('statsContent')}
                        <div className="h-2 w-2 rounded-full bg-purple-500" />
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold tracking-tight text-zinc-100">
                        {movieCount} {tc('movies').toLowerCase()}, {seriesCount} {tc('series').toLowerCase()}
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">{t('statsContentDesc')}</p>
                </CardContent>
            </Card>
            <Card className="app-surface border-emerald-500/20">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-zinc-400 flex items-center justify-between">
                        {t('statsTime')}
                        <div className="h-2 w-2 rounded-full bg-emerald-500" />
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold tracking-tight text-zinc-100">
                        {timeLabel}
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">{t('statsTimeDesc')}</p>
                </CardContent>
            </Card>
        </div>
    );
}
