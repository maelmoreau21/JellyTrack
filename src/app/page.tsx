import prisma from "@/lib/prisma";
import redis from "@/lib/redis";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Activity, ActivitySquare, MonitorPlay, Clock, TrendingUp, TrendingDown, Award, Film, Tv, Music, BookOpen, CalendarDays, PlayCircle, Users } from "lucide-react";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { unstable_cache } from "next/cache";
import { Suspense } from "react";
import { DeepInsights } from "@/components/dashboard/DeepInsights";
import { GranularAnalysis } from "@/components/dashboard/GranularAnalysis";
import { NetworkAnalysis } from "@/components/dashboard/NetworkAnalysis";
import { Skeleton } from "@/components/ui/skeleton";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { getTranslations } from 'next-intl/server';

// Charts
import { ActivityByHourChart, ActivityHourData } from "@/components/charts/ActivityByHourChart";
import { DayOfWeekChart, DayOfWeekData } from "@/components/charts/DayOfWeekChart";
import { PlatformDistributionChart, PlatformData } from "@/components/charts/PlatformDistributionChart";
import { TimeRangeSelector } from "@/components/TimeRangeSelector";
import { ComposedTrendChart } from "@/components/charts/ComposedTrendChart";
import { CategoryPieChart } from "@/components/charts/CategoryPieChart";
import { YearlyHeatmap, HeatmapData } from "@/components/charts/YearlyHeatmap";
import { DraggableDashboard } from "@/components/dashboard/DraggableDashboard";
import { HardwareMonitor } from "@/components/dashboard/HardwareMonitor";
import { KillStreamButton } from "@/components/dashboard/KillStreamButton";
import { LiveStreamsPanel } from "@/components/dashboard/LiveStreamsPanel";
import { MonthlyWatchTimeChart, MonthlyWatchData } from "@/components/charts/MonthlyWatchTimeChart";
import { CompletionRatioChart, CompletionData } from "@/components/charts/CompletionRatioChart";
import { ClientCategoryChart, ClientCategoryData } from "@/components/charts/ClientCategoryChart";
import { LibraryDailyPlaysChart } from "@/components/charts/LibraryDailyPlaysChart";
import { categorizeClient } from "@/lib/utils";

// Webhook / Redis types
type WebhookPayload = {
  ServerId: string;
  ServerName: string;
  ServerVersion: string;
  NotificationType: string;
  NotificationUsername: string;
  UserId: string;
  UserName: string;
  Client: string;
  DeviceName: string;
  DeviceId: string;
  IsTranscoding?: boolean;
  PlayMethod?: string;
  ItemId?: string;
  ItemName?: string;
  SessionId: string;
  Country?: string;
  City?: string;
};

type LiveStream = {
  sessionId: string;
  itemId: string | null;
  parentItemId: string | null;
  user: string;
  mediaTitle: string;
  mediaSubtitle: string | null;
  playMethod: string;
  device: string;
  country: string;
  city: string;
  progressPercent: number;
  isPaused: boolean;
  audioLanguage: string | null;
  audioCodec: string | null;
  subtitleLanguage: string | null;
  subtitleCodec: string | null;
};

export const dynamic = "force-dynamic";

