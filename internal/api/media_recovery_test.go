package api

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/maelmoreau21/jellytrack/internal/auth"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestHistoricalPopularTracksSeriesPeopleAndCollectionCounts(t *testing.T) {
	db := apiDB(t)
	for _, query := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('a','ja','A','http://a'),('b','jb','B','http://b')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','a','ju','User')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName","parentId","actors","directors","studios","collectionType","size") VALUES('series','a','js','Series','Series','TV',NULL,'["Series Actor"]','["Series Director"]','["Series Studio"]',NULL,0),('season','a','jseason','Season','Season','TV','js','[]','[]','[]',NULL,0),('episode','a','je','Episode','Episode','TV','jseason','[]','[]','[]',NULL,100),('album','a','jalbum','Album','MusicAlbum','Music',NULL,'[]','[]','[]',NULL,0),('cross-server','b','js','Other Series','Series','TV',NULL,'["Other Actor"]','[]','[]',NULL,0),('null-library','a','jn','Unassigned','Movie',NULL,NULL,'[]','[]','[]',NULL,1000),('empty-library','a','jem','Empty library','Movie','',NULL,'[]','[]','[]',NULL,1000),('boxset','a','jb','Boxset','BoxSet','Collections',NULL,'[]','[]','[]','boxsets',1000)`,
		`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","durationWatched") VALUES('episode-play','a','u','episode','DirectPlay',300)`,
	} {
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	for i := 1; i <= 6; i++ {
		id := fmt.Sprintf("track%d", i)
		if _, err := db.Exec(`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName","parentId","size","durationMs") VALUES(?,'a',?,?,'Audio','Music','jalbum',10,120000)`, id, "j"+id, id); err != nil {
			t.Fatal(err)
		}
		for play := 0; play < 7-i; play++ {
			if _, err := db.Exec(`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","durationWatched") VALUES(?,'a','u',?,'DirectPlay',120)`, fmt.Sprintf("%s-p%d", id, play), id); err != nil {
				t.Fatal(err)
			}
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
		var result map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		return result
	}
	popular := request("/api/media/popular?servers=a", h.recoveredMediaPopular)
	tracks := popular["music"].([]any)
	if len(tracks) != 5 || tracks[0].(map[string]any)["id"] != "track1" || tracks[0].(map[string]any)["plays"] != float64(6) {
		t.Fatalf("historical top-five tracks lost: %+v", popular)
	}
	if len(popular["musicAlbums"].([]any)) != 1 {
		t.Fatalf("Go album ranking lost: %+v", popular)
	}
	for _, key := range []string{"actors", "directors", "studios"} {
		people := popular[key].([]any)
		if len(people) != 1 || people[0].(map[string]any)["plays"] != float64(1) || !strings.HasPrefix(people[0].(map[string]any)["name"].(string), "Series ") {
			t.Fatalf("Series metadata missing or cross-server leakage: %s %+v", key, people)
		}
	}
	collections := request("/api/media/collections?servers=a", h.recoveredMediaCollections)
	groups := collections["collections"].([]any)
	if len(groups) != 2 || collections["totals"].(map[string]any)["items"] != float64(7) || collections["totals"].(map[string]any)["sizeBytes"] != float64(160) {
		t.Fatalf("ghost libraries or incorrect music count: %+v", collections)
	}
	for _, item := range groups {
		group := item.(map[string]any)
		if group["name"] == "Music" && (group["totalItems"] != float64(6) || group["albumCount"] != float64(1) || group["trackCount"] != float64(6) || len(group["ignoredCounts"].([]any)) != 1) {
			t.Fatalf("historical music count or Go child breakdown lost: %+v", group)
		}
	}
}

func TestMediaRecoveryFamiliesScopesFiltersAndPagination(t *testing.T) {
	db := apiDB(t)
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"Id":"ju","Policy":{"EnableAllFolders":true}}`)
	}))
	defer provider.Close()
	for _, q := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('a','ja','A','http://a'),('b','jb','B','http://b')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','a','ju','User'),('other','a','jo','Other'),('ub','b','ju','User B')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName","parentId","genres","resolution","durationMs","size","artist","directors","studios","dateAdded") VALUES('series','a','js','Series','Series','TV',NULL,'["Drama"]',NULL,NULL,NULL,NULL,'[]','[]','2026-10-01'),('season','a','seasonjf','Season 1','Season','TV','js','[]',NULL,NULL,NULL,NULL,'[]','[]',NULL),('episode','a','je','Episode 1','Episode','TV','seasonjf','["Drama"]','1080p',1200000,1000,NULL,'["Director"]','["Studio"]','2026-10-02'),('movie','a','shared','Movie','Movie','Films',NULL,'["Comedy"]','4K',3600000,5000,NULL,'["Director"]','["Studio"]','2026-10-03'),('samejf','b','shared','Other server film','Movie','Films',NULL,'[]','720p',1000000,7000,NULL,'[]','[]','2026-10-04'),('album','a','jalbum','Album','MusicAlbum','Music',NULL,'["Rock"]',NULL,NULL,NULL,'Artist','[]','[]','2026-10-04'),('track','a','jtrack','Track','Audio','Music','jalbum','["Rock"]',NULL,180000,1000,'Artist','[]','[]','2026-10-04')`,
		`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","durationWatched","startedAt","endedAt","pauseCount","audioLanguage","audioCodec") VALUES('p1','a','u','episode','DirectPlay',600,'2026-10-01T10:00:00Z','2026-10-01T10:10:00Z',2,'fre','aac'),('p2','a','other','episode','Transcode',1200,'2026-10-02T10:00:00Z','2026-10-02T10:20:00Z',1,'eng','aac'),('zap','a','u','episode','DirectPlay',10,'2026-10-02T11:00:00Z','2026-10-02T11:00:10Z',0,NULL,NULL),('music','a','u','track','DirectPlay',120,'2026-10-02T10:00:00Z','2026-10-02T10:02:00Z',0,NULL,NULL),('film','a','u','movie','DirectPlay',1200,'2026-10-02T10:00:00Z','2026-10-02T10:20:00Z',0,NULL,NULL)`,
		`INSERT INTO "TelemetryEvent"("id","serverId","playbackId","eventType","positionMs","metadata") VALUES('e','a','p1','seek',5000,'{"fromMs":5000,"toMs":10000}'),('secret','a','p2','pause',2000,NULL)`,
	} {
		if _, e := db.Exec(q); e != nil {
			t.Fatal(e)
		}
	}
	if _, err := db.Exec(`UPDATE "Server" SET "url"=?,"jellyfinApiKey"='test-key' WHERE "id"='a'`, provider.URL); err != nil {
		t.Fatal(err)
	}
	h := New(db, "sqlite")
	request := func(path, id string, fn http.HandlerFunc, user bool) map[string]any {
		t.Helper()
		r := httptest.NewRequest("GET", path, nil)
		if id != "" {
			r.SetPathValue("id", id)
			r.SetPathValue("name", id)
		}
		p := auth.Principal{Role: "admin"}
		if user {
			p = auth.Principal{Role: "user", Username: "User", JellyfinUserID: "ju", AuthServerID: "a", IdentityVersion: 1}
		}
		r = r.WithContext(context.WithValue(r.Context(), auth.PrincipalContextKey, p))
		w := httptest.NewRecorder()
		fn(w, r)
		if w.Code != 200 {
			t.Fatalf("%s: %d %s", path, w.Code, w.Body.String())
		}
		var out map[string]any
		if e := json.Unmarshal(w.Body.Bytes(), &out); e != nil {
			t.Fatal(e)
		}
		return out
	}
	out := request("/api/media?parents=true&servers=a&sortBy=plays&limit=1&page=200", "", h.recoveredMediaList, false)
	if out["total"] != float64(3) || out["offset"] != float64(2) {
		t.Fatalf("paging: %+v", out)
	}
	out = request("/api/media?parents=true&servers=a&genre=Drama&resolution=1080p", "", h.recoveredMediaList, false)
	items := out["items"].([]any)
	if len(items) != 1 || items[0].(map[string]any)["plays"] != float64(2) || items[0].(map[string]any)["watchTimeMs"] != float64(1800000) {
		t.Fatalf("descendants: %+v", out)
	}
	out = request("/api/media?parents=true&servers=a&q=Studio", "", h.recoveredMediaList, false)
	if out["total"] != float64(1) {
		t.Fatalf("studio search: %+v", out)
	}
	detail := request("/api/media/series?servers=a", "series", h.recoveredMediaDetail, true)
	if detail["totalPlays"] != float64(1) || detail["totalDurationMs"] != float64(600000) || len(detail["viewers"].([]any)) != 1 || len(detail["telemetry"].([]any)) != 1 || detail["pauseCount"] != float64(2) {
		t.Fatalf("user scope: %+v", detail)
	}
	episode := request("/api/media/episode?servers=a", "episode", h.recoveredMediaDetail, false)
	if len(episode["hierarchy"].([]any)) != 2 {
		t.Fatalf("breadcrumb: %+v", episode)
	}
	r := httptest.NewRequest("GET", "/api/media/shared", nil)
	r.SetPathValue("id", "shared")
	w := httptest.NewRecorder()
	h.recoveredMediaDetail(w, r)
	if w.Code != 409 {
		t.Fatalf("collision accepted: %d %s", w.Code, w.Body.String())
	}
	collections := request("/api/media/collections?servers=a", "", h.recoveredMediaCollections, false)
	totals := collections["totals"].(map[string]any)
	if totals["items"] != float64(3) || totals["sizeBytes"] != float64(7000) || totals["durationMs"] != float64(4980000) {
		t.Fatalf("collection totals: %+v", collections)
	}
	artist := request("/api/media/artist/Artist?servers=a", "Artist", h.recoveredMediaArtist, true)
	if len(artist["albums"].([]any)) != 1 || len(artist["tracks"].([]any)) != 1 || artist["stats"].(map[string]any)["plays"] != float64(1) {
		t.Fatalf("artist: %+v", artist)
	}
	popular := request("/api/media/popular?servers=a", "", h.recoveredMediaPopular, true)
	if len(popular["series"].([]any)) != 1 || popular["series"].([]any)[0].(map[string]any)["plays"] != float64(1) {
		t.Fatalf("popular: %+v", popular)
	}
	analysis := request("/api/media/analysis?servers=a", "", h.recoveredMediaAnalysis, false)
	if analysis["totalMedia"] != float64(3) || analysis["uniqueGenres"] != float64(3) {
		t.Fatalf("analysis: %+v", analysis)
	}
	if _, err := db.Exec(`INSERT INTO "PlaybackHistory"("id","serverId","mediaId","playMethod","durationWatched","startedAt","endedAt","pauseCount") VALUES('anonymous','a','movie','DirectPlay',1200,'2026-10-03T10:00:00Z','2026-10-03T10:20:00Z',3)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "TelemetryEvent"("id","serverId","playbackId","eventType","positionMs") VALUES('anonymous-event','a','anonymous','pause',5000)`); err != nil {
		t.Fatal(err)
	}
	anonymous := request("/api/media/movie?servers=a", "movie", h.recoveredMediaDetail, false)
	if anonymous["totalPlays"] != float64(2) || anonymous["pauseCount"] != float64(3) || len(anonymous["telemetry"].([]any)) != 1 || len(anonymous["history"].([]any)) != 2 {
		t.Fatalf("anonymous session dropped: %+v", anonymous)
	}
}

