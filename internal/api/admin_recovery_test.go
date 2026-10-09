package api

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/plugin"
	"golang.org/x/crypto/scrypt"
)

func TestRecoveredPluginProbeUsesRealReceiverAndRejectsBadKey(t *testing.T) {
	t.Setenv("PLUGIN_KEY_PEPPER", "admin-probe-pepper")
	db := apiDB(t)
	_, err := db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','jf','Test','http://jellyfin')`)
	if err != nil {
		t.Fatal(err)
	}
	handler := New(db, "sqlite", plugin.NewHandler(db, "sqlite", slog.New(slog.NewTextHandler(io.Discard, nil))))
	for _, tc := range []struct {
		body   string
		ok     bool
		status int
	}{{`{"action":"test_connection"}`, true, 200}, {`{"action":"force_heartbeat","apiKey":"incorrect"}`, false, 401}} {
		w := httptest.NewRecorder()
		handler.recoveredPluginHealth(w, httptest.NewRequest("POST", "/api/admin/plugin/health", strings.NewReader(tc.body)))
		var result struct {
			OK     bool `json:"ok"`
			Status int  `json:"status"`
		}
		if err = json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		if w.Code != 200 || result.OK != tc.ok || result.Status != tc.status {
			t.Fatalf("probe %s: %d %s", tc.body, w.Code, w.Body)
		}
	}
	var seen int
	if err = db.QueryRow(`SELECT COUNT(*) FROM "SystemHealthEvent"`).Scan(&seen); err != nil || seen != 0 {
		t.Fatalf("bad key created heartbeat: %d %v", seen, err)
	}
	salt := make([]byte, 16)
	digest, err := scrypt.Key([]byte("admin-probe-pepper:valid-admin-test-key"), salt, 1<<14, 8, 1, 64)
	if err != nil {
		t.Fatal(err)
	}
	hash := "s1$" + base64.RawURLEncoding.EncodeToString(salt) + "$" + base64.RawURLEncoding.EncodeToString(digest)
	if _, err = db.Exec(`INSERT INTO "GlobalSettings"("id","pluginApiKey") VALUES('global',?)`, hash); err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	handler.recoveredPluginHealth(w, httptest.NewRequest("POST", "/api/admin/plugin/health", strings.NewReader(`{"action":"force_heartbeat","apiKey":"valid-admin-test-key"}`)))
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"ok":true`) {
		t.Fatalf("valid heartbeat rejected: %d %s", w.Code, w.Body)
	}
	if err = db.QueryRow(`SELECT COUNT(*) FROM "SystemHealthEvent" WHERE "kind"='monitor_ping'`).Scan(&seen); err != nil || seen != 1 {
		t.Fatalf("valid heartbeat not persisted: %d %v", seen, err)
	}
}

func TestRecoveredDateQueriesSupportTypedPostgresAndSQLiteStrings(t *testing.T) {
	query := `SELECT * FROM "PlaybackHistory" p WHERE REPLACE(p."startedAt",'T',' ')>=?`
	if postgres := adminRecoveryBind(query, "postgres"); strings.Contains(postgres, "REPLACE") || !strings.Contains(postgres, "$1") {
		t.Fatal(postgres)
	}
	if sqlite := adminRecoveryBind(query, "sqlite"); !strings.Contains(sqlite, "REPLACE") || !strings.Contains(sqlite, "?") {
		t.Fatal(sqlite)
	}
	for _, value := range []string{"2020-01-01T01:02:03Z", "2020-01-01 01:02:03", "2020-01-01 01:02:03.123+00", "2020-01-01 01:02:03.123+00:00"} {
		if adminRecoveryTime(value).IsZero() {
			t.Fatal("invalid date parse: " + value)
		}
	}
}

func TestRecoveredPluginProbeHonorsHTTP200FailureAndMissingHandler(t *testing.T) {
	db := apiDB(t)
	h := New(db, "sqlite", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		jsonResponse(w, 200, map[string]any{"ok": false, "error": "receiver failed"})
	}))
	w := httptest.NewRecorder()
	h.recoveredPluginHealth(w, httptest.NewRequest("POST", "/api/admin/plugin/health", strings.NewReader(`{"action":"test_connection"}`)))
	if !strings.Contains(w.Body.String(), `"ok":false`) {
		t.Fatal(w.Body.String())
	}
	w = httptest.NewRecorder()
	New(db, "sqlite").recoveredPluginHealth(w, httptest.NewRequest("POST", "/api/admin/plugin/health", strings.NewReader(`{"action":"test_connection"}`)))
	if w.Code != 503 {
		t.Fatalf("missing handler: %d %s", w.Code, w.Body)
	}
}

func TestRecoveredDeleteValidatesWholeSelectionBeforeRemoteDeletion(t *testing.T) {
	db := apiDB(t)
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls++; w.WriteHeader(204) }))
	defer srv.Close()
	for _, q := range []string{`INSERT INTO "Server"("id","jellyfinServerId","name","url","jellyfinApiKey") VALUES('s','jf','Test','` + srv.URL + `','key')`, `INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","createdAt","dateAdded") VALUES('old','s','jm-old','Old','Movie','2020-01-01 00:00:00','2020-01-01 00:00:00'),('recent','s','jm-recent','Recent','Movie','2020-01-01 00:00:00','` + time.Now().UTC().Format(time.RFC3339Nano) + `'),('series','s','jm-series','Series','Series','2020-01-01 00:00:00',NULL)`} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	for _, body := range []string{`{}`, `null`, `[]`, `{"mediaIds":["old"],"confirmation":"WRONG"}`, `{"mediaIds":["old","old"],"confirmation":"DELETE"}`, `{"mediaIds":["old","recent"],"confirmation":"DELETE"}`, `{"mediaIds":["old","series"],"confirmation":"DELETE"}`, `{"mediaIds":["old","missing"],"confirmation":"DELETE"}`, `{"mediaIds":["old"],"confirmation":"DELETE"}{}`} {
		w := httptest.NewRecorder()
		New(db, "sqlite").recoveredDeleteStaleMovies(w, httptest.NewRequest("POST", "/api/admin/cleanup/delete-stale-movies", strings.NewReader(body)))
		if w.Code != 400 {
			t.Fatalf("body %s: %d %s", body, w.Code, w.Body)
		}
	}
	var count int
	_ = db.QueryRow(`SELECT COUNT(*) FROM "Media"`).Scan(&count)
	if calls != 0 || count != 3 {
		t.Fatalf("invalid selection touched remote/local data: calls %d media %d", calls, count)
	}
}

