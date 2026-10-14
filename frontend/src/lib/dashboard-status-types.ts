import type { Translate } from './view-renderers';
export interface DashboardHealthData {
  status?: { monitor?: { status?: string; lastPollAt?: string | null }; sync?: { lastSuccessAt?: string | null }; backup?: { lastSuccessAt?: string | null } };
  counts?: { activeStreams?: number; openPlaybackOrphans?: number; dbStreamsWithoutValkey?: number };
  excludedLibraries?: unknown[];
  isValkeyEnabled?: boolean;
}
export interface DashboardHardwareData { cpu?: { usagePercent?: number | null }; memory?: { allocMb?: number | null }; temperature?: { main?: number | null }; }
export interface DashboardStatusContext { locale: string; t: Translate; icon: (name: string) => string; timeAgo: (value?: string | null) => string; }
export interface DashboardHealthContext extends DashboardStatusContext { health: DashboardHealthData; }
export interface DashboardHardwareContext extends DashboardStatusContext { hardware: DashboardHardwareData; }
export interface DashboardHealthController { update(next: DashboardHealthContext): void; }
export interface DashboardHardwareController { update(next: DashboardHardwareContext): void; }
