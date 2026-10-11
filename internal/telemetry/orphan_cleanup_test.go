package telemetry

import (
	"context"
	"database/sql"
	"github.com/maelmoreau21/jellytrack/internal/config"
	"github.com/maelmoreau21/jellytrack/internal/database"
	"path/filepath"
	"testing"
	"time"
)

func TestExpiredStreamsCloseOnlyTheirUnobservedHistory(t *testing.T) {
	ctx := context.Background()
	db, err := database.Open(ctx, config.Config{DatabaseDriver: "sqlite", DatabasePath: filepath.Join(t.TempDir(), "cleanup.db")})
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, q := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','jf','Test','http://test')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s','jf-u','Test')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type") VALUES('m','s','jf-m','Test','Movie')`,
		`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","durationWatched") VALUES('expired','s','u','m','DirectPlay',42),('shared','s','u','m','DirectPlay',60),('old-orphan','s','u','m','DirectPlay',100)`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	old := time.Now().Add(-10 * time.Minute).UTC().Format(time.RFC3339Nano)
	for _, s := range []struct{ id, p, ping string }{{"expired", "expired", old}, {"shared-old", "shared", old}, {"shared-live", "shared", time.Now().UTC().Format("2006-01-02 15:04:05")}} {
		if _, err := db.Exec(`INSERT INTO "ActiveStream"("id","serverId","sessionId","userId","mediaId","playMethod","playbackId","lastPingAt") VALUES(?,'s',?,'u','m','DirectPlay',?,?)`, s.id, s.id, s.p, s.ping); err != nil {
			t.Fatal(err)
		}
	}
	count, err := CleanupOrphanStreams(ctx, db, "sqlite", 120)
	if err != nil || count != 2 {
		t.Fatalf("cleanup count=%d err=%v", count, err)
	}
	for _, id := range []string{"expired", "shared", "old-orphan"} {
		var ended sql.NullString
		var duration int
		if err := db.QueryRow(`SELECT "endedAt","durationWatched" FROM "PlaybackHistory" WHERE "id"=?`, id).Scan(&ended, &duration); err != nil {
			t.Fatal(err)
		}
		if id == "expired" {
			if ended.String != old || duration != 42 {
				t.Fatalf("lost observed values: %v %d", ended, duration)
			}
		} else if ended.Valid {
			t.Fatalf("unrelated/live history closed: %s", id)
		}
	}
}
