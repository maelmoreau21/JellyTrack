"use client";

import React, { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { HeatmapDrillDown } from './HeatmapDrillDown';

interface HeatmapCell {
    day: number;
    hour: number;
    value: number;
}

interface AttendanceHeatmapProps {
    data: HeatmapCell[];
}

export function AttendanceHeatmap({ data }: AttendanceHeatmapProps) {
    const t = useTranslations('charts');
    const dayNames = t('dayNamesShort').split(',');

    const [drillDown, setDrillDown] = useState<{ day: number; hour: number; label: string } | null>(null);

    const maxVal = useMemo(() => Math.max(...data.map(d => d.value), 1), [data]);

    const getColor = (value: number) => {
        if (value === 0) return 'bg-zinc-200/60 dark:bg-zinc-800/60';
        const opacity = Math.max(0.2, value / maxVal);
        
        if (opacity <= 0.25) return 'bg-indigo-400/30 dark:bg-indigo-500/30';
        if (opacity <= 0.5) return 'bg-indigo-500/50 dark:bg-indigo-400/50';
        if (opacity <= 0.75) return 'bg-indigo-500/75 dark:bg-indigo-400/75';
        return 'bg-indigo-600 dark:bg-indigo-500';
    };

    const handleCellClick = (dayIdx: number, hourIdx: number, val: number) => {
        if (val === 0) return;
        setDrillDown({ day: dayIdx, hour: hourIdx, label: dayNames[dayIdx] || `Day ${dayIdx}` });
    };

    // Organize data into 7x24 grid
    const grid = useMemo(() => {
        const g = Array.from({ length: 7 }, () => Array(24).fill(0));
        data.forEach(d => {
            if (d.day >= 0 && d.day < 7 && d.hour >= 0 && d.hour < 24) {
                g[d.day][d.hour] = d.value;
            }
        });
        return g;
    }, [data]);

    const hours = Array.from({ length: 24 }, (_, i) => i);

    return (
        <TooltipProvider>
            <div className="w-full space-y-2 mt-4 select-none">
                {/* Hour labels — show every 4th on desktop, every 6th on mobile */}
                <div className="flex text-[8px] md:text-[10px] text-zinc-500 ml-6 md:ml-10 mb-2">
                    {hours.map(h => (
                        <div key={h} className="flex-1 text-center font-medium">
                            <span className="hidden md:inline">{h % 4 === 0 ? `${h}h` : ''}</span>
                            <span className="md:hidden">{h % 6 === 0 ? `${h}` : ''}</span>
                        </div>
                    ))}
                </div>

                <div className="space-y-0.5 md:space-y-1">
                    {grid.map((dayRow, dayIdx) => (
                        <div key={dayIdx} className="flex items-center gap-1 md:gap-2">
                            <div className="w-5 md:w-8 text-[8px] md:text-[10px] font-medium text-zinc-500 text-right uppercase tracking-wider">
                                {dayNames[dayIdx]}
                            </div>
                            <div className="flex-1 flex gap-0.5 md:gap-1 h-4 md:h-8">
                                {dayRow.map((val, hourIdx) => (
                                    <Tooltip key={hourIdx}>
                                        <TooltipTrigger asChild>
                                            <div 
                                                onClick={() => handleCellClick(dayIdx, hourIdx, val)}
                                                className={`flex-1 rounded-sm transition-all duration-300 hover:scale-110 hover:z-10 cursor-default ${getColor(val)} ${val > 0 ? 'cursor-pointer' : ''}`}
                                                style={val > 0 ? { boxShadow: `0 0 10px rgba(99, 102, 241, ${val / maxVal * 0.3})` } : {}}
                                            />
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="text-[10px] py-1 px-2">
                                            <div className="font-bold">{dayNames[dayIdx]} — {hourIdx}h</div>
                                            <div className="text-zinc-400">{val} {t('sessions')}</div>
                                            {val > 0 && <div className="text-[9px] text-indigo-400 mt-1 font-medium italic">{t('clickToViewDetail')}</div>}
                                        </TooltipContent>
                                    </Tooltip>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                
                {/* Legend — compact on mobile */}
                <div className="flex justify-end items-center gap-1.5 md:gap-2 pt-3 md:pt-4 text-[8px] md:text-[10px] text-zinc-500">
                    <span>{t('less')}</span>
                    <div className="flex gap-0.5 md:gap-1">
                        <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-sm bg-zinc-200/60 dark:bg-zinc-800/60" />
                        <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-sm bg-indigo-400/30 dark:bg-indigo-500/30" />
                        <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-sm bg-indigo-500/50 dark:bg-indigo-400/50" />
                        <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-sm bg-indigo-500/75 dark:bg-indigo-400/75" />
                        <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-sm bg-indigo-600 dark:bg-indigo-500" />
                    </div>
                    <span>{t('more')}</span>
                </div>
            </div>

            {/* Drill-down modal */}
            {drillDown && (
                <HeatmapDrillDown
                    open={!!drillDown}
                    onOpenChange={(open) => !open && setDrillDown(null)}
                    day={drillDown.day}
                    hour={drillDown.hour}
                    dayLabel={drillDown.label}
                />
            )}
        </TooltipProvider>
    );
}
