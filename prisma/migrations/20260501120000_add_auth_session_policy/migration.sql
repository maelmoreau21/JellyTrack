ALTER TABLE "GlobalSettings"
ADD COLUMN IF NOT EXISTS "authRememberThirtyDaysEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "authSessionsRevokedAt" TIMESTAMP(3);