func TestMediaRecoveryBingeRequiresActualRunsAndNoFakeSuggestions(t *testing.T) {
	now := time.Now().UTC()
	makeSession := func(offset time.Duration, series string) map[string]any {
		return map[string]any{"id": "p", "userId": "u", "username": "User", "startedAt": now.Add(offset).Format(time.RFC3339Nano), "durationWatched": int64(1200), "type": "Episode", "genres": []string{"Drama"}, "artist": nil, "seriesId": series, "seriesTitle": "Series"}
	}
	binge, taste := recoveredMediaInsights([]map[string]any{makeSession(0, "s"), makeSession(25*time.Minute, "s"), makeSession(50*time.Minute, "s"), makeSession(3*time.Hour, "s"), makeSession(4*time.Hour, "s")})
	if binge["totalBingeSessionsMonth"] != 1 || len(taste["acquisitionSuggestions"].([]map[string]any)) != 1 {
		t.Fatalf("insights %+v %+v", binge, taste)
	}
	emptyBinge, emptyTaste := recoveredMediaInsights(nil)
	if emptyBinge["totalBingeSessionsMonth"] != 0 || len(emptyTaste["acquisitionSuggestions"].([]map[string]any)) != 0 {
		t.Fatal("empty inputs fabricate suggestions")
	}
}

