-- Remove legacy monitor polling interval fields (replaced by plugin push architecture)
ALTER TABLE "GlobalSettings" DROP COLUMN IF EXISTS "monitorIntervalActive";
ALTER TABLE "GlobalSettings" DROP COLUMN IF EXISTS "monitorIntervalIdle";
