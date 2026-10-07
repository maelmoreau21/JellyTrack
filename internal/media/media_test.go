package media

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/maelmoreau21/jellytrack/internal/config"
	"github.com/maelmoreau21/jellytrack/internal/database"
)

func TestIsLibraryExcluded(t *testing.T) {
	excluded := []string{"Home Videos", "Photos", "music_clips"}

	if !IsLibraryExcluded("Home Videos", "", "", excluded) {
		t.Error("expected 'Home Videos' to be excluded")
	}
	if !IsLibraryExcluded("home-videos", "", "", excluded) {
		t.Error("expected 'home-videos' to be excluded by normalization")
	}
	if !IsLibraryExcluded("", "photos", "", excluded) {
		t.Error("expected collectionType 'photos' to be excluded")
	}
	if IsLibraryExcluded("Movies", "movies", "Movie", excluded) {
		t.Error("expected Movies not to be excluded")
	}
}

func TestListAndGetMedia(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "media_test.db")
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
	_, _ = db.ExecContext(ctx, `INSERT INTO "Media" ("id","serverId","jellyfinMediaId","title","type","durationMs") VALUES ('m1','srv1','jfm1','Inception','Movie',8880000)`)

	res, err := ListMedia(ctx, db, "sqlite", 1, 10, "", "", "")
	if err != nil {
		t.Fatal(err)
	}
	if res.Total != 1 || len(res.Media) != 1 {
		t.Fatalf("expected 1 media item, got total=%d len=%d", res.Total, len(res.Media))
	}
	if res.Media[0]["title"] != "Inception" {
		t.Errorf("expected title Inception, got %v", res.Media[0]["title"])
	}

	detail, err := GetMediaDetail(ctx, db, "sqlite", "m1")
	if err != nil {
		t.Fatal(err)
	}
	if detail.Media["title"] != "Inception" {
		t.Errorf("expected detail title Inception, got %v", detail.Media["title"])
	}
}
