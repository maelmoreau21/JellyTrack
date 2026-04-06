export type SafeTelemetryEvent = {
  eventType?: string | null;
  positionMs?: string | null;
  createdAt?: string | null;
  metadata?: unknown;
};

export type SafeMedia = {
  id?: string;
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
  videoCodec?: string | null;
  audioCodec?: string | null;
  pauseCount?: number | null;
  audioChanges?: number | null;
  subtitleChanges?: number | null;
  ipAddress?: string | null;
  country?: string | null;
  city?: string | null;
  mediaSubtitle?: string | null;
  fallbackImageParentId?: string | null;
  bitrate?: number | null;
};
