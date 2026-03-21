"use client";

import { Search, ArrowUpDown, ChevronDown, Download, Filter, Film, Tv, Music, BookOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from 'next-intl';
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface LogFiltersProps {
    initialQuery: string;
    initialSort: string;
    initialHideZapped: boolean;
    initialType: string;
    initialClient: string;
    initialAudio: string;
    initialSubtitle: string;
    initialDateFrom: string;
    initialDateTo: string;
}

export function LogFilters({ initialQuery, initialSort, initialHideZapped, initialType, initialClient, initialAudio, initialSubtitle, initialDateFrom, initialDateTo }: LogFiltersProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const t = useTranslations('logs');
    const tc = useTranslations('common');

    const [isAdvancedOpen, setIsAdvancedOpen] = useState(
        !!initialType || !!initialClient || !!initialAudio || !!initialSubtitle || !!initialDateFrom || !!initialDateTo
    );
    const [mediaType, setMediaType] = useState(initialType || "");

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const query = formData.get("query") as string;
        const sort = formData.get("sort") as string;
        const hideZapped = formData.get("hideZapped") === "on";
        
        // Use local state for type so user doesn't have to keep hidden input bound
        const client = formData.get("client") as string;
        const audio = formData.get("audio") as string;
        const subtitle = formData.get("subtitle") as string;
        const dateFrom = formData.get("dateFrom") as string;
        const dateTo = formData.get("dateTo") as string;

        const params = new URLSearchParams(searchParams.toString());
        if (query) params.set("query", query); else params.delete("query");
        if (sort) params.set("sort", sort); else params.delete("sort");
        if (!hideZapped) params.set("hideZapped", "false"); else params.delete("hideZapped");

        if (mediaType) params.set("type", mediaType); else params.delete("type");
        if (client) params.set("client", client); else params.delete("client");
        if (audio) params.set("audio", audio); else params.delete("audio");
        if (subtitle) params.set("subtitle", subtitle); else params.delete("subtitle");
        if (dateFrom) params.set("dateFrom", dateFrom); else params.delete("dateFrom");
        if (dateTo) params.set("dateTo", dateTo); else params.delete("dateTo");

        params.delete("page");
        router.push(`/logs?${params.toString()}`);
    };

    const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const form = e.target.form;
        if (form) {
            // Request form dispatch to trigger handleSubmit properly
            form.requestSubmit();
        }
    };

    return (
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex md:flex-row flex-col gap-2 md:gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <Input
                        name="query"
                        type="text"
                        defaultValue={initialQuery}
                        placeholder={t('searchPlaceholder')}
                        className="app-field pl-9 h-10 md:h-9"
                    />
                </div>
                <div className="flex flex-col md:flex-row gap-2 md:items-center">
                    <div className="flex items-center gap-2 pl-1 md:pr-3">
                        <input
                            type="checkbox"
                            id="hideZapped"
                            name="hideZapped"
                            defaultChecked={initialHideZapped}
                            onChange={(e) => {
                                const form = e.target.form;
                                if (form) form.requestSubmit();
                            }}
                            className="w-4 h-4 rounded accent-primary cursor-pointer text-indigo-600 focus:ring-indigo-500"
                        />
                        <label htmlFor="hideZapped" className="text-sm cursor-pointer whitespace-nowrap font-medium text-zinc-600 dark:text-zinc-300">
                            {t('hideZapped')}
                        </label>
                    </div>

                    <Button 
                        type="button" 
                        variant="outline"
                        size="sm"
                        className="h-10 md:h-9 bg-zinc-100 dark:bg-slate-700/50 border-0"
                        onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                    >
                        <Filter className="w-4 h-4 mr-2" />
                        {isAdvancedOpen ? tc('close') : tc('filters')}
                    </Button>

                    <div className="app-field rounded-md px-3 py-2 text-sm flex flex-row items-center cursor-pointer hover:bg-zinc-100 dark:hover:bg-slate-700/50 relative group h-10 md:h-9">
                        <span className="font-semibold mr-2 flex items-center gap-2"><ArrowUpDown className="w-4 h-4" /> {t('sortBy')}</span>
                        <ChevronDown className="w-4 h-4" />
                        <select
                            name="sort"
                            defaultValue={initialSort}
                            onChange={handleSortChange}
                            className="absolute w-full h-full opacity-0 cursor-pointer left-0 top-0"
                        >
                            <option value="date_desc">{t('sortDateDesc')}</option>
                            <option value="date_asc">{t('sortDateAsc')}</option>
                            <option value="duration_desc">{t('sortDurationDesc')}</option>
                            <option value="duration_asc">{t('sortDurationAsc')}</option>
                        </select>
                    </div>
                    <button type="submit" className="bg-primary text-primary-foreground font-medium px-4 py-2 rounded-md hover:bg-primary/90 transition-colors h-10 md:h-9">
                        {tc('search')}
                    </button>
                    
                    <a href={`/api/logs/export?${searchParams.toString()}`} className="flex items-center gap-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium px-4 py-2 rounded-md hover:bg-emerald-500/20 transition-colors h-10 md:h-9 whitespace-nowrap">
                        <Download className="w-4 h-4" />
                        {tc('export')}
                    </a>
                </div>
            </div>

            {isAdvancedOpen && (
                <div className="col-span-1 md:col-span-4 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex flex-col gap-5 mt-2 transition-all">
                    
                    {/* Media Type Segmented Control */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{t?.('typeFilter') || 'Type de média'}</label>
                        <div className="flex flex-wrap items-center p-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg w-fit">
                            {[
                                { value: "", icon: null, labelKey: "all" },
                                { value: "Movie", icon: Film, labelKey: "moviesFilter" },
                                { value: "Episode", icon: Tv, labelKey: "seriesFilter" },
                                { value: "Audio", icon: Music, labelKey: "musicFilter" },
                                { value: "AudioBook", icon: BookOpen, labelKey: "booksFilter" },
                            ].map(({ value, icon: Icon, labelKey }) => {
                                const isActive = mediaType === value;
                                return (
                                    <button
                                        key={value || "all"}
                                        type="button"
                                        onClick={() => setMediaType(value)}
                                        className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                                            isActive
                                                ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 shadow-sm"
                                                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
                                        }`}
                                    >
                                        {Icon && <Icon className="w-4 h-4" />}
                                        {labelKey === "all" ? tc('all') : t(labelKey)}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="space-y-1.5 flex flex-col">
                            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{t?.('clientFilter') || 'Client / App'}</label>
                            <Input name="client" type="text" placeholder="ex: Jellyfin Web, Android" defaultValue={initialClient} className="h-9 bg-white dark:bg-zinc-950/50" />
                        </div>
                        <div className="space-y-1.5 flex flex-col">
                            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{t?.('audioFilter') || 'Audio (Code/Langue)'}</label>
                            <Input name="audio" type="text" placeholder="ex: aac, fre, eng" defaultValue={initialAudio} className="h-9 bg-white dark:bg-zinc-950/50" />
                        </div>
                        <div className="space-y-1.5 flex flex-col">
                            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{t?.('subtitleFilter') || 'Sous-titres (Code/Langue)'}</label>
                            <Input name="subtitle" type="text" placeholder="ex: subrip, eng, fre" defaultValue={initialSubtitle} className="h-9 bg-white dark:bg-zinc-950/50" />
                        </div>
                        <div className="space-y-1.5 grid grid-cols-2 gap-2">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{t?.('dateFrom') || 'Date (Depuis)'}</label>
                                <Input name="dateFrom" type="date" defaultValue={initialDateFrom} className="h-9 bg-white dark:bg-zinc-950/50" />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{t?.('dateTo') || 'Date (Jusqu\'au)'}</label>
                                <Input name="dateTo" type="date" defaultValue={initialDateTo} className="h-9 bg-white dark:bg-zinc-950/50" />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </form>
    );
}
