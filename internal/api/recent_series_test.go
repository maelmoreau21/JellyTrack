package api

import (
	"encoding/json"
	"net/http/httptest"
	"testing"
)

func TestRecentSeriesGroupingPreservesScopedTotalsAndPagination(t *testing.T) {
	db := apiDB(t)
	for _, q := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('a','ja','A','http://a'),('b','jb','B','http://b')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','a','ju','User')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName","parentId","dateAdded") VALUES('series','a','js','Series','Series','TV',NULL,'2026-10-01'),('season','a','jseason','Season','Season','TV','js','2026-10-02'),('episode','a','je','Episode','Episode','TV','jseason','2026-10-03'),('movie','a','jm','Movie','Movie','Films',NULL,'2026-10-04'),('other','b','js','Other','Series','TV',NULL,'2026-10-05')`,
		`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","durationWatched","playMethod") VALUES('play','a','u','episode',120,'DirectPlay')`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	h := New(db, "sqlite")
	for _, test := range []struct {
		query string
		total int
		id    string
		plays int
	}{
		{"groupSeries=true&sortBy=added&servers=a&limit=1", 2, "movie", 0},
		{"groupSeries=true&sortBy=added&servers=a&limit=1&page=2", 2, "series", 1},
		{"groupSeries=true&sortBy=added&servers=a&type=Series&limit=1", 1, "series", 1},
		{"sortBy=added&servers=a&type=Episode&limit=1", 1, "episode", 1},
	} {
		w := httptest.NewRecorder()
		h.recoveredMediaList(w, httptest.NewRequest("GET", "/api/media?"+test.query, nil))
		if w.Code != 200 {
			t.Fatalf("%s: %d %s", test.query, w.Code, w.Body.String())
		}
		var result struct {
			Total int `json:"total"`
			Items []struct {
				ID    string `json:"id"`
				Plays int    `json:"plays"`
			} `json:"items"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		if result.Total != test.total || len(result.Items) != 1 || result.Items[0].ID != test.id || result.Items[0].Plays != test.plays {
			t.Fatalf("%s: %+v", test.query, result)
		}
	}
}
