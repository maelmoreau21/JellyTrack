import prisma from "@/lib/prisma";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Activity, MonitorPlay, Clock, TrendingUp, TrendingDown, Award, Film, Tv, Music, BookOpen, CalendarDays, PlayCircle, Users } from "lucide-react";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import type { DayOfWeekData } from "@/components/charts/DayOfWeekChart";
import type { CompletionData } from "@/components/charts/CompletionRatioChart";

import { TimeRangeSelector } from "@/components/TimeRangeSelector";
import { YearlyHeatmap } from "@/components/charts/YearlyHeatmap";
import { DraggableDashboard } from "@/components/dashboard/DraggableDashboard";
import { HardwareMonitor } from "@/components/dashboard/HardwareMonitor";
import { LiveStreamsPanel } from "@/components/dashboard/LiveStreamsPanel";
import { getLogHealthSnapshot } from "@/lib/logHealth";
import { SystemHealthWidgets } from "@/components/dashboard/SystemHealthWidgets";
import { CollapsibleCard } from "@/components/dashboard/CollapsibleCard";
import { MediaFilter } from "@/components/dashboard/MediaFilter";
import { PredictionsPanel } from "@/components/dashboard/PredictionsPanel";
import { ServerFilter } from "@/components/dashboard/ServerFilter";
import { GLOBAL_SERVER_SCOPE_COOKIE } from "@/lib/serverScope";
import { resolveSelectedServerIdsAsync } from "@/lib/serverScope.server";
import { buildSelectableServerOptions } from "@/lib/selectableServers";

// Extracted data-fetching and domain types
import { getDashboardMetrics, getHeatmapData } from "@/lib/dashboardMetrics";
import { getLiveStreams } from "@/lib/liveStreams";
import type { DashboardMetrics } from "@/types/dashboard";

