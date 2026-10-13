package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/internal/testdb"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/maelmoreau21/jellytrack/internal/auth"
)

func TestPersonalWrappedUsesExplicitPairsAndRevocation(t *testing.T) {
	testPersonalWrappedContracts(t, apiDB(t), "sqlite")
}

func TestPostgresPersonalWrappedContracts(t *testing.T) {
	testPersonalWrappedContracts(t, testdb.Postgres(t), "postgres")
}

func testPersonalWrappedContracts(t *testing.T, db *sql.DB, driver string) {
	var disabled atomic.Bool
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"Id":"same","Name":"Alice","Policy":{"EnableAllFolders":true,"IsDisabled":%t}}`, disabled.Load())
	}))
	defer provider.Close()
	for _, q := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url","jellyfinApiKey") VALUES('s1','j1','One','http://fixture','key'),('s2','j2','Two','http://fixture','key')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u1','s1','same','Alice'),('u2','s2','same','Alice'),('unrelated','s2','other','Alice')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type") VALUES('m1','s1','same-film','Film','Movie'),('m2','s2','same-film','Film','Movie')`,
		`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","durationWatched","startedAt","endedAt","playMethod") VALUES('p1','s1','u1','m1',3600,'2025-01-02T10:00:00Z','2025-01-02T11:00:00Z','DirectPlay'),('p2','s2','u2','m2',1800,'2025-02-02T10:00:00Z','2025-02-02T10:30:00Z','DirectPlay'),('p3','s2','unrelated','m2',9000,'2025-03-02T10:00:00Z','2025-03-02T13:00:00Z','DirectPlay')`,
		`INSERT INTO "GlobalSettings"("id","wrappedVisible","wrappedPeriodEnabled") VALUES('global',TRUE,FALSE)`,
		`INSERT INTO "PersonAccount"("accountId","personId","createdAt") VALUES('u1','person','2025-01-01'),('u2','person','2025-01-01')`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.Exec(database.Bind(`UPDATE "Server" SET "url"=?`, driver), provider.URL); err != nil {
		t.Fatal(err)
	}
	h := New(db, driver)
	call := func() *httptest.ResponseRecorder {
		r := httptest.NewRequest("GET", "/api/me/wrapped?year=2025&serverId=forged&servers=all", nil)
		r = r.WithContext(context.WithValue(r.Context(), auth.PrincipalContextKey, auth.Principal{Username: "Alice", Role: "user", AuthServerID: "s1", JellyfinUserID: "same", IdentityVersion: 2}))
		w := httptest.NewRecorder()
		h.personalWrapped(w, r)
		return w
	}
	w := call()
	if w.Code != 200 {
		t.Fatalf("Wrapped: %d %s", w.Code, w.Body)
	}
	var data struct {
		TotalSeconds int
		TotalPlays   int
		TopMovies    []struct {
			ServerID string `json:"serverId"`
		}
		Accounts []any
	}
	if err := json.Unmarshal(w.Body.Bytes(), &data); err != nil {
		t.Fatal(err)
	}
	if data.TotalSeconds != 5400 || data.TotalPlays != 2 || len(data.TopMovies) != 2 || len(data.Accounts) != 2 || data.TopMovies[0].ServerID == data.TopMovies[1].ServerID {
		t.Fatalf("merged identities or unrelated activity: %+v", data)
	}
	if _, err := db.Exec(`DELETE FROM "PersonAccount" WHERE "accountId"='u2'`); err != nil {
		t.Fatal(err)
	}
	w = call()
	json.Unmarshal(w.Body.Bytes(), &data)
	if w.Code != 200 || data.TotalSeconds != 3600 {
		t.Fatalf("unlink did not immediately change Wrapped: %d %s", w.Code, w.Body)
	}
	r := httptest.NewRequest("GET", "/api/wrapped/me?year=2025", nil)
	r.SetPathValue("id", "me")
	r = r.WithContext(context.WithValue(r.Context(), auth.PrincipalContextKey, auth.Principal{Role: "user", Username: "Alice", AuthServerID: "s1", JellyfinUserID: "same", IdentityVersion: 2}))
	if _, err := db.Exec(`UPDATE "GlobalSettings" SET "wrappedVisible"=FALSE`); err != nil {
		t.Fatal(err)
	}
	w = httptest.NewRecorder()
	h.userWrapped(w, r)
	if w.Code != 404 {
		t.Fatalf("legacy visibility guard bypass: %d %s", w.Code, w.Body)
	}
	if _, err := db.Exec(`UPDATE "GlobalSettings" SET "wrappedVisible"=TRUE`); err != nil {
		t.Fatal(err)
	}
	disabled.Store(true)
	if w = call(); w.Code != 403 {
		t.Fatalf("disabled provider account remains readable: %d", w.Code)
	}
	w = httptest.NewRecorder()
	h.userWrapped(w, r)
	if w.Code != 403 {
		t.Fatalf("legacy provider revocation bypass: %d %s", w.Code, w.Body)
	}
}

func TestAvatarAuthorizationDeniesBeforeProxyAndStripsUpstreamHeaders(t *testing.T) {
	db := apiDB(t)
	hits := 0
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		w.Header().Set("Content-Type", "image/png")
		w.Header().Set("Set-Cookie", "foreign=secret")
		w.Header().Set("Cache-Control", "public")
		w.Write([]byte("image"))
	}))
	defer provider.Close()
	if _, err := db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url","jellyfinApiKey") VALUES('s','j','Server',?,'key')`, provider.URL); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s','own','Alice')`); err != nil {
		t.Fatal(err)
	}
	h := New(db, "sqlite")
	call := func(path string) *httptest.ResponseRecorder {
		r := httptest.NewRequest("GET", path, nil)
		r = r.WithContext(context.WithValue(r.Context(), auth.PrincipalContextKey, auth.Principal{Role: "user", Username: "Alice", AuthServerID: "s", JellyfinUserID: "own", IdentityVersion: 2}))
		w := httptest.NewRecorder()
		h.jellyfinUserImageProxy(w, r)
		return w
	}
	for _, path := range []string{"/api/jellyfin/user-image?serverId=s&userId=other", "/api/jellyfin/user-image?serverId=other&userId=own"} {
		if w := call(path); w.Code != 404 {
			t.Fatalf("foreign avatar: %d", w.Code)
		}
	}
	if hits != 0 {
		t.Fatal("denied avatar made network request")
	}
	w := call("/api/jellyfin/user-image?serverId=s&userId=own")
	if w.Code != 200 || hits != 1 || w.Header().Get("Set-Cookie") != "" || w.Header().Get("Cache-Control") != "private, no-store" {
		t.Fatalf("legitimate image or private headers: %d %v", w.Code, w.Header())
	}
}
