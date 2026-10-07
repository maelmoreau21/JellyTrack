CREATE TABLE IF NOT EXISTS "Server" (
  "id" TEXT PRIMARY KEY,
  "jellyfinServerId" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "jellyfinApiKey" TEXT,
  "allowAuthFallback" INTEGER NOT NULL DEFAULT 0,
  "isActive" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT PRIMARY KEY,
  "serverId" TEXT NOT NULL REFERENCES "Server"("id") ON DELETE CASCADE,
  "jellyfinUserId" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "isActive" INTEGER NOT NULL DEFAULT 1,
  "lastActive" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("jellyfinUserId", "serverId")
);
CREATE INDEX IF NOT EXISTS "User_serverId_idx" ON "User"("serverId");
CREATE INDEX IF NOT EXISTS "User_lastActive_idx" ON "User"("lastActive");

CREATE TABLE IF NOT EXISTS "Media" (
  "id" TEXT PRIMARY KEY,
  "serverId" TEXT NOT NULL REFERENCES "Server"("id") ON DELETE CASCADE,
  "jellyfinMediaId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "collectionType" TEXT,
  "libraryName" TEXT,
  "genres" TEXT NOT NULL DEFAULT '[]',
  "resolution" TEXT,
  "durationMs" INTEGER,
  "size" INTEGER,
  "directors" TEXT NOT NULL DEFAULT '[]',
  "actors" TEXT NOT NULL DEFAULT '[]',
  "studios" TEXT NOT NULL DEFAULT '[]',
  "parentId" TEXT,
  "artist" TEXT,
  "dateAdded" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("jellyfinMediaId", "serverId")
);
CREATE INDEX IF NOT EXISTS "Media_serverId_idx" ON "Media"("serverId");
CREATE INDEX IF NOT EXISTS "Media_type_idx" ON "Media"("type");
CREATE INDEX IF NOT EXISTS "Media_collectionType_idx" ON "Media"("collectionType");
CREATE INDEX IF NOT EXISTS "Media_jellyfinMediaId_idx" ON "Media"("jellyfinMediaId");
CREATE INDEX IF NOT EXISTS "Media_serverId_type_idx" ON "Media"("serverId", "type");
CREATE INDEX IF NOT EXISTS "Media_serverId_collectionType_idx" ON "Media"("serverId", "collectionType");
CREATE INDEX IF NOT EXISTS "Media_serverId_parentId_idx" ON "Media"("serverId", "parentId");
CREATE INDEX IF NOT EXISTS "Media_serverId_dateAdded_idx" ON "Media"("serverId", "dateAdded");

CREATE TABLE IF NOT EXISTS "PlaybackHistory" (
  "id" TEXT PRIMARY KEY,
  "serverId" TEXT NOT NULL REFERENCES "Server"("id") ON DELETE CASCADE,
  "userId" TEXT REFERENCES "User"("id") ON DELETE CASCADE,
  "mediaId" TEXT NOT NULL REFERENCES "Media"("id") ON DELETE CASCADE,
  "playMethod" TEXT NOT NULL,
  "eventSource" TEXT NOT NULL DEFAULT 'playback',
  "sourceEventId" TEXT,
  "clientName" TEXT,
  "deviceName" TEXT,
  "ipAddress" TEXT,
  "country" TEXT,
  "city" TEXT,
  "durationWatched" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TEXT,
  "audioLanguage" TEXT,
  "audioCodec" TEXT,
  "subtitleLanguage" TEXT,
  "subtitleCodec" TEXT,
  "bitrate" INTEGER,
  "pauseCount" INTEGER NOT NULL DEFAULT 0,
  "audioChanges" INTEGER NOT NULL DEFAULT 0,
  "subtitleChanges" INTEGER NOT NULL DEFAULT 0,
  "seekCount" INTEGER NOT NULL DEFAULT 0,
  "rewatchCount" INTEGER NOT NULL DEFAULT 0,
  "speedChangeCount" INTEGER NOT NULL DEFAULT 0,
  "maxPlaybackRate" REAL,
  UNIQUE("serverId", "sourceEventId")
);
CREATE INDEX IF NOT EXISTS "PlaybackHistory_serverId_idx" ON "PlaybackHistory"("serverId");
CREATE INDEX IF NOT EXISTS "PlaybackHistory_userId_idx" ON "PlaybackHistory"("userId");
CREATE INDEX IF NOT EXISTS "PlaybackHistory_mediaId_idx" ON "PlaybackHistory"("mediaId");
CREATE INDEX IF NOT EXISTS "PlaybackHistory_startedAt_idx" ON "PlaybackHistory"("startedAt");
CREATE INDEX IF NOT EXISTS "PlaybackHistory_serverId_startedAt_idx" ON "PlaybackHistory"("serverId", "startedAt");
CREATE INDEX IF NOT EXISTS "PlaybackHistory_userId_startedAt_idx" ON "PlaybackHistory"("userId", "startedAt");
CREATE INDEX IF NOT EXISTS "PlaybackHistory_serverId_userId_startedAt_idx" ON "PlaybackHistory"("serverId", "userId", "startedAt");
CREATE INDEX IF NOT EXISTS "PlaybackHistory_mediaId_startedAt_idx" ON "PlaybackHistory"("mediaId", "startedAt");
CREATE INDEX IF NOT EXISTS "PlaybackHistory_serverId_mediaId_startedAt_idx" ON "PlaybackHistory"("serverId", "mediaId", "startedAt");
CREATE INDEX IF NOT EXISTS "PlaybackHistory_clientName_idx" ON "PlaybackHistory"("clientName");
CREATE INDEX IF NOT EXISTS "PlaybackHistory_playMethod_idx" ON "PlaybackHistory"("playMethod");
CREATE INDEX IF NOT EXISTS "PlaybackHistory_eventSource_idx" ON "PlaybackHistory"("eventSource");
CREATE INDEX IF NOT EXISTS "PlaybackHistory_endedAt_idx" ON "PlaybackHistory"("endedAt");
CREATE INDEX IF NOT EXISTS "PlaybackHistory_serverId_endedAt_idx" ON "PlaybackHistory"("serverId", "endedAt");
CREATE INDEX IF NOT EXISTS "PlaybackHistory_ipAddress_startedAt_idx" ON "PlaybackHistory"("ipAddress", "startedAt");
CREATE INDEX IF NOT EXISTS "PlaybackHistory_userId_country_startedAt_idx" ON "PlaybackHistory"("userId", "country", "startedAt");

