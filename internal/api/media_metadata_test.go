package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/auth"
)

func TestDeferredMediaMetadataAuthorizationAndSlowProvider(t *testing.T) {
	db := apiDB(t)
	var itemHits atomic.Int32
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/Users/ju":
			fmt.Fprint(w, `{"Id":"ju","Policy":{"EnabledFolders":["films"]}}`)
		case "/Library/VirtualFolders":
			fmt.Fprint(w, `[{"ItemId":"films","Name":"Films"},{"ItemId":"music","Name":"Music"}]`)
		case "/Items/jf-film":
			itemHits.Add(1)
			time.Sleep(100 * time.Millisecond)
			fmt.Fprint(w, `{"Overview":"Presentation","ProductionYear":2026,"People":[{"Id":"actor","Name":"Actor","Role":"Hero","Type":"Actor","PrimaryImageTag":"tag"}],"MediaSources":[{"Id":"version","Name":"HD","Path":"/private/film.mkv","Container":"mkv"}],"ImageTags":{"Logo":"tag"},"BackdropImageTags":["tag"]}`)
		default:
			itemHits.Add(1)
			http.NotFound(w, r)
		}
	}))
	defer provider.Close()
	for _, q := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url","jellyfinApiKey") VALUES('s','js','Server','http://placeholder','test-key'),('other','jo','Other','http://placeholder','test-key')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s','ju','User')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName") VALUES('film','s','jf-film','Film','Movie','Films'),('album','s','jf-album','Secret','MusicAlbum','Music'),('other-film','other','jf-film','Other','Movie','Films')`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.Exec(`UPDATE "Server" SET "url"=?`, provider.URL); err != nil {
		t.Fatal(err)
	}
	h := New(db, "sqlite")
	request := func(id, scope string, handler http.HandlerFunc) *httptest.ResponseRecorder {
		r := httptest.NewRequest("GET", "/api/media/"+id+"?servers="+scope, nil)
		r.SetPathValue("id", id)
		r = r.WithContext(context.WithValue(r.Context(), auth.PrincipalContextKey, auth.Principal{Role: "user", Username: "User", JellyfinUserID: "ju", AuthServerID: "s", IdentityVersion: 1}))
		w := httptest.NewRecorder()
		handler(w, r)
		return w
	}
	// Initial detail remains independent of the provider's presentation call.
	if w := request("film", "s", h.recoveredMediaDetail); w.Code != 200 || itemHits.Load() != 0 {
		t.Fatalf("initial detail: %d, hits %d", w.Code, itemHits.Load())
	}
	for _, tc := range []struct{ id, scope string }{{"album", "s"}, {"other-film", "all"}, {"film", "other"}, {"missing", "s"}} {
		if w := request(tc.id, tc.scope, h.recoveredMediaMetadata); w.Code != 404 || itemHits.Load() != 0 {
			t.Fatalf("denied %s: %d hits %d", tc.id, w.Code, itemHits.Load())
		}
	}
	w := request("film", "s", h.recoveredMediaMetadata)
	if w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("metadata response must not be stored by shared caches")
	}
	if w.Code != 200 || itemHits.Load() != 1 {
		t.Fatalf("metadata: %d %s hits %d", w.Code, w.Body.String(), itemHits.Load())
	}
	var result map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result["id"] != "film" || result["overview"] != "Presentation" || result["year"] != float64(2026) || result["hasLogo"] != true || result["hasBackdrop"] != true {
		t.Fatalf("presentation: %+v", result)
	}
	for _, forbidden := range []string{"serverId", "jellyfinMediaId", "type", "history", "plays", "serverURL", "apiKey"} {
		if _, ok := result[forbidden]; ok {
			t.Fatalf("unexpected field %s", forbidden)
		}
	}
	if strings.Contains(w.Body.String(), "/private/") || strings.Contains(w.Body.String(), "test-key") {
		t.Fatalf("private provider data leaked: %s", w.Body.String())
	}
}
