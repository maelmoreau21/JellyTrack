package telemetry

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/config"
	"github.com/maelmoreau21/jellytrack/internal/database"
)

func TestActiveStreamsAndTelemetry(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "telemetry_test.db")
	db, err := database.Open(context.Background(), config.Config{
		DatabaseDriver: "sqlite",
		DatabasePath:   dbPath,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	ctx := context.Background()

	_, _ = db.ExecContext(ctx, `INSERT INTO "Server" ("id","jellyfinServerId","name","url") VALUES ('srv1','jfsrv1','Server 1','http://srv')`)
	_, _ = db.ExecContext(ctx, `INSERT INTO "User" ("id","serverId","jellyfinUserId","username") VALUES ('u1','srv1','jfu1','Alice')`)
	_, _ = db.ExecContext(ctx, `INSERT INTO "Media" ("id","serverId","jellyfinMediaId","title","type","durationMs") VALUES ('m1','srv1','jfm1','Movie 1','Movie',6000000)`)

	now := time.Now().UTC()
	_, err = db.ExecContext(ctx, `
		INSERT INTO "ActiveStream" ("id","serverId","sessionId","userId","mediaId","playMethod","bitrate","positionTicks","startedAt","lastPingAt")
		VALUES ('stream1','srv1','sess1','u1','m1','DirectPlay',5000,100000000,?,?)
	`, now.Format(time.RFC3339Nano), now.Format(time.RFC3339Nano))
	if err != nil {
		t.Fatal(err)
	}

	res, err := GetActiveStreams(ctx, db, "sqlite")
	if err != nil {
		t.Fatal(err)
	}
	if res.Count != 1 || len(res.Streams) != 1 {
		t.Fatalf("expected 1 stream, got count=%d", res.Count)
	}
	if res.TotalBandwidthMbps != 5.0 {
		t.Errorf("expected 5.0 Mbps bandwidth, got %f", res.TotalBandwidthMbps)
	}

	// Test cleanup of stale streams
	cleaned, err := CleanupOrphanStreams(ctx, db, "sqlite", 3600) // 1h timeout, stream was just pinged
	if err != nil {
		t.Fatal(err)
	}
	if cleaned != 0 {
		t.Errorf("expected 0 cleaned, got %d", cleaned)
	}
}
