package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCatalogueDeepStatsCountsTitlesNotPlaybacksAndScopesServers(t *testing.T) {
	db := apiDB(t)
	for _, query := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','jf','Server','http://server'),('other','otherjf','Other','http://other')`,
		`INSERT INTO "GlobalSettings"("id","excludedLibraries") VALUES('global','["Hidden"]')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName","directors","actors","studios") VALUES('movie','s','moviejf','Movie','Movie','Films','["Shared"]','["Actor"]','["Studio"]'),('series','s','seriesjf','Series','Series','TV','["Series Director"]','["Actor"]','["Studio"]'),('episode','s','episodejf','Episode','Episode','TV','["Episode Director"]','["Episode Actor"]','["Episode Studio"]'),('hidden','s','hiddenjf','Hidden','Movie','Hidden','["Hidden Director"]','["Hidden Actor"]','["Hidden Studio"]'),('foreign','other','moviejf','Foreign','Movie','Films','["Shared"]','["Foreign Actor"]','["Foreign Studio"]')`,
		`INSERT INTO "PlaybackHistory"("id","serverId","mediaId","playMethod","durationWatched","startedAt","endedAt") VALUES('p1','s','movie','DirectPlay',120,'2026-10-10T12:00:00Z','2026-10-10T12:02:00Z'),('p2','s','movie','DirectPlay',120,'2026-10-10T12:03:00Z','2026-10-10T12:05:00Z')`,
	} {
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	h := New(db, "sqlite")
	call := func(query, cookie string) map[string][]catalogueCreditCount {
		t.Helper()
		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", "/api/stats/deep?catalogue=true&"+query, nil)
		if cookie != "" {
			r.AddCookie(&http.Cookie{Name: "jellytrack_server_scope", Value: cookie})
		}
		h.deepStats(w, r)
		if w.Code != 200 {
			t.Fatalf("catalogue %d: %s", w.Code, w.Body.String())
		}
		var result map[string][]catalogueCreditCount
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		return result
	}
	for _, tc := range []struct{ query, cookie string }{{"servers=s", ""}, {"serverId=s", ""}, {"", "s"}, {"servers=s&timeRange=custom", ""}} {
		result := call(tc.query, tc.cookie)
		if len(result) != 3 || len(result["topDirectors"]) != 2 || len(result["topActors"]) != 1 || result["topActors"][0] != (catalogueCreditCount{Name: "Actor", Count: 2}) || result["topStudios"][0].Count != 2 {
			t.Fatalf("scoped catalogue titles, including unwatched series: %+v", result)
		}
		for _, credit := range result["topDirectors"] {
			if credit.Count != 1 {
				t.Fatalf("two playbacks multiplied a title: %+v", result)
			}
		}
	}
	result := call("servers=s,other", "")
	if result["topDirectors"][0] != (catalogueCreditCount{Name: "Shared", Count: 2}) {
		t.Fatalf("multi-server catalogue: %+v", result)
	}
	result = call("servers=missing", "")
	for key, values := range result {
		if values == nil || len(values) != 0 {
			t.Fatalf("empty scope %s: %+v", key, values)
		}
	}
	// The existing dashboard mode still counts the two watched sessions and
	// retains its additional chart fields. Catalogue ignores playback dates.
	w := httptest.NewRecorder()
	h.deepStats(w, httptest.NewRequest("GET", "/api/stats/deep?timeRange=all&servers=s", nil))
	var dashboard map[string]json.RawMessage
	if err := json.Unmarshal(w.Body.Bytes(), &dashboard); err != nil || w.Code != 200 {
		t.Fatalf("dashboard %d: %s %v", w.Code, w.Body.String(), err)
	}
	var directors []catalogueCreditCount
	if err := json.Unmarshal(dashboard["topDirectors"], &directors); err != nil || len(directors) != 1 || directors[0].Count != 2 || dashboard["audioChartData"] == nil {
		t.Fatalf("existing dashboard contract changed: %s %v", w.Body.String(), err)
	}
}

func TestCatalogueDeepStatsLimitsCreditsWithoutInventingEmptyMetadata(t *testing.T) {
	db := apiDB(t)
	if _, err := db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','jf','Server','http://server')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","directors") VALUES('m','s','jm','Film','Movie','["L","K","J","I","H","G","F","E","D","C","B","A"]')`); err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	New(db, "sqlite").deepStats(w, httptest.NewRequest("GET", "/api/stats/deep?catalogue=true", nil))
	var result map[string][]catalogueCreditCount
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil || w.Code != 200 {
		t.Fatalf("credits %d: %s %v", w.Code, w.Body.String(), err)
	}
	if len(result["topDirectors"]) != 10 || result["topDirectors"][0].Name != "A" || result["topDirectors"][9].Name != "J" || len(result["topActors"]) != 0 || result["topActors"] == nil || len(result["topStudios"]) != 0 || result["topStudios"] == nil {
		t.Fatalf("top ten and unknown metadata: %+v", result)
	}
}