CREATE TABLE IF NOT EXISTS "TelemetryEvent" (
  "id" TEXT PRIMARY KEY,
  "serverId" TEXT NOT NULL REFERENCES "Server"("id") ON DELETE CASCADE,
  "playbackId" TEXT NOT NULL REFERENCES "PlaybackHistory"("id") ON DELETE CASCADE,
  "eventType" TEXT NOT NULL,
  "positionMs" INTEGER NOT NULL,
  "metadata" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "TelemetryEvent_serverId_idx" ON "TelemetryEvent"("serverId");
CREATE INDEX IF NOT EXISTS "TelemetryEvent_playbackId_idx" ON "TelemetryEvent"("playbackId");
CREATE INDEX IF NOT EXISTS "TelemetryEvent_eventType_idx" ON "TelemetryEvent"("eventType");
CREATE INDEX IF NOT EXISTS "TelemetryEvent_serverId_eventType_idx" ON "TelemetryEvent"("serverId", "eventType");
CREATE INDEX IF NOT EXISTS "TelemetryEvent_playbackId_eventType_idx" ON "TelemetryEvent"("playbackId", "eventType");
CREATE INDEX IF NOT EXISTS "TelemetryEvent_createdAt_idx" ON "TelemetryEvent"("createdAt");
CREATE INDEX IF NOT EXISTS "TelemetryEvent_playbackId_createdAt_idx" ON "TelemetryEvent"("playbackId", "createdAt");

CREATE TABLE IF NOT EXISTS "ActiveStream" (
  "id" TEXT PRIMARY KEY,
  "serverId" TEXT NOT NULL REFERENCES "Server"("id") ON DELETE CASCADE,
  "sessionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "mediaId" TEXT NOT NULL REFERENCES "Media"("id") ON DELETE CASCADE,
  "playbackId" TEXT REFERENCES "PlaybackHistory"("id") ON DELETE SET NULL,
  "playMethod" TEXT NOT NULL,
  "clientName" TEXT,
  "deviceName" TEXT,
  "ipAddress" TEXT,
  "country" TEXT,
  "city" TEXT,
  "videoCodec" TEXT,
  "audioCodec" TEXT,
  "transcodeFps" REAL,
  "bitrate" INTEGER,
  "audioLanguage" TEXT,
  "subtitleLanguage" TEXT,
  "subtitleCodec" TEXT,
  "playbackRate" REAL,
  "positionTicks" INTEGER,
  "startedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastPingAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("sessionId", "serverId")
);
CREATE INDEX IF NOT EXISTS "ActiveStream_serverId_idx" ON "ActiveStream"("serverId");
CREATE INDEX IF NOT EXISTS "ActiveStream_playbackId_idx" ON "ActiveStream"("playbackId");
CREATE INDEX IF NOT EXISTS "ActiveStream_lastPingAt_idx" ON "ActiveStream"("lastPingAt");
CREATE INDEX IF NOT EXISTS "ActiveStream_serverId_lastPingAt_idx" ON "ActiveStream"("serverId", "lastPingAt");

CREATE TABLE IF NOT EXISTS "GlobalSettings" (
  "id" TEXT PRIMARY KEY DEFAULT 'global',
  "discordWebhookUrl" TEXT,
  "discordAlertCondition" TEXT NOT NULL DEFAULT 'ALL',
  "discordAlertsEnabled" INTEGER NOT NULL DEFAULT 0,
  "maxConcurrentTranscodes" INTEGER NOT NULL DEFAULT 0,
  "excludedLibraries" TEXT NOT NULL DEFAULT '[]',
  "syncCronHour" INTEGER NOT NULL DEFAULT 3,
  "syncCronMinute" INTEGER NOT NULL DEFAULT 0,
  "backupCronHour" INTEGER NOT NULL DEFAULT 3,
  "backupCronMinute" INTEGER NOT NULL DEFAULT 30,
  "defaultLocale" TEXT NOT NULL DEFAULT 'en',
  "timeFormat" TEXT NOT NULL DEFAULT '24h',
  "wrappedVisible" INTEGER NOT NULL DEFAULT 1,
  "wrappedPeriodEnabled" INTEGER NOT NULL DEFAULT 1,
  "wrappedStartMonth" INTEGER NOT NULL DEFAULT 12,
  "wrappedStartDay" INTEGER NOT NULL DEFAULT 1,
  "wrappedEndMonth" INTEGER NOT NULL DEFAULT 1,
  "wrappedEndDay" INTEGER NOT NULL DEFAULT 31,
  "pluginApiKey" TEXT,
  "pluginPreviousApiKey" TEXT,
  "pluginPreviousApiKeyExpiresAt" TEXT,
  "pluginKeyCreatedAt" TEXT,
  "pluginKeyExpiresAt" TEXT,
  "pluginKeyRotationDays" INTEGER NOT NULL DEFAULT 90,
  "pluginAutoRotateEnabled" INTEGER NOT NULL DEFAULT 0,
  "pluginKeyRotationGraceHours" INTEGER NOT NULL DEFAULT 24,
  "pluginLastSeen" TEXT,
  "pluginVersion" TEXT,
  "pluginServerName" TEXT,
  "pluginTelemetrySettings" TEXT,
  "authRememberThirtyDaysEnabled" INTEGER NOT NULL DEFAULT 1,
  "authSessionsRevokedAt" TEXT,
  "resolutionThresholds" TEXT,
  "ssoSettings" TEXT,
  "updatedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "AdminAuditLog" (
  "id" TEXT PRIMARY KEY,
  "action" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorUsername" TEXT,
  "target" TEXT,
  "ipAddress" TEXT,
  "details" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");
CREATE INDEX IF NOT EXISTS "AdminAuditLog_action_createdAt_idx" ON "AdminAuditLog"("action", "createdAt");
CREATE INDEX IF NOT EXISTS "AdminAuditLog_actorUserId_createdAt_idx" ON "AdminAuditLog"("actorUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "AdminAuditLog_ipAddress_createdAt_idx" ON "AdminAuditLog"("ipAddress", "createdAt");

CREATE TABLE IF NOT EXISTS "SystemHealthState" (
  "id" TEXT PRIMARY KEY DEFAULT 'global',
  "monitor" TEXT NOT NULL DEFAULT '{}',
  "sync" TEXT NOT NULL DEFAULT '{}',
  "backup" TEXT NOT NULL DEFAULT '{}',
  "updatedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "SystemHealthEvent" (
  "id" TEXT PRIMARY KEY,
  "stateId" TEXT NOT NULL DEFAULT 'global' REFERENCES "SystemHealthState"("id") ON DELETE CASCADE,
  "source" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "details" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SystemHealthEvent_createdAt_idx" ON "SystemHealthEvent"("createdAt");
CREATE INDEX IF NOT EXISTS "SystemHealthEvent_source_createdAt_idx" ON "SystemHealthEvent"("source", "createdAt");
CREATE INDEX IF NOT EXISTS "SystemHealthEvent_kind_createdAt_idx" ON "SystemHealthEvent"("kind", "createdAt");

CREATE TABLE IF NOT EXISTS "DailyStats" (
  "id" TEXT PRIMARY KEY,
  "date" TEXT NOT NULL,
  "userId" TEXT,
  "libraryName" TEXT,
  "mediaType" TEXT,
  "totalPlays" INTEGER NOT NULL DEFAULT 0,
  "totalDuration" INTEGER NOT NULL DEFAULT 0,
  "directPlays" INTEGER NOT NULL DEFAULT 0,
  "transcodes" INTEGER NOT NULL DEFAULT 0,
  "uniqueMedia" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("date", "userId", "libraryName", "mediaType")
);
CREATE INDEX IF NOT EXISTS "DailyStats_date_idx" ON "DailyStats"("date");
CREATE INDEX IF NOT EXISTS "DailyStats_userId_idx" ON "DailyStats"("userId");