func TestRecoveredDeleteOnlyRemovesSyntheticJellyfinSuccesses(t *testing.T) {
	db := apiDB(t)
	calls := []string{}
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "DELETE" || r.Header.Get("X-Emby-Token") != "key" {
			t.Errorf("invalid remote request")
		}
		calls = append(calls, r.URL.Path)
		if r.URL.Path == "/Items/jm-ok" {
			w.WriteHeader(204)
		} else {
			w.WriteHeader(503)
		}
	}))
	defer remote.Close()
	_, err := db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url","jellyfinApiKey") VALUES('s','jf','Test',?,'key')`, remote.URL)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","createdAt") VALUES('ok','s','jm-ok','Success','Movie','2020-01-01 00:00:00'),('fail','s','jm-fail','Failure','Movie','2020-01-01 00:00:00')`)
	if err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	New(db, "sqlite").recoveredDeleteStaleMovies(w, httptest.NewRequest("POST", "/api/admin/cleanup/delete-stale-movies", strings.NewReader(`{"mediaIds":["ok","fail"],"confirmation":"DELETE"}`)))
	var result struct {
		Deleted int                 `json:"deletedCount"`
		Failed  []map[string]string `json:"failed"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &result)
	if w.Code != 200 || result.Deleted != 1 || len(result.Failed) != 1 || len(calls) != 2 {
		t.Fatalf("partial deletion: %d %s", w.Code, w.Body)
	}
	var remaining string
	if err = db.QueryRow(`SELECT "id" FROM "Media"`).Scan(&remaining); err != nil || remaining != "fail" {
		t.Fatalf("failed remote deletion removed local media: %s %v", remaining, err)
	}
}

