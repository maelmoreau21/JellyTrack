package history

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/config"
	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/internal/models"
)

func TestIsZappedRule(t *testing.T) {
	now := time.Now()
	// Download is never zapped even if 10 seconds
	if IsZapped(10, "download", &now) {
		t.Error("expected download not to be zapped")
	}

	// Active stream (endedAt == nil) is never zapped
	if IsZapped(10, "playback", nil) {
		t.Error("expected active stream not to be zapped")
	}

	// Short playback (<60s) with endedAt set IS zapped
	if !IsZapped(45, "playback", &now) {
		t.Error("expected 45s playback to be zapped")
	}

	// Playback >= 60s is not zapped
	if IsZapped(60, "playback", &now) {
		t.Error("expected 60s playback not to be zapped")
	}
	if IsZapped(120, "playback", &now) {
		t.Error("expected 120s playback not to be zapped")
	}
}

func TestCumulativeCompletion(t *testing.T) {
	u1 := "user-1"
	sessions := []models.PlaybackHistory{
		{
			ID:              "s1",
			ServerID:        "srv-1",
			UserID:          &u1,
			MediaID:         "med-1",
			DurationWatched: 400, // 400s
		},
		{
			ID:              "s2",
			ServerID:        "srv-1",
			UserID:          &u1,
			MediaID:         "med-1",
			DurationWatched: 550, // +550s = 950s total
		},
	}
	durations := map[string]int64{"med-1": 1000} // total duration 1000s
	titles := map[string]string{"med-1": "Test Movie"}
	types := map[string]string{"med-1": "Movie"}

	entries := CalculateCumulativeCompletion(sessions, durations, titles, types)
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	e := entries[0]
	if e.DurationWatched != 950 {
		t.Errorf("expected 950s watched, got %d", e.DurationWatched)
	}
	if e.Percent != 95.0 {
		t.Errorf("expected 95.0%%, got %f", e.Percent)
	}
	if e.Bucket != BucketCompleted {
		t.Errorf("expected bucket completed, got %s", e.Bucket)
	}
}

func TestConsolidateHistory(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "test_history.db")
	db, err := database.Open(context.Background(), config.Config{
		DatabaseDriver: "sqlite",
		DatabasePath:   dbPath,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	ctx := context.Background()

	// Seed server, user, media
	_, _ = db.ExecContext(ctx, `INSERT INTO "Server" ("id", "jellyfinServerId", "name", "url") VALUES ('s1', 'jf1', 'Server 1', 'http://jf')`)
	_, _ = db.ExecContext(ctx, `INSERT INTO "User" ("id", "serverId", "jellyfinUserId", "username") VALUES ('u1', 's1', 'jfu1', 'Alice')`)
	_, _ = db.ExecContext(ctx, `INSERT INTO "Media" ("id", "serverId", "jellyfinMediaId", "title", "type", "durationMs") VALUES ('m1', 's1', 'jfm1', 'Film', 'Movie', 6000000)`)

	t0 := time.Now().UTC().Add(-2 * time.Hour)
	t0End := t0.Add(10 * time.Minute)
	t1 := t0End.Add(5 * time.Minute) // 5 minutes after first ended
	t1End := t1.Add(15 * time.Minute)

	_, err = db.ExecContext(ctx, `
		INSERT INTO "PlaybackHistory" ("id","serverId","userId","mediaId","playMethod","eventSource","durationWatched","startedAt","endedAt","pauseCount")
		VALUES ('p1','s1','u1','m1','DirectPlay','playback',600,?, ?, 1),
		       ('p2','s1','u1','m1','DirectPlay','playback',900,?, ?, 2)
	`, t0.Format(time.RFC3339Nano), t0End.Format(time.RFC3339Nano), t1.Format(time.RFC3339Nano), t1End.Format(time.RFC3339Nano))
	if err != nil {
		t.Fatal(err)
	}

	res, err := ConsolidateHistory(ctx, db, "sqlite", 60, false)
	if err != nil {
		t.Fatal(err)
	}

	if res.MergedCount != 1 || res.DeletedCount != 1 {
		t.Fatalf("unexpected consolidation result: %+v", res)
	}

	// Verify only 1 record remains with combined duration 1500 and pauseCount 3
	var count int
	var duration int64
	var pauses int
	err = db.QueryRowContext(ctx, `SELECT COUNT(*), COALESCE(SUM("durationWatched"),0), COALESCE(SUM("pauseCount"),0) FROM "PlaybackHistory"`).Scan(&count, &duration, &pauses)
	if err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Errorf("expected 1 record after consolidation, got %d", count)
	}
	if duration != 1500 {
		t.Errorf("expected 1500 durationWatched, got %d", duration)
	}
	if pauses != 3 {
		t.Errorf("expected 3 pauseCount, got %d", pauses)
	}
}
