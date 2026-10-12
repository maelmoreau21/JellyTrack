package jellyfin

import (
	"context"
	"fmt"
	"github.com/maelmoreau21/jellytrack/internal/testdb"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestFullSyncReplacementAndRemovalPreserveHistory(t *testing.T) {
	db := testdb.Open(t, "sqlite")
	payload := `{"Items":[{"Id":"new","Name":"John Wick","Type":"Movie","ProviderIds":{"Tmdb":"245891"}}]}`
	fail := false
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/System/Info":
			fmt.Fprint(w, `{"Id":"js"}`)
		case "/Users":
			fmt.Fprint(w, `[]`)
		case "/Library/VirtualFolders":
			fmt.Fprint(w, `[{"ItemId":"films","Name":"Films","CollectionType":"movies"}]`)
		case "/Items":
			if fail {
				http.Error(w, "unavailable", 500)
				return
			}
			fmt.Fprint(w, payload)
		default:
			http.NotFound(w, r)
		}
	}))
	defer remote.Close()
	if _, err := db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','js','S',?)`, remote.URL); err != nil {
		t.Fatal(err)
	}
	for _, query := range []string{
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","providerIds") VALUES('old','s','old','John Wick','Movie','{"Tmdb":"245891"}'),('duplicate','s','new','John Wick','Movie','{"Tmdb":"245891"}'),('gone','s','gone','Gone','Movie','{}')`,
		`INSERT INTO "PlaybackHistory"("id","serverId","mediaId","playMethod") VALUES('p-old','s','old','DirectPlay'),('p-new','s','duplicate','DirectPlay'),('p-gone','s','gone','DirectPlay')`,
		`INSERT INTO "TelemetryEvent"("id","serverId","playbackId","eventType","positionMs") VALUES('event','s','p-new','seek',10)`,
	} {
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	sync := func(recent bool) {
		t.Helper()
		if _, err := SyncOne(context.Background(), db, "sqlite", "s", "js", "S", remote.URL, "key", recent); err != nil {
			t.Fatal(err)
		}
	}
	sync(true)
	var available int
	db.QueryRow(`SELECT "isAvailable" FROM "Media" WHERE "id"='gone'`).Scan(&available)
	if available != 1 {
		t.Fatal("recent sync archived an unseen item")
	}
	fail = true
	if _, err := SyncOne(context.Background(), db, "sqlite", "s", "js", "S", remote.URL, "key"); err == nil {
		t.Fatal("expected fetch failure")
	}
	db.QueryRow(`SELECT "isAvailable" FROM "Media" WHERE "id"='gone'`).Scan(&available)
	if available != 1 {
		t.Fatal("failed sync archived an item")
	}
	fail = false
	sync(false)
	var remoteID, library string
	if err := db.QueryRow(`SELECT "jellyfinMediaId","libraryName" FROM "Media" WHERE "id"='old'`).Scan(&remoteID, &library); err != nil || remoteID != "new" || library != "Films" {
		t.Fatal(remoteID, library, err)
	}
	var histories, events, duplicates int
	db.QueryRow(`SELECT COUNT(*) FROM "PlaybackHistory" WHERE "mediaId"='old'`).Scan(&histories)
	db.QueryRow(`SELECT COUNT(*) FROM "TelemetryEvent"`).Scan(&events)
	db.QueryRow(`SELECT COUNT(*) FROM "Media" WHERE "id"='duplicate'`).Scan(&duplicates)
	if histories != 2 || events != 1 || duplicates != 0 {
		t.Fatal(histories, events, duplicates)
	}
	db.QueryRow(`SELECT "isAvailable" FROM "Media" WHERE "id"='gone'`).Scan(&available)
	if available != 0 {
		t.Fatal("deleted media still visible")
	}
	payload = `{"Items":[{"Id":"gone","Name":"Gone","Type":"Movie"}]}`
	sync(true)
	db.QueryRow(`SELECT "isAvailable" FROM "Media" WHERE "id"='gone'`).Scan(&available)
	if available != 1 {
		t.Fatal("returning item not restored")
	}
}
func TestProviderMatchingRejectsConflictsAndMultipleVersions(t *testing.T) {
	base := Item{ID: "new", Type: "Movie", ProviderIDs: map[string]string{"Tmdb": "123", "Imdb": "tt1"}}
	for _, tc := range []struct {
		kind  string
		ids   map[string]string
		items []Item
		want  bool
	}{
		{"Movie", map[string]string{"tmdb": "123"}, []Item{base}, true},
		{"Movie", map[string]string{"Tmdb": "123", "Imdb": "tt2"}, []Item{base}, false},
		{"Episode", map[string]string{"Tmdb": "123"}, []Item{base}, false},
		{"Series", map[string]string{"Tmdb": "123"}, []Item{base}, false},
		{"Movie", map[string]string{"Tmdb": "123"}, []Item{base, {ID: "version2", Type: "Movie", ProviderIDs: map[string]string{"Tmdb": "123"}}}, false},
	} {
		_, ok := NewProviderIndex(tc.items).Match(tc.kind, tc.ids)
		if ok != tc.want {
			t.Fatal(tc, ok)
		}
	}
}

func TestReplacementProtectsActiveSessionsAmbiguityAndOtherServers(t *testing.T) {
	db := testdb.Open(t, "sqlite")
	for _, query := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('a','ja','A','http://a'),('b','jb','B','http://b')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","providerIds") VALUES('old','a','old','Film','Movie','{"Tmdb":"123"}'),('other','b','old','Other film','Movie','{"Tmdb":"123"}')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','a','ju','User')`,
		`INSERT INTO "ActiveStream"("id","serverId","sessionId","userId","mediaId","playMethod") VALUES('active','a','session','u','old','DirectPlay')`,
	} {
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	items := []Item{{ID: "new", Type: "Movie", ProviderIDs: map[string]string{"Tmdb": "123"}}}
	assertOld := func() {
		t.Helper()
		for _, id := range []string{"old", "other"} {
			var remote string
			if err := db.QueryRow(`SELECT "jellyfinMediaId" FROM "Media" WHERE "id"=?`, id).Scan(&remote); err != nil || remote != "old" {
				t.Fatal(id, remote, err)
			}
		}
	}
	if err := reconcileReplacementIDs(context.Background(), db, "sqlite", "a", items); err != nil {
		t.Fatal(err)
	}
	assertOld()
	db.Exec(`DELETE FROM "ActiveStream"`)
	db.Exec(`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","providerIds") VALUES('second','a','second','Film','Movie','{"Tmdb":"123"}')`)
	if err := reconcileReplacementIDs(context.Background(), db, "sqlite", "a", items); err != nil {
		t.Fatal(err)
	}
	assertOld()
	if err := reconcilePresence(context.Background(), db, "sqlite", "a", nil); err != nil {
		t.Fatal(err)
	}
	var available int
	db.QueryRow(`SELECT "isAvailable" FROM "Media" WHERE "id"='other'`).Scan(&available)
	if available != 1 {
		t.Fatal("another server was archived")
	}
}
