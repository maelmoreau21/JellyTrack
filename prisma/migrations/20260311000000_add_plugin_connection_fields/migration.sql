-- AlterTable
ALTER TABLE "GlobalSettings" ADD COLUMN "pluginApiKey" TEXT;
ALTER TABLE "GlobalSettings" ADD COLUMN "pluginLastSeen" TIMESTAMP(3);
ALTER TABLE "GlobalSettings" ADD COLUMN "pluginVersion" TEXT;
ALTER TABLE "GlobalSettings" ADD COLUMN "pluginServerName" TEXT;