export const dynamic = "force-dynamic";

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

  // Hydrate active streams using extracted module
  const { liveStreams, totalBandwidthMbps, activeStreamsCount } = await getLiveStreams(selectedServerIds);

  return (
    <div className="dashboard-page flex-col md:flex">
      <div className="flex-1 space-y-4 md:space-y-6 p-4 md:p-8 pt-4 md:pt-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
          <div className="flex flex-col gap-2 min-w-0">
            <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6 min-w-0">
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight">{t('title')}</h2>
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

        <ErrorBoundary name="System Health">
          <SystemHealthWidgets initialSnapshot={healthSnapshot} />
        </ErrorBoundary>

        <ErrorBoundary name="Hardware Monitor">
          <HardwareMonitor />
        </ErrorBoundary>

        {/* Today Stats Banner */}
        <div className="dashboard-banner flex flex-wrap items-center gap-2 rounded-xl px-3 py-3 md:gap-3 md:px-4">
          <CalendarDays className="h-5 w-5 text-primary shrink-0" />
          <span className="text-sm font-medium text-zinc-700 dark:text-muted-foreground">{t('today')}</span>
          <div className="flex flex-wrap items-center gap-3 md:gap-6 ml-0 md:ml-2">
            <div className="flex items-center gap-1.5">
              <PlayCircle className="h-3.5 w-3.5 text-blue-400" />
              <span className="text-sm font-semibold metric-glow-blue">{metrics.todayPlays}</span>
              <span className="text-xs text-muted-foreground">{t('readings')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-orange-400" />
              <span className="text-sm font-semibold metric-glow-amber">{metrics.todayHours}h</span>
              <span className="text-xs text-muted-foreground">{t('watched')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-sm font-semibold metric-glow-emerald">{metrics.todayActiveUsers}</span>
              <span className="text-xs text-muted-foreground">{t('activeUsers')}</span>
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
                    <div className="text-2xl font-bold metric-glow-emerald">{activeStreamsCount}</div>
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
                      <div className="text-2xl font-bold metric-glow-cyan">{metrics.totalPlays.toLocaleString()}</div>
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
                    <div className="text-2xl font-bold metric-glow-violet">{metrics.directPlayPercent}%<span className="text-xs font-normal text-muted-foreground ml-1">DP</span></div>
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
                        <div className="text-2xl font-bold metric-glow-amber">{metrics.hoursWatched.toLocaleString()}h</div>
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
                      <div className="text-2xl font-bold metric-glow-pink">{metrics.currentActiveUsers}</div>
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
                      <div className="text-2xl font-bold metric-glow-blue">{metrics.breakdown.movieViews} <span className="text-sm font-normal text-zinc-500 dark:text-slate-400">{t('moviesViews')}</span></div>
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
                      <div className="text-2xl font-bold metric-glow-emerald">{metrics.breakdown.seriesViews} <span className="text-sm font-normal text-zinc-500 dark:text-slate-400">{t('seriesPlays')}</span></div>
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
                      <div className="text-2xl font-bold metric-glow-amber">{metrics.breakdown.musicViews} <span className="text-sm font-normal text-zinc-500 dark:text-slate-400">{t('musicTitles')}</span></div>
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
                      <div className="text-2xl font-bold metric-glow-violet">{metrics.breakdown.booksViews} <span className="text-sm font-normal text-zinc-500 dark:text-slate-400">{t('booksOpened')}</span></div>
                      <p className="text-xs text-purple-500 font-medium">{metrics.breakdown.booksHours}h {t('booksSpent')}</p>
                    </CardContent>
                  </Card>
                </Link>
              </div>,

              /* Dataviz Row : Multi-Axis Volume & PieChart — Bento Grid hero */
              <div key="volumes" className="grid gap-4 grid-cols-1 lg:grid-cols-4 min-w-0">
                <Card className="col-span-1 lg:col-span-3 app-surface-soft border-border backdrop-blur-sm">
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

                <Card className="col-span-1 lg:col-span-1 app-surface-soft border-border backdrop-blur-sm">
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

              /* Dataviz Row : Top Users + Plateformes */
              <div key="users-platforms" className="grid gap-4 md:grid-cols-2 min-w-0">

                <Card className="col-span-1 app-surface-soft border-border backdrop-blur-sm shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex gap-2"><Award className="w-5 h-5 text-yellow-500" /> {t('loyalUsers')}</CardTitle>
                    <CardDescription>{t('loyalUsersDesc')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6 mt-4">
                      {metrics.topUsers.length === 0 && <span className="text-muted-foreground text-sm">{t('noActivity')}</span>}
                      {metrics.topUsers.map((u, i) => (
                        <Link key={i} href={`/users/${u.jellyfinUserId}`} className="flex items-center gap-4 group hover:bg-muted/60 dark:hover:bg-zinc-800/50 rounded-lg p-1 -m-1 transition-colors">
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

                <Card className="col-span-1 app-surface-soft border-border backdrop-blur-sm shadow-sm">
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
              </div>,

              /* Dedicated Live Streams Row */
              <div key="live-streams" className="w-full">
                <ErrorBoundary name="Live Streams">
                  <LiveStreamsPanel
                    initialStreams={liveStreams}
                    initialBandwidth={totalBandwidthMbps}
                    selectedServerIds={selectedServerIds}
                  />
                </ErrorBoundary>
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
              <div key="new-stats" className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <CollapsibleCard storageKey="monthly" title={t('monthlyTime')} description={t('monthlyTimeDesc')} contentClassName="pl-0 pb-4" className="lg:col-span-2">
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
                  <ComposedTrendChart data={metrics.serverLoadData} series={[{ key: "peakStreams", color: "var(--chart-soft-7)", name: t('activeStreams'), type: "line" }]} />
                </CollapsibleCard>
              </div>
            ]} />

            {/* AI Predictions */}
            <ErrorBoundary name="AI Predictions">
              <PredictionsPanel />
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            <Suspense fallback={<Skeleton className="h-[400px] w-full bg-zinc-200/50 dark:bg-zinc-900/50 rounded-xl" />}>
              <ErrorBoundary name="Deep Insights">
                <DeepInsights
                  type={type}
                  timeRange={timeRange}
                  excludedLibraries={excludedLibraries}
                  selectedServerIds={selectedServerIds}
                />
              </ErrorBoundary>
            </Suspense>
            <Suspense fallback={<Skeleton className="h-[400px] w-full bg-zinc-200/50 dark:bg-zinc-900/50 rounded-xl" />}>
              <ErrorBoundary name="Granular Analysis">
                <GranularAnalysis
                  type={type}
                  timeRange={timeRange}
                  excludedLibraries={excludedLibraries}
                  selectedServerIds={selectedServerIds}
                />
              </ErrorBoundary>
            </Suspense>
          </TabsContent>

          <TabsContent value="network" className="space-y-6">
            <Suspense fallback={<Skeleton className="h-[400px] w-full bg-zinc-200/50 dark:bg-zinc-900/50 rounded-xl" />}>
              <ErrorBoundary name="Network Analysis">
                <NetworkAnalysis
                  type={type}
                  timeRange={timeRange}
                  excludedLibraries={excludedLibraries}
                  selectedServerIds={selectedServerIds}
                />
              </ErrorBoundary>
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
