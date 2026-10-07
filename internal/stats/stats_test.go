package stats

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/config"
	"github.com/maelmoreau21/jellytrack/internal/database"
)

func TestDashboardAndStats(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "stats_test.db")
	db, err := database.Open(context.Background(), config.Config{
		DatabaseDriver: "sqlite",
		DatabasePath:   dbPath,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	ctx := context.Background()

	_, _ = db.ExecContext(ctx, `INSERT INTO "Server" ("id","jellyfinServerId","name","url") VALUES ('s1','jfs1','Server 1','http://srv')`)
	_, _ = db.ExecContext(ctx, `INSERT INTO "User" ("id","serverId","jellyfinUserId","username") VALUES ('u1','s1','jfu1','Alice')`)
	_, _ = db.ExecContext(ctx, `INSERT INTO "Media" ("id","serverId","jellyfinMediaId","title","type","durationMs","directors","actors","studios") VALUES ('m1','s1','jfm1','Interstellar','Movie',10000000,'["Christopher Nolan"]','["Matthew McConaughey"]','["Syncopy"]')`)

	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, _ = db.ExecContext(ctx, `INSERT INTO "PlaybackHistory" ("id","serverId","userId","mediaId","playMethod","eventSource","durationWatched","startedAt","country") VALUES ('p1','s1','u1','m1','DirectPlay','playback',3600,?,'France')`, now)

	dash, err := GetDashboard(ctx, db, "sqlite", 30)
	if err != nil {
		t.Fatal(err)
	}
	if dash.Views != 1 {
		t.Errorf("expected 1 view, got %d", dash.Views)
	}
	if dash.DurationMs != 3600*1000 {
		t.Errorf("expected 3600000 ms, got %d", dash.DurationMs)
	}
	if dash.Users != 1 {
		t.Errorf("expected 1 user, got %d", dash.Users)
	}

	deep, err := GetDeepStats(ctx, db)
	if err != nil {
		t.Fatal(err)
	}
	if len(deep.Directors) != 1 || deep.Directors[0]["name"] != "Christopher Nolan" {
		t.Fatalf("unexpected deep stats directors: %+v", deep.Directors)
	}

	geo, err := GetGeoStats(ctx, db, "sqlite", 30)
	if err != nil {
		t.Fatal(err)
	}
	countries := geo["countries"].([]map[string]any)
	if len(countries) != 1 || countries[0]["country"] != "France" {
		t.Fatalf("unexpected geo stats: %+v", countries)
	}
}
