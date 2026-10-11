package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"testing"
	"time"
)

func TestCataloguePageWithThousandsOfItemsKeepsRealCounts(t *testing.T) {
	for _, hierarchy := range []bool{false, true} {
		t.Run(fmt.Sprint(hierarchy), func(t *testing.T) { testCatalogueScale(t, hierarchy) })
	}
}

func testCatalogueScale(t *testing.T, hierarchy bool) {
	db := apiDB(t)
	for _, q := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','jf','Test','http://test')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s','jf-u','Test')`,
		`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<3000) INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName","durationMs") SELECT 'm'||x,'s','jf-m'||x,'Movie '||x,'Movie','Movies',7200000 FROM n`,
		`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","durationWatched") SELECT 'p'||"id",'s','u',"id",'DirectPlay',600 FROM "Media"`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	if hierarchy {
		for _, q := range []string{
			`UPDATE "Media" SET "type"='Series'`,
			`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName","parentId") SELECT 'season-'||"id",'s','jf-season-'||"id",'Season','Season','Series',"jellyfinMediaId" FROM "Media" WHERE "type"='Series'`,
			`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName","parentId") SELECT 'episode-'||"id",'s','jf-episode-'||"id",'Episode','Episode','Series',"id" FROM "Media" WHERE "type"='Season'`,
			`UPDATE "PlaybackHistory" SET "mediaId"='episode-season-'||"mediaId"`,
		} {
			if _, err := db.Exec(q); err != nil {
				t.Fatal(err)
			}
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	r := httptest.NewRequest("GET", "/api/media?parents=true&sortBy=added&limit=40", nil).WithContext(ctx)
	w := httptest.NewRecorder()
	start := time.Now()
	New(db, "sqlite").recoveredMediaList(w, r)
	t.Logf("3,000 catalogue titles / 3,000 playbacks: %s", time.Since(start))
	if w.Code != 200 {
		t.Fatalf("status %d: %s", w.Code, w.Body.String())
	}
	var result struct {
		Total int
		Items []struct {
			Plays       int
			WatchTimeMS int64 `json:"watchTimeMs"`
		}
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Total != 3000 || len(result.Items) != 40 {
		t.Fatalf("total=%d items=%d", result.Total, len(result.Items))
	}
	for _, item := range result.Items {
		if item.Plays != 1 || item.WatchTimeMS != 600000 {
			t.Fatalf("lost aggregates: %+v", item)
		}
	}
	cleanup := httptest.NewRecorder()
	if _, err := db.Exec(`UPDATE "Media" SET "createdAt"='2020-01-01 00:00:00',"dateAdded"='2020-01-01 00:00:00'`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName","createdAt","dateAdded") VALUES('unplayed','s','jf-unplayed','Unplayed','Movie','Movies','2020-01-01 00:00:00','2020-01-01 00:00:00')`); err != nil {
		t.Fatal(err)
	}
	start = time.Now()
	New(db, "sqlite").recoveredCleanup(cleanup, httptest.NewRequest("GET", "/api/admin/cleanup", nil).WithContext(ctx))
	t.Logf("cleanup same catalogue: %s", time.Since(start))
	if cleanup.Code != 200 {
		t.Fatalf("cleanup %d: %s", cleanup.Code, cleanup.Body.String())
	}
	var candidates struct {
		Ghosts []recoveredMedia `json:"ghostMedia"`
	}
	if err := json.Unmarshal(cleanup.Body.Bytes(), &candidates); err != nil {
		t.Fatal(err)
	}
	if len(candidates.Ghosts) != 1 || candidates.Ghosts[0].ID != "unplayed" {
		t.Fatalf("played parents marked ghost: %d", len(candidates.Ghosts))
	}
}
