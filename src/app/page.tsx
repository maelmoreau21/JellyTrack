import prisma from "@/lib/prisma";
import redis from "@/lib/redis";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Activity, MonitorPlay, Clock, TrendingUp, TrendingDown, Award, Film, Tv, Music, BookOpen, CalendarDays, PlayCircle, Users, LayoutDashboard, RadioTower, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { unstable_cache } from "next/cache";
import { Suspense } from "react";
import { DeepInsights } from "@/components/dashboard/DeepInsights";
import { GranularAnalysis } from "@/components/dashboard/GranularAnalysis";
import { NetworkAnalysis } from "@/components/dashboard/NetworkAnalysis";
import { Skeleton } from "@/components/ui/skeleton";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { redirect } from "next/navigation";
import { getTranslations } from 'next-intl/server';
import { cookies } from "next/headers";

// Charts — lazy-loaded for performance (recharts is heavy)
import { LazyComposedTrendChart as ComposedTrendChart } from "@/components/charts/LazyCharts";
import { LazyCategoryPieChart as CategoryPieChart } from "@/components/charts/LazyCharts";
import { LazyLibraryDailyPlaysChart as LibraryDailyPlaysChart } from "@/components/charts/LazyCharts";
import { LazyActivityByHourChart as ActivityByHourChart } from "@/components/charts/LazyCharts";
import { LazyDayOfWeekChart as DayOfWeekChart } from "@/components/charts/LazyCharts";
import { LazyMonthlyWatchTimeChart as MonthlyWatchTimeChart } from "@/components/charts/LazyCharts";
import { LazyCompletionRatioChart as CompletionRatioChart } from "@/components/charts/LazyCharts";
import { LazyClientCategoryChart as ClientCategoryChart } from "@/components/charts/LazyCharts";
import { LazyPlatformDistributionChart as PlatformDistributionChart } from "@/components/charts/LazyCharts";

// Type-only imports (zero-cost at runtime)
import type { ActivityHourData } from "@/components/charts/ActivityByHourChart";
import type { DayOfWeekData } from "@/components/charts/DayOfWeekChart";
import type { PlatformData } from "@/components/charts/PlatformDistributionChart";
import type { MonthlyWatchData } from "@/components/charts/MonthlyWatchTimeChart";
import type { CompletionData } from "@/components/charts/CompletionRatioChart";
import type { ClientCategoryData } from "@/components/charts/ClientCategoryChart";
import type { HeatmapData } from "@/components/charts/YearlyHeatmap";

import { TimeRangeSelector } from "@/components/TimeRangeSelector";
import { YearlyHeatmap } from "@/components/charts/YearlyHeatmap";
import { DraggableDashboard } from "@/components/dashboard/DraggableDashboard";
import { HardwareMonitor } from "@/components/dashboard/HardwareMonitor";
import { LiveStreamsPanel } from "@/components/dashboard/LiveStreamsPanel";
import { buildExcludedMediaClause, getCompletionMetrics, isZapped } from "@/lib/mediaPolicy";
import { ZAPPING_CONDITION } from '@/lib/statsUtils';
import { getLogHealthSnapshot } from "@/lib/logHealth";
import { categorizeClient } from "@/lib/utils";
import { GHOST_LIBRARY_NAMES } from "@/lib/libraryUtils";
import { SystemHealthWidgets } from "@/components/dashboard/SystemHealthWidgets";
import { CollapsibleCard } from "@/components/dashboard/CollapsibleCard";
import { MediaFilter } from "@/components/dashboard/MediaFilter";
import { PredictionsPanel } from "@/components/dashboard/PredictionsPanel";
import { ServerFilter } from "@/components/dashboard/ServerFilter";
import { buildLegacyStreamRedisKey, buildStreamRedisKey } from "@/lib/serverRegistry";
import { GLOBAL_SERVER_SCOPE_COOKIE, resolveSelectedServerIdsAsync } from "@/lib/serverScope";
import { buildSelectableServerOptions } from "@/lib/selectableServers";


type LiveStream = {
  serverId: string;
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
  mediaType?: string | null;
  albumArtist?: string | null;
  albumName?: string | null;
  seriesName?: string | null;
  seasonName?: string | null;
  posterItemId?: string | null;
  audioStreamIndex?: number | null;
  subtitleStreamIndex?: number | null;
};

// Local domain types to avoid `any` in dashboard calculations
type History = {
  startedAt: Date;
  durationWatched: number;
  clientName?: string | null;
  playMethod?: string | null;
  userId?: string | null;
  media?: { type?: string | null; durationMs?: bigint | null } | null;
};

type TrendEntry = {
  time: string;
  movieVolume: number;
  seriesVolume: number;
  musicVolume: number;
  booksVolume: number;
  totalViews: number;
  moviePlays: number;
  seriesPlays: number;
  musicPlays: number;
  booksPlays: number;
};

type TopUserAgg = {
  userId: string;
  _sum: { durationWatched?: number | null };
};

type ActiveStreamRow = {
  serverId: string;
  sessionId: string;
  mediaId: string;
  media: { jellyfinMediaId: string; title: string; type?: string | null; parentId?: string | null; artist?: string | null; durationMs?: bigint | null };
  user: { username?: string | null } | null;
  playMethod?: string | null;
  deviceName?: string | null;
  country?: string | null;
  city?: string | null;
  positionTicks?: bigint | null;
  audioLanguage?: string | null;
  subtitleLanguage?: string | null;
  audioCodec?: string | null;
  subtitleCodec?: string | null;
};

type DashboardMetrics = {
  totalUsers: number;
  hoursWatched: number;
  hoursGrowth: number;
  previousHoursWatched: number;
  directPlayPercent: number;
  peakConcurrentStreams: number;
  totalPlays: number;
  playsGrowth: number;
  previousPlays: number;
  currentActiveUsers: number;
  activeUsersGrowth: number;
  previousActiveUsers: number;
  todayPlays: number;
  todayHours: number;
  todayActiveUsers: number;
  trendData: TrendEntry[];
  categoryPieData: { name: string; value: number }[];
  hourlyChartData: ActivityHourData[];
  dayOfWeekChartData: DayOfWeekData[];
  platformChartData: PlatformData[];
  serverLoadData: { time: string; peakStreams: number }[];
  topUsers: { username: string; jellyfinUserId: string; hours: number }[];
  monthlyWatchData: MonthlyWatchData[];
  completionData: CompletionData[];
  clientCategoryData: ClientCategoryData[];
  breakdown: {
    movieViews: number; movieHours: number;
    seriesViews: number; seriesHours: number;
    musicViews: number; musicHours: number;
    booksViews: number; booksHours: number;
  };
};

