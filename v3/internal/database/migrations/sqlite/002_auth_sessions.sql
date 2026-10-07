CREATE TABLE "AuthSession" (
  "id" TEXT PRIMARY KEY,
  "username" TEXT NOT NULL,
  "role" TEXT NOT NULL CHECK ("role" IN ('user','admin')),
  "expiresAt" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");
