package api

import (
	"encoding/json"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func TestGeoStatsPreservesSessionsAndDistinguishesLocalAndMissing(t *testing.T) {
	db := apiDB(t)
	t.Setenv("GEOIP_DATABASE_PATH", filepath.Join(t.TempDir(), "absent.mmdb"))
	for _, q := range []string{`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','js','S','http://s')`, `INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s','ju','U')`, `INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type") VALUES('m','s','jm','M','Movie')`, `INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","country","city","ipAddress","playMethod") VALUES('a','s','u','m','Unknown','Unknown','192.168.1.2','DirectPlay'),('b','s','u','m','Unknown','Unknown','8.8.8.8','DirectPlay'),('c','s','u','m','France',NULL,'1.2.3.4','DirectPlay'),('d','s','u','m',NULL,NULL,NULL,'DirectPlay')`} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	w := httptest.NewRecorder()
	New(db, "sqlite").geoStats(w, httptest.NewRequest("GET", "/api/geo-stats", nil))
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var result struct {
		TotalSessions, LocalSessions, UnlocatedSessions int
		GeoipAvailable                                  bool
		Message                                         string
		Locations                                       []struct {
			Country, City, Kind string
			Sessions            int
		}
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.TotalSessions != 4 || result.LocalSessions != 1 || result.UnlocatedSessions != 2 || result.GeoipAvailable || result.Message == "" {
		t.Fatalf("%+v", result)
	}
	for _, loc := range result.Locations {
		if loc.Country == "Unknown" || loc.City == "Unknown" {
			t.Fatal("placeholder leaked", loc)
		}
	}
	var count int
	db.QueryRow(`SELECT COUNT(*) FROM "PlaybackHistory"`).Scan(&count)
	if count != 4 {
		t.Fatal("history lost")
	}
}
