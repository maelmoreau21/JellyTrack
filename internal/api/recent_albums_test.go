package api

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRecentMusicShowsAlbumsWithAggregatedTrackHistory(t *testing.T) {
	db := apiDB(t)
	for _, q := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','js','S','http://s')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s','ju','User')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName","parentId","dateAdded") VALUES('album','s','ja','Album','MusicAlbum','Musiques',NULL,'2026-10-01'),('track','s','jt','Track','Audio','Musiques','ja','2026-10-02'),('book','s','jb','Livre audio','AudioBook','Livres',NULL,'2026-10-03')`,
		`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","durationWatched","playMethod") VALUES('p','s','u','track',120,'DirectPlay')`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	h := New(db, "sqlite")
	w := httptest.NewRecorder()
	h.recoveredMediaList(w, httptest.NewRequest("GET", "/api/media?groupSeries=true&groupAlbums=true&type=music&sortBy=added", nil))
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var result struct {
		Total int
		Items []struct {
			ID    string
			Plays int
		}
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Total != 1 || len(result.Items) != 1 || result.Items[0].ID != "album" || result.Items[0].Plays != 1 {
		t.Fatalf("%+v", result)
	}
	w = httptest.NewRecorder()
	h.recoveredMediaList(w, httptest.NewRequest("GET", "/api/media?type=Audio&sortBy=added", nil))
	if w.Code != 200 || !json.Valid(w.Body.Bytes()) || !containsRecentID(w.Body.Bytes(), "track") {
		t.Fatal("track access lost", w.Body.String())
	}
	w = httptest.NewRecorder()
	h.recoveredMediaList(w, httptest.NewRequest("GET", "/api/media?groupAlbums=true&type=AudioBook&sortBy=added", nil))
	if w.Code != 200 || !containsRecentID(w.Body.Bytes(), "book") {
		t.Fatal("audiobook hidden", w.Body.String())
	}
	if _, err := db.Exec(`UPDATE "Media" SET "libraryName"=NULL WHERE "id"='track'`); err != nil {
		t.Fatal(err)
	}
	w = httptest.NewRecorder()
	h.history(w, httptest.NewRequest("GET", "/api/history?library=Musiques", nil))
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"id":"p"`) {
		t.Fatal("inherited library drilldown failed", w.Code, w.Body.String())
	}
}
func containsRecentID(data []byte, id string) bool {
	var result struct{ Items []struct{ ID string } }
	if json.Unmarshal(data, &result) != nil {
		return false
	}
	for _, item := range result.Items {
		if item.ID == id {
			return true
		}
	}
	return false
}
