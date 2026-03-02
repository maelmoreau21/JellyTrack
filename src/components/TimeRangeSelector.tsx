"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, X } from "lucide-react";
import { format, parse } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { DateRange } from "react-day-picker";
import { useTranslations, useLocale } from "next-intl";

const DATE_LOCALES: Record<string, Locale> = { fr, en: enUS };

export function TimeRangeSelector() {
    const t = useTranslations('timeRange');
    const locale = useLocale();
    const dateFnsLocale = DATE_LOCALES[locale] || fr;
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const timeRange = searchParams.get("timeRange") || "7d";

    // Parse custom dates from URL
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    const [date, setDate] = useState<DateRange | undefined>(() => {
        if (timeRange === "custom" && fromParam && toParam) {
            return {
                from: new Date(fromParam),
                to: new Date(toParam)
            }
        }
        return undefined;
    });

    const handleValueChange = (value: string) => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("from");
        params.delete("to");
        params.set("timeRange", value);
        if (value !== "custom") {
            setDate(undefined);
        }
        router.push(`${pathname}?${params.toString()}`);
    };

    const handleDateSelect = (selectedDate: DateRange | undefined) => {
        setDate(selectedDate);
        if (selectedDate?.from && selectedDate?.to) {
            const params = new URLSearchParams(searchParams.toString());
            params.set("timeRange", "custom");
            params.set("from", format(selectedDate.from, "yyyy-MM-dd"));
            params.set("to", format(selectedDate.to, "yyyy-MM-dd"));
            router.push(`${pathname}?${params.toString()}`);
        }
    };

    return (
        <div className="flex items-center gap-2">
            <Select value={timeRange} onValueChange={handleValueChange}>
                <SelectTrigger className="w-[180px] bg-zinc-900 border-zinc-800 text-sm h-9">
                    <SelectValue placeholder={t('period')} />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                    <SelectItem value="24h">{t('last24h')}</SelectItem>
                    <SelectItem value="7d">{t('last7d')}</SelectItem>
                    <SelectItem value="30d">{t('last30d')}</SelectItem>
                    <SelectItem value="all">{t('allTime')}</SelectItem>
                    <SelectItem value="custom">{t('custom')}</SelectItem>
                </SelectContent>
            </Select>

            {timeRange === "custom" && (
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            className={`h-9 bg-zinc-900 border-zinc-800 justify-start text-left font-normal ${!date && "text-muted-foreground"}`}
                        >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {date?.from ? (
                                date.to ? (
                                    <>
                                        {format(date.from, "dd MMM", { locale: dateFnsLocale })} -{" "}
                                        {format(date.to, "dd MMM", { locale: dateFnsLocale })}
                                    </>
                                ) : (
                                    format(date.from, "dd MMM yyyy", { locale: dateFnsLocale })
                                )
                            ) : (
                                <span>{t('pickDate')}</span>
                            )}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-zinc-950 border-zinc-800" align="end">
                        <Calendar
                            initialFocus
                            mode="range"
                            defaultMonth={date?.from}
                            selected={date}
                            onSelect={handleDateSelect}
                            numberOfMonths={2}
                            locale={dateFnsLocale}
                        />
                    </PopoverContent>
                </Popover>
            )}
        </div>
    );
}
