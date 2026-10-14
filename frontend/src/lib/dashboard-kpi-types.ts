import type { Translate } from './view-renderers';

/** Fields consumed by the overview cards from stats.FullDashboardResult. */
export interface DashboardKpiData {
  totalPlays?: number;
  views?: number;
  playsGrowth?: number;
  previousPlays?: number;
  directPlayPercent?: number;
  hoursWatched?: number;
  durationMs?: number;
  hoursGrowth?: number;
  previousHoursWatched?: number;
  currentActiveUsers?: number;
  activeUsersGrowth?: number;
  previousActiveUsers?: number;
  totalUsers?: number;
  users?: number;
}

export interface DashboardKpiContext {
  data: DashboardKpiData;
  activeStreamsCount: number;
  currentTimeRange: string;
  locale: string;
  t: Translate;
  icon: (name: string) => string;
  formatNumber: (value: number) => string;
  historyURL: () => string;
}

export interface DashboardKpiController {
  update(next: DashboardKpiContext): void;
}
