package users

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/config"
	"github.com/maelmoreau21/jellytrack/internal/database"
)

func TestUserDuplicateDetectionAndMerge(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "users_test.db")
	db, err := database.Open(context.Background(), config.Config{
		DatabaseDriver: "sqlite",
		DatabasePath:   dbPath,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	ctx := context.Background()

	// Create 2 servers
	_, _ = db.ExecContext(ctx, `INSERT INTO "Server" ("id","jellyfinServerId","name","url") VALUES ('srv1','jfsrv1','Server A','http://a'), ('srv2','jfsrv2','Server B','http://b')`)
	// Create users with duplicate usernames
	_, _ = db.ExecContext(ctx, `INSERT INTO "User" ("id","serverId","jellyfinUserId","username") VALUES ('u1','srv1','jfu1','Bob'), ('u2','srv2','jfu2','Bob')`)
	// Create media
	_, _ = db.ExecContext(ctx, `INSERT INTO "Media" ("id","serverId","jellyfinMediaId","title","type") VALUES ('m1','srv1','jfm1','Movie 1','Movie')`)

	// Create history for u1
	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, _ = db.ExecContext(ctx, `INSERT INTO "PlaybackHistory" ("id","serverId","userId","mediaId","playMethod","eventSource","durationWatched","startedAt") VALUES ('p1','srv1','u1','m1','DirectPlay','playback',300,?)`, now)

	// Create DailyStats for u1 and u2
	today := time.Now().UTC().Format("2006-01-02")
	_, _ = db.ExecContext(ctx, `INSERT INTO "DailyStats" ("id","date","userId","libraryName","mediaType","totalPlays","totalDuration","uniqueMedia") VALUES ('d1',?,'u1','Movies','Movie',2,600,1)`, today)
	_, _ = db.ExecContext(ctx, `INSERT INTO "DailyStats" ("id","date","userId","libraryName","mediaType","totalPlays","totalDuration","uniqueMedia") VALUES ('d2',?,'u2','Movies','Movie',3,900,2)`, today)

	// Detect duplicates
	dups, err := DetectDuplicates(ctx, db)
	if err != nil {
		t.Fatal(err)
	}
	if len(dups) != 1 || dups[0].Username != "Bob" || dups[0].Count != 2 {
		t.Fatalf("unexpected duplicates: %+v", dups)
	}

	// Merge u1 into u2
	actor := "admin"
	res, err := MergeUsers(ctx, db, "sqlite", "u1", "u2", &actor, nil)
	if err != nil {
		t.Fatal(err)
	}
	if res.SessionsMoved != 1 {
		t.Errorf("expected 1 session moved, got %d", res.SessionsMoved)
	}
	if res.DailyStatsUpdated != 1 {
		t.Errorf("expected 1 daily stats merged, got %d", res.DailyStatsUpdated)
	}

	// Verify u1 is deleted
	var remaining int
	_ = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM "User" WHERE "id"='u1'`).Scan(&remaining)
	if remaining != 0 {
		t.Error("expected source user u1 to be deleted")
	}

	// Verify PlaybackHistory now points to u2
	var histUserID string
	_ = db.QueryRowContext(ctx, `SELECT "userId" FROM "PlaybackHistory" WHERE "id"='p1'`).Scan(&histUserID)
	if histUserID != "u2" {
		t.Errorf("expected history to point to u2, got %s", histUserID)
	}

	// Verify merged DailyStats for u2: plays=5, duration=1500, uniqueMedia=2
	var plays, dur, uniq int
	err = db.QueryRowContext(ctx, `SELECT "totalPlays", "totalDuration", "uniqueMedia" FROM "DailyStats" WHERE "userId"='u2'`).Scan(&plays, &dur, &uniq)
	if err != nil {
		t.Fatal(err)
	}
	if plays != 5 || dur != 1500 || uniq != 2 {
		t.Errorf("unexpected merged daily stats: plays=%d, dur=%d, uniq=%d", plays, dur, uniq)
	}
}
