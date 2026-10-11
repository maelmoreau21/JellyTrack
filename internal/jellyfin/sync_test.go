package jellyfin

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/config"
	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/internal/testdb"
)

func TestMultiServerSlowTargetDoesNotBlockHealthySync(t *testing.T) {
	for _, driver := range []string{"sqlite", "postgres"} {
		t.Run(driver, func(t *testing.T) {
			db := testdb.Open(t, driver)
			db.SetMaxOpenConns(1)
			blocked := make(chan struct{})
			release := make(chan struct{})
			synced := make(chan struct{})
			slow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { close(blocked); <-release; w.WriteHeader(503) }))
			defer slow.Close()
			healthy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch r.URL.Path {
				case "/System/Info":
					fmt.Fprint(w, `{"Id":"good","ServerName":"Healthy"}`)
				case "/Users":
					fmt.Fprint(w, `[]`)
				case "/Library/VirtualFolders":
					fmt.Fprint(w, `[]`)
				case "/Items":
					fmt.Fprint(w, `{"Items":[]}`)
					close(synced)
				}
			}))
			defer healthy.Close()
			_, err := db.Exec(database.Bind(`INSERT INTO "Server"("id","jellyfinServerId","name","url","jellyfinApiKey") VALUES('slow','slow','Slow',?,'key'),('good','good','Healthy',?,'key')`, driver), slow.URL, healthy.URL)
			if err != nil {
				t.Fatal(err)
			}
			result := make(chan error, 1)
			go func() { _, err := SyncAllServers(context.Background(), db, driver); result <- err }()
			<-blocked
			select {
			case <-synced:
			case <-time.After(3 * time.Second):
				close(release)
				<-result
				t.Fatal("healthy server waited for slow target")
			}
			close(release)
			if err := <-result; err == nil {
				t.Fatal("partial error was hidden despite healthy empty server success")
			}
		})
	}
}

func TestMultiServerRefusesChangedRemoteIdentityWithExistingData(t *testing.T) {
	for _, driver := range []string{"sqlite", "postgres"} {
		t.Run(driver, func(t *testing.T) {
			db := testdb.Open(t, driver)
			remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				fmt.Fprint(w, `{"Id":"other-server","ServerName":"Different"}`)
			}))
			defer remote.Close()
			_, err := db.Exec(database.Bind(`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('a','original','Original',?)`, driver), remote.URL)
			if err != nil {
				t.Fatal(err)
			}
			if _, err = db.Exec(`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type") VALUES('m','a','m','Original','Movie')`); err != nil {
				t.Fatal(err)
			}
			if _, err := SyncOne(context.Background(), db, driver, "a", "original", "Original", remote.URL, "key"); err == nil {
				t.Fatal("different server attached to old data")
			}
			var identity string
			if err := db.QueryRow(`SELECT "jellyfinServerId" FROM "Server" WHERE "id"='a'`).Scan(&identity); err != nil || identity != "original" {
				t.Fatalf("identity changed: %s %v", identity, err)
			}
		})
	}
}

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
	for i := 0; i < 2; i++ {
		result, err := SyncOne(ctx, db, "sqlite", "configured-id", map[bool]string{true: "provisional-id", false: "canonical-id"}[i == 0], "Configured", remote.URL, "secret")
		if err != nil {
			t.Fatal(err)
		}
		if i == 0 {
			if _, err = db.Exec(`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type") VALUES('existing-media','configured-id','media','Existing','Movie')`); err != nil {
				t.Fatal(err)
			}

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
