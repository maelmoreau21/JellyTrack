import prisma from "@/lib/prisma";

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

/**
 * Lightweight prediction engine using exponential moving averages
 * and day-of-week/hour patterns from historical data.
 */
export async function getPredictions(): Promise<{
  trendingMedia: TrendingItem[];
  peakPredictions: PeakPrediction[];
}> {
  const now = new Date();
  
  // --- 1. TRENDING MEDIA ---
  // Compare current 7 days vs previous 7 days
  const currentWeekStart = new Date(now);
  currentWeekStart.setDate(currentWeekStart.getDate() - 7);
  currentWeekStart.setHours(0, 0, 0, 0);
  
  const previousWeekStart = new Date(currentWeekStart);
  previousWeekStart.setDate(previousWeekStart.getDate() - 7);

  const [currentWeekRows, previousWeekRows] = await Promise.all([
    prisma.playbackHistory.groupBy({
      by: ["mediaId"],
      _count: { id: true },
      where: {
        startedAt: { gte: currentWeekStart },
        durationWatched: { gte: 60 }, // Skip zaps
      },
    }),
    prisma.playbackHistory.groupBy({
      by: ["mediaId"],
      _count: { id: true },
      where: {
        startedAt: { gte: previousWeekStart, lt: currentWeekStart },
        durationWatched: { gte: 60 },
      },
    }),
  ]);

  const allMediaIds = Array.from(new Set([
    ...currentWeekRows.map(r => r.mediaId),
    ...previousWeekRows.map(r => r.mediaId)
  ]));

  const allMedia = await prisma.media.findMany({
    where: { id: { in: allMediaIds } },
    select: { id: true, title: true, type: true, parentId: true, jellyfinMediaId: true }
  });

  const mediaMap = new Map(allMedia.map(m => [m.id, m]));

  // Resolve Series hierarchy for episodes
  const episodeMedia = allMedia.filter(m => m.type === 'Episode');
  const seasonIds = Array.from(new Set(episodeMedia.map(m => m.parentId).filter(Boolean) as string[]));
  
  const seasons = seasonIds.length > 0 ? await prisma.media.findMany({
    where: { jellyfinMediaId: { in: seasonIds }, type: 'Season' },
    select: { jellyfinMediaId: true, parentId: true, title: true }
  }) : [];
  
  const seasonMap = new Map(seasons.map(s => [s.jellyfinMediaId, s]));
  const seriesIds = Array.from(new Set(seasons.map(s => s.parentId).filter(Boolean) as string[]));

  const series = seriesIds.length > 0 ? await prisma.media.findMany({
    where: { jellyfinMediaId: { in: seriesIds }, type: 'Series' },
    select: { jellyfinMediaId: true, title: true }
  }) : [];

  const seriesMap = new Map(series.map(s => [s.jellyfinMediaId, s]));

  type AggItem = {
    id: string;
    title: string;
    type: string;
    current: number;
    previous: number;
  };

  const aggMap = new Map<string, AggItem>();

  function processRows(rows: typeof currentWeekRows, isCurrent: boolean) {
    rows.forEach(row => {
      const media = mediaMap.get(row.mediaId);
      if (!media) return;

      let aggId = media.id;
      let aggTitle = media.title;
      let aggType = media.type;
      let jfId = media.jellyfinMediaId;

      if (media.type === 'Episode' && media.parentId) {
        const season = seasonMap.get(media.parentId);
        if (season && season.parentId) {
          const s = seriesMap.get(season.parentId);
          if (s) {
            aggId = `series:${s.jellyfinMediaId}`;
            aggTitle = s.title;
            aggType = 'Series';
            jfId = s.jellyfinMediaId;
          }
        }
      }

      const existing = aggMap.get(aggId) || { 
        id: jfId, 
        title: aggTitle, 
        type: aggType, 
        current: 0, 
        previous: 0 
      };

      if (isCurrent) existing.current += row._count.id;
      else existing.previous += row._count.id;

      aggMap.set(aggId, existing);
    });
  }

  processRows(currentWeekRows, true);
  processRows(previousWeekRows, false);

  const trendingMedia: TrendingItem[] = Array.from(aggMap.values())
    .map(item => {
      const growth = item.previous > 0 ? ((item.current - item.previous) / item.previous) * 100 : item.current > 1 ? 100 : 0;
      const trendScore = item.current * (1 + Math.max(0, growth) / 200);
      
      return {
        title: item.title,
        jellyfinMediaId: item.id,
        mediaType: item.type,
        currentWeekPlays: item.current,
        previousWeekPlays: item.previous,
        growthPercent: Math.round(growth),
        trendScore: Math.round(trendScore * 10) / 10,
      };
    })
    .filter(d => d.growthPercent > 0 || d.currentWeekPlays >= 3)
    .sort((a, b) => b.trendScore - a.trendScore)
    .slice(0, 10);

  // --- 2. PEAK PREDICTIONS ---
  // Analyze the last 4 weeks to build a pattern per (dayOfWeek, hour)
  const fourWeeksAgo = new Date(now);
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
  
  const recentHistory = await prisma.playbackHistory.findMany({
    where: {
      startedAt: { gte: fourWeeksAgo },
      durationWatched: { gte: 10 },
    },
    select: { startedAt: true },
  });

  // Build a 7×24 grid of session counts per week
  const weekGrid = new Map<string, number[]>(); // key: "day-hour", value: [week1, week2, week3, week4]
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      weekGrid.set(`${d}-${h}`, [0, 0, 0, 0]);
    }
  }

  for (const row of recentHistory) {
    const date = new Date(row.startedAt);
    const dayOfWeek = date.getDay();
    const hour = date.getHours();
    const weeksAgo = Math.floor((now.getTime() - date.getTime()) / (7 * 24 * 60 * 60 * 1000));
    const weekIndex = Math.min(3, weeksAgo);
    
    const key = `${dayOfWeek}-${hour}`;
    const arr = weekGrid.get(key);
    if (arr) arr[weekIndex]++;
  }

  // Exponential moving average: most recent week has highest weight
  const weights = [0.4, 0.3, 0.2, 0.1]; // week 0 (most recent) has weight 0.4
  const peakPredictions: PeakPrediction[] = [];

  for (const [key, counts] of weekGrid.entries()) {
    const [d, h] = key.split("-").map(Number);
    const ema = counts.reduce((sum, c, i) => sum + c * weights[i], 0);
    const avg = counts.reduce((s, c) => s + c, 0) / 4;
    const variance = counts.reduce((s, c) => s + (c - avg) ** 2, 0) / 4;
    const stdDev = Math.sqrt(variance);
    // Confidence: lower variance = higher confidence
    const confidence = avg > 0 ? Math.max(0, Math.min(100, Math.round(100 - (stdDev / avg) * 50))) : 0;

    if (ema >= 1) {
      peakPredictions.push({
        dayOfWeek: d,
        hour: h,
        predictedSessions: Math.round(ema * 10) / 10,
        confidence,
      });
    }
  }

  // Sort by predicted sessions
  peakPredictions.sort((a, b) => b.predictedSessions - a.predictedSessions);

  return { trendingMedia, peakPredictions: peakPredictions.slice(0, 48) };
}
