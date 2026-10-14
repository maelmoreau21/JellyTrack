CREATE INDEX IF NOT EXISTS "PlaybackHistory_durationWatched_id_idx" ON "PlaybackHistory"("durationWatched", "id");
CREATE INDEX IF NOT EXISTS "PlaybackHistory_serverId_durationWatched_id_idx" ON "PlaybackHistory"("serverId", "durationWatched", "id");
CREATE INDEX IF NOT EXISTS "TelemetryEvent_playbackId_createdAt_id_idx" ON "TelemetryEvent"("playbackId", "createdAt", "id");
