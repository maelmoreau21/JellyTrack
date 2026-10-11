package jellyfin

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/maelmoreau21/jellytrack/internal/config"
	"github.com/maelmoreau21/jellytrack/internal/database"
)

func TestSyncResolvesConfiguredServerWithoutChangingInternalID(t *testing.T) {
	ctx := context.Background()
	db, err := database.Open(ctx, config.Config{DatabaseDriver: "sqlite", DatabasePath: filepath.Join(t.TempDir(), "sync.db")})
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/System/Info":
			fmt.Fprint(w, `{"Id":"canonical-id","ServerName":"Actual server"}`)
		case "/Users":
			fmt.Fprint(w, `[{"Id":"user","Name":"Alice"}]`)
		case "/Library/VirtualFolders":
			fmt.Fprint(w, `[]`)
		case "/Items":
			fmt.Fprint(w, `{"Items":[]}`)
		default:
			t.Errorf("unexpected endpoint %s", r.URL.Path)
			http.NotFound(w, r)
		}
	}))
	defer remote.Close()
	if _, err = db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('configured-id','provisional-id','Configured',?)`, remote.URL); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type") VALUES('existing-media','configured-id','media','Existing','Movie')`); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		result, err := SyncOne(ctx, db, "sqlite", "configured-id", "provisional-id", "Configured", remote.URL, "secret")
		if err != nil {
			t.Fatal(err)
		}
		if result.Users != 1 {
			t.Fatalf("users=%d", result.Users)
		}
	}
	var id, jf string
	var count int
	if err = db.QueryRow(`SELECT "id","jellyfinServerId" FROM "Server"`).Scan(&id, &jf); err != nil {
		t.Fatal(err)
	}
	if id != "configured-id" || jf != "canonical-id" {
		t.Fatalf("identity %s/%s", id, jf)
	}
	if err = db.QueryRow(`SELECT COUNT(*) FROM "Media" WHERE "serverId"='configured-id' AND "id"='existing-media'`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("existing data lost: %d %v", count, err)
	}
}
