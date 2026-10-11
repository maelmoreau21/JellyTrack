package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

func TestHistoricalCollectionNormalizationAndScopedDrilldown(t *testing.T) {
	db := apiDB(t)
	for _, query := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('a','ja','A','http://a'),('b','jb','B','http://b')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('ua','a','ju','A'),('ub','b','ju','B')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName","collectionType","size","durationMs","dateAdded") VALUES('film-a','a','shared','Film A','Movie','Films','movies',10,1000,'2026-10-01'),('film-b','b','shared','Film B','Movie','Movies','movies',20,2000,'2026-10-02'),('film-extra','b','extra','Extra','Movie','Autre','movies',99,99000,'2026-10-03'),('album-a','a','album','Album A','MusicAlbum','Musique','music',0,0,'2026-10-01'),('album-b','b','album','Album B','MusicAlbum','Music','music',0,0,'2026-10-02'),('track-a','a','track','Track','Audio','Musique','music',5,500,'2026-10-01'),('ghost-box','a','box','Box','BoxSet','Collections','boxsets',999,99999,'2026-10-01'),('ghost-tv','b','episode','Unwatched orphan','Episode','TV Shows','tvshows',1,1000,'2026-10-01')`,
		`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","durationWatched","playMethod") VALUES('pa','a','ua','film-a',60,'DirectPlay'),('pb','b','ub','film-b',120,'DirectPlay'),('pb2','b','ub','film-b',120,'DirectPlay'),('pt','a','ua','track-a',120,'DirectPlay')`,
	} {
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	h := New(db, "sqlite")
	request := func(path string, handler http.HandlerFunc) map[string]any {
		t.Helper()
		w := httptest.NewRecorder()
		handler(w, httptest.NewRequest("GET", path, nil))
		if w.Code != 200 {
			t.Fatalf("%s: %d %s", path, w.Code, w.Body.String())
		}
		var data map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &data); err != nil {
			t.Fatal(err)
		}
		return data
	}
	result := request("/api/media/collections", h.recoveredMediaCollections)
	groups := result["collections"].([]any)
	if len(groups) != 3 {
		t.Fatalf("aliases should merge across servers and boxsets should be ignored: %+v", result)
	}
	var films, music map[string]any
	for _, raw := range groups {
		group := raw.(map[string]any)
		if group["key"] == "movies" {
			films = group
		}
		if group["key"] == "music" {
			music = group
		}
	}
	if films == nil || films["totalItems"] != float64(2) || films["name"] != "Films" || films["sizeBytes"] != float64(30) {
		t.Fatalf("normalized film group lost server-aware items: %+v", films)
	}
	if films["topItem"].(map[string]any)["id"] != "film-b" || films["lastAdded"].(map[string]any)["id"] != "film-b" {
		t.Fatalf("global top/latest chose wrong server: %+v", films)
	}
	if music == nil || music["albumCount"] != float64(2) || music["trackCount"] != float64(1) || music["totalItems"] != float64(1) || music["name"] != "Musique" {
		t.Fatalf("tracks must replace albums after merging: %+v", music)
	}

	if music["topItem"].(map[string]any)["id"] != "track-a" {
		t.Fatalf("collection leader must retain leaf media: %+v", music)
	}
	scopes, _ := json.Marshal(films["scopes"])
	items := request("/api/media?parents=true&libraryScopes="+url.QueryEscape(string(scopes)), h.recoveredMediaList)["items"].([]any)
	if len(items) != 2 {
		t.Fatalf("merged drilldown included unrelated library: %+v", items)
	}
	scoped := request("/api/media/collections?servers=a", h.recoveredMediaCollections)["collections"].([]any)
	if len(scoped) != 2 {
		t.Fatalf("selected scope ignored: %+v", scoped)
	}
	for _, raw := range scoped {
		for _, scope := range raw.(map[string]any)["scopes"].([]any) {
			if scope.(map[string]any)["serverId"] != "a" {
				t.Fatal("cross-server collection scope")
			}
		}
	}
	scopedItems := request("/api/media?parents=true&servers=a&libraryScopes="+url.QueryEscape(string(scopes)), h.recoveredMediaList)["items"].([]any)
	if len(scopedItems) != 1 || scopedItems[0].(map[string]any)["id"] != "film-a" {
		t.Fatalf("library drilldown widened selected server: %+v", scopedItems)
	}
	invalid := request("/api/media?libraryScopes=malformed", h.recoveredMediaList)
	if invalid["total"] != float64(0) {
		t.Fatalf("invalid scoped filter returned catalogue: %+v", invalid)
	}
}

func TestHistoricalLibraryKeyMatchesMain(t *testing.T) {
	for value, want := range map[string]string{" SérieS-TV ": "tvshows", "Musique": "music", "TV Shows": "tvshows", "Movies UHD": "filmsuhd", "TV-4k": "seriesuhd", "My_Custom-Library": "mycustomlibrary", "ComicBooks": "books", "Photo": "photos"} {
		if got := historicalLibraryKey(value); got != want {
			t.Errorf("%q = %q, want %q", value, got, want)
		}
	}
}

func TestHistoricalCatalogueSortContracts(t *testing.T) {
	db := apiDB(t)
	for _, query := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','js','S','http://s')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s','ju','U')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName","resolution","durationMs") VALUES('direct','s','d','Direct','Movie','Films','720p',9000000),('transcode','s','t','Transcode','Movie','Films','4K',1000000)`,
		`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","durationWatched","playMethod") VALUES('dp','s','u','direct',60,'DirectPlay'),('tr','s','u','transcode',1200,'Transcode')`,
	} {
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	h := New(db, "sqlite")
	for sort, want := range map[string]string{"quality": "direct", "duration": "transcode", "runtime": "direct", "resolution": "transcode"} {
		w := httptest.NewRecorder()
		h.recoveredMediaList(w, httptest.NewRequest("GET", "/api/media?parents=true&sortBy="+sort, nil))
		var data struct {
			Items []struct {
				ID string `json:"id"`
			} `json:"items"`
		}
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &data) != nil || len(data.Items) != 2 || data.Items[0].ID != want {
			t.Fatalf("sort %s: %d %s", sort, w.Code, w.Body.String())
		}
	}
}
