CREATE INDEX IF NOT EXISTS "PlaybackHistory_startedAt_id_idx" ON "PlaybackHistory"("startedAt", "id");
CREATE INDEX IF NOT EXISTS "PlaybackHistory_serverId_startedAt_id_idx" ON "PlaybackHistory"("serverId", "startedAt", "id");
CREATE INDEX IF NOT EXISTS "PlaybackHistory_userId_startedAt_id_idx" ON "PlaybackHistory"("userId", "startedAt", "id");
