"use client";

import { useState, useEffect } from "react";
import { User, Video, Building2, TrendingUp, ChevronRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { useTranslations } from "next-intl";

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
        { title: "Top Directors", icon: Video, items: data.topDirectors, color: "text-sky-400", bg: "bg-sky-400/10" },
        { title: "Top Actors", icon: User, items: data.topActors, color: "text-violet-400", bg: "bg-violet-400/10" },
        { title: "Top Studios", icon: Building2, items: data.topStudios, color: "text-emerald-400", bg: "bg-emerald-400/10" },
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
                                    <div key={item.name} className="flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors">
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs font-mono text-zinc-500 w-4">{idx + 1}</span>
                                            <span className="text-sm font-medium text-zinc-200 truncate max-w-[150px]">{item.name}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/50">
                                                {item.count}
                                            </span>
                                            <ChevronRight className="w-3 h-3 text-zinc-600" />
                                        </div>
                                    </div>
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
