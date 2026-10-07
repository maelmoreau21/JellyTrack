export type Session = {
  username: string;
  role: "admin" | "user";
  csrfToken: string;
};

export type Summary = {
  periodDays: number;
  views: number;
  durationMs: number;
  users: number;
  media: number;
  activity: { day: string; views: number }[];
};

export type UserItem = {
  id: string;
  username: string;
  jellyfinUserId: string;
  lastActive: string | null;
  server: string | null;
};

export type MediaItem = {
  id: string;
  jellyfinMediaId: string;
  title: string;
  type: string;
  library: string | null;
  resolution: string | null;
  durationMs: number;
  server: string | null;
};

export type HistoryItem = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number;
  playMethod: string;
  username: string | null;
  title: string;
  type: string;
  library: string | null;
};

export type ActiveStream = {
  id: string;
  serverId: string;
  sessionId: string;
  playMethod: string;
  clientName: string;
  deviceName: string;
  ipAddress: string;
  country: string;
  city: string;
  user: string;
  mediaTitle: string;
  mediaType: string;
  jellyfinMediaId: string;
  progressPercent: number;
  startedAt: string;
};

export type DeepStats = {
  topDirectors: { name: string; count: number }[];
  topActors: { name: string; count: number }[];
  topStudios: { name: string; count: number }[];
};

export type GeoStats = {
  countries: { name: string; sessions: number; cities: string[] }[];
  locations: { country: string; city: string; sessions: number; lastSeen: string }[];
  liveLocations: { country: string; city: string; username: string; mediaTitle: string }[];
};

export type BackupItem = {
  name: string;
  type: "auto" | "manual";
  size: number;
  sizeMb: string;
  date: string;
};

export type ServerItem = {
  id: string;
  jellyfinServerId: string;
  name: string;
  url: string;
  allowAuthFallback: boolean;
  isActive: boolean;
};

export type GlobalSettings = {
  discordWebhookUrl: string;
  discordAlertCondition: string;
  discordAlertsEnabled: boolean;
  maxConcurrentTranscodes: number;
  excludedLibraries: string[];
  syncCronHour: number;
  syncCronMinute: number;
  backupCronHour: number;
  backupCronMinute: number;
  defaultLocale: string;
  timeFormat: string;
  wrappedVisible: boolean;
};
