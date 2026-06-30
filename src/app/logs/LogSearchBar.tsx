"use client";

import React, { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from 'next-intl';

export default function LogSearchBar({ initialQuery }: { initialQuery?: string }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const t = useTranslations('logs');
    const initial = initialQuery ?? (searchParams.get('query') || '');
    const [value, setValue] = useState(initial);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const params = new URLSearchParams(searchParams.toString());
        if (value) params.set('query', value); else params.delete('query');
        params.delete('page');
        const qs = params.toString();
        router.push(`/logs${qs ? `?${qs}` : ''}`);
    };

    return (
        <form onSubmit={handleSubmit} className="w-full md:min-w-[350px]">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                    name="query"
                    type="text"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={t('searchPlaceholder')}
                    className="app-field pl-9 h-10 md:h-9 w-full placeholder:text-muted-foreground text-foreground"
                />
            </div>
        </form>
    );
}