// --- Aggregation Cache Helper ---
const getDashboardMetrics = unstable_cache(
  async (type: string | undefined, timeRange: string, excludedLibraries: string[], customFrom?: string, customTo?: string) => {
    // 1. Calculate time windows
    let currentStartDate: Date | undefined;
    let previousStartDate: Date | undefined;
    let previousEndDate: Date | undefined;

    const now = new Date();
    previousEndDate = new Date(now);

    if (timeRange === "custom" && customFrom && customTo) {
      currentStartDate = new Date(customFrom);
      currentStartDate.setHours(0, 0, 0, 0);

      const toDate = new Date(customTo);
      toDate.setHours(23, 59, 59, 999);

      // Calculate previous span of identical length
      const diff = toDate.getTime() - currentStartDate.getTime();
      previousStartDate = new Date(currentStartDate.getTime() - diff - 1);
      previousEndDate = new Date(currentStartDate.getTime() - 1);

      // We overwrite previousEndDate to toDate for the main query filter later if we want a strict ceiling, but since we use `dateFilter = gte: currentStartDate` without ceiling for now, we should add ceiling.
    } else if (timeRange === "24h") {
      currentStartDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      previousStartDate = new Date(now.getTime() - 48 * 60 * 60 * 1000);
      previousEndDate = currentStartDate;
    } else if (timeRange === "30d") {
      currentStartDate = new Date();
      currentStartDate.setDate(currentStartDate.getDate() - 30);
      currentStartDate.setHours(0, 0, 0, 0);

      previousStartDate = new Date(currentStartDate);
      previousStartDate.setDate(previousStartDate.getDate() - 30);
      previousEndDate = new Date(currentStartDate);
    } else if (timeRange === "7d") {
      currentStartDate = new Date();
      currentStartDate.setDate(currentStartDate.getDate() - 7);
      currentStartDate.setHours(0, 0, 0, 0);

      previousStartDate = new Date(currentStartDate);
      previousStartDate.setDate(previousStartDate.getDate() - 7);
      previousEndDate = new Date(currentStartDate);
    }

    const dateFilter: any = currentStartDate ? { gte: currentStartDate } : undefined;
    if (timeRange === "custom" && customTo && dateFilter) {
      const toDate = new Date(customTo);
      toDate.setHours(23, 59, 59, 999);
      dateFilter.lte = toDate;
    }
    const prevDateFilter = (previousStartDate && previousEndDate) ? { gte: previousStartDate, lt: previousEndDate } : undefined;

    // 2. Build Media Filter
    let AND: any[] = [];
    if (type === 'movie') AND.push({ type: "Movie" });
    else if (type === 'series') AND.push({ type: { in: ["Series", "Episode"] } });
    else if (type === 'music') AND.push({ type: { in: ["Audio", "Track"] } });
    else if (type === 'book') AND.push({ type: "Book" });

    if (excludedLibraries.length > 0) {
      AND.push({
        NOT: {
          OR: [
            { type: { in: excludedLibraries } },
            ...excludedLibraries.map((lib: string) => ({ collectionType: lib }))
          ]
        }
      });
    }
    const mediaWhere = AND.length > 0 ? { AND } : {};

    // 3. User & Hours (Current)
    const totalUsers = await prisma.user.count();
    const hoursWatchedAgg = await prisma.playbackHistory.aggregate({
      _sum: { durationWatched: true },
      where: { media: mediaWhere, startedAt: dateFilter }
    });
    const hoursWatched = parseFloat(((hoursWatchedAgg._sum.durationWatched || 0) / 3600).toFixed(1));

    // Previous Hours
    let previousHoursWatched = 0;
    if (prevDateFilter) {
      const prevHoursAgg = await prisma.playbackHistory.aggregate({
        _sum: { durationWatched: true },
        where: { media: mediaWhere, startedAt: prevDateFilter }
      });
      previousHoursWatched = parseFloat(((prevHoursAgg._sum.durationWatched || 0) / 3600).toFixed(1));
    }
    const hoursGrowth = previousHoursWatched > 0 ? ((hoursWatched - previousHoursWatched) / previousHoursWatched) * 100 : 0;

    // Previous period: total plays & active users
    let previousPlays = 0;
    let previousActiveUsers = 0;
    if (prevDateFilter) {
      previousPlays = await prisma.playbackHistory.count({
        where: { media: mediaWhere, startedAt: prevDateFilter }
      });
      const prevActiveUsersAgg = await prisma.playbackHistory.groupBy({
        by: ['userId'],
        where: { media: mediaWhere, startedAt: prevDateFilter, userId: { not: null } }
      });
      previousActiveUsers = prevActiveUsersAgg.length;
    }

    // 4. Load all history matching period
    const histories = await prisma.playbackHistory.findMany({
      where: { startedAt: dateFilter, media: mediaWhere },
      select: { startedAt: true, durationWatched: true, clientName: true, playMethod: true, userId: true, media: { select: { type: true, title: true } } },
      orderBy: { startedAt: 'asc' }
    });

    // Sub-Categories Breakdown
    let movieViews = 0, movieHours = 0;
    let seriesViews = 0, seriesHours = 0;
    let musicViews = 0, musicHours = 0;
    let booksViews = 0, booksHours = 0;
    let directPlayCount = 0;

    const trendMap = new Map<string, any>();
    const getFormatKey = (d: Date) => {
      if (timeRange === "24h") return `${d.getHours().toString().padStart(2, '0')}:00`;
      else if (timeRange === "all") return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
      else return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
    };

    histories.forEach((h: any) => {
      if (h.playMethod === "DirectPlay") directPlayCount++;

      const key = getFormatKey(new Date(h.startedAt));
      if (!trendMap.has(key)) {
        trendMap.set(key, { time: key, movieVolume: 0, seriesVolume: 0, musicVolume: 0, booksVolume: 0, totalViews: 0, moviePlays: 0, seriesPlays: 0, musicPlays: 0, booksPlays: 0 });
      }
      const entry = trendMap.get(key)!;
      const mType = h.media?.type?.toLowerCase() || "";
      const hours = h.durationWatched / 3600;

      // Classifying
      if (mType.includes('movie')) {
        entry.movieVolume += hours;
        entry.moviePlays += 1;
        movieViews++; movieHours += hours;
      } else if (mType.includes('series') || mType.includes('episode')) {
        entry.seriesVolume += hours;
        entry.seriesPlays += 1;
        seriesViews++; seriesHours += hours;
      } else if (mType.includes('audio') || mType.includes('track')) {
        entry.musicVolume += hours;
        entry.musicPlays += 1;
        musicViews++; musicHours += hours;
      } else if (mType.includes('book')) {
        entry.booksVolume += hours;
        entry.booksPlays += 1;
        booksViews++; booksHours += hours;
      } else {
        entry.booksVolume += hours;
        entry.booksPlays += 1;
      }

      entry.totalViews += 1;
    });

    const categoryPieData = [
      { name: 'movies', value: parseFloat(movieHours.toFixed(2)) },
      { name: 'series', value: parseFloat(seriesHours.toFixed(2)) },
      { name: 'music', value: parseFloat(musicHours.toFixed(2)) },
      { name: 'books', value: parseFloat(booksHours.toFixed(2)) },
    ].filter(item => item.value > 0);

    const trendData = Array.from(trendMap.values()).map(v => ({
      time: v.time,
      movieVolume: parseFloat(v.movieVolume.toFixed(2)),
      seriesVolume: parseFloat(v.seriesVolume.toFixed(2)),
      musicVolume: parseFloat(v.musicVolume.toFixed(2)),
      booksVolume: parseFloat(v.booksVolume.toFixed(2)),
      totalViews: v.totalViews,
      moviePlays: v.moviePlays,
      seriesPlays: v.seriesPlays,
      musicPlays: v.musicPlays,
      booksPlays: v.booksPlays,
    }));

    const directPlayPercent = histories.length > 0 ? Math.round((directPlayCount / histories.length) * 100) : 100;

    // Loyalty Top 5
    const topUsersAgg = await prisma.playbackHistory.groupBy({
      by: ['userId'],
      _sum: { durationWatched: true },
      where: { media: mediaWhere, startedAt: dateFilter, userId: { not: null } },
      orderBy: { _sum: { durationWatched: 'desc' } },
      take: 5
    });

    const topUsers = await Promise.all(topUsersAgg.map(async (agg: any) => {
      const u = await prisma.user.findUnique({ where: { id: agg.userId } });
      return {
        username: u?.username || "?",
        jellyfinUserId: u?.jellyfinUserId || "",
        hours: parseFloat(((agg._sum.durationWatched || 0) / 3600).toFixed(1))
      };
    }));

    // Hourly
    const hourlyCounts = new Array(24).fill(0);
    histories.forEach((h: any) => {
      const hour = h.startedAt.getHours();
      hourlyCounts[hour]++;
    });
    const hourlyChartData: ActivityHourData[] = hourlyCounts.map((count, index) => ({
      hour: `${index.toString().padStart(2, '0')}:00`, count
    }));

    // Day of week
    const dayCounts = new Array(7).fill(0);
    histories.forEach((h: any) => {
      dayCounts[h.startedAt.getDay()]++;
    });
    const dayOfWeekChartData: DayOfWeekData[] = dayCounts.map((count, index) => ({
      day: String(index), count
    }));

    // Clients Platform Distro
    const platformCounts = new Map<string, number>();
    histories.forEach((h: any) => {
      const pName = h.clientName || "?";
      platformCounts.set(pName, (platformCounts.get(pName) || 0) + 1);
    });
    const platformChartData: PlatformData[] = Array.from(platformCounts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    // Peak Concurrent Streams
    const events: { time: number, type: number }[] = [];
    histories.forEach((h: any) => {
      const start = h.startedAt.getTime();
      const end = start + (h.durationWatched * 1000);
      events.push({ time: start, type: 1 });
      events.push({ time: end, type: -1 });
    });

    events.sort((a, b) => a.time - b.time || a.type - b.type);

    let currentConcurrent = 0;
    let peakConcurrentStreams = 0;

    // Track historical peak by hour for the chart
    const serverLoadMap = new Map<string, number>();

    for (const evt of events) {
      currentConcurrent += evt.type;
      if (currentConcurrent > peakConcurrentStreams) {
        peakConcurrentStreams = currentConcurrent;
      }

      const evtFullHourKey = getFormatKey(new Date(evt.time));
      // Overwrite the mapped hour with the max concurrency seen in that window
      const mappedVal = serverLoadMap.get(evtFullHourKey) || 0;
      if (currentConcurrent > mappedVal) {
        serverLoadMap.set(evtFullHourKey, currentConcurrent);
      }
    }

    // Merge into trend data
    const serverLoadData = Array.from(trendMap.values()).map(v => ({
      time: v.time,
      peakStreams: serverLoadMap.get(v.time) || 0
    }));

    // Monthly watch time (last 12 months)
    const MONTH_IDX = ["0","1","2","3","4","5","6","7","8","9","10","11"];
    const monthlyMap = new Map<string, number>();
    const nowMonth = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(nowMonth.getFullYear(), nowMonth.getMonth() - i, 1);
      const key = `${d.getMonth()}_${d.getFullYear().toString().slice(-2)}`;
      monthlyMap.set(key, 0);
    }
    histories.forEach((h: any) => {
      const d = new Date(h.startedAt);
      const key = `${d.getMonth()}_${d.getFullYear().toString().slice(-2)}`;
      if (monthlyMap.has(key)) {
        monthlyMap.set(key, (monthlyMap.get(key) || 0) + h.durationWatched / 3600);
      }
    });
    const monthlyWatchData: MonthlyWatchData[] = Array.from(monthlyMap.entries()).map(([month, hours]) => ({
      month, hours: parseFloat(hours.toFixed(1))
    }));

    // Completion ratio (abandoned vs finished)
    // "Terminé" = watched >= 80% of media duration, "Partiel" = 20-80%, "Abandonné" = < 20%
    let completed = 0, partial = 0, abandoned = 0;
    // We need media durations for this — load them
    const mediaIds = [...new Set(histories.map((h: any) => h.media?.title).filter(Boolean))];
    // Fetch media with durations
    const mediaWithDuration = await prisma.media.findMany({
      where: { durationMs: { not: null } },
      select: { id: true, title: true, durationMs: true },
    });
    const mediaDurationMap = new Map<string, number>();
    mediaWithDuration.forEach(m => {
      if (m.durationMs) mediaDurationMap.set(m.title, Number(m.durationMs) / 1000);
    });

    // Also load full histories with mediaId for completion calc
    const fullHistories = await prisma.playbackHistory.findMany({
      where: { startedAt: dateFilter, media: mediaWhere },
      select: { durationWatched: true, media: { select: { title: true, durationMs: true } } },
    });
    fullHistories.forEach((h: any) => {
      const mediaDurS = h.media?.durationMs ? Number(h.media.durationMs) / 1000 : 0;
      if (mediaDurS <= 0 || h.durationWatched <= 0) {
        // No duration info: count as partial
        partial++;
        return;
      }
      const pct = h.durationWatched / mediaDurS;
      if (pct >= 0.8) completed++;
      else if (pct >= 0.2) partial++;
      else abandoned++;
    });
    const completionData: CompletionData[] = [
      { name: "completed", value: completed },
      { name: "partial", value: partial },
      { name: "abandoned", value: abandoned },
    ].filter(d => d.value > 0);

    // Client categories
    const clientCatMap = new Map<string, number>();
    histories.forEach((h: any) => {
      const cat = categorizeClient(h.clientName || "");
      clientCatMap.set(cat, (clientCatMap.get(cat) || 0) + 1);
    });
    const clientCategoryData: ClientCategoryData[] = Array.from(clientCatMap.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    // Current period: total plays & active users
    const totalPlays = histories.length;
    const currentActiveUsers = new Set(histories.map((h: any) => h.userId).filter(Boolean)).size;
    const playsGrowth = previousPlays > 0 ? ((totalPlays - previousPlays) / previousPlays) * 100 : 0;
    const activeUsersGrowth = previousActiveUsers > 0 ? ((currentActiveUsers - previousActiveUsers) / previousActiveUsers) * 100 : 0;

    // Today stats (always today regardless of selected timeRange)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayHistories = await prisma.playbackHistory.findMany({
      where: { startedAt: { gte: todayStart }, media: mediaWhere },
      select: { durationWatched: true, userId: true },
    });
    const todayPlays = todayHistories.length;
    const todayHours = parseFloat((todayHistories.reduce((sum: number, h: any) => sum + (h.durationWatched || 0), 0) / 3600).toFixed(1));
    const todayActiveUsers = new Set(todayHistories.map((h: any) => h.userId).filter(Boolean)).size;

    return {
      totalUsers,
      hoursWatched,
      hoursGrowth,
      previousHoursWatched,
      directPlayPercent,
      peakConcurrentStreams,
      totalPlays,
      playsGrowth,
      previousPlays,
      currentActiveUsers,
      activeUsersGrowth,
      previousActiveUsers,
      todayPlays,
      todayHours,
      todayActiveUsers,
      trendData,
      categoryPieData,
      hourlyChartData,
      dayOfWeekChartData,
      platformChartData,
      serverLoadData,
      topUsers,
      monthlyWatchData,
      completionData,
      clientCategoryData,
      breakdown: {
        movieViews, movieHours: parseFloat(movieHours.toFixed(1)),
        seriesViews, seriesHours: parseFloat(seriesHours.toFixed(1)),
        musicViews, musicHours: parseFloat(musicHours.toFixed(1)),
        booksViews, booksHours: parseFloat(booksHours.toFixed(1)),
      }
    };
  },
  ['jellytulli-dashboard'],
  { revalidate: 60 }
);

