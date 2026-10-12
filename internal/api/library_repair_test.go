package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestManualLibraryRepairUsesJellyfinMembershipAndVerifiedBackup(t *testing.T) {
	db := apiDB(t)
	directory := t.TempDir()
	t.Setenv("BACKUP_DIR", directory)
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/System/Info":
			w.Write([]byte(`{"Id":"ja"}`))
		case "/Library/VirtualFolders":
			w.Write([]byte(`[{"ItemId":"films","Name":"Films","CollectionType":"movies"},{"ItemId":"kids","Name":"Enfants","CollectionType":"movies"},{"ItemId":"tv","Name":"Séries","CollectionType":"tvshows"}]`))
		case "/Items":
			if r.URL.Query().Get("Recursive") != "true" {
				t.Error("nested media not requested")
			}
			ids := map[string]string{"films": "movie", "kids": "kid", "tv": "episode"}
			json.NewEncoder(w).Encode(map[string]any{"Items": []map[string]string{{"Id": ids[r.URL.Query().Get("ParentId")]}}, "TotalRecordCount": 1})
		default:
			http.NotFound(w, r)
		}
	}))
	defer remote.Close()
	if _, err := db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url","jellyfinApiKey") VALUES('a','ja','A',?,'key'),('b','jb','B',?,'key')`, remote.URL, remote.URL); err != nil {
		t.Fatal(err)
	}
	for _, q := range []string{
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','a','ju','User')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName") VALUES('m','a','movie','Film','Movie','movies'),('k','a','kid','Enfant','Movie',NULL),('e','a','episode','Episode','Episode','tvshows'),('missing','a','gone','Ancien','Movie',NULL)`,
		`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","durationWatched","playMethod") VALUES('p','a','u','e',120,'DirectPlay')`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	h := New(db, "sqlite")
	request := func() *httptest.ResponseRecorder {
		r := httptest.NewRequest("POST", "http://localhost/api/admin/repair-library-names", strings.NewReader(`{}`))
		r.Header.Set("Origin", "http://localhost")
		w := httptest.NewRecorder()
		h.repairLibraryNames(w, r)
		return w
	}
	w := request()
	if w.Code != 200 {
		t.Fatalf("%d %s", w.Code, w.Body.String())
	}
	var result struct {
		Repaired, Unresolved            int
		Backup, BackupSHA256, BackupURL string
		UnresolvedSamples               []struct{ Title, RemoteID, ServerID, Reason string }
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Repaired != 3 || result.Unresolved != 1 || len(result.BackupSHA256) != 64 || !repairBackupName.MatchString(result.Backup) {
		t.Fatalf("%+v", result)
	}
	if len(result.UnresolvedSamples) != 1 || result.UnresolvedSamples[0].RemoteID != "gone" || result.UnresolvedSamples[0].ServerID != "a" || result.UnresolvedSamples[0].Reason == "" {
		t.Fatalf("unresolved diagnostic missing: %+v", result.UnresolvedSamples)
	}
	for id, want := range map[string]string{"m": "Films", "k": "Enfants", "e": "Séries"} {
		var got string
		if err := db.QueryRow(`SELECT "libraryName" FROM "Media" WHERE "id"=?`, id).Scan(&got); err != nil || got != want {
			t.Fatalf("%s: %q %v", id, got, err)
		}
	}
	snapshot, err := sql.Open("sqlite", filepath.Join(directory, result.Backup))
	if err != nil {
		t.Fatal(err)
	}
	defer snapshot.Close()
	var old string
	if err = snapshot.QueryRow(`SELECT "libraryName" FROM "Media" WHERE "id"='m'`).Scan(&old); err != nil || old != "movies" {
		t.Fatalf("backup: %q %v", old, err)
	}
	var duration int
	if err = db.QueryRow(`SELECT "durationWatched" FROM "PlaybackHistory" WHERE "id"='p' AND "mediaId"='e'`).Scan(&duration); err != nil || duration != 120 {
		t.Fatal("history changed", err)
	}
	download := httptest.NewRequest("GET", "http://localhost"+result.BackupURL, nil)
	download.SetPathValue("name", result.Backup)
	out := httptest.NewRecorder()
	h.downloadLibraryRepairBackup(out, download)
	if out.Code != 200 || !strings.HasPrefix(out.Body.String(), "SQLite format 3") {
		t.Fatal("backup cannot be downloaded", out.Code)
	}
	w = request()
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"repaired":0`) {
		t.Fatal("repair not idempotent", w.Body.String())
	}
	files, _ := os.ReadDir(directory)
	if len(files) != 1 {
		t.Fatalf("unexpected backups %d", len(files))
	}
	// A single conflicting write rolls back all repair changes.
	_, err = h.applyLibraryRepair(context.Background(), []libraryRepairChange{{id: "m", server: "a", remote: "movie", before: sql.NullString{String: "Films", Valid: true}, after: "Wrong"}, {id: "k", server: "a", remote: "kid", before: sql.NullString{String: "stale", Valid: true}, after: "Wrong"}})
	if err == nil {
		t.Fatal("concurrent change accepted")
	}
	db.QueryRow(`SELECT "libraryName" FROM "Media" WHERE "id"='m'`).Scan(&old)
	if old != "Films" {
		t.Fatal("partial commit")
	}
}

func TestManualLibraryRepairGuardsAndRemoteFailure(t *testing.T) {
	db := apiDB(t)
	h := New(db, "sqlite")
	t.Setenv("BACKUP_DIR", t.TempDir())
	r := httptest.NewRequest("POST", "http://localhost/api/admin/repair-library-names", nil)
	r.Header.Set("Origin", "https://other.example")
	w := httptest.NewRecorder()
	h.repairLibraryNames(w, r)
	if w.Code != 403 {
		t.Fatal(w.Code)
	}
	r.Header.Set("Origin", "http://localhost")
	h.libraryRepairMu.Lock()
	w = httptest.NewRecorder()
	h.repairLibraryNames(w, r)
	h.libraryRepairMu.Unlock()
	if w.Code != 409 {
		t.Fatal(w.Code)
	}
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Error(w, "unavailable", 503) }))
	defer remote.Close()
	db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url","jellyfinApiKey") VALUES('a','ja','A',?,'key')`, remote.URL)
	db.Exec(`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName") VALUES('m','a','movie','Film','Movie','movies')`)
	w = httptest.NewRecorder()
	h.repairLibraryNames(w, r)
	if w.Code != 502 {
		t.Fatalf("%d %s", w.Code, w.Body.String())
	}
	var name string
	db.QueryRow(`SELECT "libraryName" FROM "Media" WHERE "id"='m'`).Scan(&name)
	if name != "movies" {
		t.Fatal("failed repair changed data")
	}
	// Both endpoints must use the administrator middleware.
	mux := http.NewServeMux()
	identity := func(next http.Handler) http.Handler { return next }
	deny := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(403) })
	}
	h.Register(mux, identity, deny)
	for _, path := range []string{"/api/admin/repair-library-names", "/api/admin/library-repair-backup/JellyTrack-library-repair-20261012T123456000000001Z.sqlite"} {
		method := "GET"
		if strings.HasSuffix(path, "names") {
			method = "POST"
		}
		out := httptest.NewRecorder()
		mux.ServeHTTP(out, httptest.NewRequest(method, path, nil))
		if out.Code != 403 {
			t.Fatalf("unprotected %s", path)
		}
	}
}
