package cleanup

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/config"
	"github.com/maelmoreau21/jellytrack/internal/database"
)

func TestCleanupAndConsolidation(t *testing.T) {
	ctx := context.Background()
	db, err := database.Open(ctx, config.Config{DatabaseDriver: "sqlite", DatabasePath: filepath.Join(t.TempDir(), "cleanup_test.db")})
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	// Seed server, user, media
	_, err = db.ExecContext(ctx, `INSERT INTO "Server" ("id","jellyfinServerId","name","url") VALUES ('srv1','jsrv1','Test Server','http://localhost')`)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.ExecContext(ctx, `INSERT INTO "User" ("id","serverId","jellyfinUserId","username") VALUES ('u1','srv1','ju1','TestUser')`)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.ExecContext(ctx, `INSERT INTO "Media" ("id","serverId","jellyfinMediaId","title","type","durationMs") VALUES ('m1','srv1','jm1','Big Movie','Movie',7200000)`)
	if err != nil {
		t.Fatal(err)
	}

	// 1. Test CleanupOrphanedSessions
	// Insert stale ActiveStream (lastPingAt 1 hour ago)
	stalePing := time.Now().UTC().Add(-1 * time.Hour).Format(time.RFC3339Nano)
	_, err = db.ExecContext(ctx, `INSERT INTO "ActiveStream" ("id","serverId","sessionId","userId","mediaId","playMethod","lastPingAt") VALUES ('str1','srv1','sess1','u1','m1','DirectPlay',?)`, stalePing)
	if err != nil {
		t.Fatal(err)
	}
	// Insert open PlaybackHistory without active stream
	staleStart := time.Now().UTC().Add(-2 * time.Hour).Format(time.RFC3339Nano)
	_, err = db.ExecContext(ctx, `INSERT INTO "PlaybackHistory" ("id","serverId","userId","mediaId","playMethod","startedAt","endedAt","durationWatched") VALUES ('ph1','srv1','u1','m1','DirectPlay',?,NULL,300)`, staleStart)
	if err != nil {
		t.Fatal(err)
	}

	deletedStreams, closedSessions, err := CleanupOrphanedSessions(ctx, db, "sqlite", 600)
	if err != nil {
		t.Fatal(err)
	}
	if deletedStreams != 1 {
		t.Fatalf("expected 1 deleted stream, got %d", deletedStreams)
	}
	if closedSessions != 1 {
		t.Fatalf("expected 1 closed session, got %d", closedSessions)
	}

	// 2. Test ConsolidatePlaybackHistory with dedicated media m2
	_, err = db.ExecContext(ctx, `INSERT INTO "Media" ("id","serverId","jellyfinMediaId","title","type","durationMs") VALUES ('m2','srv1','jm2','Second Movie','Movie',7200000)`)
	if err != nil {
		t.Fatal(err)
	}
	t1 := time.Now().UTC().Add(-30 * time.Minute)
	t2 := t1.Add(10 * time.Minute)
	t3 := t2.Add(5 * time.Minute)
	t4 := t3.Add(10 * time.Minute)

	_, err = db.ExecContext(ctx, `INSERT INTO "PlaybackHistory" ("id","serverId","userId","mediaId","playMethod","startedAt","endedAt","durationWatched","pauseCount") VALUES
		('p_a','srv1','u1','m2','DirectPlay',?,?,600,1),
		('p_b','srv1','u1','m2','DirectPlay',?,?,600,0)`,
		t1.Format(time.RFC3339Nano), t2.Format(time.RFC3339Nano),
		t3.Format(time.RFC3339Nano), t4.Format(time.RFC3339Nano))
	if err != nil {
		t.Fatal(err)
	}

	mergedClusters, prunedCount, err := ConsolidatePlaybackHistory(ctx, db, "sqlite", 60)
	if err != nil {
		t.Fatal(err)
	}
	if mergedClusters != 1 || prunedCount != 1 {
		t.Fatalf("expected 1 cluster merged and 1 session pruned, got %d and %d", mergedClusters, prunedCount)
	}

	// Verify duration in leader p_a is 1200
	var dur int64
	err = db.QueryRowContext(ctx, `SELECT "durationWatched" FROM "PlaybackHistory" WHERE "id" = 'p_a'`).Scan(&dur)
	if err != nil {
		t.Fatal(err)
	}
	if dur != 1200 {
		t.Fatalf("expected consolidated duration 1200, got %d", dur)
	}

	// 3. Test TelemetryRetention
	oldDate := time.Now().UTC().AddDate(0, 0, -100).Format(time.RFC3339Nano)
	_, err = db.ExecContext(ctx, `INSERT INTO "TelemetryEvent" ("id","serverId","playbackId","eventType","positionMs","createdAt") VALUES ('t1','srv1','p_a','pause',1000,?)`, oldDate)
	if err != nil {
		t.Fatal(err)
	}
	deletedTel, err := TelemetryRetention(ctx, db, "sqlite", 90)
	if err != nil {
		t.Fatal(err)
	}
	if deletedTel != 1 {
		t.Fatalf("expected 1 deleted telemetry event, got %d", deletedTel)
	}
}
