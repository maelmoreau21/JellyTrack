-- Add session-linked playback fast paths and persisted plugin telemetry settings.
ALTER TABLE "ActiveStream" ADD COLUMN "playbackId" TEXT;
ALTER TABLE "GlobalSettings" ADD COLUMN "pluginTelemetrySettings" JSONB;

CREATE INDEX "ActiveStream_playbackId_idx" ON "ActiveStream"("playbackId");

ALTER TABLE "ActiveStream"
ADD CONSTRAINT "ActiveStream_playbackId_fkey"
FOREIGN KEY ("playbackId") REFERENCES "PlaybackHistory"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
