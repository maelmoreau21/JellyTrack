package api

import (
	"encoding/json"
	"net/http/httptest"
	"testing"
)

func TestCleanupNavigationKeepsNestedCategoriesAndServerIdentity(t *testing.T) {
	db := apiDB(t)
	for _, query := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s1','s1','One','http://one'),('s2','s2','Two','http://two')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s1','jf-u','User')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","createdAt","durationMs") VALUES('series1','s1','series','Series','Series','2020-01-01 00:00:00',NULL),('series2','s2','series','Series','Series','2020-01-01 00:00:00',NULL),('episode','s1','episode','Episode','Episode','2020-01-01 00:00:00',1000000),('movie','s1','movie','Movie','Movie','2020-01-01 00:00:00',1000000)`,
		`UPDATE "Media" SET "parentId"='series' WHERE "id"='episode'`,
		`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","durationWatched") VALUES('p1','s1','u','episode','DirectPlay',100),('p2','s1','u','episode','DirectPlay',50)`,
	} {
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	w := httptest.NewRecorder()
	New(db, "sqlite").navigationCleanup(w, httptest.NewRequest("GET", "/api/admin/cleanup", nil))
	var result struct {
		Ghosts     []cleanupNavigationMedia `json:"ghostMedia"`
		Abandoned  []cleanupNavigationMedia `json:"abandonedMedia"`
		Duplicates []cleanupNavigationMedia `json:"duplicateMedia"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if w.Code != 200 || len(result.Ghosts) != 2 || len(result.Abandoned) != 1 || len(result.Duplicates) != 2 {
		t.Fatalf("unexpected categories: status=%d %+v", w.Code, result)
	}
	for _, m := range result.Ghosts {
		if m.ID == "series1" {
			t.Fatal("watched child failed to exclude its series")
		}
	}
	if result.Abandoned[0].Completion != 15 || result.Abandoned[0].Title != "Series — Episode" {
		t.Fatalf("cumulative completion/title lost: %+v", result.Abandoned[0])
	}
}

func TestCleanupNavigationRespectsLibraryCompletionRules(t *testing.T) {
	m := &cleanupNavigationMedia{Type: "Audio", Completion: 15}
	if !cleanupAbandoned(m, nil) {
		t.Fatal("music default abandoned threshold lost")
	}
	rules := map[string]json.RawMessage{"libraries": json.RawMessage(`{"music":{"completionEnabled":false}}`)}
	if cleanupAbandoned(m, rules) {
		t.Fatal("disabled completion rule ignored")
	}
	rules["libraries"] = json.RawMessage(`{"music":{"partialThreshold":14,"abandonedThreshold":10}}`)
	if cleanupAbandoned(m, rules) {
		t.Fatal("custom partial threshold ignored")
	}
}

func TestCleanupNavigationDuplicatesExcludeMusicAlbums(t *testing.T) {
	db := apiDB(t)
	for _, query := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s1','s1','One','http://one')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type") VALUES('a1','s1','a1','Shared title','MusicAlbum'),('a2','s1','a2','Shared title','MusicAlbum'),('m1','s1','m1','Shared title','Movie'),('m2','s1','m2','Shared title','Movie')`,
	} {
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	w := httptest.NewRecorder()
	New(db, "sqlite").navigationCleanup(w, httptest.NewRequest("GET", "/api/admin/cleanup", nil))
	var result struct {
		Duplicates []cleanupNavigationMedia `json:"duplicateMedia"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if w.Code != 200 || len(result.Duplicates) != 2 {
		t.Fatalf("unexpected duplicate category: %d %+v", w.Code, result)
	}
	for _, m := range result.Duplicates {
		if m.Type != "Movie" {
			t.Fatalf("historically excluded album listed: %+v", m)
		}
	}
}
