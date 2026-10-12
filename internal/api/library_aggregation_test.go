package api

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestLibraryAggregationWithRepeatedPlaybacks(t *testing.T) {
	db := apiDB(t)
	for _, q := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','jf','Test','http://test')`,
		`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<1000) INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName") SELECT 'm'||x,'s','jf'||x,'Movie '||x,'Movie','Films' FROM n`,
		`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<100) INSERT INTO "PlaybackHistory"("id","serverId","mediaId","playMethod","durationWatched") SELECT 'p'||x||'-'||m."id",'s',m."id",CASE WHEN x<=75 THEN 'DirectPlay' ELSE 'Transcode' END,600 FROM n CROSS JOIN "Media" m`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	h := New(db, "sqlite")
	r := httptest.NewRequest("GET", "/api/media", nil)
	base, args, err := h.recoveredMediaBase(r)
	if err != nil {
		t.Fatal(err)
	}
	start := time.Now()
	rows, err := h.recoveredRows(r, base+`SELECT SUM("plays") AS "plays",SUM("watchTimeMs") AS "watched",SUM("directPlays") AS "direct" FROM agg`, args...)
	t.Logf("1,000 media / 100,000 playbacks aggregation: %s", time.Since(start))
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || mediaNumber(rows[0]["plays"]) != 100000 || mediaNumber(rows[0]["watched"]) != 60000000000 || mediaNumber(rows[0]["direct"]) != 75000 {
		t.Fatalf("incorrect aggregation: %+v", rows)
	}
	legacy := base[:strings.Index(base, "per_media AS (")] + `agg AS (SELECT f."root",COUNT(p."id") AS "plays",COALESCE(SUM(p."durationWatched"),0)*1000 AS "watchTimeMs",MAX(p."startedAt") AS "lastPlayed",SUM(CASE WHEN p."playMethod"='DirectPlay' THEN 1 ELSE 0 END) AS "directPlays" FROM family f LEFT JOIN valid p ON p."mediaId"=f."member" GROUP BY f."root") `
	start = time.Now()
	previous, err := h.recoveredRows(r, legacy+`SELECT SUM("plays") AS "plays",SUM("watchTimeMs") AS "watched",SUM("directPlays") AS "direct" FROM agg`, args...)
	t.Logf("same fixture before optimization: %s", time.Since(start))
	if err != nil || len(previous) != 1 || mediaNumber(previous[0]["plays"]) != mediaNumber(rows[0]["plays"]) || mediaNumber(previous[0]["watched"]) != mediaNumber(rows[0]["watched"]) || mediaNumber(previous[0]["direct"]) != mediaNumber(rows[0]["direct"]) {
		t.Fatalf("legacy comparison: %+v %v", previous, err)
	}
}
