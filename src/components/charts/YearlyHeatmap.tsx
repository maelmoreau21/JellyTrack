"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from 'next-themes';
import { useTranslations, useLocale } from 'next-intl';
import { normalizeLibraryKey } from '@/lib/mediaPolicy';
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
    dataByType?: Record<string, HeatmapData[]>;
    libraryTypes?: string[];
}

const LIBRARY_COLORS: Record<string, string> = {
    'movies': '#3b82f6',
    'tvshows': '#22c55e',
    'music': '#eab308',
    'books': '#a855f7',
    'Movie': '#3b82f6',
    'Episode': '#22c55e',
    'Audio': '#eab308',
    'Series': '#14b8a6',
};

const customTheme: ThemeInput = {
    light: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
    dark: ['#27272a', '#312e81', '#4338ca', '#4f46e5', '#6366f1'],
};

export function YearlyHeatmap({ data, availableYears, dataByType, libraryTypes }: YearlyHeatmapProps) {
    const t = useTranslations('charts');
    const tc = useTranslations('common');
    const locale = useLocale();
    const dateFnsLocale = locale === 'fr' ? fr : enUS;
    const { theme } = useTheme();
    const [mountedTheme, setMountedTheme] = useState(false);
    useEffect(() => {
        const id = window.setTimeout(() => setMountedTheme(true), 0);
        return () => clearTimeout(id);
    }, []);
    const currentYear = new Date().getFullYear();
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [selectedLibrary, setSelectedLibrary] = useState<string>('_total');
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

    // Dynamic block size: fill the container width (53 weeks + label margin)
    const blockSize = useMemo(() => {
        if (containerWidth <= 0) return 14; // default before measurement
        const WEEKS = 53;
        const LABEL_MARGIN = 44; // more room for weekday/month labels
        const BLOCK_MARGIN = 2; // smaller margin to fit more neatly
        const available = Math.max(0, containerWidth - LABEL_MARGIN);
        const computed = Math.floor(available / WEEKS) - BLOCK_MARGIN;
        return Math.max(10, Math.min(20, computed)); // clamp 10..20 for readability
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

        // Use filtered data based on selected library
        const sourceData = (selectedLibrary !== '_total' && dataByType?.[selectedLibrary]) 
            ? dataByType[selectedLibrary] 
            : data;

        // Filter data for the selected year
        const yearEntries = sourceData.filter(d => d.date.startsWith(String(selectedYear)));
        const dataMap = new Map(yearEntries.map(d => [d.date, d]));

        // Recompute levels based on the year's average (mean) so coloring reflects relative activity
        const allDays = eachDayOfInterval({ start: jan1, end: dec31 });
        const countsAll = allDays.map((d) => {
            const ds = format(d, "yyyy-MM-dd");
            return dataMap.get(ds)?.count || 0;
        });
        const sumAll = countsAll.reduce((s, v) => s + v, 0);
        const mean = countsAll.length > 0 ? sumAll / countsAll.length : 0;

        const getLevel = (count: number): 0 | 1 | 2 | 3 | 4 => {
            if (count === 0) return 0;
            // If mean is 0 (no activity), fallback to a simple presence bucket
            if (mean === 0) return 1;

            const ratio = count / mean; // how many times above/below average
            if (ratio < 0.5) return 1;
            if (ratio < 1) return 2;
            if (ratio < 2) return 3;
            return 4;
        };

        const yearData: HeatmapData[] = [];
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
    }, [data, dataByType, selectedYear, selectedLibrary]);

    const totalPlays = processedData.reduce((sum, d) => sum + d.count, 0);
    const totalCountLabel = useMemo(() => {
        const rawValue = t.raw('playsTotal');
        const base = typeof rawValue === 'string' ? rawValue : '{{count}} plays in {{year}}';

        return base
            .replace(/\{\{\s*count\s*\}\}/g, '__COUNT__')
            .replace(/\{\{\s*year\s*\}\}/g, '__YEAR__')
            .replace(/\{\s*count\s*\}/g, '{{count}}')
            .replace(/\{\s*year\s*\}/g, '{{year}}')
            .replace(/__COUNT__/g, '{{count}}')
            .replace(/__YEAR__/g, '{{year}}');
    }, [t]);

    return (
        <Card className="app-surface border-border overflow-hidden flex flex-col">
            <CardHeader className="w-full pb-2">
                <CardTitle className="flex items-center justify-between text-zinc-900 dark:text-zinc-100">
                    <span>{t('yearlyActivity')}</span>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => {
                                const idx = sortedYears.indexOf(selectedYear);
                                if (idx < sortedYears.length - 1) setSelectedYear(sortedYears[idx + 1]);
                            }}
                            disabled={!canGoPrev}
                            className="p-1 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title={t('previousYear')}
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300 bg-zinc-100/50 dark:bg-zinc-800/50 px-3 py-1 rounded-md min-w-[60px] text-center">
                            {selectedYear}
                        </span>
                        <button
                            onClick={() => {
                                const idx = sortedYears.indexOf(selectedYear);
                                if (idx > 0) setSelectedYear(sortedYears[idx - 1]);
                            }}
                            disabled={!canGoNext}
                            className="p-1 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title={t('nextYear')}
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </CardTitle>
                <CardDescription className="text-zinc-400">
                    {t('playsInYear', { count: totalPlays, year: selectedYear })}
                </CardDescription>
                {libraryTypes && libraryTypes.length > 1 && (
                    <div className="flex flex-wrap gap-1.5 pt-2">
                        <button
                            onClick={() => setSelectedLibrary('_total')}
                            className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                                selectedLibrary === '_total'
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                            }`}
                        >
                            {t('all')}
                        </button>
                        {libraryTypes.map(lib => {
                            const norm = normalizeLibraryKey(lib) || lib;
                            let label = lib;
                            try { label = tc(norm); } catch { label = lib; }
                            const bgColor = LIBRARY_COLORS[norm] || LIBRARY_COLORS[lib] || undefined;
                            return (
                                <button
                                    key={lib}
                                    onClick={() => setSelectedLibrary(lib)}
                                    className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                                        selectedLibrary === lib
                                            ? 'text-white'
                                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                    }`}
                                    style={selectedLibrary === lib ? { backgroundColor: bgColor || '#6366f1' } : undefined}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                )}
            </CardHeader>
            <CardContent className="w-full pb-6 pt-4 px-4" ref={containerRef}>
                <div className="w-full">
                    <div className="w-full overflow-hidden">
                    <ActivityCalendar
                        data={processedData}
                        theme={customTheme}
                        colorScheme={mountedTheme && theme === 'dark' ? 'dark' : 'light'}
                        blockSize={blockSize}
                        blockRadius={3}
                        blockMargin={2}
                        fontSize={blockSize < 11 ? 10 : 12}
                        labels={{
                            months: t('months').split(','),
                            weekdays: t('weekdays').split(','),
                            totalCount: totalCountLabel,
                            legend: {
                                less: t('less'),
                                more: t('more')
                            }
                        }}
                        renderBlock={(block, activity) => (
                            <TooltipProvider delayDuration={50}>
                                <Tooltip>
                                    <TooltipTrigger asChild>{block}</TooltipTrigger>
                                    <TooltipContent className="bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 pointer-events-none">
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
                </div>
            </CardContent>
        </Card>
    );
}
