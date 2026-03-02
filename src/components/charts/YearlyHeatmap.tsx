"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations, useLocale } from 'next-intl';
import { ActivityCalendar, ThemeInput } from "react-activity-calendar";
import { format, eachDayOfInterval, startOfYear, endOfYear } from "date-fns";
import { fr } from "date-fns/locale";
import { enUS } from "date-fns/locale";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface HeatmapData {
    date: string; // YYYY-MM-DD
    count: number;
    level: 0 | 1 | 2 | 3 | 4;
}

interface YearlyHeatmapProps {
    data: HeatmapData[];
    availableYears: number[];
}

const customTheme: ThemeInput = {
    light: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
    dark: ['#18181b', '#312e81', '#4338ca', '#4f46e5', '#6366f1'],
};

export function YearlyHeatmap({ data, availableYears }: YearlyHeatmapProps) {
    const t = useTranslations('charts');
    const locale = useLocale();
    const dateFnsLocale = locale === 'fr' ? fr : enUS;
    const currentYear = new Date().getFullYear();
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(0);

    // Measure container width with ResizeObserver for responsive blockSize
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setContainerWidth(entry.contentRect.width);
            }
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Dynamic block size: fill the container width (53 weeks + ~40px label margin)
    const blockSize = useMemo(() => {
        if (containerWidth <= 0) return 14; // default before measurement
        const WEEKS = 53;
        const LABEL_MARGIN = 45; // space for weekday labels on the left
        const BLOCK_MARGIN = 3;
        const available = containerWidth - LABEL_MARGIN;
        const computed = Math.floor(available / WEEKS) - BLOCK_MARGIN;
        return Math.max(8, Math.min(22, computed)); // clamp 8..22
    }, [containerWidth]);

    const sortedYears = useMemo(() => {
        const years = [...new Set([...availableYears, currentYear])].sort((a, b) => b - a);
        return years;
    }, [availableYears, currentYear]);

    const canGoPrev = sortedYears.indexOf(selectedYear) < sortedYears.length - 1;
    const canGoNext = sortedYears.indexOf(selectedYear) > 0;

    const processedData = useMemo(() => {
        const jan1 = startOfYear(new Date(selectedYear, 0, 1));
        const dec31 = endOfYear(new Date(selectedYear, 0, 1));

        // Filter data for the selected year
        const yearEntries = data.filter(d => d.date.startsWith(String(selectedYear)));
        const dataMap = new Map(yearEntries.map(d => [d.date, d]));

        // Recompute levels based on this year's max
        const counts = yearEntries.map(d => d.count);
        const maxCount = counts.length > 0 ? Math.max(...counts) : 1;
        const getLevel = (count: number): 0 | 1 | 2 | 3 | 4 => {
            if (count === 0) return 0;
            const ratio = count / maxCount;
            if (ratio < 0.25) return 1;
            if (ratio < 0.5) return 2;
            if (ratio < 0.75) return 3;
            return 4;
        };

        const yearData: HeatmapData[] = [];
        const allDays = eachDayOfInterval({ start: jan1, end: dec31 });
        for (const date of allDays) {
            const dateStr = format(date, "yyyy-MM-dd");
            const existing = dataMap.get(dateStr);
            yearData.push({
                date: dateStr,
                count: existing?.count || 0,
                level: existing ? getLevel(existing.count) : 0,
            });
        }
        return yearData;
    }, [data, selectedYear]);

    const totalPlays = processedData.reduce((sum, d) => sum + d.count, 0);

    return (
        <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-sm overflow-hidden flex flex-col">
            <CardHeader className="w-full pb-2">
                <CardTitle className="text-zinc-100 flex items-center justify-between">
                    <span>{t('yearlyActivity')}</span>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => {
                                const idx = sortedYears.indexOf(selectedYear);
                                if (idx < sortedYears.length - 1) setSelectedYear(sortedYears[idx + 1]);
                            }}
                            disabled={!canGoPrev}
                            className="p-1 rounded-md hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title={t('previousYear')}
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-sm font-medium text-zinc-300 bg-zinc-800/50 px-3 py-1 rounded-md min-w-[60px] text-center">
                            {selectedYear}
                        </span>
                        <button
                            onClick={() => {
                                const idx = sortedYears.indexOf(selectedYear);
                                if (idx > 0) setSelectedYear(sortedYears[idx - 1]);
                            }}
                            disabled={!canGoNext}
                            className="p-1 rounded-md hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title={t('nextYear')}
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </CardTitle>
                <CardDescription className="text-zinc-400">
                    {t('playsInYear', { count: totalPlays, year: selectedYear })}
                </CardDescription>
            </CardHeader>
            <CardContent className="w-full pb-6 pt-4 px-4" ref={containerRef}>
                <div className="w-full">
                    <ActivityCalendar
                        data={processedData}
                        theme={customTheme}
                        colorScheme="dark"
                        blockSize={blockSize}
                        blockRadius={3}
                        blockMargin={3}
                        fontSize={blockSize < 11 ? 10 : 12}
                        labels={{
                            months: t('months').split(','),
                            weekdays: t('weekdays').split(','),
                            totalCount: t('playsTotal'),
                            legend: {
                                less: t('less'),
                                more: t('more')
                            }
                        }}
                        renderBlock={(block: any, activity: any) => (
                            <TooltipProvider delayDuration={50}>
                                <Tooltip>
                                    <TooltipTrigger asChild>{block}</TooltipTrigger>
                                    <TooltipContent className="bg-zinc-800 text-zinc-100 border-zinc-700 pointer-events-none">
                                        <div className="flex flex-col text-xs space-y-1">
                                            <span className="font-semibold">{t('playsCount', { count: activity.count })}</span>
                                            <span className="text-zinc-400">
                                                {format(new Date(activity.date), "EEEE d MMMM yyyy", { locale: dateFnsLocale })}
                                            </span>
                                        </div>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        )}
                    />
                </div>
            </CardContent>
        </Card>
    );
}
