package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestStreamCommandsPreserveLocalStateOnRemoteFailureAndScopeServer(t *testing.T) {
	status := http.StatusBadGateway
	var timeout float64
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/Message") {
			var payload map[string]any
			_ = json.NewDecoder(r.Body).Decode(&payload)
			timeout, _ = payload["TimeoutMs"].(float64)
		}
		w.WriteHeader(status)
	}))
	defer remote.Close()
	db := apiDB(t)
	for _, q := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url","jellyfinApiKey") VALUES('s1','jf1','One',?,'fixture'),('s2','jf2','Two',?,'fixture')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u1','s1','ju1','One'),('u2','s2','ju2','Two')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type") VALUES('m1','s1','jm1','One','Movie'),('m2','s2','jm2','Two','Movie')`,
		`INSERT INTO "ActiveStream"("id","serverId","sessionId","userId","mediaId","playMethod") VALUES('a1','s1','same','u1','m1','DirectPlay'),('a2','s2','same','u2','m2','DirectPlay')`,
	} {
		var args []any
		if strings.Contains(q, "jellyfinApiKey") {
			args = []any{remote.URL, remote.URL}
		}
		if _, err := db.Exec(q, args...); err != nil {
			t.Fatal(err)
		}
	}
	h := New(db, "sqlite")
	call := func(body string, stop bool) int {
		w := httptest.NewRecorder()
		h.streamCommand(w, httptest.NewRequest("POST", "/api/streams/action", strings.NewReader(body)), stop)
		return w.Code
	}
	if got := call(`{"sessionId":"same"}`, true); got != 409 {
		t.Fatalf("ambiguous session: %d", got)
	}
	if got := call(`{"sessionId":"same","serverId":"s1"}`, true); got != 502 {
		t.Fatalf("remote failure: %d", got)
	}
	var count int
	_ = db.QueryRow(`SELECT COUNT(*) FROM "ActiveStream"`).Scan(&count)
	if count != 2 {
		t.Fatal("failed stop deleted local session")
	}
	status = 204
	if got := call(`{"sessionId":"same","serverId":"s1","text":"Hello","timeoutMs":30000}`, false); got != 200 || timeout != 30000 {
		t.Fatalf("message timeout lost: %d %v", got, timeout)
	}
	if got := call(`{"sessionId":"same","serverId":"s1"}`, true); got != 200 {
		t.Fatalf("stop: %d", got)
	}
	_ = db.QueryRow(`SELECT COUNT(*) FROM "ActiveStream" WHERE "serverId"='s2'`).Scan(&count)
	if count != 1 {
		t.Fatal("stop crossed server scope")
	}
}

func TestStreamsDoNotInventBandwidthAndExposeRecordedPause(t *testing.T) {
	db := apiDB(t)
	for _, q := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','jf','Fixture','http://127.0.0.1:9')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s','ju','User')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type") VALUES('m','s','jm','Film','Movie')`,
		`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod") VALUES('p','s','u','m','Transcode')`,
		`INSERT INTO "TelemetryEvent"("id","serverId","playbackId","eventType","positionMs") VALUES('e','s','p','pause',1000)`,
		`INSERT INTO "ActiveStream"("id","serverId","sessionId","userId","mediaId","playbackId","playMethod","audioLanguage") VALUES('a','s','session','u','m','p','Transcode','fre')`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	w := httptest.NewRecorder()
	New(db, "sqlite").streams(w, httptest.NewRequest("GET", "/api/streams", nil))
	var data struct {
		Streams   []map[string]any `json:"streams"`
		Known     bool             `json:"bandwidthKnown"`
		Bandwidth float64          `json:"totalBandwidthMbps"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &data); err != nil {
		t.Fatal(err)
	}
	if w.Code != 200 || data.Known || data.Bandwidth != 0 || len(data.Streams) != 1 || data.Streams[0]["isPaused"] != true || data.Streams[0]["audioLanguage"] != "fre" || data.Streams[0]["bitrate"] != nil {
		t.Fatalf("stream values: %d %s", w.Code, w.Body.String())
	}
}
