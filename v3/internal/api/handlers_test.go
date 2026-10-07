package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/maelmoreau21/jellytrack/v3/internal/config"
	"github.com/maelmoreau21/jellytrack/v3/internal/database"
)

func apiDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := database.Open(context.Background(), config.Config{DatabaseDriver: "sqlite", DatabasePath: filepath.Join(t.TempDir(), "api.db")})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func TestDashboardReadsPersistedData(t *testing.T) {
	db := apiDB(t)
	for _, q := range []string{`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','jf','Jellyfin','http://jellyfin')`, `INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s','jf-u','Mael')`, `INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type") VALUES('m','s','jf-m','Film','Movie')`, `INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName") VALUES('m2','s','jf-m2','Kids film','Movie','Kids')`, `INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","durationWatched") VALUES('p','s','u','m','DirectPlay',3600000)`, `INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","durationWatched") VALUES('p2','s','u','m2','DirectPlay',900000)`, `INSERT INTO "GlobalSettings"("id","excludedLibraries") VALUES('global','["Kids"]')`} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	w := httptest.NewRecorder()
	New(db, "sqlite").dashboard(w, httptest.NewRequest("GET", "/api/dashboard?days=30", nil))
	if w.Code != 200 {
		t.Fatalf("status=%d: %s", w.Code, w.Body.String())
	}
	var result struct {
		Views    int64            `json:"views"`
		Duration int64            `json:"durationMs"`
		Users    int64            `json:"users"`
		Media    int64            `json:"media"`
		Activity []map[string]any `json:"activity"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Views != 1 || result.Duration != 3600000 || result.Users != 1 || result.Media != 2 || len(result.Activity) != 1 {
		t.Fatalf("unexpected dashboard data: %+v", result)
	}
}

func TestPaginationBoundsAreEnforced(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/users?limit=999&offset=-5", nil)
	limit, offset := page(req)
	if limit != 200 || offset != 0 {
		t.Fatalf("page = %d,%d", limit, offset)
	}
}
