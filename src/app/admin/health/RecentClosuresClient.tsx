"use client";

import React, { useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Clock3, RadioTower, RefreshCw, ShieldAlert } from "lucide-react";

function SourceIcon({ source }: { source?: string | null }) {
    const s = (source || "").toLowerCase();
    if (s === "monitor") return <RadioTower className="h-4 w-4 text-cyan-500 mt-0.5" />;
    if (s === "sync") return <RefreshCw className="h-4 w-4 text-amber-500 mt-0.5" />;
    if (s === "backup") return <Clock3 className="h-4 w-4 text-emerald-500 mt-0.5" />;
    return <ShieldAlert className="h-4 w-4 text-zinc-500 mt-0.5" />;
}

export default function RecentClosuresClient({ events, defaultCount = 5 }: { events?: Array<any>, defaultCount?: number }) {
    const t = useTranslations("dashboard");
    const locale = useLocale();
    const [count, setCount] = useState<number>(defaultCount);

    const sorted = useMemo(() => {
        if (!Array.isArray(events)) return [];
        return [...events].sort((a, b) => {
            const ta = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
            const tb = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
            return tb - ta;
        });
    }, [events]);

    const list = sorted.slice(0, count);

    const formatDate = (s?: string | null) => {
        if (!s) return t("never");
        try { return new Date(s).toLocaleString(locale); } catch { return String(s); }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between">
                <div />
                <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{t("show")}</span>
                    <div className="inline-flex rounded-md border bg-transparent p-0.5">
                        {[5, 10, 20].map((n) => (
                            <button
                                key={n}
                                type="button"
                                onClick={() => setCount(n)}
                                className={`px-2 py-1 text-xs font-medium ${count === n ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100' } rounded`}
                            >
                                {n}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex-1 mt-3 space-y-2 overflow-y-auto pr-1">
                {list.length === 0 && (
                    <div className="app-surface-soft rounded-lg border border-dashed border-border py-8 text-center text-sm italic text-muted-foreground">{t("noRecentEvents")}</div>
                )}

                {list.map((event: any) => (
                    <div key={event.id} className="app-surface-soft rounded-lg border border-border p-3">
                        <div className="flex items-start gap-3 text-sm font-medium text-foreground">
                            <SourceIcon source={event.source} />
                            <div className="flex-1">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="leading-relaxed">{event.message ?? event.kind ?? JSON.stringify(event.details ?? {})}</div>
                                    <div className="text-xs text-muted-foreground ml-3">{String(event.kind || "").replace(/_/g, " ")}</div>
                                </div>
                                {event.details && typeof event.details === 'object' && (
                                    <div className="mt-2 text-xs text-muted-foreground">{Object.entries(event.details).map(([k, v]) => `${k}: ${String(v)}`).join(' · ')}</div>
                                )}
                            </div>
                        </div>
                        <div className="mt-2 text-right text-[10px] font-mono text-muted-foreground">{formatDate(event.createdAt)}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
