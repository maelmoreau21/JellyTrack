package api

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestLibraryRepairCompletesResolutionBeyondServerWriteDeadline(t *testing.T) {
	db := apiDB(t)
	t.Setenv("BACKUP_DIR", t.TempDir())
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/System/Info":
			time.Sleep(150 * time.Millisecond)
			io.WriteString(w, `{"Id":"ja"}`)
		case "/Library/VirtualFolders":
			io.WriteString(w, `[{"ItemId":"lib","Name":"Films"}]`)
		case "/Items":
			io.WriteString(w, `{"Items":[{"Id":"unknown","MediaSources":[{"MediaStreams":[{"Type":"Video","Width":1920,"Height":1080}]}]},{"Id":"known","MediaSources":[{"MediaStreams":[{"Type":"Video","Width":3840,"Height":2160}]}]}]}`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer remote.Close()
	if _, err := db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url","jellyfinApiKey") VALUES('s','ja','S',?,'key')`, remote.URL); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName","resolution") VALUES('u','s','unknown','Unknown','Movie','Films','Unknown'),('k','s','known','Known','Movie','Films','720p')`); err != nil {
		t.Fatal(err)
	}
	h := New(db, "sqlite")
	server := httptest.NewUnstartedServer(http.HandlerFunc(h.repairLibraryNames))
	server.Config.WriteTimeout = 50 * time.Millisecond
	server.Start()
	defer server.Close()
	request, err := http.NewRequest("POST", server.URL, strings.NewReader(`{}`))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Origin", server.URL)
	response, err := server.Client().Do(request)
	if err != nil {
		t.Fatalf("repair response lost beyond deadline: %v", err)
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	if response.StatusCode != 200 {
		t.Fatalf("%d %s", response.StatusCode, body)
	}
	for id, want := range map[string]string{"u": "1080p", "k": "720p"} {
		var got string
		if err := db.QueryRow(`SELECT "resolution" FROM "Media" WHERE "id"=?`, id).Scan(&got); err != nil || got != want {
			t.Fatalf("%s: %q %v", id, got, err)
		}
	}
}
