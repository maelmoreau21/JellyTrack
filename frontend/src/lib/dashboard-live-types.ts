import type { Translate } from './view-renderers';

/** Raw fields used by the historical dashboard stream renderer. */
export interface DashboardLiveStream {
  sessionId?: string;
  serverId?: string;
  serverName?: string;
  serverStatus?: string;
  user?: string;
  username?: string;
  itemId?: string;
  mediaId?: string;
  posterItemId?: string;
  mediaTitle?: string;
  mediaType?: string;
  progressPercent?: number;
  playMethod?: string;
  isPaused?: boolean;
  audioCodec?: string;
  audioLanguage?: string;
  subtitleCodec?: string;
  subtitleLanguage?: string;
  versionName?: string;
  seriesName?: string;
  seasonName?: string;
  device?: string;
  clientName?: string;
  city?: string;
  country?: string;
}

export interface DashboardLiveContext {
  streams: DashboardLiveStream[];
  liveBandwidth: number;
  liveBandwidthKnown: boolean;
  forceCardsView: boolean;
  multiServer: boolean;
  isAdmin: boolean;
  t: Translate;
}

export interface DashboardLiveController {
  update(next: DashboardLiveContext): void;
}
