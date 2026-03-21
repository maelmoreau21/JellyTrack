"use client";

import { Search, ArrowUpDown, ChevronDown, Download, Filter, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from 'next-intl';
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface LogFiltersProps {
    initialQuery: string;
    initialSort: string;
    initialHideZapped: boolean;
    initialClient: string;
    initialAudio: string;
    initialSubtitle: string;
    initialDateFrom: string;
    initialDateTo: string;
}

export function LogFilters({ initialQuery, initialSort, initialHideZapped, initialClient, initialAudio, initialSubtitle, initialDateFrom, initialDateTo }: LogFiltersProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const t = useTranslations('logs');
    const tc = useTranslations('common');

    const [isAdvancedOpen, setIsAdvancedOpen] = useState(
        !!initialClient || !!initialAudio || !!initialSubtitle || !!initialDateFrom || !!initialDateTo
    );

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const query = formData.get("query") as string;
        const sort = formData.get("sort") as string;
        const hideZapped = formData.get("hideZapped") === "on";
        
        const client = formData.get("client") as string;
        const audio = formData.get("audio") as string;
        const subtitle = formData.get("subtitle") as string;
        const dateFrom = formData.get("dateFrom") as string;
        const dateTo = formData.get("dateTo") as string;

        const params = new URLSearchParams(searchParams.toString());
        if (query) params.set("query", query); else params.delete("query");
        if (sort) params.set("sort", sort); else params.delete("sort");
        if (!hideZapped) params.set("hideZapped", "false"); else params.delete("hideZapped");

        if (client) params.set("client", client); else params.delete("client");
        if (audio) params.set("audio", audio); else params.delete("audio");
        if (subtitle) params.set("subtitle", subtitle); else params.delete("subtitle");
        if (dateFrom) params.set("dateFrom", dateFrom); else params.delete("dateFrom");
        if (dateTo) params.set("dateTo", dateTo); else params.delete("dateTo");

        // Reset page to 1 when search changes
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
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">{t?.('clientFilter') || 'Client / Device'}</label>
                        <Input name="client" type="text" placeholder="ex: Jellyfin Web" defaultValue={initialClient} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">{t?.('audioFilter') || 'Audio (Code/Language)'}</label>
                        <Input name="audio" type="text" placeholder="ex: aac, fre, eng" defaultValue={initialAudio} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">{t?.('subtitleFilter') || 'Subtitle (Code/Language)'}</label>
                        <Input name="subtitle" type="text" placeholder="ex: subrip, fre" defaultValue={initialSubtitle} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1 grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-xs font-medium text-muted-foreground">{t?.('dateFrom') || 'Date (From)'}</label>
                            <Input name="dateFrom" type="date" defaultValue={initialDateFrom} className="h-8 text-sm" />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-muted-foreground">{t?.('dateTo') || 'Date (To)'}</label>
                            <Input name="dateTo" type="date" defaultValue={initialDateTo} className="h-8 text-sm" />
                        </div>
                    </div>
                </div>
            )}
        </form>
    );
}
