package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestIncompleteCleanupIncludesMissingVideoResolutionAndWholeBrokenFamilies(t *testing.T) {
	db := apiDB(t)
	t.Setenv("BACKUP_DIR", t.TempDir())
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/System/Info":
			fmt.Fprint(w, `{"Id":"js"}`)
		case "/Library/VirtualFolders":
			fmt.Fprint(w, `[{"ItemId":"films","Name":"Films"}]`)
		case "/Items":
			fmt.Fprint(w, `{"Items":[{"Id":"current","Type":"Movie"}]}`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer remote.Close()
	if _, err := db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url","jellyfinApiKey") VALUES('s','js','S',?,'key')`, remote.URL); err != nil {
		t.Fatal(err)
	}
	for _, query := range []string{
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName","resolution","parentId") VALUES('no-res','s','old-film','Old film','Movie','Films','Unknown',NULL),('music','s','old-track','Music','Audio','Music',NULL,NULL),('known','s','old-known','Known','Movie','Films','720p',NULL),('current','s','current','Current','Movie',NULL,NULL,NULL),('parent','s','old-series','Old series','Series',NULL,NULL,NULL),('child','s','old-episode','Old episode','Episode',NULL,NULL,'old-series')`,
		`INSERT INTO "PlaybackHistory"("id","serverId","mediaId","playMethod") VALUES('p-film','s','no-res','DirectPlay'),('p-episode','s','child','DirectPlay'),('p-music','s','music','DirectPlay'),('p-known','s','known','DirectPlay')`,
	} {
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	h := New(db, "sqlite")
	call := func(body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest("POST", "http://localhost/api/admin/cleanup-unassigned-history", strings.NewReader(body))
		r.Header.Set("Origin", "http://localhost")
		w := httptest.NewRecorder()
		h.cleanupUnassignedHistory(w, r)
		return w
	}
	w := call(`{}`)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var response struct{ Preview unassignedCleanupPlan }
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if response.Preview.Media != 4 || response.Preview.History != 2 {
		t.Fatal(w.Body.String())
	}
	var count int
	db.QueryRow(`SELECT COUNT(*) FROM "Media"`).Scan(&count)
	if count != 6 {
		t.Fatal("preview deleted records")
	}
	body, _ := json.Marshal(map[string]any{"apply": true, "token": response.Preview.Token})
	w = call(string(body))
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	for _, id := range []string{"no-res", "parent", "child", "current"} {
		db.QueryRow(`SELECT COUNT(*) FROM "Media" WHERE "id"=?`, id).Scan(&count)
		if count != 0 {
			t.Fatal("incomplete row retained", id)
		}
	}
	for _, id := range []string{"music", "known"} {
		db.QueryRow(`SELECT COUNT(*) FROM "Media" WHERE "id"=?`, id).Scan(&count)
		if count != 1 {
			t.Fatal("valid row deleted", id)
		}
	}
	db.QueryRow(`SELECT COUNT(*) FROM "PlaybackHistory"`).Scan(&count)
	if count != 2 {
		t.Fatal(count)
	}
	w = call(`{}`)
	json.Unmarshal(w.Body.Bytes(), &response)
	if response.Preview.Media != 0 {
		t.Fatal("cleanup not idempotent", w.Body.String())
	}
}
func TestCleanupRejectsResolutionRecoveredAfterPreview(t *testing.T) {
	db := apiDB(t)
	db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','js','S','http://s')`)
	db.Exec(`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName","resolution") VALUES('m','s','jm','Film','Movie','Films','Unknown')`)
	h := New(db, "sqlite")
	plan := unassignedCleanupPlan{Media: 1, ids: []string{"m"}}
	var err error
	plan.Token, plan.History, plan.Telemetry, err = cleanupFingerprint(context.Background(), db, plan.ids)
	if err != nil {
		t.Fatal(err)
	}
	db.Exec(`UPDATE "Media" SET "resolution"='1080p' WHERE "id"='m'`)
	if _, err = h.applyUnassignedCleanup(context.Background(), plan); err == nil {
		t.Fatal("repaired record deleted")
	}
}

func TestIncompleteCleanupWorksOfflineAndIncludesCurrentMedia(t *testing.T) {
	db := apiDB(t)
	if _, err := db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','js','S','http://127.0.0.1:1')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName","resolution","isAvailable") VALUES('missing-lib','s','lib','Film','Movie',NULL,'1080p',1),('missing-res','s','res','Film','Movie','Films',NULL,1),('audio','s','audio','Music','Audio','Music',NULL,1)`); err != nil {
		t.Fatal(err)
	}
	plan, err := New(db, "sqlite").planUnassignedCleanup(context.Background())
	if err != nil || plan.Media != 2 {
		t.Fatal(plan, err)
	}
}
