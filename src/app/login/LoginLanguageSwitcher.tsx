"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useRef, useEffect, useTransition, useId } from "react";
import { ChevronDown } from "lucide-react";
import { AVAILABLE_LOCALES, DEFAULT_LOCALE, isSupportedLocale } from "@/i18n/locales";

export function LoginLanguageSwitcher() {
    const locale = useLocale();
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const menuId = useId();
    const selectedLocale = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
    const current = AVAILABLE_LOCALES.find(l => l.code === selectedLocale) || AVAILABLE_LOCALES[0];

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    useEffect(() => {
        if (!open) return;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setOpen(false);
            }
        };

        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [open]);

    function switchLocale(newLocale: string) {
        if (!isSupportedLocale(newLocale)) return;
        // Setting the cookie is a client-only side-effect; silence immutability lint here
        // eslint-disable-next-line react-hooks/immutability
        document.cookie = `locale=${newLocale};path=/;max-age=${365 * 24 * 60 * 60}`;
        setOpen(false);
        startTransition(() => {
            router.refresh();
        });
    }

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                onKeyDown={(event) => {
                    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setOpen(true);
                    }
                }}
                disabled={isPending}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all border ${
                    open
                        ? "border-indigo-500/30 bg-indigo-500/10 text-zinc-900 dark:text-zinc-100"
                        : "border-zinc-300 dark:border-zinc-700/50 bg-white/80 dark:bg-zinc-900/50 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 hover:border-zinc-400 dark:hover:border-zinc-600"
                } ${isPending ? "opacity-50 cursor-wait" : ""}`}
                aria-expanded={open}
                aria-haspopup="menu"
                aria-controls={open ? menuId : undefined}
            >
                <img
                    src={`https://flagcdn.com/w40/${current.iso}.png`}
                    alt={current.label}
                    width={20}
                    height={14}
                    loading="lazy"
                    decoding="async"
                    className="w-5 h-3.5 object-cover rounded-sm shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                />
                <span className="font-medium text-zinc-800 dark:text-zinc-100">{current.label}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>

            {open && (
                <div
                    id={menuId}
                    role="menu"
                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-56 rounded-xl border border-zinc-200 dark:border-zinc-700/80 bg-white dark:bg-zinc-900/95 backdrop-blur-xl shadow-2xl p-1.5 animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200"
                >
                    {AVAILABLE_LOCALES.map((loc) => (
                        <button
                            key={loc.code}
                            type="button"
                            role="menuitemradio"
                            aria-checked={loc.code === selectedLocale}
                            onClick={() => switchLocale(loc.code)}
                            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all ${
                                loc.code === selectedLocale
                                    ? "bg-indigo-500/15 text-indigo-700 dark:text-indigo-200 font-medium"
                                    : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100"
                            }`}
                        >
                            <img
                                src={`https://flagcdn.com/w40/${loc.iso}.png`}
                                alt={loc.label}
                                width={20}
                                height={14}
                                loading="lazy"
                                decoding="async"
                                className="w-5 h-3.5 object-cover rounded-sm shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                            />
                            <span className="flex-1 text-left">{loc.label}</span>
                            {loc.code === selectedLocale && (
                                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">✓</span>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
