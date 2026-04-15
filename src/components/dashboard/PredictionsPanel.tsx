"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, TrendingUp, Zap, Clock, ArrowUpRight, Film } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { useTranslations } from "next-intl";

interface TrendingItem {
  title: string;
  jellyfinMediaId: string;
  mediaType: string;
  currentWeekPlays: number;
  previousWeekPlays: number;
  growthPercent: number;
  trendScore: number;
}

interface PeakPrediction {
  dayOfWeek: number;
  hour: number;
  predictedSessions: number;
  confidence: number;
}

interface PredictionData {
  trendingMedia: TrendingItem[];
  peakPredictions: PeakPrediction[];
}

export function PredictionsPanel() {
  const t = useTranslations("dashboard");
  const [data, setData] = useState<PredictionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/predictions");
        if (res.ok) setData(await res.json());
      } catch { /* silent */ }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!data || (data.trendingMedia.length === 0 && data.peakPredictions.length === 0)) {
    return null;
  }

  const dayNames = t("dayNames").split(",");
  const topPeaks = data.peakPredictions.slice(0, 10);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Trending Media */}
      {data.trendingMedia.length > 0 && (
        <Card className="app-surface-soft border-border soft-light-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-md flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-orange-500" />
              {t("trendingMedia")}
            </CardTitle>
            <CardDescription>{t("trendingMediaDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.trendingMedia.slice(0, 8).map((item, i) => (
              <Link
                key={item.jellyfinMediaId}
                href={`/media/${item.jellyfinMediaId}`}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors group"
              >
                <span className="text-muted-foreground text-xs w-5 text-right shrink-0">{i + 1}.</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                    {item.title}
                  </div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                    <Film className="w-3 h-3" />
                    {item.currentWeekPlays} {t("playsThisWeek")}
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-1">
                  {item.growthPercent > 0 ? (
                    <Badge className="bg-emerald-500/10 text-emerald-500 border-0 text-xs gap-0.5">
                      <ArrowUpRight className="w-3 h-3" />
                      +{item.growthPercent}%
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">
                      {t("newTrend")}
                    </Badge>
                  )}
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Peak Predictions — mini heatmap of next 48h */}
      {topPeaks.length > 0 && (
        <Card className="app-surface-soft border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-md flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500" />
              {t("peakPredictions")}
            </CardTitle>
            <CardDescription>{t("peakPredictionsDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {topPeaks.map((peak, i) => {
                const maxPrediction = topPeaks[0]?.predictedSessions || 1;
                const barWidth = Math.round((peak.predictedSessions / maxPrediction) * 100);
                const isHighConfidence = peak.confidence >= 70;

                return (
                  <div key={`${peak.dayOfWeek}-${peak.hour}`} className="flex items-center gap-2 text-xs">
                    <span className="w-16 text-muted-foreground shrink-0 font-medium truncate">
                      {dayNames[peak.dayOfWeek]?.substring(0, 3) || "?"}
                    </span>
                    <span className="w-8 text-muted-foreground shrink-0">
                      {String(peak.hour).padStart(2, "0")}h
                    </span>
                    <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden relative">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isHighConfidence ? "bg-amber-500/70" : "bg-amber-500/40"
                        }`}
                        style={{ width: `${barWidth}%` }}
                      />
                      <span className="absolute right-2 top-0.5 text-[10px] font-medium text-zinc-600 dark:text-zinc-400">
                        ~{peak.predictedSessions.toFixed(0)}
                      </span>
                    </div>
                    <span
                      className={`w-8 text-right text-[10px] font-mono ${
                        isHighConfidence ? "text-emerald-500" : "text-zinc-500"
                      }`}
                    >
                      {peak.confidence}%
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground mt-3 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {t("predictionBasis")}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
