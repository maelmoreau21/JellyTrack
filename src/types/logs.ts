export type SafeTelemetryEvent = {
  eventType?: string | null;
  positionMs?: string | null;
  createdAt?: string | null;
  metadata?: unknown;
};

export type SafeMedia = {
  id?: string;
  serverId?: string | null;
  jellyfinMediaId?: string | null;
  title?: string | null;
  type?: string | null;
  parentId?: string | null;
  artist?: string | null;
  resolution?: string | null;
  durationMs?: string | null;
};

export type SafeUser = {
  id?: string;
  username?: string | null;
  jellyfinUserId?: string | null;
};

export type SafeLog = {
  id: string;
  serverId?: string | null;
  userId?: string | null;
  mediaId?: string | null;
  startedAt: string;
  endedAt: string | null;
  media?: SafeMedia | null;
  user?: SafeUser | null;
  telemetryEvents: SafeTelemetryEvent[];
  isActuallyActive?: boolean;
  durationWatched?: number | null;
  // additional optional fields used in UI
  clientName?: string | null;
  playMethod?: string | null;
  eventSource?: string | null;
  sourceEventId?: string | null;
  videoCodec?: string | null;
  audioLanguage?: string | null;
  audioCodec?: string | null;
  subtitleLanguage?: string | null;
  subtitleCodec?: string | null;
  pauseCount?: number | null;
  audioChanges?: number | null;
  subtitleChanges?: number | null;
  seekCount?: number | null;
  rewatchCount?: number | null;
  speedChangeCount?: number | null;
  maxPlaybackRate?: number | null;
  ipAddress?: string | null;
  country?: string | null;
  city?: string | null;
  mediaSubtitle?: string | null;
  fallbackImageParentId?: string | null;
  bitrate?: number | null;
  anomalyFlags?: string[];
  ipBurstCount?: number | null;
  isReconnection?: boolean;
};
