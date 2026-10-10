package api

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/auth"
)

func TestRecoveredHistoryFieldsFiltersTelemetryAndChartDrilldowns(t *testing.T) {
	db := apiDB(t)
	for _, query := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','js','Server','http://server')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s','ju','Alice')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","durationMs","resolution","libraryName") VALUES('m','s','jm','Movie','Movie',600000,'4K','Films'),('a','s','ja','Audio','Audio',600000,NULL,'Music')`,
		`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","clientName","deviceName","ipAddress","country","city","durationWatched","startedAt","endedAt","audioCodec","audioLanguage","subtitleCodec","subtitleLanguage","bitrate","pauseCount","audioChanges","subtitleChanges") VALUES('p','s','u','m','DirectPlay','Jellyfin Web','Browser','8.8.8.8','France','Paris',570,'2026-10-10T12:00:00Z','2026-10-10T12:10:00Z','aac','fre','subrip','eng',256000,2,3,4),('pa','s','u','a','DirectPlay','Android','Phone','1.1.1.1','France','Paris',60,'2026-10-10T12:00:00Z','2026-10-10T12:01:00Z','flac','eng',NULL,NULL,128000,0,0,0)`,
		`INSERT INTO "TelemetryEvent"("id","serverId","playbackId","eventType","positionMs","metadata","createdAt") VALUES('t','s','p','audio_change',12300,'{"from":{"language":"eng"},"to":{"language":"fre"},"versionName":"Director cut"}','2026-10-10T12:00:00Z')`,
	} {
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	handler := New(db, "sqlite")
	for _, tc := range []struct {
		query string
		total int
	}{{"query=8.8.8.8", 1}, {"q=browser", 0}, {"device=Browser", 1}, {"type=Movie,Audio", 2}, {"audio=fre&subtitle=eng&resolution=4K", 1}, {"audio=FR%20(aac)&subtitle=EN%20(subrip)", 1}, {"subtitle=OFF", 0}, {"libraryCategory=movies", 1}, {"completion=finished", 1}, {"completion=abandoned", 0}, {"completion=almost", 0}, {"completion=skipped", 1}, {"excludeTypes=Audio", 1}, {"excludeLibs=Films", 1}} {
		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", "/api/history?days=all&"+tc.query, nil)
		handler.history(w, r)
		if w.Code != 200 {
			t.Fatalf("%s: %s", tc.query, w.Body.String())
		}
		var result struct {
			Total int
			Items []map[string]any
		}
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		if result.Total != tc.total {
			t.Fatalf("%s total=%d wanted=%d", tc.query, result.Total, tc.total)
		}
		if tc.query == "query=8.8.8.8" {
			item := result.Items[0]
			if item["ipAddress"] != "8.8.8.8" || item["resolution"] != "4K" || item["pauseCount"] != float64(2) || item["bitrate"] != float64(256) || item["versionName"] != "Director cut" || len(item["telemetryEvents"].([]any)) != 1 {
				t.Fatalf("fields=%v", item)
			}
		}
	}
}

func TestHistoryAlertsUseStoredThresholdsExcludePrivateIPs(t *testing.T) {
	db := apiDB(t)
	now := time.Now().UTC().Format(time.RFC3339Nano)
	for _, query := range []string{`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','js','Server','http://server')`, `INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s','ju','Alice')`, `INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type") VALUES('m','s','jm','Movie','Movie')`, `INSERT INTO "GlobalSettings"("id","resolutionThresholds") VALUES('global','{"smartSecurityThresholds":{"ipAttemptThreshold":1,"ipWindowMinutes":1440,"newCountryGraceMinutes":5}}')`} {
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	for _, ip := range []string{"8.8.8.8", "192.168.1.2"} {
		if _, err := db.Exec(`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","durationWatched","startedAt","endedAt","ipAddress","country") VALUES(?,'s','u','m','DirectPlay',600,?,?,?,'France')`, ip, now, now, ip); err != nil {
			t.Fatal(err)
		}
	}
	r := httptest.NewRequest("GET", "/api/history?days=all", nil)
	r = r.WithContext(context.WithValue(r.Context(), auth.PrincipalContextKey, auth.Principal{Role: "admin"}))
	w := httptest.NewRecorder()
	New(db, "sqlite").history(w, r)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	var result struct {
		NewCountryAlerts int
		TopHotIps        []struct {
			IpAddress string
			Attempts  int
		}
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.NewCountryAlerts != 2 || len(result.TopHotIps) != 1 || result.TopHotIps[0].IpAddress != "8.8.8.8" {
		t.Fatalf("alerts=%+v", result)
	}
}
