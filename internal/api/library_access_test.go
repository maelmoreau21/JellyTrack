package api

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/maelmoreau21/jellytrack/internal/auth"
)

func TestCatalogueLibraryAccess(t *testing.T) {
	db := apiDB(t)
	policy := `{"Id":"ju","Policy":{"EnabledFolders":["films"]}}`
	folders := `[{"ItemId":"films","Name":"Films"},{"ItemId":"music","Name":"Music"}]`
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-MediaBrowser-Token") != "test-key" {
			t.Error("missing server credential")
		}
		switch r.URL.Path {
		case "/Users/ju":
			fmt.Fprint(w, policy)
		case "/Library/VirtualFolders":
			fmt.Fprint(w, folders)
		default:
			http.NotFound(w, r)
		}
	}))
	defer provider.Close()
	queries := []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url","jellyfinApiKey") VALUES('s','js','Server','http://placeholder','test-key'),('other','jo','Other','http://other','test-key')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s','ju','User')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName","parentId") VALUES('film','s','jf-film','Visible Film','Movie','Films',NULL),('album','s','jf-album','Secret Album','MusicAlbum','Music',NULL),('track','s','jf-track','Secret Track','Audio','Music','jf-album'),('other-film','other','jf-film','Other Film','Movie','Films',NULL)`,
	}
	for _, query := range queries {
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.Exec(`UPDATE "Server" SET "url"=? WHERE "id"='s'`, provider.URL); err != nil {
		t.Fatal(err)
	}
	h := New(db, "sqlite")
	request := func(path string) *http.Request {
		r := httptest.NewRequest("GET", path, nil)
		return r.WithContext(context.WithValue(r.Context(), auth.PrincipalContextKey, auth.Principal{Role: "user", Username: "User", JellyfinUserID: "ju", AuthServerID: "s", IdentityVersion: 1}))
	}
	for _, tc := range []struct {
		name, policy, folders string
		count                 int
	}{
		{"restricted", policy, folders, 1},
		{"all folders", `{"Id":"ju","Policy":{"EnableAllFolders":true}}`, folders, 3},
		{"revoked", `{"Id":"ju","Policy":{"EnabledFolders":[]}}`, folders, 0},
		{"disabled", `{"Id":"ju","Policy":{"EnableAllFolders":true,"IsDisabled":true}}`, folders, 0},
		{"wrong identity", `{"Id":"someone-else","Policy":{"EnableAllFolders":true}}`, folders, 0},
		{"invalid provider response", `broken`, folders, 0},
		{"duplicate name", `{"Id":"ju","Policy":{"EnabledFolders":["films"]}}`, `[{"ItemId":"films","Name":"Films"},{"ItemId":"hidden","Name":"Films"}]`, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			policy, folders = tc.policy, tc.folders
			base, args, err := h.recoveredMediaBase(request("/api/media?servers=all"))
			if err != nil {
				t.Fatal(err)
			}
			rows, err := h.recoveredRows(request("/api/media"), base+`SELECT "id" FROM catalog`, args...)
			if err != nil || len(rows) != tc.count {
				t.Fatalf("rows=%v err=%v expected=%d", rows, err, tc.count)
			}
		})
	}
	policy = `{"Id":"ju","Policy":{"EnabledFolders":["films"]}}`
	folders = `[{"ItemId":"films","Name":"Films"},{"ItemId":"music","Name":"Music"}]`
	for _, tc := range []struct {
		path, id string
		handler  http.HandlerFunc
		status   int
	}{
		{"/api/media/collections", "", h.mediaCollections, 200},
		{"/api/media", "", h.mediaList, 200},
		{"/api/search?q=Secret", "", h.search, 200},
		{"/api/media/album", "album", h.mediaDetail, 404},
		{"/api/media/track", "track", h.mediaDetail, 404},
		{"/api/jellyfin/image?serverId=s&mediaId=jf-album", "", h.jellyfinImageProxy, 404},
	} {
		r := request(tc.path)
		r.SetPathValue("id", tc.id)
		w := httptest.NewRecorder()
		tc.handler(w, r)
		if w.Code != tc.status || strings.Contains(w.Body.String(), "Secret") || strings.Contains(w.Body.String(), `"Music"`) {
			t.Fatalf("%s: %d %s", tc.path, w.Code, w.Body.String())
		}
	}
}
