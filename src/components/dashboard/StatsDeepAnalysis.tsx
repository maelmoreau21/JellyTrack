"use client";

import { useState, useEffect } from "react";
import { User, Video, Building2, TrendingUp, ChevronRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { useTranslations } from "next-intl";
import Link from "next/link";
import MediaSearchModal from '@/components/MediaSearchModal';

type StatItem = { name: string; count: number };

export default function StatsDeepAnalysis() {
    const t = useTranslations('deepInsights');
    const tc = useTranslations('common');

    const [data, setData] = useState<{ topDirectors: StatItem[]; topActors: StatItem[]; topStudios: StatItem[] }>({ topDirectors: [], topActors: [], topStudios: [] });
    const [loading, setLoading] = useState(true);

    // Modal state must be declared unconditionally before any early returns
    const [modalOpen, setModalOpen] = useState(false);
    const [modalQuery, setModalQuery] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;
        const fetchData = async () => {
            try {
                const res = await fetch("/api/stats/deep");
                if (res.ok) {
                    const json = await res.json();
                    if (mounted && json) {
                        setData({
                            topDirectors: Array.isArray(json.topDirectors) ? json.topDirectors : [],
                            topActors: Array.isArray(json.topActors) ? json.topActors : [],
                            topStudios: Array.isArray(json.topStudios) ? json.topStudios : [],
                        });
                    }
                } else {
                    console.warn('[StatsDeepAnalysis] /api/stats/deep returned', res.status);
                }
            } catch (err) {
                console.error("Failed to load deep stats", err);
            } finally {
                if (mounted) setLoading(false);
            }
        };
        fetchData();
        return () => { mounted = false; };
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

    const openModal = (q: string) => {
        setModalQuery(q);
        setModalOpen(true);
    };

    const sections = [
        { title: t('topDirectors') || 'Top Directors', icon: Video, items: data.topDirectors, color: "text-sky-400", bg: "bg-sky-400/10", actionText: t('topDirectors') || 'directed titles' },
        { title: t('topActors') || 'Top Actors', icon: User, items: data.topActors, color: "text-violet-400", bg: "bg-violet-400/10", actionText: t('topActors') || 'appearances' },
        { title: t('topStudios') || 'Top Studios', icon: Building2, items: data.topStudios, color: "text-emerald-400", bg: "bg-emerald-400/10", actionText: t('topStudios') || 'produced titles' },
    ];

    return (
        <>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {sections.map((section) => (
                <Card key={String(section.title)} className="app-surface overflow-hidden group">
                    <CardHeader className="pb-3 border-b border-border/50">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className={`p-1.5 rounded-lg ${section.bg}`}>
                                    <section.icon className={`w-4 h-4 ${section.color}`} />
                                </div>
                                <CardTitle className="text-base text-foreground">{section.title}</CardTitle>
                            </div>
                            <TrendingUp className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="divide-y divide-border/50">
                            {section.items && section.items.length > 0 ? (
                                section.items.map((item, idx) => (
                                    <button key={item.name} onClick={() => openModal(item.name)} className="w-full text-left flex items-center px-4 py-3 hover:bg-muted/30 transition-colors group/item block">
                                        <div className="flex items-center justify-center w-6 h-6 shrink-0 rounded-full bg-muted text-[10px] font-mono font-bold text-muted-foreground mr-3 group-hover/item:text-foreground group-hover/item:bg-accent/20 transition-colors">
                                            {idx + 1}
                                        </div>
                                        <div className="flex-1 min-w-0 pr-4">
                                            <div className="text-sm font-bold text-foreground truncate group-hover/item:text-primary transition-colors">{item.name}</div>
                                            <div className="text-[11px] font-medium text-muted-foreground truncate mt-0.5 group-hover/item:text-foreground/70 transition-colors">
                                                <span className="text-primary font-bold">{item.count}</span> {section.actionText}
                                            </div>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 group-hover/item:text-primary transition-colors" />
                                    </button>
                                ))
                            ) : (
                                <div className="p-8 text-center text-sm text-muted-foreground italic">
                                    {tc('noData') || 'No data available'}
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
        <MediaSearchModal open={modalOpen} onClose={() => setModalOpen(false)} query={modalQuery} />
        </>
    );
}
