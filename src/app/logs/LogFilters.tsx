"use client";

import { Search, ArrowUpDown, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from 'next-intl';

interface LogFiltersProps {
    initialQuery: string;
    initialSort: string;
}

export function LogFilters({ initialQuery, initialSort }: LogFiltersProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const t = useTranslations('logs');
    const tc = useTranslations('common');

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const query = formData.get("query") as string;
        const sort = formData.get("sort") as string;

        const params = new URLSearchParams(searchParams.toString());
        if (query) params.set("query", query);
        else params.delete("query");
        if (sort) params.set("sort", sort);
        else params.delete("sort");

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
        <form className="flex md:flex-row flex-col gap-2 md:gap-4" onSubmit={handleSubmit}>
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
            <div className="flex gap-2">
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
            </div>
        </form>
    );
}
