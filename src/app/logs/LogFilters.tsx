"use client";

import { Search, ArrowUpDown, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { useTranslations } from 'next-intl';

interface LogFiltersProps {
    initialQuery: string;
    initialSort: string;
}

export function LogFilters({ initialQuery, initialSort }: LogFiltersProps) {
    const router = useRouter();
    const t = useTranslations('logs');
    const tc = useTranslations('common');

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const query = formData.get("query") as string;
        const sort = formData.get("sort") as string;

        const params = new URLSearchParams();
        if (query) params.set("query", query);
        if (sort) params.set("sort", sort);

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
        <form className="flex md:flex-row flex-col gap-4" onSubmit={handleSubmit}>
            <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                    name="query"
                    type="text"
                    defaultValue={initialQuery}
                    placeholder={t('searchPlaceholder')}
                    className="pl-9"
                />
            </div>
            <div className="flex gap-2">
                <div className="border rounded-md px-3 py-2 text-sm bg-background flex flex-row items-center cursor-pointer hover:bg-muted relative group">
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
                <button type="submit" className="bg-primary text-primary-foreground font-medium px-4 py-2 rounded-md hover:bg-primary/90 transition-colors">
                    {tc('search')}
                </button>
            </div>
        </form>
    );
}
