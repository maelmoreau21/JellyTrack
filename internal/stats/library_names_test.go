package stats

import (
	"context"
	"fmt"
	"testing"
)

func TestLibraryChartsUseActualNamesAndScopedParents(t *testing.T) {
	db := statsDB(t)
	for _, q := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','js','One','http://one'),('other','jo','Other','http://other')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s','ju','User')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName","collectionType","parentId","durationMs") VALUES
 ('film','s','jf','Film','Movie','Films','movies',NULL,600000),
 ('kid','s','jk','Enfant','Movie','Films enfants','movies',NULL,600000),
 ('album','s','ja','Album','MusicAlbum','Musiques','music',NULL,NULL),
 ('track','s','jt','Track','Audio',NULL,'music','ja',600000),
 ('series','s','jseries','Series','Series','Séries','tvshows',NULL,NULL),
 ('season','s','jseason','Season','Season',NULL,'tvshows','jseries',NULL),
 ('episode','s','je','Episode','Episode',NULL,'tvshows','season',600000),
 ('unknown','s','jx','Unknown','Movie',NULL,'movies',NULL,600000),
 ('foreign','other','ja','Foreign album','MusicAlbum','Autre musique','music',NULL,NULL)`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	for i, id := range []string{"film", "kid", "track", "episode", "unknown"} {
		if _, err := db.Exec(`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","durationWatched","playMethod") VALUES(?,'s','u',?,300,'DirectPlay')`, fmt.Sprintf("p%d", i), id); err != nil {
			t.Fatal(err)
		}
	}
	result, err := GetGranularAnalysis(context.Background(), db, "sqlite", DashboardFilter{TimeRange: "all"})
	if err != nil {
		t.Fatal(err)
	}
	expected := map[string]bool{"Films": true, "Films enfants": true, "Musiques": true, "Séries": true, "Unknown": true}
	if len(result.Collections) != len(expected) || len(result.DropOffData) != len(expected) {
		t.Fatalf("names: %+v %+v", result.Collections, result.DropOffData)
	}
	for _, name := range result.Collections {
		if !expected[name] {
			t.Fatalf("technical or foreign name: %q", name)
		}
	}
	for _, point := range result.DropOffData {
		if !expected[point.Time] || point.Completion != 50 {
			t.Fatalf("completion by name: %+v", point)
		}
	}
}