func TestAcquisitionSuggestionsPreserveHistoricalHeuristicsAndMeasuredDemand(t *testing.T) {
	genre := map[string]any{"kind": "genre", "name": "Drama", "hours": 2.0, "percentage": 20.0, "plays": 4.0}
	dominant := recoveredAcquisitionSuggestion(genre, 0, 10)
	if dominant["scorePercent"] != float64(70) || dominant["category"] != "Genre Dominant" || dominant["title"] != "Enrichir la collection Drama" || dominant["scoreKind"] != "historical_heuristic" || genre["scorePercent"] != nil {
		t.Fatalf("dominant score fields or immutable demand lost: %+v %+v", dominant, genre)
	}
	trend := recoveredAcquisitionSuggestion(genre, 1, 10)
	if trend["scorePercent"] != float64(50) || trend["badge"] != "Tendance Forte" {
		t.Fatalf("trend score: %+v", trend)
	}
	genre["hours"] = 10.0
	if recoveredAcquisitionSuggestion(genre, 0, 10)["scorePercent"] != float64(99) || recoveredAcquisitionSuggestion(genre, 1, 10)["scorePercent"] != float64(85) {
		t.Fatal("historical score maximums lost")
	}
	artist := recoveredAcquisitionSuggestion(map[string]any{"kind": "artist", "name": "Artist", "hours": 1.2, "plays": 3.0}, 0, 10)
	if artist["scorePercent"] != 92 || artist["badge"] != "Favori Utilisateurs" {
		t.Fatalf("artist heuristic lost: %+v", artist)
	}
	_, taste := recoveredMediaInsights([]map[string]any{{"durationWatched": int64(3600), "type": "Movie", "genres": []string{"Drama"}, "artist": "Artist"}})
	suggestions := taste["acquisitionSuggestions"].([]map[string]any)
	demand := taste["demandSuggestions"].([]map[string]any)
	if len(suggestions) != 2 || len(demand) != 2 || suggestions[0]["scoreKind"] != "historical_heuristic" || demand[0]["scorePercent"] != nil || demand[0]["hours"] != float64(1) {
		t.Fatalf("Go measured demand lost: %+v", taste)
	}
	_, empty := recoveredMediaInsights(nil)
	if len(empty["acquisitionSuggestions"].([]map[string]any)) != 0 || len(empty["demandSuggestions"].([]map[string]any)) != 0 {
		t.Fatal("empty state fabricates recommendations")
	}
}

