-- Keep sort indexes separate from the broad duration>=60 zapping predicate.
CREATE INDEX IF NOT EXISTS "PlaybackHistory_durationSort_id_idx" ON "PlaybackHistory"(("durationWatched"+0), "id");
CREATE INDEX IF NOT EXISTS "PlaybackHistory_serverId_durationSort_id_idx" ON "PlaybackHistory"("serverId", ("durationWatched"+0), "id");
CREATE INDEX IF NOT EXISTS "TelemetryEvent_playbackId_createdAt_id_idx" ON "TelemetryEvent"("playbackId", "createdAt", "id");
