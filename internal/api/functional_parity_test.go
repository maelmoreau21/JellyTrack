package api

import (
	"encoding/json"
	"net/http/httptest"
	"testing"
)

func TestFunctionalParityStreamsParentSubtitlesAndServerScope(t *testing.T) {
	db := apiDB(t)
	for _, query := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','jf','One','http://one'),('other','jf-other','Two','http://two')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s','ju','User')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","parentId","artist","durationMs") VALUES('series','s','series-jf','The Series','Series',NULL,NULL,NULL),('season','s','season-jf','Season 1','Season','series-jf',NULL,NULL),('ep','s','ep-jf','Episode 1','Episode','season-jf',NULL,600000),('album','s','album-jf','The Album','MusicAlbum',NULL,'Artist',NULL),('track','s','track-jf','Track','Audio','album-jf',NULL,600000),('wrong-season','other','season-jf','Wrong Season','Season',NULL,NULL,NULL),('wrong-album','other','album-jf','Wrong Album','MusicAlbum',NULL,'Wrong Artist',NULL)`,
		`INSERT INTO "ActiveStream"("id","serverId","sessionId","userId","mediaId","playMethod","positionTicks") VALUES('ep-stream','s','ep-session','u','ep','DirectPlay',3000000000),('track-stream','s','track-session','u','track','DirectPlay',0)`,
	} {
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	w := httptest.NewRecorder()
	New(db, "sqlite").streams(w, httptest.NewRequest("GET", "/api/streams?servers=s", nil))
	var data struct {
		Streams []map[string]any `json:"streams"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &data); err != nil {
		t.Fatal(err)
	}
	if w.Code != 200 || len(data.Streams) != 2 {
		t.Fatalf("response: %d %s", w.Code, w.Body.String())
	}
	want := map[string]string{"ep-session": "The Series — Season 1", "track-session": "Artist — The Album"}
	for _, stream := range data.Streams {
		if stream["mediaSubtitle"] != want[stream["sessionId"].(string)] {
			t.Fatalf("subtitle: %+v", stream)
		}
		if stream["sessionId"] == "ep-session" && stream["progressPercent"] != float64(50) {
			t.Fatalf("progress: %+v", stream)
		}
	}
}

func TestFunctionalParityTelemetryNullableFieldsEmptySessionsAndServerScope(t *testing.T) {
	db := apiDB(t)
	for _, query := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','jf','One','http://one'),('other','jf-other','Two','http://two')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s','ju','User'),('other-user','other','other-ju','Other')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type") VALUES('m','s','same-media','Film','Movie'),('empty','s','empty-media','Empty','Movie'),('other-media','other','same-media','Other Film','Movie')`,
		`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","sourceEventId","startedAt","endedAt") VALUES('open','s','u','m','DirectPlay',NULL,'2026-10-01T10:00:00Z',NULL),('closed','s','u','m','DirectPlay','source-1','2026-10-01T09:00:00Z','2026-10-01T09:10:00Z'),('other-play','other','other-user','other-media','DirectPlay',NULL,'2026-10-01T08:00:00Z',NULL)`,
	} {
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	h := New(db, "sqlite")
	for _, server := range []string{"s", "jf"} {
		w := httptest.NewRecorder()
		h.streamsTelemetry(w, httptest.NewRequest("GET", "/api/streams/telemetry?mediaId=same-media&serverId="+server, nil))
		var result struct {
			Sessions []map[string]any `json:"sessions"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		if w.Code != 200 || len(result.Sessions) != 2 {
			t.Fatalf("server=%s: %d %s", server, w.Code, w.Body.String())
		}
		if result.Sessions[0]["id"] != "open" || result.Sessions[0]["endedAt"] != nil || result.Sessions[0]["sourceEventId"] != nil {
			t.Fatalf("null fields: %+v", result.Sessions[0])
		}
		if result.Sessions[1]["endedAt"] != "2026-10-01T09:10:00Z" || result.Sessions[1]["sourceEventId"] != "source-1" {
			t.Fatalf("string fields: %+v", result.Sessions[1])
		}
	}
	w := httptest.NewRecorder()
	h.streamsTelemetry(w, httptest.NewRequest("GET", "/api/streams/telemetry?mediaId=empty-media&serverId=s", nil))
	var result map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if sessions, ok := result["sessions"].([]any); !ok || len(sessions) != 0 {
		t.Fatalf("empty sessions contract: %s", w.Body.String())
	}
}
