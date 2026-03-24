"use client";

import React, { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRouter } from "next/navigation";

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
    const router = useRouter();
    const dayNames = t('dayNamesShort').split(',');

    const maxVal = useMemo(() => Math.max(...data.map(d => d.value), 1), [data]);

    const getColor = (value: number) => {
        if (value === 0) return 'bg-zinc-100 dark:bg-zinc-900/40';
        const opacity = Math.max(0.2, value / maxVal);
        
        // Use indigo shades or similar
        if (opacity <= 0.25) return 'bg-indigo-500/20';
        if (opacity <= 0.5) return 'bg-indigo-500/40';
        if (opacity <= 0.75) return 'bg-indigo-500/70';
        return 'bg-indigo-500';
    };

    const handleCellClick = (dayIdx: number, hourIdx: number, val: number) => {
        if (val === 0) return;
        // Redirect to logs filtered by day and hour
        // Day is 0-6 (Sun-Sat or Mon-Sun depending on locale, but typically 0 is Sunday in JS)
        router.push(`/logs?day=${dayIdx}&hour=${hourIdx}`);
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
                <div className="flex text-[10px] text-zinc-500 ml-10 mb-2">
                    {hours.map(h => (
                        <div key={h} className="flex-1 text-center font-medium">
                            {h % 4 === 0 ? `${h}h` : ''}
                        </div>
                    ))}
                </div>

                <div className="space-y-1">
                    {grid.map((dayRow, dayIdx) => (
                        <div key={dayIdx} className="flex items-center gap-2">
                            <div className="w-8 text-[10px] font-medium text-zinc-500 text-right uppercase tracking-wider">
                                {dayNames[dayIdx]}
                            </div>
                            <div className="flex-1 flex gap-1 h-6 md:h-8">
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
                                            {val > 0 && <div className="text-[9px] text-indigo-400 mt-1 font-medium italic">Click to view logs</div>}
                                        </TooltipContent>
                                    </Tooltip>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                
                <div className="flex justify-end items-center gap-2 pt-4 text-[10px] text-zinc-500">
                    <span>Moins</span>
                    <div className="flex gap-1">
                        <div className="w-3 h-3 rounded-sm bg-zinc-100 dark:bg-zinc-900/40" />
                        <div className="w-3 h-3 rounded-sm bg-indigo-500/20" />
                        <div className="w-3 h-3 rounded-sm bg-indigo-500/40" />
                        <div className="w-3 h-3 rounded-sm bg-indigo-500/70" />
                        <div className="w-3 h-3 rounded-sm bg-indigo-500" />
                    </div>
                    <span>Plus</span>
                </div>
            </div>
        </TooltipProvider>
    );
}
