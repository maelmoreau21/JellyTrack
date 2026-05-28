ALTER TABLE "PlaybackHistory" ADD COLUMN "eventSource" TEXT NOT NULL DEFAULT 'playback';
ALTER TABLE "PlaybackHistory" ADD COLUMN "sourceEventId" TEXT;

CREATE INDEX "PlaybackHistory_eventSource_idx" ON "PlaybackHistory"("eventSource");
CREATE UNIQUE INDEX "PlaybackHistory_serverId_sourceEventId_key" ON "PlaybackHistory"("serverId", "sourceEventId");