func TestMediaRecoveryRealMetadataWhitelistAndSafeServerOptions(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/Items/jf" || r.Header.Get("X-MediaBrowser-Token") != "secret-key" {
			t.Errorf("unexpected metadata request: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"Name":"Film","Overview":"Real overview","ProductionYear":2026,"ImageTags":{"Logo":"tag"},"BackdropImageTags":["tag"],"IntroStartPositionTicks":20000000,"People":[{"Id":"person","Name":"Actor","Role":"Role","PrimaryImageTag":"tag"}],"MediaSources":[{"Id":"v1","Name":"Edition","Path":"/secret/server/path","Container":"mkv","Size":1234,"MediaStreams":[{"Type":"Audio","Codec":"aac"},{"Type":"Video","Codec":"h264"}]},{"Id":"v2","Name":"Version 2"}]}`))
	}))
	defer server.Close()
	db := apiDB(t)
	if _, e := db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url","jellyfinApiKey") VALUES('s','jfs','Server',?,'secret-key')`, server.URL); e != nil {
		t.Fatal(e)
	}
	if _, e := db.Exec(`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","directors","genres") VALUES('m','s','jf','Film','Movie','["R\u00e9alisateur"]','["Com\u00e9die"]')`); e != nil {
		t.Fatal(e)
	}
	h := New(db, "sqlite")
	r := httptest.NewRequest("GET", "/api/media/m?metadata=true", nil)
	r.SetPathValue("id", "m")
	w := httptest.NewRecorder()
	h.recoveredMediaDetail(w, r)
	var data map[string]any
	if e := json.Unmarshal(w.Body.Bytes(), &data); e != nil {
		t.Fatal(e)
	}
	if w.Code != 200 || data["overview"] != "Real overview" || data["hasLogo"] != true || data["hasBackdrop"] != true || len(data["people"].([]any)) != 1 || len(data["versions"].([]any)) != 2 || len(data["markers"].([]any)) != 1 {
		t.Fatalf("real metadata failed: %d %s", w.Code, w.Body.String())
	}
	if strings.Contains(w.Body.String(), "secret-key") || strings.Contains(w.Body.String(), "secret/server/path") {
		t.Fatal("private metadata leaked")
	}
	w = httptest.NewRecorder()
	h.recoveredMediaServerOptions(w, httptest.NewRequest("GET", "/api/media/server-options", nil))
	if strings.Contains(w.Body.String(), "secret-key") || strings.Contains(w.Body.String(), server.URL) {
		t.Fatal("server options leak connection settings")
	}
	for _, query := range []string{"/api/media?q=R%C3%A9alisateur", "/api/media?genre=Com%C3%A9die"} {
		w = httptest.NewRecorder()
		h.recoveredMediaList(w, httptest.NewRequest("GET", query, nil))
		if w.Code != 200 || !strings.Contains(w.Body.String(), `"total":1`) {
			t.Fatalf("encoded JSON strings not searched: %s %d %s", query, w.Code, w.Body.String())
		}
	}
}