func TestRecoveredCleanupUsesDateAddedAndKeepsServerScope(t *testing.T) {
	db := apiDB(t)
	for _, q := range []string{`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','jf','Test','http://jellyfin')`, `INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","createdAt","dateAdded","size") VALUES('old-added','s','old','Old added','Movie',CURRENT_TIMESTAMP,'2020-01-01 00:00:00',1024),('recent-added','s','recent','Recent added','Movie','2020-01-01 00:00:00',CURRENT_TIMESTAMP,2048)`} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	w := httptest.NewRecorder()
	New(db, "sqlite").recoveredCleanup(w, httptest.NewRequest("GET", "/api/admin/cleanup", nil))
	var result struct {
		Ghosts         []recoveredMedia `json:"ghostMedia"`
		Size           int64            `json:"totalRecoverableSizeBytes"`
		Recommendation struct {
			Media []recoveredMedia `json:"media"`
		} `json:"staleMoviesRecommendation"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if w.Code != 200 || len(result.Ghosts) != 1 || result.Ghosts[0].ID != "old-added" || result.Size != 1024 || len(result.Recommendation.Media) != 1 {
		t.Fatalf("cleanup dateAdded contract: %d %s", w.Code, w.Body)
	}
}

func TestRecoveredHealthHasRealAnomaliesAndNoFabricatedPoll(t *testing.T) {
	db := apiDB(t)
	for _, q := range []string{`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','jf','Test','http://jellyfin')`, `INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s','ju','Alice')`, `INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type") VALUES('m','s','jm','Movie','Movie')`, `INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","ipAddress","durationWatched") VALUES('p1','s','u','m','DirectPlay','1.1.1.1',100),('p2','s','u','m','DirectPlay','2.2.2.2',100)`} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	w := httptest.NewRecorder()
	New(db, "sqlite").recoveredAdminHealth(w, httptest.NewRequest("GET", "/api/admin/health", nil))
	var result struct {
		Alerts   []map[string]any          `json:"securityAlerts"`
		Orphans  []map[string]any          `json:"orphanPlaybacks"`
		Timeline []map[string]any          `json:"anomalyTimeline"`
		Status   map[string]map[string]any `json:"status"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &result)
	if w.Code != 200 || len(result.Alerts) != 1 || len(result.Orphans) != 2 || len(result.Timeline) != 14 || result.Status["monitor"]["lastPollAt"] != nil {
		t.Fatalf("health contract: %d %s", w.Code, w.Body)
	}
}

func TestRecoveredCompareDeduplicatesScopesAndCounts24Hours(t *testing.T) {
	t.Setenv("JELLYTRACK_MODE", "multi")
	db := apiDB(t)
	for _, q := range []string{`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s1','jf-one','One','http://one'),('master','master','Duplicate primary','http://one/'),('s2','jf-two','Two','http://two')`, `INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type") VALUES('m1','master','jm1','Movie','Movie'),('m2','s2','jm2','Movie','Movie')`, `INSERT INTO "PlaybackHistory"("id","serverId","mediaId","playMethod","durationWatched","startedAt") VALUES('p1','master','m1','DirectPlay',3600,CURRENT_TIMESTAMP),('old','master','m1','DirectPlay',9000,'2020-01-01 00:00:00'),('p2','s2','m2','DirectPlay',1800,CURRENT_TIMESTAMP)`} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	w := httptest.NewRecorder()
	New(db, "sqlite").recoveredServerCompare(w, httptest.NewRequest("GET", "/api/admin/server-compare?servers=master,invalid", nil))
	var result struct {
		Options  []map[string]string `json:"selectableServers"`
		Servers  []map[string]any    `json:"servers"`
		Selected []string            `json:"selectedServerIds"`
		Totals   map[string]any      `json:"totals"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &result)
	if w.Code != 200 || len(result.Options) != 2 || len(result.Servers) != 1 || len(result.Selected) != 1 || result.Totals["plays24h"] != float64(1) || result.Totals["watchHours24h"] != float64(1) {
		t.Fatalf("compare contract: %d %s", w.Code, w.Body)
	}
}
