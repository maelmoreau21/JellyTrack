CREATE TABLE IF NOT EXISTS "AuthSession" (
  "id" TEXT PRIMARY KEY,
  "username" TEXT NOT NULL,
  "role" TEXT NOT NULL CHECK ("role" IN ('user','admin')),
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");