async function HeatmapWrapper() {
  // Fetch ALL playback history with media type for library filtering
  const rawData = await prisma.playbackHistory.findMany({
    select: { startedAt: true, media: { select: { collectionType: true, type: true } } }
  });

  const countsByDateAndType = new Map<string, Map<string, number>>();
  const yearsSet = new Set<number>();
  const libraryTypes = new Set<string>();

  rawData.forEach(r => {
    const d = r.startedAt.toISOString().split('T')[0];
    const lib = r.media?.collectionType || r.media?.type || 'unknown';
    libraryTypes.add(lib);
    yearsSet.add(r.startedAt.getFullYear());

    if (!countsByDateAndType.has(d)) countsByDateAndType.set(d, new Map());
    const dayMap = countsByDateAndType.get(d)!;
    dayMap.set(lib, (dayMap.get(lib) || 0) + 1);
    dayMap.set('_total', (dayMap.get('_total') || 0) + 1);
  });

  const heatmapDataByType: Record<string, HeatmapData[]> = {};

  // Build per-library and total data sets
  const allKeys = ['_total', ...Array.from(libraryTypes)];
  for (const key of allKeys) {
    const entries: HeatmapData[] = [];
    countsByDateAndType.forEach((dayMap, date) => {
      const count = dayMap.get(key) || 0;
      if (count > 0) entries.push({ date, count, level: 0 });
    });
    heatmapDataByType[key] = entries;
  }

  const availableYears = Array.from(yearsSet).sort((a, b) => b - a);

  return <YearlyHeatmap data={heatmapDataByType['_total'] || []} availableYears={availableYears} dataByType={heatmapDataByType} libraryTypes={Array.from(libraryTypes)} />;
}

