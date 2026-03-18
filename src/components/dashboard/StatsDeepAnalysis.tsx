"use client";

import { useState, useEffect } from "react";
import { User, Video, Building2, TrendingUp, ChevronRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { useTranslations } from "next-intl";
import Link from "next/link";

type StatItem = { name: string; count: number };

export default function StatsDeepAnalysis() {
    const t = useTranslations('stats');
    const [data, setData] = useState<{
        topDirectors: StatItem[];
        topActors: StatItem[];
        topStudios: StatItem[];
    } | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch("/api/stats/deep");
                if (res.ok) {
                    const json = await res.json();
                    setData(json);
                }
            } catch (err) {
                console.error("Failed to load deep stats", err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    if (loading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="h-64 bg-zinc-800/20 rounded-xl" />
                ))}
            </div>
        );
    }

    if (!data) return null;

    const sections = [
        { title: "Top Directors", icon: Video, items: data.topDirectors, color: "text-sky-400", bg: "bg-sky-400/10", actionText: "films/séries réalisés" },
        { title: "Top Actors", icon: User, items: data.topActors, color: "text-violet-400", bg: "bg-violet-400/10", actionText: "apparitions (films/séries)" },
        { title: "Top Studios", icon: Building2, items: data.topStudios, color: "text-emerald-400", bg: "bg-emerald-400/10", actionText: "films/séries produits" },
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {sections.map((section) => (
                <Card key={section.title} className="app-surface overflow-hidden group">
                    <CardHeader className="pb-3 border-b border-white/[0.03]">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className={`p-1.5 rounded-lg ${section.bg}`}>
                                    <section.icon className={`w-4 h-4 ${section.color}`} />
                                </div>
                                <CardTitle className="text-base">{section.title}</CardTitle>
                            </div>
                            <TrendingUp className="w-4 h-4 text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="divide-y divide-white/[0.03]">
                            {section.items.length > 0 ? (
                                section.items.map((item, idx) => (
                                    <Link key={item.name} href={`/media?q=${encodeURIComponent(item.name)}`} className="flex items-center px-4 py-3 hover:bg-white/[0.04] transition-colors group/item block">
                                        <div className="flex items-center justify-center w-6 h-6 shrink-0 rounded-full bg-zinc-800/50 text-[10px] font-mono font-bold text-zinc-500 mr-3 group-hover/item:text-zinc-300 group-hover/item:bg-zinc-700/50 transition-colors">
                                            {idx + 1}
                                        </div>
                                        <div className="flex-1 min-w-0 pr-4">
                                            <div className="text-sm font-bold text-zinc-200 truncate group-hover/item:text-primary transition-colors">{item.name}</div>
                                            <div className="text-[11px] font-medium text-zinc-500 truncate mt-0.5 group-hover/item:text-zinc-400 transition-colors">
                                                <span className="text-zinc-400 font-bold">{item.count}</span> {section.actionText}
                                            </div>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-zinc-700 shrink-0 group-hover/item:text-primary transition-colors" />
                                    </Link>
                                ))
                            ) : (
                                <div className="p-8 text-center text-sm text-zinc-500 italic">
                                    No data available
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
