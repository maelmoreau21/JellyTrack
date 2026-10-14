package api

import (
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestProgressivePopularAlbumAndLibraries(t *testing.T) {
	db := apiDB(t)
	plays, events := 3000, 1500
	if os.Getenv("JELLYTRACK_MEDIA_SCALE_QA") == "true" {
		plays, events = 100000, 15000
	}
	for _, query := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','js','Server','http://fixture')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s','ju','Listener')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName","durationMs") VALUES('album','s','ja','Popular Album','MusicAlbum','Music',1200000)`,
		`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<10) INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName","parentId","durationMs","size") SELECT 'track'||x,'s','jt'||x,'Track '||x,'Audio','Music','ja',120000,2400000 FROM n`,
		fmt.Sprintf(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<%d) INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","durationWatched","pauseCount","seekCount") SELECT 'p'||x,'s','u','track'||((x%%10)+1),'DirectPlay',120,1,1 FROM n`, plays),
		fmt.Sprintf(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<%d) INSERT INTO "TelemetryEvent"("id","serverId","playbackId","eventType","positionMs","metadata") SELECT 'e'||x,'s','p'||x,'seek',10000,'{"fromMs":5000,"toMs":10000}' FROM n`, events),
	} {
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	h := New(db, "sqlite")
	read := func(path string, collections bool) (map[string]any, int) {
		r := httptest.NewRequest("GET", path, nil)
		r.SetPathValue("id", "album")
		w := httptest.NewRecorder()
		start := time.Now()
		if strings.Contains(path, "media-metadata") {
			h.recoveredMediaMetadata(w, r)
		} else if collections {
			h.recoveredMediaCollections(w, r)
		} else {
			h.recoveredMediaDetail(w, r)
		}
		t.Logf("%s: %s, %d bytes", path, time.Since(start), w.Body.Len())
		if w.Code != 200 {
			t.Fatalf("%d %s", w.Code, w.Body.String())
		}
		var result map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		return result, w.Body.Len()
	}
	heading, _ := read("/api/media-metadata/album?part=header", false)
	if heading["title"] != "Popular Album" {
		t.Fatal("local title lost")
	}
	if _, found := heading["plays"]; found {
		t.Fatal("header unnecessarily queries history")
	}
	full, fullBytes := read("/api/media/album", false)
	overview, overviewBytes := read("/api/media/album?part=overview", false)
	for _, key := range []string{"id", "title", "type", "children", "hierarchy", "plays", "totalPlays", "totalDurationMs", "pauseCount", "seekCount"} {
		if !reflect.DeepEqual(full[key], overview[key]) {
			t.Fatalf("summary differs for %s", key)
		}
	}
	if overview["totalPlays"] != float64(plays) || len(overview["children"].([]any)) != 10 {
		t.Fatal("popular album counts lost")
	}
	for _, key := range []string{"history", "telemetry", "behavior", "counterTimeline", "viewers"} {
		if _, found := overview[key]; found {
			t.Fatalf("heavy %s loaded before first paint", key)
		}
	}
	if overviewBytes >= fullBytes/4 {
		t.Fatalf("first response is not substantially smaller: %d vs %d", overviewBytes, fullBytes)
	}
	librariesFull, _ := read("/api/media/collections", true)
	librariesOverview, _ := read("/api/media/collections?part=overview", true)
	if !reflect.DeepEqual(librariesFull["totals"], librariesOverview["totals"]) {
		t.Fatal("library totals differ")
	}
	a, b := librariesFull["collections"].([]any), librariesOverview["collections"].([]any)
	if len(a) != len(b) {
		t.Fatal("library groups differ")
	}
	for i := range a {
		x, y := a[i].(map[string]any), b[i].(map[string]any)
		for _, key := range []string{"key", "scopes", "types", "totalItems", "sizeBytes", "durationMs", "albumCount", "trackCount"} {
			if !reflect.DeepEqual(x[key], y[key]) {
				t.Fatalf("library %s changed", key)
			}
		}
		if _, found := y["topItem"]; found {
			t.Fatal("ranking loaded before library first paint")
		}
	}
}
