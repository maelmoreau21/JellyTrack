-- CreateTable
CREATE TABLE "TelemetryEvent" (
    "id" TEXT NOT NULL,
    "playbackId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "positionMs" BIGINT NOT NULL,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelemetryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TelemetryEvent_playbackId_idx" ON "TelemetryEvent"("playbackId");

-- CreateIndex
CREATE INDEX "TelemetryEvent_eventType_idx" ON "TelemetryEvent"("eventType");

-- CreateIndex
CREATE INDEX "TelemetryEvent_playbackId_eventType_idx" ON "TelemetryEvent"("playbackId", "eventType");

-- AddForeignKey
ALTER TABLE "TelemetryEvent" ADD CONSTRAINT "TelemetryEvent_playbackId_fkey" FOREIGN KEY ("playbackId") REFERENCES "PlaybackHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: Add timeFormat to GlobalSettings
ALTER TABLE "GlobalSettings" ADD COLUMN "timeFormat" TEXT NOT NULL DEFAULT '24h';
