package api

import (
	"encoding/csv"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHistoricalExportFiltersFormatsUnitsAndLiveFallback(t *testing.T) {
	db := apiDB(t)
	for _, query := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','js','Server','http://server')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s','ju','=Alice'),('v','s','jv','Bob')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","resolution") VALUES('m','s','jm','Movie','Movie','4K')`,
		`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","durationWatched","startedAt","endedAt","clientName","country","audioLanguage","subtitleCodec") VALUES('p','s','u','m','DirectPlay',125,'2020-01-02T12:00:00Z','2020-01-02T12:03:00Z','Web','France','fre','subrip'),('zap','s','u','m','DirectPlay',20,'2020-01-02T13:00:00Z','2020-01-02T13:01:00Z','TV','France','eng',NULL),('b','s','v','m','Transcode',180,'2020-01-03T12:00:00Z','2020-01-03T12:03:00Z','TV','Canada','eng',NULL)`,
		`INSERT INTO "ActiveStream"("id","serverId","sessionId","userId","mediaId","playMethod","bitrate","audioCodec","startedAt","lastPingAt") VALUES('a','s','session','u','m','DirectPlay',256000,'aac','2020-01-02','2020-01-02')`,
	} {
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	h := New(db, "sqlite")
	for _, filter := range []string{"user=u&query=Movie&client=Web&audio=fre&subtitle=subrip&resolution=4K&playMethod=DirectPlay&dateFrom=2020-01-02&dateTo=2020-01-02", "userId=u,v&sort=duration_asc", "hideZapped=false"} {
		w := httptest.NewRecorder()
		h.exportLogsCSV(w, httptest.NewRequest("GET", "/api/logs/export?format=json&"+filter, nil))
		if w.Code != 200 {
			t.Fatal(w.Body.String())
		}
		var items []map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &items); err != nil {
			t.Fatal(err)
		}
		want := 1
		if strings.HasPrefix(filter, "userId") {
			want = 2
		}
		if strings.HasPrefix(filter, "hideZapped") {
			want = 3
		}
		if len(items) != want {
			t.Fatalf("%s: %v", filter, items)
		}
		if want == 1 || strings.HasPrefix(filter, "userId") {
			if items[0]["id"] != "p" || items[0]["durationWatchedSeconds"] != float64(125) || items[0]["audioBitrateKbps"] != float64(256) || items[0]["audioCodec"] != "aac" {
				t.Fatalf("historical fields: %v", items[0])
			}
		}
	}
	w := httptest.NewRecorder()
	h.exportLogsCSV(w, httptest.NewRequest("GET", "/api/logs/export?user=u&client=Web", nil))
	records, err := csv.NewReader(strings.NewReader(w.Body.String())).ReadAll()
	if err != nil {
		t.Fatal(err)
	}
	if len(records) != 2 || len(records[0]) != 17 || records[0][11] != "Duration (s)" || records[1][11] != "125" || records[1][2] != "'=Alice" {
		t.Fatalf("CSV contract: %v", records)
	}
}
