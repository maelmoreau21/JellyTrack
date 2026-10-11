CREATE TABLE "ServerConnectionState" (
  "serverId" TEXT PRIMARY KEY REFERENCES "Server"("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL,
  "lastAttemptAt" TEXT NOT NULL,
  "lastConnectedAt" TEXT,
  "latencyMs" BIGINT
);

ALTER TABLE "Media" ADD COLUMN "providerIds" TEXT NOT NULL DEFAULT '{}';
