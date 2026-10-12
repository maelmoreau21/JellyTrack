package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func TestManualUnassignedCleanupPreviewsBacksUpAndPreservesIdentifiableOrActiveMedia(t *testing.T) {
	db := apiDB(t)
	directory := t.TempDir()
	t.Setenv("BACKUP_DIR", directory)
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/System/Info":
			io.WriteString(w, `{"Id":"ja"}`)
		case "/Library/VirtualFolders":
			io.WriteString(w, `[{"ItemId":"films","Name":"Films"}]`)
		case "/Items":
			io.WriteString(w, `{"Items":[{"Id":"current"}]}`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer remote.Close()
	if _, err := db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url","jellyfinApiKey") VALUES('a','ja','A',?,'key')`, remote.URL); err != nil {
		t.Fatal(err)
	}
	for _, query := range []string{
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','a','ju','User')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName","parentId","resolution") VALUES('bad','a','gone','Old broken','Movie',NULL,NULL,NULL),('known','a','also-gone','Known history','Movie','Films',NULL,'720p'),('repairable','a','current','Still available','Movie','Films',NULL,'720p'),('active','a','active-old','Active','Movie',NULL,NULL,NULL),('parent','a','jparent','Parent','Series',NULL,NULL,NULL),('child','a','jchild','Child','Episode','Films','jparent','720p')`,
		`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","durationWatched") VALUES('bad-play','a','u','bad','DirectPlay',120),('good-play','a','u','known','DirectPlay',240)`,
		`INSERT INTO "TelemetryEvent"("id","serverId","playbackId","eventType","positionMs") VALUES('bad-event','a','bad-play','PlaybackStop',120000),('good-event','a','good-play','PlaybackStop',240000)`,
		`INSERT INTO "ActiveStream"("id","serverId","sessionId","userId","mediaId","playMethod") VALUES('stream','a','session','u','active','DirectPlay')`,
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
	var preview struct{ Preview unassignedCleanupPlan }
	if err := json.Unmarshal(w.Body.Bytes(), &preview); err != nil {
		t.Fatal(err)
	}
	if preview.Preview.Media != 1 || preview.Preview.History != 1 || preview.Preview.Telemetry != 1 || preview.Preview.Token == "" {
		t.Fatalf("incorrect preview: %+v", preview)
	}
	var count int
	db.QueryRow(`SELECT COUNT(*) FROM "Media"`).Scan(&count)
	if count != 6 {
		t.Fatal("preview deleted data")
	}
	if w = call(`{"apply":true,"token":"wrong"}`); w.Code != 409 {
		t.Fatal("unreviewed deletion accepted")
	}
	body, _ := json.Marshal(map[string]any{"apply": true, "token": preview.Preview.Token})
	w = call(string(body))
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var result struct {
		Backup  string
		Deleted unassignedCleanupPlan
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Deleted.Media != 1 || result.Deleted.History != 1 || result.Deleted.Telemetry != 1 {
		t.Fatalf("incorrect deletion report: %+v", result)
	}
	for table, want := range map[string]int{"Media": 5, "PlaybackHistory": 1, "TelemetryEvent": 1, "ActiveStream": 1, "User": 1, "Server": 1} {
		if err := db.QueryRow(`SELECT COUNT(*) FROM "` + table + `"`).Scan(&count); err != nil || count != want {
			t.Fatalf("%s count=%d want=%d %v", table, count, want, err)
		}
	}
	snapshot, err := sql.Open("sqlite", filepath.Join(directory, result.Backup))
	if err != nil {
		t.Fatal(err)
	}
	defer snapshot.Close()
	if err = snapshot.QueryRow(`SELECT COUNT(*) FROM "PlaybackHistory" WHERE "id"='bad-play'`).Scan(&count); err != nil || count != 1 {
		t.Fatal("deleted history absent from backup", err)
	}
	w = call(`{}`)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	json.Unmarshal(w.Body.Bytes(), &preview)
	if preview.Preview.Media != 0 {
		t.Fatal("cleanup is not idempotent")
	}
}

func TestUnassignedCleanupRejectsNewPlaybackAfterPreview(t *testing.T) {
	db := apiDB(t)
	for _, query := range []string{`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','js','S','http://s')`, `INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s','ju','U')`, `INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type") VALUES('m','s','jm','M','Movie')`} {
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	h := New(db, "sqlite")
	plan := unassignedCleanupPlan{Media: 1, ids: []string{"m"}}
	var err error
	plan.Token, plan.History, plan.Telemetry, err = cleanupFingerprint(context.Background(), db, plan.ids)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod") VALUES('new','s','u','m','DirectPlay')`); err != nil {
		t.Fatal(err)
	}
	if _, err = h.applyUnassignedCleanup(context.Background(), plan); err == nil {
		t.Fatal("new playback deleted")
	}
	var count int
	db.QueryRow(`SELECT COUNT(*) FROM "Media" WHERE "id"='m'`).Scan(&count)
	if count != 1 {
		t.Fatal("partial deletion committed")
	}
}
