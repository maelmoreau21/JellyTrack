CREATE INDEX IF NOT EXISTS "Media_server_normalized_jellyfin_id_idx"
ON "Media"("serverId", LOWER(REPLACE("jellyfinMediaId",'-','')));
