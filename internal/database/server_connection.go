package database

import (
	"context"
	"database/sql"
	"time"
)

// Failed attempts retain the last successful contact and measured latency.
func RecordServerConnection(ctx context.Context, db *sql.DB, driver, serverID string, online bool, latency any) error {
	status := "offline"
	var connected any
	now := time.Now().UTC().Format(time.RFC3339Nano)
	if online {
		status = "online"
		connected = now
	}
	_, err := db.ExecContext(ctx, Bind(`INSERT INTO "ServerConnectionState"("serverId","status","lastAttemptAt","lastConnectedAt","latencyMs") VALUES(?,?,?,?,?) ON CONFLICT("serverId") DO UPDATE SET "status"=excluded."status","lastAttemptAt"=excluded."lastAttemptAt","lastConnectedAt"=COALESCE(excluded."lastConnectedAt","ServerConnectionState"."lastConnectedAt"),"latencyMs"=COALESCE(excluded."latencyMs","ServerConnectionState"."latencyMs")`, driver), serverID, status, now, connected, latency)
	return err
}
