-- Keep the authenticated Jellyfin server/user identity across page reloads.
ALTER TABLE "AuthSession" ADD COLUMN "identity" TEXT;
