/**
 * Dashboard metrics aggregation — extracted from page.tsx for maintainability.
 *
 * Contains all data-fetching and computation logic used by the dashboard page.
 */
import prisma from "@/lib/prisma";
import { unstable_cache } from "next/cache";
import { buildExcludedMediaClause, getCumulativeCompletionEntries } from "@/lib/mediaPolicy";
import { ZAPPING_CONDITION } from "@/lib/statsUtils";
import { categorizeClient } from "@/lib/utils";
import { GHOST_LIBRARY_NAMES } from "@/lib/libraryUtils";

import type { ActivityHourData } from "@/components/charts/ActivityByHourChart";
import type { DayOfWeekData } from "@/components/charts/DayOfWeekChart";
import type { PlatformData } from "@/components/charts/PlatformDistributionChart";
import type { MonthlyWatchData } from "@/components/charts/MonthlyWatchTimeChart";
import type { CompletionData } from "@/components/charts/CompletionRatioChart";
import type { ClientCategoryData } from "@/components/charts/ClientCategoryChart";
import type { HeatmapData } from "@/components/charts/YearlyHeatmap";

import type { DashboardHistory, DashboardMetrics, TrendEntry, TopUserAgg } from "@/types/dashboard";

// --- Dashboard Aggregation Cache ---
export const getDashboardMetrics = unstable_cache(
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
          mediaId: true,
          clientName: true,
          playMethod: true,
          userId: true,
          media: { select: { type: true, durationMs: true, parentId: true } },
        },
        orderBy: { startedAt: "asc" },
      }) as Promise<DashboardHistory[]>,
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

    const topUsersRaw = await prisma.playbackHistory.groupBy({
      by: ["userId"],
      _sum: { durationWatched: true },
      where: { ...playbackBaseWhere, startedAt: dateFilter, userId: { not: null } },
      orderBy: { _sum: { durationWatched: "desc" } },
      take: 5,
    });
    const topUsersAgg = topUsersRaw as unknown as TopUserAgg[];

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

    const completionReferenceHistories: DashboardHistory[] = histories.length === 0
      ? []
      : currentStartDate
        ? await prisma.playbackHistory.findMany({
          where: playbackBaseWhere,
          select: {
            durationWatched: true,
            mediaId: true,
            userId: true,
            startedAt: true,
            media: { select: { type: true, durationMs: true, parentId: true } },
          },
        }) as DashboardHistory[]
        : histories;

    let completed = 0;
    let partial = 0;
    let abandoned = 0;
    getCumulativeCompletionEntries(histories, completionReferenceHistories).forEach(({ completion }) => {
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

// --- Heatmap Data Cache ---
export const getHeatmapData = unstable_cache(
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