export const dynamic = "force-dynamic";

// --- Aggregation Cache Helper ---
const getDashboardMetrics = unstable_cache(
  async (
    type: string | undefined,
    timeRange: string,
    excludedLibraries: string[],
    excludedTypes: string[],
    customFrom?: string,
    customTo?: string,
    selectedServerIds: string[] = []
  ) => {
    void type;

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

      const diff = toDate.getTime() - currentStartDate.getTime();
      previousStartDate = new Date(currentStartDate.getTime() - diff - 1);
      previousEndDate = new Date(currentStartDate.getTime() - 1);
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

    const dateFilter: { gte?: Date; lte?: Date } | undefined = currentStartDate ? { gte: currentStartDate } : undefined;
    if (timeRange === "custom" && customTo && dateFilter) {
      const toDate = new Date(customTo);
      toDate.setHours(23, 59, 59, 999);
      dateFilter.lte = toDate;
    }

    const prevDateFilter: { gte: Date; lt?: Date } | undefined =
      previousStartDate && previousEndDate ? { gte: previousStartDate, lt: previousEndDate } : undefined;

    // 2. Build media filter
    const AND: Array<Record<string, unknown>> = [];

    if (excludedTypes && excludedTypes.length > 0) {
      const typeExclusions: string[] = [];
      if (excludedTypes.includes("Movie")) typeExclusions.push("Movie");
      if (excludedTypes.includes("Series")) typeExclusions.push("Series", "Episode", "Season");
      if (excludedTypes.includes("MusicAlbum")) typeExclusions.push("MusicAlbum", "Audio", "Track");
      if (excludedTypes.includes("Book")) typeExclusions.push("Book");
      if (typeExclusions.length > 0) {
        AND.push({ type: { notIn: typeExclusions } });
      }
    }

    AND.push({
      libraryName: { notIn: GHOST_LIBRARY_NAMES },
      collectionType: { not: "boxsets" },
    });

    const excludedClause = buildExcludedMediaClause(excludedLibraries);
    if (excludedClause) AND.push(excludedClause);

    const mediaWhere = AND.length > 0 ? { AND } : {};
    const zappedFilter = ZAPPING_CONDITION;
    const selectedServerScope = selectedServerIds.length > 0 ? { in: selectedServerIds } : undefined;

    const playbackBaseWhere: Record<string, unknown> = { media: mediaWhere, ...zappedFilter };
    if (selectedServerScope) {
      playbackBaseWhere.serverId = selectedServerScope;
    }

    // Same playback where clause but WITHOUT zapping exclusions — used as a fallback
    const playbackBaseWhereNoZap: Record<string, unknown> = { media: mediaWhere };
    if (selectedServerScope) {
      playbackBaseWhereNoZap.serverId = selectedServerScope;
    }

    const userWhere = selectedServerScope ? { serverId: selectedServerScope } : undefined;

    // 3. Main period metrics + history loaded in parallel
    const [totalUsers, hoursWatchedAgg, histories] = await Promise.all([
      prisma.user.count({ where: userWhere }),
      prisma.playbackHistory.aggregate({
        _sum: { durationWatched: true },
        where: { ...playbackBaseWhere, startedAt: dateFilter },
      }),
      prisma.playbackHistory.findMany({
        where: { ...playbackBaseWhere, startedAt: dateFilter },
        select: {
          startedAt: true,
          durationWatched: true,
          clientName: true,
          playMethod: true,
          userId: true,
          media: { select: { type: true, durationMs: true, parentId: true } },
        },
        orderBy: { startedAt: "asc" },
      }) as Promise<History[]>,
    ]);

    const totalDurationWatched = Number(hoursWatchedAgg?._sum?.durationWatched ?? 0);
    const hoursWatched = parseFloat((totalDurationWatched / 3600).toFixed(1));

    let previousHoursWatched = 0;
    let hoursGrowth = 0;
    let previousPlays = 0;
    let previousActiveUsers = 0;

    if (prevDateFilter) {
      const [prevHoursAgg, prevPlaysCount, prevActiveUsersAgg] = await Promise.all([
        prisma.playbackHistory.aggregate({
          _sum: { durationWatched: true },
          where: { ...playbackBaseWhere, startedAt: prevDateFilter },
        }),
        prisma.playbackHistory.count({
          where: { ...playbackBaseWhere, startedAt: prevDateFilter },
        }),
        prisma.playbackHistory.groupBy({
          by: ["userId"],
          where: { ...playbackBaseWhere, startedAt: prevDateFilter, userId: { not: null } },
        }),
      ]);

      const previousDurationWatched = Number(prevHoursAgg?._sum?.durationWatched ?? 0);
      previousHoursWatched = parseFloat((previousDurationWatched / 3600).toFixed(1));
      hoursGrowth = previousHoursWatched > 0 ? ((hoursWatched - previousHoursWatched) / previousHoursWatched) * 100 : 0;
      previousPlays = prevPlaysCount;
      previousActiveUsers = prevActiveUsersAgg.length;
    }

    // 4. Compute chart datasets from the loaded history
    let movieViews = 0;
    let movieHours = 0;
    let seriesViews = 0;
    let seriesHours = 0;
    let musicViews = 0;
    let musicHours = 0;
    let booksViews = 0;
    let booksHours = 0;
    let directPlayCount = 0;

    const trendMap = new Map<string, TrendEntry>();
    const getFormatKey = (d: Date) => {
      if (timeRange === "24h") return `${d.getHours().toString().padStart(2, "0")}:00`;
      if (timeRange === "all") return `${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()}`;
      return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`;
    };

    const seriesTracker = new Map<string, Set<string>>();

    histories.forEach((h) => {
      if (h.playMethod === "DirectPlay") directPlayCount++;

      const key = getFormatKey(new Date(h.startedAt));
      if (!trendMap.has(key)) {
        trendMap.set(key, {
          time: key,
          movieVolume: 0,
          seriesVolume: 0,
          musicVolume: 0,
          booksVolume: 0,
          totalViews: 0,
          moviePlays: 0,
          seriesPlays: 0,
          musicPlays: 0,
          booksPlays: 0,
        });
      }

      const entry = trendMap.get(key)!;
      const mType = (h.media?.type || "").toLowerCase();
      const hours = h.durationWatched / 3600;

      if (mType.includes("movie")) {
        entry.movieVolume += hours;
        entry.moviePlays += 1;
        movieViews++;
        movieHours += hours;
      } else if (mType.includes("series") || mType.includes("episode")) {
        entry.seriesVolume += hours;
        
        // Tracking unique series per time bucket
        const seriesId = h.media?.parentId || 'unknown';
        if (!seriesTracker.has(key)) seriesTracker.set(key, new Set());
        const bucketSeries = seriesTracker.get(key)!;
        
        if (!bucketSeries.has(seriesId)) {
          entry.seriesPlays += 1;
          bucketSeries.add(seriesId);
        }

        seriesViews++;
        seriesHours += hours;
      } else if (mType.includes("audio") || mType.includes("track")) {
        entry.musicVolume += hours;
        entry.musicPlays += 1;
        musicViews++;
        musicHours += hours;
      } else if (mType.includes("book")) {
        entry.booksVolume += hours;
        entry.booksPlays += 1;
        booksViews++;
        booksHours += hours;
      } else {
        entry.booksVolume += hours;
        entry.booksPlays += 1;
      }

      entry.totalViews += 1;
    });

    const categoryPieData = [
      { name: "movies", value: parseFloat(movieHours.toFixed(2)) },
      { name: "series", value: parseFloat(seriesHours.toFixed(2)) },
      { name: "music", value: parseFloat(musicHours.toFixed(2)) },
      { name: "books", value: parseFloat(booksHours.toFixed(2)) },
    ].filter((item) => item.value > 0);

    const trendData = Array.from(trendMap.values()).map((v) => ({
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

    const topUsersAgg = (await prisma.playbackHistory.groupBy({
      by: ["userId"],
      _sum: { durationWatched: true },
      where: { ...playbackBaseWhere, startedAt: dateFilter, userId: { not: null } },
      orderBy: { _sum: { durationWatched: "desc" } },
      take: 5,
    })) as TopUserAgg[];

    const topUserIds = topUsersAgg
      .map((agg) => agg.userId)
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    const topUserRows = topUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: topUserIds } },
          select: { id: true, username: true, jellyfinUserId: true },
        })
      : [];

    const topUserMap = new Map(topUserRows.map((u) => [u.id, u]));
    const topUsers = topUsersAgg.map((agg) => {
      const user = topUserMap.get(agg.userId);
      return {
        username: user?.username || "?",
        jellyfinUserId: user?.jellyfinUserId || "",
        hours: parseFloat((((agg._sum.durationWatched as number | null) || 0) / 3600).toFixed(1)),
      };
    });

    const hourlyCounts = new Array(24).fill(0);
    histories.forEach((h) => {
      const hour = h.startedAt.getHours();
      hourlyCounts[hour]++;
    });
    const hourlyChartData: ActivityHourData[] = hourlyCounts.map((count, index) => ({
      hour: `${index.toString().padStart(2, "0")}:00`,
      count,
    }));

    // Day of week counts (0 = Sunday .. 6 = Saturday)
    let dayCounts = new Array(7).fill(0);
    histories.forEach((h) => {
      dayCounts[h.startedAt.getDay()]++;
    });

    // If some weekdays are zero because of the zapping filter (short sessions),
    // query a no-zap fallback and fill zero-days with fallback counts.
    // This preserves the zapped counts where present but ensures days with
    // only short sessions are still represented on the chart.
    const hasZeroDay = dayCounts.some((v) => v === 0);
    if (hasZeroDay) {
      try {
        const fallback = await prisma.playbackHistory.findMany({
          where: { ...playbackBaseWhereNoZap, startedAt: dateFilter },
          select: { startedAt: true },
        }) as { startedAt: Date }[];
        if (fallback && fallback.length > 0) {
          const fallbackCounts = new Array(7).fill(0);
          fallback.forEach((h) => {
            const d = h.startedAt instanceof Date ? h.startedAt : new Date(h.startedAt as any);
            fallbackCounts[d.getDay()]++;
          });
          dayCounts = dayCounts.map((c, idx) => (c > 0 ? c : fallbackCounts[idx]));
        }
      } catch (e) {
        // ignore fallback errors and keep original counts
      }
    }

    const dayOfWeekChartData: DayOfWeekData[] = dayCounts.map((count, index) => ({
      day: String(index),
      dayIndex: index,
      count,
    }));

    const platformCounts = new Map<string, number>();
    histories.forEach((h) => {
      const pName = h.clientName || "?";
      platformCounts.set(pName, (platformCounts.get(pName) || 0) + 1);
    });
    const platformChartData: PlatformData[] = Array.from(platformCounts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    const events: Array<{ time: number; type: number }> = [];
    histories.forEach((h) => {
      const start = h.startedAt.getTime();
      const end = start + h.durationWatched * 1000;
      events.push({ time: start, type: 1 });
      events.push({ time: end, type: -1 });
    });

    events.sort((a, b) => a.time - b.time || a.type - b.type);

    let currentConcurrent = 0;
    let peakConcurrentStreams = 0;
    const serverLoadMap = new Map<string, number>();

    for (const evt of events) {
      currentConcurrent += evt.type;
      if (currentConcurrent > peakConcurrentStreams) {
        peakConcurrentStreams = currentConcurrent;
      }

      const evtFullHourKey = getFormatKey(new Date(evt.time));
      const mappedVal = serverLoadMap.get(evtFullHourKey) || 0;
      if (currentConcurrent > mappedVal) {
        serverLoadMap.set(evtFullHourKey, currentConcurrent);
      }
    }

    const serverLoadData = Array.from(trendMap.values()).map((v) => ({
      time: v.time,
      peakStreams: serverLoadMap.get(v.time) || 0,
    }));

    const monthlyMap = new Map<string, number>();
    histories.forEach((h) => {
      const d = new Date(h.startedAt);
      const key = `${d.getFullYear()}_${d.getMonth()}`;
      monthlyMap.set(key, (monthlyMap.get(key) || 0) + h.durationWatched / 3600);
    });
    const monthlyWatchData: MonthlyWatchData[] = Array.from(monthlyMap.entries()).map(([month, hours]) => ({
      month,
      hours: parseFloat(hours.toFixed(1)),
    }));

    let completed = 0;
    let partial = 0;
    let abandoned = 0;
    histories.forEach((h) => {
      const completion = getCompletionMetrics(h.media || {}, h.durationWatched);
      if (completion.bucket === "completed") completed++;
      else if (completion.bucket === "partial") partial++;
      else if (completion.bucket === "abandoned") abandoned++;
    });

    const completionData: CompletionData[] = [
      { name: "completed", value: completed },
      { name: "partial", value: partial },
      { name: "abandoned", value: abandoned },
    ].filter((d) => d.value > 0);

    const clientCatMap = new Map<string, number>();
    histories.forEach((h) => {
      const cat = categorizeClient(h.clientName || "");
      clientCatMap.set(cat, (clientCatMap.get(cat) || 0) + 1);
    });
    const clientCategoryData: ClientCategoryData[] = Array.from(clientCatMap.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    const totalPlays = histories.length;
    const currentActiveUsers = new Set(histories.map((h) => h.userId).filter(Boolean)).size;
    const playsGrowth = previousPlays > 0 ? ((totalPlays - previousPlays) / previousPlays) * 100 : 0;
    const activeUsersGrowth = previousActiveUsers > 0 ? ((currentActiveUsers - previousActiveUsers) / previousActiveUsers) * 100 : 0;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [todayPlays, todayHoursAgg, todayActiveUsersAgg] = await Promise.all([
      prisma.playbackHistory.count({
        where: { ...playbackBaseWhere, startedAt: { gte: todayStart } },
      }),
      prisma.playbackHistory.aggregate({
        _sum: { durationWatched: true },
        where: { ...playbackBaseWhere, startedAt: { gte: todayStart } },
      }),
      prisma.playbackHistory.groupBy({
        by: ["userId"],
        where: { ...playbackBaseWhere, startedAt: { gte: todayStart }, userId: { not: null } },
      }),
    ]);
    const todayHours = parseFloat((((todayHoursAgg._sum.durationWatched as number | null) || 0) / 3600).toFixed(1));
    const todayActiveUsers = todayActiveUsersAgg.length;

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
        movieViews,
        movieHours: parseFloat(movieHours.toFixed(1)),
        seriesViews,
        seriesHours: parseFloat(seriesHours.toFixed(1)),
        musicViews,
        musicHours: parseFloat(musicHours.toFixed(1)),
        booksViews,
        booksHours: parseFloat(booksHours.toFixed(1)),
      },
    };
  },
  ["JellyTrack-dashboard-v2"],
  { revalidate: 60 }
);

const getHeatmapData = unstable_cache(
  async (selectedServerIdsKey: string) => {
    const selectedServerIds = selectedServerIdsKey ? selectedServerIdsKey.split(",").filter(Boolean) : [];
    const serverWhere = selectedServerIds.length > 0 ? { serverId: { in: selectedServerIds } } : undefined;

    const rawData = await prisma.playbackHistory.findMany({
      where: serverWhere,
      select: { startedAt: true, media: { select: { collectionType: true, type: true } } },
    });

    const countsByDateAndType = new Map<string, Map<string, number>>();
    const yearsSet = new Set<number>();
    const libraryTypes = new Set<string>();

    rawData.forEach((r) => {
      const d = r.startedAt.toISOString().split("T")[0];
      const lib = r.media?.collectionType || r.media?.type || "unknown";
      libraryTypes.add(lib);
      yearsSet.add(r.startedAt.getFullYear());

      if (!countsByDateAndType.has(d)) countsByDateAndType.set(d, new Map());
      const dayMap = countsByDateAndType.get(d)!;
      dayMap.set(lib, (dayMap.get(lib) || 0) + 1);
      dayMap.set("_total", (dayMap.get("_total") || 0) + 1);
    });

    const heatmapDataByType: Record<string, HeatmapData[]> = {};
    const allKeys = ["_total", ...Array.from(libraryTypes)];
    for (const key of allKeys) {
      const entries: HeatmapData[] = [];
      countsByDateAndType.forEach((dayMap, date) => {
        const count = dayMap.get(key) || 0;
        if (count > 0) entries.push({ date, count, level: 0 });
      });
      heatmapDataByType[key] = entries;
    }

    return {
      heatmapDataByType,
      availableYears: Array.from(yearsSet).sort((a, b) => b - a),
      libraryTypes: Array.from(libraryTypes),
    };
  },
  ["JellyTrack-heatmap-v3"],
  { revalidate: 120 }
);

async function HeatmapWrapper({ selectedServerIds }: { selectedServerIds: string[] }) {
  const selectedServerIdsKey = selectedServerIds.length > 0 ? [...selectedServerIds].sort().join(",") : "";
  const { heatmapDataByType, availableYears, libraryTypes } = await getHeatmapData(selectedServerIdsKey);

  return (
    <YearlyHeatmap
      data={heatmapDataByType["_total"] || []}
      availableYears={availableYears}
      dataByType={heatmapDataByType}
      libraryTypes={libraryTypes}
    />
  );
}

export default async function DashboardPage(props: {
  searchParams: Promise<{
    type?: string;
    timeRange?: string;
    from?: string;
    to?: string;
    excludeLibs?: string;
    excludeTypes?: string;
    servers?: string;
  }>;
}) {
  // RBAC: Non-admin users are redirected to their profile page
  const authSession = await getServerSession(authOptions);
  if (!authSession?.user?.isAdmin) {
    const uid = (authSession?.user as { jellyfinUserId?: string } | undefined)?.jellyfinUserId;
    redirect(uid ? `/users/${uid}` : "/login");
  }

  const searchParams = await props.searchParams;
  const { type, timeRange = "7d", from, to, excludeLibs, excludeTypes, servers: serversParam } = searchParams;

  const [settings, serverRows] = await Promise.all([
    prisma.globalSettings.findUnique({ where: { id: "global" } }),
    prisma.server.findMany({
      select: { id: true, name: true, isActive: true, url: true, jellyfinServerId: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const dbExcluded = settings?.excludedLibraries || [];

  // Combine DB settings with URL params for excluded libraries
  const excludedLibsUrl = excludeLibs ? excludeLibs.split(",") : [];
  const excludedLibraries = Array.from(new Set([...dbExcluded, ...excludedLibsUrl]));

  const excludedTypesArr = excludeTypes ? excludeTypes.split(",") : [];

  const jellytrackMode = (process.env.JELLYTRACK_MODE || "single").toLowerCase();
  const selectableServerOptions = buildSelectableServerOptions(serverRows);

  const multiServerEnabled = jellytrackMode === "multi" && selectableServerOptions.length > 1;
  const cookieStore = await cookies();
  const persistedScopeCookie = cookieStore.get(GLOBAL_SERVER_SCOPE_COOKIE)?.value ?? null;
  const { selectedServerIds } = await resolveSelectedServerIdsAsync({
    multiServerEnabled,
    selectableServerIds: selectableServerOptions.map((server) => server.id),
    requestedServersParam: serversParam,
    cookieServersParam: persistedScopeCookie,
  });

  const metrics = (await getDashboardMetrics(
    type,
    timeRange,
    excludedLibraries,
    excludedTypesArr,
    from,
    to,
    selectedServerIds
  )) as DashboardMetrics;
  const healthSnapshot = await getLogHealthSnapshot();

  const t = await getTranslations('dashboard');
  const tc = await getTranslations('common');

  // Post-process cached data with translations
  const DAY_NAMES = t('dayNames').split(',').map((name) => name.trim());
  const MONTH_NAMES = t('monthNames').split(',');

  // Normalize and localize day-of-week labels while keeping stable indexes.
  const normalizedDayCounts = new Array(7).fill(0);
  metrics.dayOfWeekChartData.forEach((entry: DayOfWeekData, fallbackIndex: number) => {
    const idxFromData =
      typeof entry.dayIndex === "number"
        ? entry.dayIndex
        : Number.parseInt(String(entry.day), 10);
    const idx = Number.isInteger(idxFromData) && idxFromData >= 0 && idxFromData < 7
      ? idxFromData
      : fallbackIndex;
    if (idx >= 0 && idx < 7) {
      const numericCount = Number(entry.count ?? 0);
      normalizedDayCounts[idx] += Number.isFinite(numericCount) ? numericCount : 0;
    }
  });

  metrics.dayOfWeekChartData = DAY_NAMES.slice(0, 7).map((dayLabel: string, index: number) => ({
    day: dayLabel,
    dayIndex: index,
    count: normalizedDayCounts[index] ?? 0,
  }));

  // Monthly data: pass MONTH_NAMES to chart component for client-side year navigation

  // Translate completion data labels  
  const completionLabels: Record<string, string> = {
    completed: t('completed'),
    partial: t('partial'),
    abandoned: t('abandoned'),
  };
  metrics.completionData = metrics.completionData.map((d: CompletionData) => ({
    ...d,
    name: completionLabels[d.name] || d.name,
  }));

  const selectedServerScope = selectedServerIds.length > 0 ? { in: selectedServerIds } : undefined;

  // Source of truth: Prisma ActiveStream table
  const activeStreamEntries = await prisma.activeStream.findMany({
    where: selectedServerScope ? { serverId: selectedServerScope } : undefined,
    include: {
      user: { select: { username: true } },
      media: { select: { jellyfinMediaId: true, title: true, type: true, parentId: true, artist: true, durationMs: true } }
    }
  }) as unknown as ActiveStreamRow[];
  
  const activeStreamsCount = activeStreamEntries.length;
  let liveStreams: LiveStream[] = [];
  let totalBandwidthMbps = 0;

  if (activeStreamsCount > 0) {
    // Fetch real-time specifics from Redis if they exist
    const redisKeys = activeStreamEntries.map((s) => buildStreamRedisKey(s.serverId, s.sessionId));
    const redisPayloads = await Promise.all(redisKeys.map(k => redis.get(k)));
    const redisMap = new Map<string, Record<string, unknown>>();
    
    redisPayloads.forEach((p, idx) => {
        if (p) {
            try {
                const parsed = JSON.parse(p);
                const stream = activeStreamEntries[idx];
                redisMap.set(`${stream.serverId}:${stream.sessionId}`, parsed);
            } catch {}
        }
    });

    // Backward compatibility: fallback to legacy key if scoped key is absent.
    await Promise.all(activeStreamEntries.map(async (stream) => {
      const mapKey = `${stream.serverId}:${stream.sessionId}`;
      if (redisMap.has(mapKey)) return;
      try {
        const legacyPayload = await redis.get(buildLegacyStreamRedisKey(stream.sessionId));
        if (!legacyPayload) return;
        redisMap.set(mapKey, JSON.parse(legacyPayload));
      } catch {}
    }));

    const relatedPairs = new Set<string>();
    for (const entry of activeStreamEntries) {
      // We also need parent and grandparent for hierarchical display if not in Redis
      if (entry.media?.parentId) relatedPairs.add(JSON.stringify([entry.serverId, entry.media.parentId]));
    }

    const relatedTargets = Array.from(relatedPairs).map((pair) => {
      const parsed = JSON.parse(pair) as [string, string];
      return { serverId: parsed[0], jellyfinMediaId: parsed[1] };
    });
    
    const relatedMedia = relatedTargets.length > 0
      ? await prisma.media.findMany({
        where: {
          OR: relatedTargets.map((target) => ({
            serverId: target.serverId,
            jellyfinMediaId: target.jellyfinMediaId,
          })),
        },
        select: { serverId: true, jellyfinMediaId: true, title: true, type: true, parentId: true, artist: true },
      })
      : [];
    const mediaHierarchyMap = new Map(relatedMedia.map((m) => [`${m.serverId}:${m.jellyfinMediaId}`, m]));

    liveStreams = activeStreamEntries.map((dbStream) => {
        const payload = (redisMap.get(`${dbStream.serverId}:${dbStream.sessionId}`) || {}) as Record<string, unknown>;

        const isTranscoding = dbStream.playMethod === "Transcode"
            || (payload['isTranscoding'] === true)
            || (payload['IsTranscoding'] === true);

        totalBandwidthMbps += isTranscoding ? 12 : 6;

        const itemMedia = dbStream.media;
        const parentMedia = itemMedia.parentId ? mediaHierarchyMap.get(`${dbStream.serverId}:${itemMedia.parentId}`) : null;
        const grandparentMedia = parentMedia?.parentId ? mediaHierarchyMap.get(`${dbStream.serverId}:${parentMedia.parentId}`) : null;

        // Build enriched subtitle
        let mediaSubtitle: string | null = null;
        if (typeof payload['mediaSubtitle'] === 'string') {
          mediaSubtitle = payload['mediaSubtitle'] as string;
        } else if (itemMedia.type === "Episode" && parentMedia) {
          mediaSubtitle = grandparentMedia?.title
            ? `${grandparentMedia.title} — ${parentMedia.title}`
            : parentMedia.title;
        } else if ((itemMedia.type === "Audio" || itemMedia.type === "Track") && parentMedia) {
          const resolvedArtist = itemMedia.artist || parentMedia.artist || null;
          mediaSubtitle = resolvedArtist ? `${resolvedArtist} — ${parentMedia.title}` : parentMedia.title;
        } else if (parentMedia?.title) {
          mediaSubtitle = parentMedia.title;
        }

        // Calculate progress percentage
        let progressPercent = 0;
        if (typeof payload['progressPercent'] === "number") {
          progressPercent = payload['progressPercent'] as number;
        } else if (dbStream.positionTicks && itemMedia.durationMs && itemMedia.durationMs > 0) {
          const runTimeTicks = Number(itemMedia.durationMs) * 10_000;
          progressPercent = Math.min(100, Math.round((Number(dbStream.positionTicks) / runTimeTicks) * 100));
        }

        const audioLang = typeof payload['audioLanguage'] === 'string' ? (payload['audioLanguage'] as string) : null;
        const audioC = typeof payload['audioCodec'] === 'string' ? (payload['audioCodec'] as string) : null;
        const subLang = typeof payload['subtitleLanguage'] === 'string' ? (payload['subtitleLanguage'] as string) : null;
        const subC = typeof payload['subtitleCodec'] === 'string' ? (payload['subtitleCodec'] as string) : null;

        return {
          serverId: dbStream.serverId,
          sessionId: dbStream.sessionId,
          itemId: itemMedia.jellyfinMediaId,
          user: dbStream.user?.username || "Unknown",
          mediaTitle: itemMedia.title || "Unknown",
          mediaSubtitle,
          playMethod: dbStream.playMethod || "Unknown",
          device: dbStream.deviceName || "Unknown",
          country: dbStream.country || "Unknown",
          city: dbStream.city || "Unknown",
          progressPercent,
          isPaused: payload['isPaused'] === true || payload['IsPaused'] === true,
          parentItemId: itemMedia.parentId ?? null,
          audioLanguage: dbStream.audioLanguage || audioLang || null,
          audioCodec: dbStream.audioCodec || audioC || null,
          subtitleLanguage: dbStream.subtitleLanguage || subLang || null,
          subtitleCodec: dbStream.subtitleCodec || subC || null,
          audioStreamIndex:
            typeof payload["audioStreamIndex"] === "number"
              ? (payload["audioStreamIndex"] as number)
              : typeof payload["AudioStreamIndex"] === "number"
              ? (payload["AudioStreamIndex"] as number)
              : null,
          subtitleStreamIndex:
            typeof payload["subtitleStreamIndex"] === "number"
              ? (payload["subtitleStreamIndex"] as number)
              : typeof payload["SubtitleStreamIndex"] === "number"
              ? (payload["SubtitleStreamIndex"] as number)
              : null,
          mediaType: itemMedia.type,
          albumArtist: itemMedia.artist,
          posterItemId: (itemMedia.type === 'Audio' || itemMedia.type === 'Track') ? (itemMedia.parentId || itemMedia.jellyfinMediaId) : itemMedia.jellyfinMediaId,
        };
      });
  }

  return (
    <div className="dashboard-page flex-col md:flex">
      <div className="flex-1 space-y-4 md:space-y-6 p-4 md:p-8 pt-4 md:pt-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
          <div className="flex flex-col gap-2 min-w-0">
            <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6 min-w-0">
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Dashboard</h2>
              <div className="w-full md:w-auto overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
                <MediaFilter />
              </div>
            </div>
            <ServerFilter servers={selectableServerOptions} enabled={multiServerEnabled} />
          </div>
          <div className="flex items-center gap-2 md:gap-4 shrink-0">
            <TimeRangeSelector />
          </div>
        </div>

        <SystemHealthWidgets initialSnapshot={healthSnapshot} />

        <HardwareMonitor />

        {/* Today Stats Banner */}
        <div className="dashboard-banner flex flex-wrap items-center gap-2 rounded-xl px-3 py-3 md:gap-3 md:px-4">
          <CalendarDays className="h-5 w-5 text-primary shrink-0" />
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t('today')}</span>
          <div className="flex flex-wrap items-center gap-3 md:gap-6 ml-0 md:ml-2">
            <div className="flex items-center gap-1.5">
              <PlayCircle className="h-3.5 w-3.5 text-blue-400" />
              <span className="text-sm font-semibold text-zinc-900 dark:text-white">{metrics.todayPlays}</span>
              <span className="text-xs text-zinc-500">{t('readings')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-orange-400" />
              <span className="text-sm font-semibold text-zinc-900 dark:text-white">{metrics.todayHours}h</span>
              <span className="text-xs text-zinc-500">{t('watched')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-sm font-semibold text-zinc-900 dark:text-white">{metrics.todayActiveUsers}</span>
              <span className="text-xs text-zinc-500">{t('activeUsers')}</span>
            </div>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="dashboard-tablist">
            <TabsTrigger value="overview">{t('overviewTab')}</TabsTrigger>
            <TabsTrigger value="analytics">{t('detailedTab')}</TabsTrigger>
            <TabsTrigger value="network">{t('networkTab')}</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <DraggableDashboard blocks={[
              /* Global Metrics Row 1 */
              <div key="metrics" className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
                <Card className="app-surface-soft border-border backdrop-blur-sm">
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

                <Card className="app-surface-soft border-border backdrop-blur-sm">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('totalPlays')}</CardTitle>
                    <PlayCircle className="h-4 w-4 text-primary" />
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

                <Card className="app-surface-soft border-border backdrop-blur-sm">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('directPlay')}</CardTitle>
                    <MonitorPlay className="h-4 w-4 text-primary" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{metrics.directPlayPercent}%<span className="text-xs font-normal text-muted-foreground ml-1">DP</span></div>
                    <p className="text-xs text-muted-foreground mt-1">{t('directPlayDesc')}</p>
                  </CardContent>
                </Card>

                <Link href="/logs" className="block group">
                  <Card className="app-surface-soft border-border backdrop-blur-sm transition-all group-hover:border-primary/50 cursor-pointer">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">{t('globalTime')}</CardTitle>
                      <Clock className="h-4 w-4 text-primary" />
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

                <Card className="app-surface-soft border-border backdrop-blur-sm">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('activeUsersTitle')}</CardTitle>
                    <Users className="h-4 w-4 text-red-400" />
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
                  <Card className="app-surface-soft border-border transition-all group-hover:border-primary/40 cursor-pointer">
                    <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                      <CardTitle className="text-sm font-medium opacity-70">{t('moviesCard')}</CardTitle>
                      <Film className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                      <div className="text-2xl font-bold text-zinc-900 dark:text-white">{metrics.breakdown.movieViews} <span className="text-sm font-normal text-zinc-500">{t('moviesViews')}</span></div>
                      <p className="text-xs text-blue-500 font-medium">{metrics.breakdown.movieHours}h {t('moviesWatched')}</p>
                    </CardContent>
                  </Card>
                </Link>

                <Link href="/logs?type=Episode" className="block group">
                  <Card className="app-surface-soft border-border transition-all group-hover:border-green-500/40 cursor-pointer">
                    <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                      <CardTitle className="text-sm font-medium opacity-70">{t('seriesCard')}</CardTitle>
                      <Tv className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                      <div className="text-2xl font-bold text-zinc-900 dark:text-white">{metrics.breakdown.seriesViews} <span className="text-sm font-normal text-zinc-500">{t('seriesPlays')}</span></div>
                      <p className="text-xs text-green-500 font-medium">{metrics.breakdown.seriesHours}h {t('seriesWatched')}</p>
                    </CardContent>
                  </Card>
                </Link>

                <Link href="/logs?type=Audio" className="block group">
                  <Card className="app-surface-soft border-border transition-colors group-hover:border-primary/40 cursor-pointer">
                    <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                      <CardTitle className="text-sm font-medium opacity-70">{t('musicCard')}</CardTitle>
                      <Music className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                      <div className="text-2xl font-bold text-zinc-900 dark:text-white">{metrics.breakdown.musicViews} <span className="text-sm font-normal text-zinc-500">{t('musicTitles')}</span></div>
                      <p className="text-xs text-yellow-500 font-medium">{metrics.breakdown.musicHours}h {t('musicListened')}</p>
                    </CardContent>
                  </Card>
                </Link>

                <Link href="/logs?type=AudioBook" className="block group">
                  <Card className="app-surface-soft border-border transition-all group-hover:border-purple-500/40 cursor-pointer">
                    <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                      <CardTitle className="text-sm font-medium opacity-70">{t('booksCard')}</CardTitle>
                      <BookOpen className="h-4 w-4 text-purple-500" />
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                      <div className="text-2xl font-bold text-zinc-900 dark:text-white">{metrics.breakdown.booksViews} <span className="text-sm font-normal text-zinc-500">{t('booksOpened')}</span></div>
                      <p className="text-xs text-purple-500 font-medium">{metrics.breakdown.booksHours}h {t('booksSpent')}</p>
                    </CardContent>
                  </Card>
                </Link>
              </div>,

              /* Dataviz Row : Multi-Axis Volume & PieChart */
              <div key="volumes" className="grid gap-4 md:grid-cols-2 lg:grid-cols-7 min-w-0">
                <Card className="col-span-1 lg:col-span-5 app-surface-soft border-border backdrop-blur-sm">
                  <CardHeader className="pb-1">
                    <CardTitle>{t('volumeHistory')}</CardTitle>
                    <CardDescription>{t('volumeHistoryDesc')}</CardDescription>
                  </CardHeader>
                  <CardContent className="pl-0 pb-4 pr-1">
                    <div className="h-[400px] min-h-[400px] w-full overflow-hidden">
                      {metrics.trendData.length > 0 ? (
                        <ComposedTrendChart data={metrics.trendData} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">{tc('noData')}</div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card className="col-span-1 lg:col-span-2 app-surface-soft border-border backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle>{t('categoryBreakdown')}</CardTitle>
                    <CardDescription>{t('categoryBreakdownDesc')}</CardDescription>
                  </CardHeader>
                  <CardContent className="pl-0 pb-4">
                    <div className="h-[300px] min-h-[300px] w-full overflow-hidden">
                      {metrics.categoryPieData.length > 0 ? (
                        <CategoryPieChart data={metrics.categoryPieData.map((d) => ({ ...d, name: tc(d.name), rawName: d.name }))} />
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
              <Card key="libraryPlays" className="app-surface-soft border-border backdrop-blur-sm">
                <CardHeader className="pb-1">
                  <CardTitle>{t('libraryPlays')}</CardTitle>
                  <CardDescription>{t('libraryPlaysDesc')}</CardDescription>
                </CardHeader>
                <CardContent className="pl-0 pb-4 pr-1">
                  <div className="h-[350px] min-h-[350px] w-full overflow-hidden">
                    {metrics.trendData.length > 0 ? (
                      <LibraryDailyPlaysChart data={metrics.trendData} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">{tc('noData')}</div>
                    )}
                  </div>
                </CardContent>
              </Card>,

              /* Yearly Heatmap Contribution Component - Phase 6 */
              <Suspense key="heatmap" fallback={<Skeleton className="h-[250px] w-full rounded-xl" />}>
                <HeatmapWrapper selectedServerIds={selectedServerIds} />
              </Suspense>,

              /* Dataviz Row : Plateformes + Top Users + Live */
              <div key="platforms" className="grid gap-4 md:grid-cols-2 lg:grid-cols-8 min-w-0">

                <Card className="col-span-2 app-surface-soft border-border backdrop-blur-sm shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex gap-2"><Award className="w-5 h-5 text-yellow-500" /> {t('loyalUsers')}</CardTitle>
                    <CardDescription>{t('loyalUsersDesc')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6 mt-4">
                      {metrics.topUsers.length === 0 && <span className="text-muted-foreground text-sm">{t('noActivity')}</span>}
                      {metrics.topUsers.map((u, i) => (
                        <Link key={i} href={`/users/${u.jellyfinUserId}`} className="flex items-center gap-4 group hover:bg-zinc-200 dark:hover:bg-zinc-800/50 rounded-lg p-1 -m-1 transition-colors">
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

                <Card className="col-span-3 app-surface-soft border-border backdrop-blur-sm shadow-sm">
                  <CardHeader>
                    <CardTitle>{t('clientEcosystem')}</CardTitle>
                    <CardDescription>{t('clientEcosystemDesc')}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex justify-center items-center pb-4">
                    <div className="h-[300px] w-full max-w-[400px]">
                      {metrics.platformChartData.length > 0 ? (
                        <PlatformDistributionChart data={metrics.platformChartData} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">{tc('noData')}</div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <LiveStreamsPanel
                  initialStreams={liveStreams}
                  initialBandwidth={totalBandwidthMbps}
                  selectedServerIds={selectedServerIds}
                />
              </div>,

              /* Third Row Analytics - Hourly + Day of Week */
              <div key="hourly" className="grid gap-4 md:grid-cols-2">
                <CollapsibleCard storageKey="hourly" title={t('hourlyActivity')} description={t('hourlyActivityDesc')} contentClassName="pl-0 pb-4">
                  <div className="h-[250px] min-h-[250px] w-full overflow-hidden">
                    {metrics.hourlyChartData.length > 0 ? (
                      <ActivityByHourChart data={metrics.hourlyChartData} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">{tc('noData')}</div>
                    )}
                  </div>
                </CollapsibleCard>
                <CollapsibleCard storageKey="dayOfWeek" title={t('dayOfWeekActivity')} description={t('dayOfWeekActivityDesc')} contentClassName="pl-0 pb-4">
                  <div className="h-[250px] min-h-[250px] w-full overflow-hidden">
                    {metrics.dayOfWeekChartData.some((d: DayOfWeekData) => Number(d.count ?? 0) > 0) ? (
                      <DayOfWeekChart data={metrics.dayOfWeekChartData} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">{tc('noData')}</div>
                    )}
                  </div>
                </CollapsibleCard>
              </div>,

              /* Monthly Watch Time + Completion Ratio + Client Categories */
              <div key="new-stats" className="grid gap-4 md:grid-cols-3">
                <CollapsibleCard storageKey="monthly" title={t('monthlyTime')} description={t('monthlyTimeDesc')} contentClassName="pl-0 pb-4">
                  <div className="h-[320px] w-full overflow-hidden">
                    {metrics.monthlyWatchData.length > 0 ? (
                      <MonthlyWatchTimeChart data={metrics.monthlyWatchData} monthNames={MONTH_NAMES} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">{tc('noData')}</div>
                    )}
                  </div>
                </CollapsibleCard>

                <CollapsibleCard storageKey="completion" title={t('completionRate')} description={t('completionRateDesc')}>
                  <div className="h-[280px] w-full overflow-hidden">
                    {metrics.completionData.length > 0 ? (
                      <CompletionRatioChart data={metrics.completionData} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">{t('noDurationData')}</div>
                    )}
                  </div>
                </CollapsibleCard>

                <CollapsibleCard storageKey="clientFamilies" title={t('clientFamilies')} description={t('clientFamiliesDesc')}>
                  <div className="h-[280px] w-full overflow-hidden">
                    {metrics.clientCategoryData.length > 0 ? (
                      <ClientCategoryChart data={metrics.clientCategoryData} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">{t('noClient')}</div>
                    )}
                  </div>
                </CollapsibleCard>
              </div>,

              /* Expansion: Server Load Timeline */
              <div key="server-load" className="grid gap-4 md:grid-cols-1">
                <CollapsibleCard storageKey="serverLoad" title={t('serverLoad')} description={t('serverLoadDesc')}>
                  <ComposedTrendChart data={metrics.serverLoadData} series={[{ key: "peakStreams", color: "#ef4444", name: t('activeStreams'), type: "line" }]} />
                </CollapsibleCard>
              </div>
            ]} />

            {/* AI Predictions */}
            <PredictionsPanel />
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            <Suspense fallback={<Skeleton className="h-[400px] w-full bg-zinc-200/50 dark:bg-zinc-900/50 rounded-xl" />}>
              <DeepInsights
                type={type}
                timeRange={timeRange}
                excludedLibraries={excludedLibraries}
                selectedServerIds={selectedServerIds}
              />
            </Suspense>
            <Suspense fallback={<Skeleton className="h-[400px] w-full bg-zinc-200/50 dark:bg-zinc-900/50 rounded-xl" />}>
              <GranularAnalysis
                type={type}
                timeRange={timeRange}
                excludedLibraries={excludedLibraries}
                selectedServerIds={selectedServerIds}
              />
            </Suspense>
          </TabsContent>

          <TabsContent value="network" className="space-y-6">
            <Suspense fallback={<Skeleton className="h-[400px] w-full bg-zinc-200/50 dark:bg-zinc-900/50 rounded-xl" />}>
              <NetworkAnalysis
                type={type}
                timeRange={timeRange}
                excludedLibraries={excludedLibraries}
                selectedServerIds={selectedServerIds}
              />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
