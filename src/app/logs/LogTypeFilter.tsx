"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from 'next-intl';
import { Film, Tv, Music, BookOpen } from "lucide-react";

const TYPES = [
    { value: "", icon: null, labelKey: "all" as const },
    { value: "Movie", icon: Film, labelKey: "moviesFilter" as const },
    { value: "Episode", icon: Tv, labelKey: "seriesFilter" as const },
    { value: "Audio", icon: Music, labelKey: "musicFilter" as const },
    { value: "AudioBook", icon: BookOpen, labelKey: "booksFilter" as const },
];

export function LogTypeFilter({ currentType }: { currentType: string }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const t = useTranslations('logs');
    const tc = useTranslations('common');

    const handleTypeChange = (type: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (type) params.set("type", type);
        else params.delete("type");
        params.delete("page"); // Reset to page 1 on filter change
        router.push(`/logs?${params.toString()}`);
    };

    return (
        <div className="flex items-center gap-1.5 flex-wrap">
            {TYPES.map(({ value, icon: Icon, labelKey }) => {
                const isActive = currentType === value;
                return (
                    <button
                        key={value || "all"}
                        onClick={() => handleTypeChange(value)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isActive
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "app-field hover:bg-zinc-100 dark:hover:bg-zinc-700/50 text-zinc-700 dark:text-zinc-300"
                            }`}
                    >
                        {Icon && <Icon className="w-3.5 h-3.5" />}
                        {labelKey === "all" ? tc("all") : t(labelKey)}
                    </button>
                );
            })}
        </div>
    );
}