export default async function DashboardPage(props: { searchParams: Promise<{ type?: string; timeRange?: string; from?: string; to?: string }> }) {
  // RBAC: Non-admin users are redirected to their profile page
  const authSession = await getServerSession(authOptions);
  if (!authSession?.user?.isAdmin) {
    const uid = (authSession?.user as any)?.jellyfinUserId;
    redirect(uid ? `/users/${uid}` : "/login");
  }

  const { type, timeRange = "7d", from, to } = await props.searchParams;

  const settings = await prisma.globalSettings.findUnique({ where: { id: "global" } });
  const excludedLibraries = settings?.excludedLibraries || [];

  const metrics = await getDashboardMetrics(type, timeRange, excludedLibraries, from, to);

  const t = await getTranslations('dashboard');
  const tc = await getTranslations('common');

  // Post-process cached data with translations
  const DAY_NAMES = t('dayNames').split(',');
  const MONTH_NAMES = t('monthNames').split(',');
  
  // Translate day of week labels
  metrics.dayOfWeekChartData = metrics.dayOfWeekChartData.map((d: any) => ({
    ...d,
    day: DAY_NAMES[parseInt(d.day)] || d.day,
  }));
  
  // Translate monthly watch data labels  
  metrics.monthlyWatchData = metrics.monthlyWatchData.map((d: any) => {
    const parts = d.month.split('_');
    const monthIdx = parseInt(parts[0]);
    const yearSuffix = parts[1];
    return { ...d, month: `${MONTH_NAMES[monthIdx]} ${yearSuffix}` };
  });
  
  // Translate completion data labels  
  const completionLabels: Record<string, string> = {
    completed: t('completed'),
    partial: t('partial'),
    abandoned: t('abandoned'),
  };
  metrics.completionData = metrics.completionData.map((d: any) => ({
    ...d,
    name: completionLabels[d.name] || d.name,
  }));

  // Redis Live Streams
  const keys = await redis.keys("stream:*");
  const activeStreamsCount = keys.length;
  let liveStreams: LiveStream[] = [];
  let totalBandwidthMbps = 0;

  if (activeStreamsCount > 0) {
    const payloads = await Promise.all(keys.map((k) => redis.get(k)));
    liveStreams = payloads
      .filter((p): p is string => p !== null)
      .map((p) => {
        const payload: any = JSON.parse(p);
        totalBandwidthMbps += payload.IsTranscoding ? 12 : 6;

        // Build enriched subtitle for hierarchical display
        let mediaSubtitle: string | null = null;
        if (payload.SeriesName) {
          // TV: "SeriesName — SeasonName"
          mediaSubtitle = payload.SeriesName + (payload.SeasonName ? ` — ${payload.SeasonName}` : '');
        } else if (payload.AlbumName) {
          // Music: "Artist — Album"
          mediaSubtitle = (payload.AlbumArtist ? `${payload.AlbumArtist} — ` : '') + payload.AlbumName;
        }

        // Calculate progress percentage
        let progressPercent = 0;
        if (payload.PlaybackPositionTicks && payload.RunTimeTicks && payload.RunTimeTicks > 0) {
          progressPercent = Math.min(100, Math.round((payload.PlaybackPositionTicks / payload.RunTimeTicks) * 100));
        }

        return {
          sessionId: payload.SessionId,
          itemId: payload.ItemId || null,
          user: payload.UserName || payload.UserId || "Unknown",
          mediaTitle: payload.ItemName || "Unknown",
          mediaSubtitle,
          playMethod: payload.PlayMethod || (payload.IsTranscoding ? "Transcode" : "DirectPlay"),
          device: payload.DeviceName || "Unknown",
          country: payload.Country || "Unknown",
          city: payload.City || "Unknown",
          progressPercent,
          isPaused: payload.IsPaused === true,
          parentItemId: payload.AlbumId || payload.SeriesId || payload.SeasonId || null,
          audioLanguage: payload.AudioLanguage || null,
          audioCodec: payload.AudioCodec || null,
          subtitleLanguage: payload.SubtitleLanguage || null,
          subtitleCodec: payload.SubtitleCodec || null,
        };
      });
  }

  return (
    <div className="flex-col md:flex">
      <div className="flex-1 space-y-4 md:space-y-6 p-4 md:p-8 pt-4 md:pt-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
          <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6 min-w-0">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Dashboard</h2>
            <Tabs defaultValue={type || "all"} className="w-full md:w-[380px]">
              <TabsList className="bg-zinc-900 border border-zinc-800 w-full">
                <TabsTrigger value="all" asChild><Link href={`/?timeRange=${timeRange}`}>{tc('all')}</Link></TabsTrigger>
                <TabsTrigger value="movie" asChild><Link href={`/?type=movie&timeRange=${timeRange}`}>{tc('movies')}</Link></TabsTrigger>
                <TabsTrigger value="series" asChild><Link href={`/?type=series&timeRange=${timeRange}`}>{tc('series')}</Link></TabsTrigger>
                <TabsTrigger value="music" asChild><Link href={`/?type=music&timeRange=${timeRange}`}>{tc('music')}</Link></TabsTrigger>
                <TabsTrigger value="book" asChild><Link href={`/?type=book&timeRange=${timeRange}`}>{tc('books')}</Link></TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <span className="text-xs text-zinc-400 bg-zinc-900/80 px-2 py-1.5 rounded-md border border-zinc-800 hidden sm:block">
              {t('cachedData')}
            </span>
            <TimeRangeSelector />
          </div>
        </div>

        <HardwareMonitor />

        {/* Today Stats Banner */}
        <div className="flex flex-wrap items-center gap-2 md:gap-3 px-3 md:px-4 py-3 bg-zinc-900/60 border border-zinc-800/50 rounded-xl backdrop-blur-sm">
          <CalendarDays className="h-5 w-5 text-primary shrink-0" />
          <span className="text-sm font-medium text-zinc-300">{t('today')}</span>
          <div className="flex flex-wrap items-center gap-3 md:gap-6 ml-0 md:ml-2">
            <div className="flex items-center gap-1.5">
              <PlayCircle className="h-3.5 w-3.5 text-blue-400" />
              <span className="text-sm font-semibold text-white">{metrics.todayPlays}</span>
              <span className="text-xs text-zinc-500">{t('readings')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-orange-400" />
              <span className="text-sm font-semibold text-white">{metrics.todayHours}h</span>
              <span className="text-xs text-zinc-500">{t('watched')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-sm font-semibold text-white">{metrics.todayActiveUsers}</span>
              <span className="text-xs text-zinc-500">{t('activeUsers')}</span>
            </div>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-zinc-900 border border-zinc-800">
            <TabsTrigger value="overview">{t('overviewTab')}</TabsTrigger>
            <TabsTrigger value="analytics">{t('detailedTab')}</TabsTrigger>
            <TabsTrigger value="network">{t('networkTab')}</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <DraggableDashboard blocks={[
              /* Global Metrics Row 1 */
              <div key="metrics" className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
                <Card className="bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('activeStreams')}</CardTitle>
                    <Activity className="h-4 w-4 text-emerald-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{activeStreamsCount}</div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                      {t('managedByServer')}
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('totalPlays')}</CardTitle>
                    <PlayCircle className="h-4 w-4 text-cyan-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <div className="text-2xl font-bold">{metrics.totalPlays.toLocaleString()}</div>
                      {timeRange !== "all" && metrics.playsGrowth !== 0 && (
                        <div className={`flex items-center text-xs font-semibold px-1.5 py-0.5 rounded-full ${metrics.playsGrowth >= 0 ? 'text-emerald-500 bg-emerald-500/10' : 'text-red-500 bg-red-500/10'}`}>
                          {metrics.playsGrowth >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                          {metrics.playsGrowth > 0 ? "+" : ""}{metrics.playsGrowth.toFixed(1)}%
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {timeRange !== "all" && metrics.previousPlays > 0 ? t('vsPrevPeriod', { count: metrics.previousPlays }) : t('onSelectedPeriod')}
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('directPlay')}</CardTitle>
                    <MonitorPlay className="h-4 w-4 text-purple-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{metrics.directPlayPercent}%<span className="text-xs font-normal text-zinc-400 ml-1">DP</span></div>
                    <p className="text-xs text-muted-foreground mt-1">{t('directPlayDesc')}</p>
                  </CardContent>
                </Card>

                <Link href="/logs" className="block group">
                <Card className="bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm transition-colors group-hover:border-orange-500/40 cursor-pointer">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('globalTime')}</CardTitle>
                    <Clock className="h-4 w-4 text-orange-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <div className="text-2xl font-bold">{metrics.hoursWatched.toLocaleString()}h</div>
                      {timeRange !== "all" && (
                        <div className={`flex items-center text-xs font-semibold px-1.5 py-0.5 rounded-full ${metrics.hoursGrowth >= 0 ? 'text-emerald-500 bg-emerald-500/10' : 'text-red-500 bg-red-500/10'}`}>
                          {metrics.hoursGrowth >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                          {metrics.hoursGrowth > 0 ? "+" : ""}{metrics.hoursGrowth.toFixed(1)}%
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 text-ellipsis overflow-hidden whitespace-nowrap">
                      {timeRange !== "all" ? t('cumulVsPrev', { count: metrics.previousHoursWatched }) : t('cumulAllTime', { count: metrics.totalUsers })}
                    </p>
                  </CardContent>
                </Card>
                </Link>

                <Card className="bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('activeUsersTitle')}</CardTitle>
                    <Users className="h-4 w-4 text-red-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <div className="text-2xl font-bold">{metrics.currentActiveUsers}</div>
                      {timeRange !== "all" && metrics.activeUsersGrowth !== 0 && (
                        <div className={`flex items-center text-xs font-semibold px-1.5 py-0.5 rounded-full ${metrics.activeUsersGrowth >= 0 ? 'text-emerald-500 bg-emerald-500/10' : 'text-red-500 bg-red-500/10'}`}>
                          {metrics.activeUsersGrowth >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                          {metrics.activeUsersGrowth > 0 ? "+" : ""}{metrics.activeUsersGrowth.toFixed(1)}%
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {timeRange !== "all" && metrics.previousActiveUsers > 0 ? t('vsUsersOnPeriod', { count: metrics.previousActiveUsers }) : t('onTotalRegistered', { count: metrics.totalUsers })}
                    </p>
                  </CardContent>
                </Card>
              </div>,

              /* Analytics Breadcrumb - Ultimate Expansion */
              <div key="breadcrumb" className="grid gap-4 md:grid-cols-4">
                <Link href="/logs?type=Movie" className="block group">
                  <Card className="bg-zinc-900/30 border-zinc-800/40 transition-colors group-hover:border-blue-500/40 group-hover:bg-zinc-900/50 cursor-pointer">
                    <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                      <CardTitle className="text-sm font-medium text-zinc-400">{t('moviesCard')}</CardTitle>
                      <Film className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                      <div className="text-2xl font-bold text-white">{metrics.breakdown.movieViews} <span className="text-sm font-normal text-zinc-500">{t('moviesViews')}</span></div>
                      <p className="text-xs text-blue-500 font-medium">{metrics.breakdown.movieHours}h {t('moviesWatched')}</p>
                    </CardContent>
                  </Card>
                </Link>

                <Link href="/logs?type=Episode" className="block group">
                  <Card className="bg-zinc-900/30 border-zinc-800/40 transition-colors group-hover:border-green-500/40 group-hover:bg-zinc-900/50 cursor-pointer">
                    <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                      <CardTitle className="text-sm font-medium text-zinc-400">{t('seriesCard')}</CardTitle>
                      <Tv className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                      <div className="text-2xl font-bold text-white">{metrics.breakdown.seriesViews} <span className="text-sm font-normal text-zinc-500">{t('seriesPlays')}</span></div>
                      <p className="text-xs text-green-500 font-medium">{metrics.breakdown.seriesHours}h {t('seriesWatched')}</p>
                    </CardContent>
                  </Card>
                </Link>

                <Link href="/logs?type=Audio" className="block group">
                  <Card className="bg-zinc-900/30 border-zinc-800/40 transition-colors group-hover:border-yellow-500/40 group-hover:bg-zinc-900/50 cursor-pointer">
                    <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                      <CardTitle className="text-sm font-medium text-zinc-400">{t('musicCard')}</CardTitle>
                      <Music className="h-4 w-4 text-yellow-500" />
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                      <div className="text-2xl font-bold text-white">{metrics.breakdown.musicViews} <span className="text-sm font-normal text-zinc-500">{t('musicTitles')}</span></div>
                      <p className="text-xs text-yellow-500 font-medium">{metrics.breakdown.musicHours}h {t('musicListened')}</p>
                    </CardContent>
                  </Card>
                </Link>

                <Link href="/logs?type=AudioBook" className="block group">
                  <Card className="bg-zinc-900/30 border-zinc-800/40 transition-colors group-hover:border-purple-500/40 group-hover:bg-zinc-900/50 cursor-pointer">
                    <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                      <CardTitle className="text-sm font-medium text-zinc-400">{t('booksCard')}</CardTitle>
                      <BookOpen className="h-4 w-4 text-purple-500" />
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                      <div className="text-2xl font-bold text-white">{metrics.breakdown.booksViews} <span className="text-sm font-normal text-zinc-500">{t('booksOpened')}</span></div>
                      <p className="text-xs text-purple-500 font-medium">{metrics.breakdown.booksHours}h {t('booksSpent')}</p>
                    </CardContent>
                  </Card>
                </Link>
              </div>,

              /* Dataviz Row : Multi-Axis Volume & PieChart */
              <div key="volumes" className="grid gap-4 md:grid-cols-2 lg:grid-cols-7 min-w-0">
                <Card className="col-span-1 lg:col-span-5 bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm">
                  <CardHeader className="pb-1">
                    <CardTitle>{t('volumeHistory')}</CardTitle>
                    <CardDescription>{t('volumeHistoryDesc')}</CardDescription>
                  </CardHeader>
                  <CardContent className="pl-0 pb-4 pr-1">
                    <div className="h-[400px] min-h-[400px] w-full overflow-hidden">
                      <ComposedTrendChart data={metrics.trendData} />
                    </div>
                  </CardContent>
                </Card>

                <Card className="col-span-1 lg:col-span-2 bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle>{t('categoryBreakdown')}</CardTitle>
                    <CardDescription>{t('categoryBreakdownDesc')}</CardDescription>
                  </CardHeader>
                  <CardContent className="pl-0 pb-4">
                    <div className="h-[300px] min-h-[300px] w-full overflow-hidden">
                      {metrics.categoryPieData.length > 0 ? (
                        <CategoryPieChart data={metrics.categoryPieData.map((d: any) => ({ ...d, name: tc(d.name) }))} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">
                          {t('noCategoryData')}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>,

              /* Daily Plays by Library */
              <Card key="libraryPlays" className="bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm">
                <CardHeader className="pb-1">
                  <CardTitle>{t('libraryPlays')}</CardTitle>
                  <CardDescription>{t('libraryPlaysDesc')}</CardDescription>
                </CardHeader>
                <CardContent className="pl-0 pb-4 pr-1">
                  <div className="h-[350px] min-h-[350px] w-full overflow-hidden">
                    <LibraryDailyPlaysChart data={metrics.trendData} />
                  </div>
                </CardContent>
              </Card>,

              /* Yearly Heatmap Contribution Component - Phase 6 */
              <Suspense key="heatmap" fallback={<Skeleton className="h-[250px] w-full rounded-xl" />}>
                <HeatmapWrapper />
              </Suspense>,

              /* Dataviz Row : Plateformes + Top Users + Live */
              <div key="platforms" className="grid gap-4 md:grid-cols-2 lg:grid-cols-8 min-w-0">

                <Card className="col-span-2 bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="flex gap-2"><Award className="w-5 h-5 text-yellow-500" /> {t('loyalUsers')}</CardTitle>
                    <CardDescription>{t('loyalUsersDesc')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6 mt-4">
                      {metrics.topUsers.length === 0 && <span className="text-muted-foreground text-sm">{t('noActivity')}</span>}
                      {metrics.topUsers.map((u, i) => (
                        <Link key={i} href={`/users/${u.jellyfinUserId}`} className="flex items-center gap-4 group hover:bg-zinc-800/50 rounded-lg p-1 -m-1 transition-colors">
                          <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm">
                            #{i + 1}
                          </div>
                          <div className="flex-1 space-y-1">
                            <p className="text-sm font-medium leading-none truncate max-w-[100px] group-hover:text-purple-400 transition-colors">{u.username}</p>
                          </div>
                          <div className="font-semibold text-sm">
                            {u.hours}h
                          </div>
                        </Link>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="col-span-3 bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle>{t('clientEcosystem')}</CardTitle>
                    <CardDescription>{t('clientEcosystemDesc')}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex justify-center items-center pb-4">
                    <div className="h-[300px] w-full max-w-[400px]">
                      <PlatformDistributionChart data={metrics.platformChartData} />
                    </div>
                  </CardContent>
                </Card>

                <LiveStreamsPanel initialStreams={liveStreams} initialBandwidth={totalBandwidthMbps} />
              </div>,

              /* Third Row Analytics - Hourly + Day of Week */
              <div key="hourly" className="grid gap-4 md:grid-cols-2">
                <Card className="bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle>{t('hourlyActivity')}</CardTitle>
                    <CardDescription>{t('hourlyActivityDesc')}</CardDescription>
                  </CardHeader>
                  <CardContent className="pl-0 pb-4">
                    <div className="h-[250px] min-h-[250px] w-full overflow-hidden">
                      <ActivityByHourChart data={metrics.hourlyChartData} />
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle>{t('dayOfWeekActivity')}</CardTitle>
                    <CardDescription>{t('dayOfWeekActivityDesc')}</CardDescription>
                  </CardHeader>
                  <CardContent className="pl-0 pb-4">
                    <div className="h-[250px] min-h-[250px] w-full overflow-hidden">
                      <DayOfWeekChart data={metrics.dayOfWeekChartData} />
                    </div>
                  </CardContent>
                </Card>
              </div>,

              /* Monthly Watch Time + Completion Ratio + Client Categories */
              <div key="new-stats" className="grid gap-4 md:grid-cols-3">
                <Card className="bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle>{t('monthlyTime')}</CardTitle>
                    <CardDescription>{t('monthlyTimeDesc')}</CardDescription>
                  </CardHeader>
                  <CardContent className="pl-0 pb-4">
                    <div className="h-[300px] w-full overflow-hidden">
                      {metrics.monthlyWatchData.length > 0 ? (
                        <MonthlyWatchTimeChart data={metrics.monthlyWatchData} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">{tc('noData')}</div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle>{t('completionRate')}</CardTitle>
                    <CardDescription>{t('completionRateDesc')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[280px] w-full overflow-hidden">
                      {metrics.completionData.length > 0 ? (
                        <CompletionRatioChart data={metrics.completionData} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">{t('noDurationData')}</div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle>{t('clientFamilies')}</CardTitle>
                    <CardDescription>{t('clientFamiliesDesc')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[280px] w-full overflow-hidden">
                      {metrics.clientCategoryData.length > 0 ? (
                        <ClientCategoryChart data={metrics.clientCategoryData} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">{t('noClient')}</div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>,

              /* Expansion: Server Load Timeline */
              <div key="server-load" className="grid gap-4 md:grid-cols-1">
                <Card className="bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle>{t('serverLoad')}</CardTitle>
                    <CardDescription>{t('serverLoadDesc')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ComposedTrendChart data={metrics.serverLoadData} series={[{ key: "peakStreams", color: "#ef4444", name: t('activeStreams'), type: "line" }]} />
                  </CardContent>
                </Card>
              </div>
            ]} />
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            <Suspense fallback={<Skeleton className="h-[400px] w-full bg-zinc-900/50 rounded-xl" />}>
              <DeepInsights type={type} timeRange={timeRange} excludedLibraries={excludedLibraries} />
            </Suspense>
            <Suspense fallback={<Skeleton className="h-[400px] w-full bg-zinc-900/50 rounded-xl" />}>
              <GranularAnalysis type={type} timeRange={timeRange} excludedLibraries={excludedLibraries} />
            </Suspense>
          </TabsContent>

          <TabsContent value="network" className="space-y-6">
            <Suspense fallback={<Skeleton className="h-[400px] w-full bg-zinc-900/50 rounded-xl" />}>
              <NetworkAnalysis type={type} timeRange={timeRange} excludedLibraries={excludedLibraries} />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
