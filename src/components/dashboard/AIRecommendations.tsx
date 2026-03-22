"use client";

import { useEffect, useState } from "react";
import { Sparkles, Play, ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { getJellyfinImageUrl } from "@/lib/jellyfin";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { useTranslations } from "next-intl";

interface Recommendation {
  id: string;
  score: number;
  media: {
    jellyfinMediaId: string;
    title: string;
    type: string;
    year?: number | null;
  };
}

export function AIRecommendations() {
  const t = useTranslations('dashboard');
  const tc = useTranslations('common');
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/recommendations", {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });

        if (!res.ok) {
          // Read optional error body for debugging, but avoid noisy console.error
          const body = await res.json().catch(() => null);
          console.debug("AI Recs non-ok response:", res.status, body);
          if (mounted) setError(true);
          return;
        }

        const data = await res.json();
        if (data && data.recommendations && Array.isArray(data.recommendations)) {
          if (mounted) setRecommendations(data.recommendations);
        }
      } catch (err) {
        console.debug("AI Recs fetch failed:", err);
        if (mounted) setError(true);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="mt-8">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-indigo-500 animate-pulse" />
          <h3 className="text-xl font-bold tracking-tight">{t('aiRecommendations')}</h3>
        </div>
        <div className="flex gap-4 overflow-x-hidden">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="w-[160px] h-[240px] rounded-xl flex-shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  if (error || recommendations.length === 0) {
    return null; // Hide if no recommendations to avoid clutter
  }

  return (
    <div className="mt-8 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 text-indigo-500" />
        <h3 className="text-xl font-bold tracking-tight">{t('aiRecommendations')}</h3>
        <span className="text-xs text-zinc-500 font-medium ml-2 px-2 py-1 bg-indigo-500/10 text-indigo-500 rounded-full border border-indigo-500/20">
          {t('basedOnProfile')}
        </span>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700">
        {recommendations.map((rec, index) => (
          <Link 
            key={rec.id} 
            href={`/media/${rec.id}`}
            className="group relative flex-shrink-0 w-[160px] snap-start"
          >
            <div className={`relative ${rec.media.type === 'Episode' ? 'aspect-video' : 'aspect-[2/3]'} w-full rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 shadow-sm group-hover:shadow-md transition-all duration-300`}>
              <Image
                src={getJellyfinImageUrl(rec.id, 'Primary')}
                alt={rec.media.title}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-500"
                unoptimized
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 text-white">
                  <Play className="w-5 h-5 fill-current ml-1" />
                </div>
              </div>

              {/* Match Score Badge */}
              <div className="absolute top-2 left-2 z-10">
                <div className="bg-black/60 backdrop-blur-md border border-white/10 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-lg flex items-center gap-1">
                  <span className="text-emerald-400">{(Math.min(rec.score * 100, 99)).toFixed(0)}%</span> Match
                </div>
              </div>
            </div>

            <div className="mt-2 px-1">
              <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate group-hover:text-indigo-500 transition-colors">
                {rec.media.title}
              </h4>
              <p className="text-xs text-zinc-500 flex items-center gap-1">
                {rec.media.type === "Movie" ? tc('movie') : (rec.media.type === "Series" ? tc('seriesSingular') : tc('track'))}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
