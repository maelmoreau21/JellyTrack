"use client";

import { Search, ArrowUpDown, Download, Filter, Film, Tv, Music, BookOpen, Server, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from 'next-intl';
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

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
    initialServers?: string;
    serverOptions?: Array<{ id: string; name: string }>;
    multiServerEnabled?: boolean;
    hideSearch?: boolean;
}

export function LogFilters({ initialQuery, initialSort, initialHideZapped, initialType, initialClient, initialAudio, initialSubtitle, initialDateFrom, initialDateTo, initialServers = "", serverOptions = [], multiServerEnabled = false, hideSearch = false }: LogFiltersProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const t = useTranslations('logs');
    const tc = useTranslations('common');
    const tch = useTranslations('charts');

    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
    const initialMediaTypes = initialType ? initialType.split(',').map(s => s.trim()).filter(Boolean) : [];
    const [mediaTypes, setMediaTypes] = useState<string[]>(initialMediaTypes);
    const validServerIds = new Set(serverOptions.map((server) => server.id));
    const initialServerIds = initialServers
        ? initialServers
            .split(',')
            .map((id) => id.trim())
            .filter((id) => id.length > 0 && validServerIds.has(id))
        : [];
    const [selectedServers, setSelectedServers] = useState<string[]>(initialServerIds);
    const allServersSelected = selectedServers.length === 0;
    const exportParams = new URLSearchParams(searchParams.toString());
    if (multiServerEnabled && selectedServers.length > 0) {
        exportParams.set("servers", selectedServers.join(","));
    } else {
        exportParams.delete("servers");
    }
    const exportQuery = exportParams.toString();

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        // Preserve existing query param if this form does not include a `query` input
        const formHasQuery = formData.has("query");
        const query = formHasQuery ? (formData.get("query") as string) : (searchParams.get("query") || "");
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

        if (mediaTypes.length) params.set("type", mediaTypes.join(",")); else params.delete("type");
        if (client) params.set("client", client); else params.delete("client");
        if (audio) params.set("audio", audio); else params.delete("audio");
        if (subtitle) params.set("subtitle", subtitle); else params.delete("subtitle");
        if (dateFrom) params.set("dateFrom", dateFrom); else params.delete("dateFrom");
        if (dateTo) params.set("dateTo", dateTo); else params.delete("dateTo");
        if (multiServerEnabled && selectedServers.length > 0) params.set("servers", selectedServers.join(",")); else params.delete("servers");

        params.delete("page");
        router.push(`/logs?${params.toString()}`);
    };


    return (
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex md:flex-row flex-col gap-2 md:gap-4">
                <div className="relative flex-1 md:min-w-[350px]">
                    {!hideSearch && (
                        <>
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                            <Input
                                name="query"
                                type="text"
                                defaultValue={initialQuery}
                                placeholder={t('searchPlaceholder')}
                                className="app-field pl-9 h-10 md:h-9 w-full"
                            />
                        </>
                    )}
                </div>
                <div className="flex flex-col md:flex-row gap-2 md:items-center w-full md:w-auto">
                    <div className="flex items-center justify-between md:justify-start w-full md:w-auto gap-4 pl-1 md:pr-3">
                        <div className="flex items-center gap-2">
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
                            <label htmlFor="hideZapped" className="text-sm cursor-pointer whitespace-nowrap font-medium text-foreground/80 dark:text-slate-300">
                                {t('hideZapped')}
                            </label>
                        </div>

                        <Button 
                            type="button" 
                            variant="ghost"
                            size="sm"
                            className="h-10 md:h-9 px-3 hover:bg-muted"
                            onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                        >
                            <Filter className={`w-4 h-4 mr-2 ${isAdvancedOpen ? 'text-primary' : ''}`} />
                            <span className="text-sm font-semibold">{tc('filters')}</span>
                        </Button>

                        {Boolean(initialQuery || initialType || initialClient || initialAudio || initialSubtitle || initialDateFrom || initialDateTo || !initialHideZapped || (initialSort && initialSort !== 'date_desc')) && (
                            <Button 
                                type="button" 
                                variant="ghost"
                                size="sm"
                                className="h-10 md:h-9 px-2.5 text-red-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                onClick={() => {
                                    setMediaTypes([]);
                                    setSelectedServers([]);
                                    router.push(window.location.pathname);
                                }}
                                title="Réinitialiser tous les filtres"
                            >
                                <RotateCcw className="w-3.5 h-3.5 mr-1" />
                                <span className="text-xs font-semibold">Réinitialiser</span>
                            </Button>
                        )}
                    </div>


                    <div className="grid grid-cols-2 md:flex md:flex-row gap-2 w-full md:w-auto">
                        <div className="relative group h-10 md:h-9">
                            <Select 
                                defaultValue={initialSort} 
                                onValueChange={(val) => {
                                    const params = new URLSearchParams(searchParams.toString());
                                    params.set("sort", val);
                                    params.delete("page");
                                    router.push(`/logs?${params.toString()}`);
                                }}
                            >
                                <SelectTrigger className="h-full w-full md:w-[200px] font-semibold text-foreground">
                                    <div className="flex items-center gap-2">
                                        <ArrowUpDown className="w-4 h-4" />
                                        <SelectValue placeholder={t('sortBy')} />
                                    </div>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="date_desc">{t('sortDateDesc')}</SelectItem>
                                    <SelectItem value="date_asc">{t('sortDateAsc')}</SelectItem>
                                    <SelectItem value="duration_desc">{t('sortDurationDesc')}</SelectItem>
                                    <SelectItem value="duration_asc">{t('sortDurationAsc')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        
                        <button type="submit" className="bg-primary text-primary-foreground font-medium px-4 py-2 rounded-md hover:bg-primary/90 transition-colors h-10 md:h-9 md:hidden lg:block order-last md:order-none">
                            {tc('search')}
                        </button>
                        
                        <div className="flex items-center gap-1">
                            <a href={`/api/logs/export?${exportQuery}`} className="flex items-center justify-center gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium px-3 py-2 rounded-l-md hover:bg-emerald-500/20 transition-colors h-10 md:h-9 text-xs whitespace-nowrap border border-emerald-500/20" title="Exporter en CSV">
                                <Download className="w-3.5 h-3.5" />
                                <span>CSV</span>
                            </a>
                            <a href={`/api/logs/export?${exportQuery}&format=json`} className="flex items-center justify-center gap-1.5 bg-sky-500/10 text-sky-600 dark:text-sky-400 font-medium px-3 py-2 rounded-r-md hover:bg-sky-500/20 transition-colors h-10 md:h-9 text-xs whitespace-nowrap border border-sky-500/20 border-l-0" title="Exporter en JSON structuré">
                                <Download className="w-3.5 h-3.5" />
                                <span>JSON</span>
                            </a>
                        </div>

                        <button type="submit" className="hidden md:block lg:hidden bg-primary text-primary-foreground font-medium px-4 py-2 rounded-md hover:bg-primary/90 transition-colors h-10 md:h-9">
                            {tc('search')}
                        </button>
                    </div>
                </div>
            </div>

            {isAdvancedOpen && (
                <div className="col-span-1 md:col-span-4 p-4 rounded-xl app-surface-soft border border-border flex flex-col gap-4 mt-1 transition-all">
                    
                    <div className="flex flex-col lg:flex-row gap-6">
                        {/* Media Type Segmented Control */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{t?.('typeFilter') || 'Media type'}</label>
                            <div className="app-surface-nested flex flex-wrap items-center p-1 rounded-lg w-fit">
                                {[
                                    { value: "", icon: null, labelKey: "all" },
                                    { value: "Movie", icon: Film, labelKey: "moviesFilter" },
                                    { value: "Episode", icon: Tv, labelKey: "seriesFilter" },
                                    { value: "Audio", icon: Music, labelKey: "musicFilter" },
                                    { value: "AudioBook", icon: BookOpen, labelKey: "booksFilter" },
                                ].map(({ value, icon: Icon, labelKey }) => {
                                    const isActive = value ? mediaTypes.includes(value) : mediaTypes.length === 0;
                                    return (
                                        <button
                                            key={value || "all"}
                                            type="button"
                                            onClick={() => {
                                                if (!value) {
                                                    setMediaTypes([]);
                                                } else {
                                                    setMediaTypes(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
                                                }
                                            }}
                                            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                                                isActive
                                                    ? "bg-primary/15 text-primary shadow-sm border border-primary/25"
                                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                            }`}
                                        >
                                            {Icon && <Icon className="w-3.5 h-3.5" />}
                                            {labelKey === "all" ? tc('all') : t(labelKey)}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {multiServerEnabled && serverOptions.length > 1 && (
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{tch('server')}</label>
                                <div className="app-surface-nested flex flex-wrap items-center p-1 rounded-lg w-fit">
                                    <button
                                        type="button"
                                        onClick={() => setSelectedServers([])}
                                        className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                                            allServersSelected
                                                ? "bg-primary/15 text-primary shadow-sm border border-primary/25"
                                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                        }`}
                                    >
                                        {tc('all')}
                                    </button>

                                    {serverOptions.map((server) => {
                                        const isActive = allServersSelected ? true : selectedServers.includes(server.id);
                                        return (
                                            <button
                                                key={server.id}
                                                type="button"
                                                onClick={() => {
                                                    if (allServersSelected) {
                                                        setSelectedServers([server.id]);
                                                        return;
                                                    }
                                                    setSelectedServers((prev) =>
                                                        prev.includes(server.id)
                                                            ? prev.filter((id) => id !== server.id)
                                                            : [...prev, server.id]
                                                    );
                                                }}
                                                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                                                    isActive
                                                        ? "bg-primary/15 text-primary shadow-sm border border-primary/25"
                                                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                                }`}
                                            >
                                                <Server className="w-3.5 h-3.5" />
                                                {server.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="space-y-1.5 flex flex-col">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t?.('clientFilter') || 'Client / App'}</label>
                            <Input name="client" type="text" placeholder="ex: Jellyfin Web, Android" defaultValue={initialClient} className="app-field h-9" />
                        </div>
                        <div className="space-y-1.5 flex flex-col">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t?.('audioFilter') || 'Audio (Code/Language)'}</label>
                            <Input name="audio" type="text" placeholder="ex: aac, fre, eng" defaultValue={initialAudio} className="app-field h-9" />
                        </div>
                        <div className="space-y-1.5 flex flex-col">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t?.('subtitleFilter') || 'Subtitles (Code/Language)'}</label>
                            <Input name="subtitle" type="text" placeholder="ex: subrip, eng, fre" defaultValue={initialSubtitle} className="app-field h-9" />
                        </div>
                        <div className="space-y-1.5 grid grid-cols-2 gap-2">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t?.('dateFrom') || 'Date (From)'}</label>
                                <Input name="dateFrom" type="date" defaultValue={initialDateFrom} className="app-field h-9" />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t?.('dateTo') || 'Date (To)'}</label>
                                <Input name="dateTo" type="date" defaultValue={initialDateTo} className="app-field h-9" />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </form>
    );
}
