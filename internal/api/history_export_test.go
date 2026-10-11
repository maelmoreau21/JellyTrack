package api

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
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
			if items[0]["id"] != "p" || items[0]["durationWatchedSeconds"] != float64(125) || items[0]["audioBitrateKbps"] != nil || items[0]["audioCodec"] != "aac" {
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
	if len(records) != 2 || len(records[0]) != 17 || records[0][11] != "Duration (s)" || records[1][11] != "125" || records[1][2] != "'=Alice" || records[1][13] != "" {
		t.Fatalf("CSV contract: %v", records)
	}
}

func TestHistoryExportAudioKeepsUnknownVideoExplicitMetadataAndAudioLiveFallback(t *testing.T) {
	db := apiDB(t)
	for _, query := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','js','Server','http://server'),('other','otherjf','Other','http://other')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s','ju','=Alice')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type") VALUES('video','s','jvideo','Video','Movie'),('audio','s','jaudio','Audio','Audio')`,
		`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","durationWatched","startedAt","endedAt","bitrate") VALUES('video','s','u','video','DirectPlay',120,'2020-01-02T12:00:00Z','2020-01-02T12:02:00Z',600000),('video-null','s','u','video','DirectPlay',120,'2020-01-02T12:00:00Z','2020-01-02T12:02:00Z',NULL),('audio','s','u','audio','DirectPlay',120,'2020-01-02T12:00:00Z','2020-01-02T12:02:00Z',NULL),('explicit','s','u','video','DirectPlay',120,'2020-01-02T12:00:00Z','2020-01-02T12:02:00Z',12000000)`,
		`INSERT INTO "ActiveStream"("id","serverId","sessionId","userId","mediaId","playMethod","bitrate","audioCodec","startedAt","lastPingAt") VALUES('video','s','sv','u','video','DirectPlay',512000,'aac','2020-01-02','2020-01-02'),('audio','s','sa','u','audio','DirectPlay',256000,'aac','2020-01-02','2020-01-02'),('wrongserver','other','so','u','audio','DirectPlay',999000,'other','2020-01-03','2020-01-03')`,
		`INSERT INTO "TelemetryEvent"("id","serverId","playbackId","eventType","positionMs","createdAt","metadata") VALUES('explicit','s','explicit','start',0,'2020-01-02T12:00:00Z','{"audioBitrateKbps":384}')`,
	} {
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	h := New(db, "sqlite")
	want := map[string]any{"video": nil, "video-null": nil, "audio": float64(256), "explicit": float64(384)}
	w := httptest.NewRecorder()
	h.exportLogsCSV(w, httptest.NewRequest("GET", "/api/logs/export?format=json&limit=1", nil))
	var items []map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &items); err != nil || w.Code != 200 {
		t.Fatalf("export %d: %s %v", w.Code, w.Body.String(), err)
	}
	if len(items) != len(want) {
		t.Fatalf("export retained a page limit or lost sessions: %+v", items)
	}
	for _, item := range items {
		id := item["id"].(string)
		if item["audioBitrateKbps"] != want[id] {
			t.Errorf("export %s audio=%v, want %v", id, item["audioBitrateKbps"], want[id])
		}
	}
	w = httptest.NewRecorder()
	h.exportLogsCSV(w, httptest.NewRequest("GET", "/api/logs/export?sort=date_asc", nil))
	records, err := csv.NewReader(strings.NewReader(w.Body.String())).ReadAll()
	if err != nil || len(records) != len(want)+1 || len(records[0]) != 17 {
		t.Fatalf("CSV contract: %+v %v", records, err)
	}
	for _, record := range records[1:] {
		id := record[0]
		expected := ""
		if id == "audio" {
			expected = "256"
		}
		if id == "explicit" {
			expected = "384"
		}
		if record[13] != expected || record[2] != "'=Alice" || record[11] != "120" {
			t.Errorf("CSV %s rate/escaping/seconds: %+v", id, record)
		}
	}
}

func TestHistoryExportEnrichmentPreservesAllRowsPastBatchBoundary(t *testing.T) {
	db := apiDB(t)
	for _, query := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','js','Server','http://server')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type") VALUES('m','s','jm','Video','Movie')`,
	} {
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	tx, err := db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	for i := 0; i < 501; i++ {
		if _, err := tx.Exec(`INSERT INTO "PlaybackHistory"("id","serverId","mediaId","playMethod","durationWatched","startedAt","endedAt","bitrate") VALUES(?,'s','m','DirectPlay',120,'2020-01-02T12:00:00Z','2020-01-02T12:02:00Z',600000)`, fmt.Sprintf("p%03d", i)); err != nil {
			t.Fatal(err)
		}
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "TelemetryEvent"("id","serverId","playbackId","eventType","positionMs","createdAt","metadata") VALUES('endbatch','s','p500','start',0,'2020-01-02T12:00:00Z','{"audioBitrateKbps":192}')`); err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	New(db, "sqlite").exportLogsCSV(w, httptest.NewRequest("GET", "/api/logs/export?format=json&sort=date_asc&limit=1", nil))
	var items []map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &items); err != nil || w.Code != 200 || len(items) != 501 {
		t.Fatalf("large export status/count: %d %d %v", w.Code, len(items), err)
	}
	for _, item := range items {
		var expected any
		if item["id"] == "p500" {
			expected = float64(192)
		}
		if item["audioBitrateKbps"] != expected {
			t.Fatalf("batch-boundary audio %s: got %v want %v", item["id"], item["audioBitrateKbps"], expected)
		}
	}
}
