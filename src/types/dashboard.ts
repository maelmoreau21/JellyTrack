/**
 * Domain types for the JellyTrack dashboard.
 * Extracted from page.tsx to keep the page component lean.
 */

import type { ActivityHourData } from "@/components/charts/ActivityByHourChart";
import type { DayOfWeekData } from "@/components/charts/DayOfWeekChart";
import type { PlatformData } from "@/components/charts/PlatformDistributionChart";
import type { MonthlyWatchData } from "@/components/charts/MonthlyWatchTimeChart";
import type { CompletionData } from "@/components/charts/CompletionRatioChart";
import type { ClientCategoryData } from "@/components/charts/ClientCategoryChart";

export type LiveStream = {
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

/** A single playback history record as loaded for dashboard calculations. */
export type DashboardHistory = {
  startedAt: Date;
  durationWatched: number;
  mediaId?: string | null;
  clientName?: string | null;
  playMethod?: string | null;
  userId?: string | null;
  media?: { type?: string | null; durationMs?: bigint | null; parentId?: string | null } | null;
};

export type TrendEntry = {
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

export type TopUserAgg = {
  userId: string;
  _sum: { durationWatched?: number | null };
};

export type ActiveStreamRow = {
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

export type DashboardMetrics = {
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
