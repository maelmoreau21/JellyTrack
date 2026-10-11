package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestAlbumDetailLargeLibrary(t *testing.T) {
	db := apiDB(t)
	for _, q := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','js','S','http://s'),('other','jo','Other','http://o')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s','ju','U')`,
		`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<1000) INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName") SELECT 'album'||x,'s','ja'||x,'Album '||x,'MusicAlbum','Music' FROM n`,
		`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<6000) INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName","parentId","durationMs","size") SELECT 'track'||x,'s','jt'||x,'Track '||x,'Audio','Music',CASE WHEN x%2=0 THEN 'album' ELSE 'ja' END||CAST((x+5)/6 AS INTEGER),120000,2400000 FROM n`,
		`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","durationWatched") SELECT 'p'||"id",'s','u',"id",'DirectPlay',120 FROM "Media" WHERE "type"='Audio'`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","parentId") VALUES('foreign','other','foreign','Other track','Audio','ja1')`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	h := New(db, "sqlite")
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	r := httptest.NewRequest("GET", "/api/media/album1?servers=s", nil).WithContext(ctx)
	r.SetPathValue("id", "album1")
	// Compare identical aggregate queries on the same library, retaining both ID forms.
	base, args, err := h.recoveredMediaBase(r)
	if err != nil {
		t.Fatal(err)
	}
	edgeStart := strings.Index(base, `edges("parent","child")`)
	edgeEnd := strings.Index(base, `, valid AS`)
	old := base[:edgeStart] + `family("root","member") AS (SELECT "id","id" FROM catalog UNION SELECT f."root",c."id" FROM family f JOIN catalog p ON p."id"=f."member" JOIN catalog c ON c."serverId"=p."serverId" AND (c."parentId"=p."id" OR c."parentId"=p."jellyfinMediaId"))` + base[edgeEnd:]
	for _, variant := range []struct{ name, base string }{{"previous recursion", old}, {"indexed edges", base}} {
		start := time.Now()
		rows, err := h.recoveredRows(r, variant.base+`SELECT "plays","watchTimeMs" FROM agg WHERE "root"='album1'`, args...)
		if err != nil {
			t.Fatal(err)
		}
		t.Logf("%s: %s", variant.name, time.Since(start))
		if len(rows) != 1 || mediaNumber(rows[0]["plays"]) != 6 {
			t.Fatalf("lost album aggregates: %v", rows)
		}
	}
	w := httptest.NewRecorder()
	start := time.Now()
	h.recoveredMediaDetail(w, r)
	t.Logf("album detail (7,000 media / 6,000 plays): %s", time.Since(start))
	if w.Code != 200 {
		t.Fatalf("%d %s", w.Code, w.Body.String())
	}
	var item struct {
		Children    []map[string]any
		Plays       int
		WatchTimeMs int64
		BitrateKbps float64
	}
	if err := json.Unmarshal(w.Body.Bytes(), &item); err != nil {
		t.Fatal(err)
	}
	if len(item.Children) != 6 || item.Plays != 6 || item.WatchTimeMs != 720000 || item.BitrateKbps != 160 {
		t.Fatal(fmt.Sprintf("incorrect album: %+v", item))
	}
}
