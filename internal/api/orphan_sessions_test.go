package api

import (
	"encoding/json"
	"net/http/httptest"
	"testing"
)

func TestHealthOrphansIdentifyExactPlaybackAndServer(t *testing.T) {
	db := apiDB(t)
	for _, query := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s1','jf1','One','http://one'),('s2','jf2','Two','http://two')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s1','ju','Alice')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type") VALUES('m','s1','jm','Movie','Movie')`,
		`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod") VALUES('current','s1','u','m','DirectPlay'),('old','s1','u','m','DirectPlay'),('other-server','s2','u','m','DirectPlay')`,
		`INSERT INTO "ActiveStream"("id","serverId","sessionId","userId","mediaId","playbackId","playMethod") VALUES('a','s1','session','u','m','current','DirectPlay')`,
	} {
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	w := httptest.NewRecorder()
	New(db, "sqlite").recoveredAdminHealth(w, httptest.NewRequest("GET", "/api/admin/health", nil))
	var result struct {
		Counts struct {
			Orphans int `json:"openPlaybackOrphans"`
		} `json:"counts"`
		Orphans []struct {
			ID string `json:"id"`
		} `json:"orphanPlaybacks"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if w.Code != 200 || result.Counts.Orphans != 2 || len(result.Orphans) != 2 {
		t.Fatalf("count and list must identify old and other-server rows: %d %s", w.Code, w.Body)
	}
	for _, orphan := range result.Orphans {
		if orphan.ID == "current" {
			t.Fatal("active playback reported as orphan")
		}
	}
	// Legacy streams without a playback link still cover their own user/media,
	// but never conceal unclosed rows belonging to another server.
	if _, err := db.Exec(`UPDATE "ActiveStream" SET "playbackId"=NULL`); err != nil {
		t.Fatal(err)
	}
	w = httptest.NewRecorder()
	New(db, "sqlite").recoveredAdminHealth(w, httptest.NewRequest("GET", "/api/admin/health", nil))
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if w.Code != 200 || result.Counts.Orphans != 1 || len(result.Orphans) != 1 || result.Orphans[0].ID != "other-server" {
		t.Fatalf("legacy stream server scope: %d %s", w.Code, w.Body)
	}
}
