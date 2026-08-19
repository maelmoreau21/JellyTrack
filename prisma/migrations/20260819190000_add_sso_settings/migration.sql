-- AlterTable
ALTER TABLE "GlobalSettings"
ADD COLUMN IF NOT EXISTS "ssoSettings" JSONB;
