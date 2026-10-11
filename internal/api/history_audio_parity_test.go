package api

import (
	"encoding/json"
	"net/http/httptest"
	"testing"
)

func TestHistoryAudioBitrateSeparatesVideoAndExplicitAudioMetadata(t *testing.T) {
	db := apiDB(t)
	for _, query := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','jf','Server','http://server'),('other','otherjf','Other','http://other')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s','ju','User')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type") VALUES('video','s','jvideo','Video','Movie'),('audio','s','jaudio','Audio','Audio'),('audiobook','s','jbook','Audio book','AudioBook')`,
		`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","durationWatched","startedAt","endedAt","bitrate") VALUES('video','s','u','video','DirectPlay',120,'2026-10-10T12:00:00Z','2026-10-10T12:02:00Z',12000000),('audio','s','u','audio','DirectPlay',120,'2026-10-10T12:00:00Z','2026-10-10T12:02:00Z',256000),('explicit','s','u','video','DirectPlay',120,'2026-10-10T12:00:00Z','2026-10-10T12:02:00Z',12000000),('stream','s','u','video','DirectPlay',120,'2026-10-10T12:00:00Z','2026-10-10T12:02:00Z',12000000),('low','s','u','video','DirectPlay',120,'2026-10-10T12:00:00Z','2026-10-10T12:02:00Z',1536000),('video600','s','u','video','DirectPlay',120,'2026-10-10T12:00:00Z','2026-10-10T12:02:00Z',600000),('lowexplicit','s','u','video','DirectPlay',120,'2026-10-10T12:00:00Z','2026-10-10T12:02:00Z',600000),('audiobook','s','u','audiobook','DirectPlay',120,'2026-10-10T12:00:00Z','2026-10-10T12:02:00Z',2160000)`,
		`INSERT INTO "TelemetryEvent"("id","serverId","playbackId","eventType","positionMs","createdAt","metadata") VALUES('wrongserver','other','video','start',0,'2026-10-10T12:03:00Z','{"audioBitrateKbps":999}'),('unqualified','s','video','start',0,'2026-10-10T12:00:00Z','{"bitrate":12000000}'),('explicitold','s','explicit','start',0,'2026-10-10T12:00:00Z','{"audioBitrate":192000}'),('explicitnew','s','explicit','audio_change',0,'2026-10-10T12:01:00Z','{"audioBitrateKbps":320}'),('stream','s','stream','start',0,'2026-10-10T12:00:00Z','{"audioStream":{"BitRate":448000}}'),('lowexplicit','s','lowexplicit','start',0,'2026-10-10T12:00:00Z','{"audioBitrateKbps":128}')`,
	} {
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	w := httptest.NewRecorder()
	New(db, "sqlite").history(w, httptest.NewRequest("GET", "/api/history?days=all", nil))
	if w.Code != 200 {
		t.Fatalf("history: %d %s", w.Code, w.Body.String())
	}
	var result struct{ Items []map[string]any }
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	want := map[string]any{"video": nil, "audio": float64(256), "explicit": float64(320), "stream": float64(448), "low": nil, "video600": nil, "lowexplicit": float64(128), "audiobook": float64(2160)}
	if len(result.Items) != len(want) {
		t.Fatalf("items: %+v", result.Items)
	}
	for _, item := range result.Items {
		id := item["id"].(string)
		expected, ok := want[id]
		if !ok || item["audioBitrateKbps"] != expected {
			t.Errorf("%s audio=%v, want %v", id, item["audioBitrateKbps"], expected)
		}
		if id == "video" && (item["bitrate"] != float64(12000) || len(item["telemetryEvents"].([]any)) != 1) {
			t.Errorf("global bitrate/server scope altered: %+v", item)
		}
	}
	profile, err := New(db, "sqlite").profileHistory(httptest.NewRequest("GET", "/api/users/u?export=true", nil), "u", "s")
	if err != nil {
		t.Fatal(err)
	}
	profileItems := profile["items"].([]map[string]any)
	if len(profileItems) != len(want) {
		t.Fatalf("profile items: %+v", profileItems)
	}
	for _, item := range profileItems {
		id := item["id"].(string)
		if item["audioBitrateKbps"] != want[id] {
			t.Errorf("profile %s audio=%v, want %v", id, item["audioBitrateKbps"], want[id])
		}
	}
}

func TestRecordedHistoryAudioBitrateOnlyUsesExplicitPositiveValues(t *testing.T) {
	for _, tc := range []struct {
		metadata map[string]any
		want     float64
	}{
		{map[string]any{"audioBitrate": float64(192000)}, 192},
		{map[string]any{"audioBitrate": float64(256)}, 256},
		{map[string]any{"audioBitrateKbps": float64(12000)}, 12000},
		{map[string]any{"bitrate": float64(256000)}, 0},
		{map[string]any{"audioBitrateKbps": float64(-128)}, 0},
		{map[string]any{"audioBitrateKbps": "256"}, 0},
	} {
		got := recordedHistoryAudioBitrate(tc.metadata)
		if tc.want == 0 && got != nil || tc.want != 0 && (got == nil || *got != tc.want) {
			t.Errorf("metadata %+v: got %v, want %v", tc.metadata, got, tc.want)
		}
	}
}
