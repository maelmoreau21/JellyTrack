package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/auth"
	"github.com/maelmoreau21/jellytrack/internal/config"
	"github.com/maelmoreau21/jellytrack/internal/database"
)

func apiDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := database.Open(context.Background(), config.Config{DatabaseDriver: "sqlite", DatabasePath: filepath.Join(t.TempDir(), "api.db")})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func TestDashboardReadsPersistedData(t *testing.T) {
	db := apiDB(t)
	for _, q := range []string{`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','jf','Jellyfin','http://jellyfin')`, `INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s','jf-u','Mael')`, `INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type") VALUES('m','s','jf-m','Film','Movie')`, `INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName") VALUES('m2','s','jf-m2','Kids film','Movie','Kids')`, `INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","durationWatched") VALUES('p','s','u','m','DirectPlay',3600000)`, `INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","durationWatched") VALUES('p2','s','u','m2','DirectPlay',900000)`, `INSERT INTO "GlobalSettings"("id","excludedLibraries") VALUES('global','["Kids"]')`} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	w := httptest.NewRecorder()
	New(db, "sqlite").dashboard(w, httptest.NewRequest("GET", "/api/dashboard?days=30", nil))
	if w.Code != 200 {
		t.Fatalf("status=%d: %s", w.Code, w.Body.String())
	}
	var result struct {
		Views    int64            `json:"views"`
		Duration int64            `json:"durationMs"`
		Users    int64            `json:"users"`
		Media    int64            `json:"media"`
		Activity []map[string]any `json:"activity"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Views != 1 || result.Duration != 3600000 || result.Users != 1 || result.Media != 2 || len(result.Activity) != 1 {
		t.Fatalf("unexpected dashboard data: %+v", result)
	}
}

func TestPaginationBoundsAreEnforced(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/users?limit=999&offset=-5", nil)
	limit, offset := page(req)
	if limit != 200 || offset != 0 {
		t.Fatalf("page = %d,%d", limit, offset)
	}
}

func TestDeepStatsAndGeoStats(t *testing.T) {
	db := apiDB(t)
	_, _ = db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s1','jf1','S1','http://j1')`)
	_, _ = db.Exec(`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","directors","actors","studios") VALUES('m1','s1','jm1','Film 1','Movie','["Christopher Nolan"]','["Leonardo DiCaprio"]','["Warner Bros"]')`)
	_, _ = db.Exec(`INSERT INTO "PlaybackHistory"("id","serverId","mediaId","playMethod","country","city","durationWatched") VALUES('p1','s1','m1','DirectPlay','France','Paris',3600)`)

	h := New(db, "sqlite")

	// 1. deep stats
	w := httptest.NewRecorder()
	h.deepStats(w, httptest.NewRequest("GET", "/api/stats/deep", nil))
	if w.Code != 200 {
		t.Fatalf("deep stats status=%d", w.Code)
	}

	// 2. geo stats
	wGeo := httptest.NewRecorder()
	h.geoStats(wGeo, httptest.NewRequest("GET", "/api/geo-stats", nil))
	if wGeo.Code != 200 {
		t.Fatalf("geo stats status=%d", wGeo.Code)
	}

	// 3. search
	wSearch := httptest.NewRecorder()
	h.search(wSearch, httptest.NewRequest("GET", "/api/search?q=Film", nil))
	if wSearch.Code != 200 {
		t.Fatalf("search status=%d", wSearch.Code)
	}

	// 4. media list
	wMedia := httptest.NewRecorder()
	h.mediaList(wMedia, httptest.NewRequest("GET", "/api/media", nil))
	if wMedia.Code != 200 {
		t.Fatalf("media list status=%d", wMedia.Code)
	}
}

func TestServerCRUDAndSSRFPrevention(t *testing.T) {
	db := apiDB(t)
	h := New(db, "sqlite")

	// 1. SSRF URL rejection
	ssrfPayload := strings.NewReader(`{"name":"Evil","url":"http://169.254.169.254/latest/meta-data","apiKey":"test"}`)
	wSSRF := httptest.NewRecorder()
	h.saveServer(wSSRF, httptest.NewRequest("POST", "/api/settings/jellyfin-servers", ssrfPayload))
	if wSSRF.Code != 400 {
		t.Fatalf("expected 400 for cloud metadata url, got %d", wSSRF.Code)
	}

	// 2. Valid server create
	createPayload := strings.NewReader(`{"name":"Primary","url":"https://jellyfin.example.com","apiKey":"validkey","isActive":true}`)
	wCreate := httptest.NewRecorder()
	h.saveServer(wCreate, httptest.NewRequest("POST", "/api/settings/jellyfin-servers", createPayload))
	if wCreate.Code != 200 {
		t.Fatalf("create status=%d: %s", wCreate.Code, wCreate.Body.String())
	}
	var createRes struct {
		ID     string `json:"id"`
		Server struct {
			ID   string `json:"id"`
			Name string `json:"name"`
			URL  string `json:"url"`
		} `json:"server"`
	}
	if err := json.Unmarshal(wCreate.Body.Bytes(), &createRes); err != nil {
		t.Fatal(err)
	}
	if createRes.ID == "" || createRes.Server.Name != "Primary" {
		t.Fatalf("unexpected server create response: %+v", createRes)
	}

	// 3. Patch server
	patchPayload := strings.NewReader(`{"id":"` + createRes.ID + `","name":"Primary Renamed","allowAuthFallback":false}`)
	wPatch := httptest.NewRecorder()
	h.updateServer(wPatch, httptest.NewRequest("PATCH", "/api/settings/jellyfin-servers", patchPayload))
	if wPatch.Code != 200 {
		t.Fatalf("patch status=%d: %s", wPatch.Code, wPatch.Body.String())
	}

	// 4. List servers
	wList := httptest.NewRecorder()
	h.listServers(wList, httptest.NewRequest("GET", "/api/settings/jellyfin-servers", nil))
	if wList.Code != 200 {
		t.Fatalf("list status=%d", wList.Code)
	}
	var listRes struct {
		Servers []map[string]any `json:"servers"`
	}
	_ = json.Unmarshal(wList.Body.Bytes(), &listRes)
	if len(listRes.Servers) != 1 || listRes.Servers[0]["name"] != "Primary Renamed" {
		t.Fatalf("unexpected list response: %+v", listRes)
	}

	// 5. Delete server
	delPayload := strings.NewReader(`{"id":"` + createRes.ID + `"}`)
	wDel := httptest.NewRecorder()
	h.deleteServer(wDel, httptest.NewRequest("DELETE", "/api/settings/jellyfin-servers", delPayload))
	if wDel.Code != 200 {
		t.Fatalf("delete status=%d", wDel.Code)
	}
}

func TestJellyfinWebhookEnforcementAndForwarding(t *testing.T) {
	db := apiDB(t)
	var forwardedBody string
	mockPlugin := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		buf := make([]byte, 1024)
		n, _ := r.Body.Read(buf)
		forwardedBody = string(buf[:n])
		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	h := New(db, "sqlite", mockPlugin)

	// 1. Without ALLOWED_JELLYFIN_HOSTS -> 503
	t.Setenv("ALLOWED_JELLYFIN_HOSTS", "")
	wEmpty := httptest.NewRecorder()
	h.jellyfinWebhook(wEmpty, httptest.NewRequest("POST", "/api/webhook/jellyfin", strings.NewReader(`{}`)))
	if wEmpty.Code != 503 {
		t.Fatalf("expected 503 when ALLOWED_JELLYFIN_HOSTS empty, got %d", wEmpty.Code)
	}

	// 2. Not JSON -> 415
	t.Setenv("ALLOWED_JELLYFIN_HOSTS", "jf.local")
	wNotJSON := httptest.NewRecorder()
	rNotJSON := httptest.NewRequest("POST", "/api/webhook/jellyfin", strings.NewReader("text"))
	rNotJSON.Header.Set("Content-Type", "text/plain")
	h.jellyfinWebhook(wNotJSON, rNotJSON)
	if wNotJSON.Code != 415 {
		t.Fatalf("expected 415 for non-JSON, got %d", wNotJSON.Code)
	}

	// 3. Unauthorized host -> 403
	wUnauth := httptest.NewRecorder()
	rUnauth := httptest.NewRequest("POST", "/api/webhook/jellyfin", strings.NewReader(`{"serverUrl":"http://evil.com"}`))
	rUnauth.Header.Set("Content-Type", "application/json")
	h.jellyfinWebhook(wUnauth, rUnauth)
	if wUnauth.Code != 403 {
		t.Fatalf("expected 403 for unauthorized host, got %d", wUnauth.Code)
	}

	// 4. Authorized host -> forwards to plugin handler
	wAuth := httptest.NewRecorder()
	rAuth := httptest.NewRequest("POST", "/api/webhook/jellyfin", strings.NewReader(`{"serverUrl":"http://jf.local:8096","NotificationType":"PlaybackStart"}`))
	rAuth.Header.Set("Content-Type", "application/json")
	h.jellyfinWebhook(wAuth, rAuth)
	if wAuth.Code != 200 {
		t.Fatalf("expected 200 for authorized host, got %d", wAuth.Code)
	}
	if !strings.Contains(forwardedBody, "PlaybackStart") {
		t.Fatalf("expected forwarded payload to contain PlaybackStart, got: %s", forwardedBody)
	}
}

func TestUserActiveStreamRBAC(t *testing.T) {
	db := apiDB(t)
	_, _ = db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','jf','Jellyfin','http://jf')`)
	_, _ = db.Exec(`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u1','s','jf-u1','alice')`)
	_, _ = db.Exec(`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u2','s','jf-u2','bob')`)
	_, _ = db.Exec(`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type") VALUES('m1','s','jm1','Movie 1','Movie')`)
	_, _ = db.Exec(`INSERT INTO "ActiveStream"("id","serverId","sessionId","userId","mediaId","playMethod","startedAt") VALUES('st1','s','sess1','u1','m1','DirectPlay','2026-10-08T00:00:00Z')`)

	h := New(db, "sqlite")

	// 1. Non-admin querying someone else -> 403
	rAliceReqBob := httptest.NewRequest("GET", "/api/users/jf-u2/active-stream", nil)
	rAliceReqBob.SetPathValue("id", "jf-u2")
	aliceCtx := context.WithValue(rAliceReqBob.Context(), auth.PrincipalContextKey, auth.Principal{Username: "alice", Role: "user"})
	rAliceReqBob = rAliceReqBob.WithContext(aliceCtx)
	wAliceReqBob := httptest.NewRecorder()
	h.userActiveStream(wAliceReqBob, rAliceReqBob)
	if wAliceReqBob.Code != 403 {
		t.Fatalf("expected 403 for non-admin querying another user, got %d", wAliceReqBob.Code)
	}

	// 2. Non-admin querying themselves -> 200 with active stream
	rAliceReqSelf := httptest.NewRequest("GET", "/api/users/jf-u1/active-stream", nil)
	rAliceReqSelf.SetPathValue("id", "jf-u1")
	rAliceReqSelf = rAliceReqSelf.WithContext(aliceCtx)
	wAliceReqSelf := httptest.NewRecorder()
	h.userActiveStream(wAliceReqSelf, rAliceReqSelf)
	if wAliceReqSelf.Code != 200 {
		t.Fatalf("expected 200 for user querying own stream, got %d: %s", wAliceReqSelf.Code, wAliceReqSelf.Body.String())
	}
	var selfRes struct {
		ActiveStream map[string]any `json:"activeStream"`
		Stream       map[string]any `json:"stream"`
	}
	_ = json.Unmarshal(wAliceReqSelf.Body.Bytes(), &selfRes)
	if selfRes.ActiveStream == nil || selfRes.ActiveStream["sessionId"] != "sess1" {
		t.Fatalf("unexpected stream response: %+v", selfRes)
	}

	// 3. Admin querying anyone -> 200
	adminCtx := context.WithValue(rAliceReqBob.Context(), auth.PrincipalContextKey, auth.Principal{Username: "admin", Role: "admin"})
	rAdmin := httptest.NewRequest("GET", "/api/users/jf-u1/active-stream", nil)
	rAdmin.SetPathValue("id", "jf-u1")
	rAdmin = rAdmin.WithContext(adminCtx)
	wAdmin := httptest.NewRecorder()
	h.userActiveStream(wAdmin, rAdmin)
	if wAdmin.Code != 200 {
		t.Fatalf("expected 200 for admin, got %d", wAdmin.Code)
	}
}

func TestStreamsAndTelemetryMediaGrouping(t *testing.T) {
	db := apiDB(t)
	_, _ = db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','jf','Jellyfin','http://jf')`)
	_, _ = db.Exec(`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s','jf-u','Mael')`)
	_, _ = db.Exec(`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","durationMs") VALUES('m','s','jmid-100','The Movie','Movie',7200000)`)
	_, _ = db.Exec(`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","durationWatched","startedAt") VALUES('play1','s','u','m','DirectPlay',3600,'2026-10-08T00:00:00Z')`)
	_, err := db.Exec(`INSERT INTO "TelemetryEvent"("id","serverId","playbackId","eventType","positionMs","createdAt") VALUES('te1','s','play1','pause',120000,'2026-10-08T00:02:00Z')`)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = db.Exec(`INSERT INTO "ActiveStream"("id","serverId","sessionId","userId","mediaId","playMethod","deviceName","bitrate","positionTicks","startedAt") VALUES('st1','s','sess1','u','m','DirectPlay','Shield TV',20000000,36000000000,'2026-10-08T00:00:00Z')`)

	h := New(db, "sqlite")

	// 1. GET /api/streams
	wStreams := httptest.NewRecorder()
	h.streams(wStreams, httptest.NewRequest("GET", "/api/streams", nil))
	if wStreams.Code != 200 {
		t.Fatalf("streams status=%d", wStreams.Code)
	}
	var streamsRes struct {
		Streams            []map[string]any `json:"streams"`
		Count              int              `json:"count"`
		TotalBandwidthMbps float64          `json:"totalBandwidthMbps"`
	}
	_ = json.Unmarshal(wStreams.Body.Bytes(), &streamsRes)
	if streamsRes.Count != 1 || streamsRes.Streams[0]["itemId"] != "jmid-100" || streamsRes.Streams[0]["device"] != "Shield TV" {
		t.Fatalf("unexpected streams response: %+v", streamsRes)
	}

	// 2. GET /api/streams/telemetry?mediaId=jmid-100
	wTelem := httptest.NewRecorder()
	h.streamsTelemetry(wTelem, httptest.NewRequest("GET", "/api/streams/telemetry?mediaId=jmid-100", nil))
	if wTelem.Code != 200 {
		t.Fatalf("telemetry status=%d: %s", wTelem.Code, wTelem.Body.String())
	}
	var telemRes struct {
		MediaID  string `json:"mediaId"`
		Sessions []struct {
			ID              string           `json:"id"`
			TelemetryEvents []map[string]any `json:"telemetryEvents"`
		} `json:"sessions"`
	}
	_ = json.Unmarshal(wTelem.Body.Bytes(), &telemRes)
	if len(telemRes.Sessions) != 1 || len(telemRes.Sessions[0].TelemetryEvents) != 1 {
		t.Fatalf("unexpected telemetry media response: %+v", telemRes)
	}
}

func TestHeatmapDrilldownAndMatrix(t *testing.T) {
	db := apiDB(t)
	_, _ = db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','jf','Jellyfin','http://jf')`)
	_, _ = db.Exec(`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s','jf-u','Mael')`)
	_, _ = db.Exec(`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type") VALUES('m','s','jm','Movie','Movie')`)
	nowStr := time.Now().UTC().Format(time.RFC3339Nano)
	_, _ = db.Exec(`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","durationWatched","startedAt","playMethod") VALUES('p1','s','u','m',3600,?,'DirectPlay')`, nowStr)

	h := New(db, "sqlite")

	// 1. Full heatmap
	wHM := httptest.NewRecorder()
	h.heatmapDetail(wHM, httptest.NewRequest("GET", "/api/heatmap-detail", nil))
	if wHM.Code != 200 {
		t.Fatalf("heatmap status=%d", wHM.Code)
	}
	var hmRes struct {
		Heatmap []map[string]any `json:"heatmap"`
	}
	_ = json.Unmarshal(wHM.Body.Bytes(), &hmRes)
	if len(hmRes.Heatmap) == 0 {
		t.Fatalf("expected heatmap points, got 0")
	}

	// 2. Drilldown by day/hour
now := time.Now().UTC()
	dayStr := strconv.Itoa(int(now.Weekday()))
	hourStr := strconv.Itoa(now.Hour())
	wDrill := httptest.NewRecorder()
	h.heatmapDetail(wDrill, httptest.NewRequest("GET", "/api/heatmap-detail?day="+dayStr+"&hour="+hourStr, nil))
	if wDrill.Code != 200 {
		t.Fatalf("drilldown status=%d", wDrill.Code)
	}
	var drillRes struct {
		Sessions []map[string]any `json:"sessions"`
	}
	_ = json.Unmarshal(wDrill.Body.Bytes(), &drillRes)
	if len(drillRes.Sessions) != 1 {
		t.Fatalf("expected 1 drilldown session, got %d", len(drillRes.Sessions))
	}
}

func TestAdminEndpoints(t *testing.T) {
	db := apiDB(t)
	_, err := db.Exec(`INSERT INTO "GlobalSettings"("id","ssoSettings") VALUES('global','{"enabled":true,"url":"https://sso.example.com","clientId":"client1","clientSecret":"secret1"}')`)
	if err != nil {
		t.Fatal(err)
	}

	h := New(db, "sqlite")

	// 1. Health
	wH := httptest.NewRecorder()
	h.adminHealth(wH, httptest.NewRequest("GET", "/api/admin/health", nil))
	if wH.Code != 200 {
		t.Fatalf("admin health status=%d", wH.Code)
	}

	// 2. Smart settings
	wSmartGet := httptest.NewRecorder()
	h.getSmartSettings(wSmartGet, httptest.NewRequest("GET", "/api/admin/security/smart-settings", nil))
	if wSmartGet.Code != 200 {
		t.Fatalf("smart settings GET status=%d", wSmartGet.Code)
	}

	wSmartPatch := httptest.NewRecorder()
	h.updateSmartSettings(wSmartPatch, httptest.NewRequest("PATCH", "/api/admin/security/smart-settings", strings.NewReader(`{"thresholds":{"maxFailedLoginsPerIp":10}}`)))
	if wSmartPatch.Code != 200 {
		t.Fatalf("smart settings PATCH status=%d", wSmartPatch.Code)
	}

	// 3. SSO settings (masks secret)
	wSSO := httptest.NewRecorder()
	h.getSSO(wSSO, httptest.NewRequest("GET", "/api/settings/sso", nil))
	if wSSO.Code != 200 {
		t.Fatalf("sso GET status=%d", wSSO.Code)
	}
	var ssoRes map[string]any
	_ = json.Unmarshal(wSSO.Body.Bytes(), &ssoRes)
	sec, ok := ssoRes["clientSecret"].(string)
	if !ok || !strings.Contains(sec, "••••••••") {
		t.Fatalf("clientSecret should be masked, got: %v", ssoRes["clientSecret"])
	}

	// 4. Consolidate history
	wCons := httptest.NewRecorder()
	h.adminConsolidateHistory(wCons, httptest.NewRequest("POST", "/api/admin/consolidate-history", strings.NewReader(`{"mergeWindowMinutes":30}`)))
	if wCons.Code != 200 {
		t.Fatalf("consolidate status=%d", wCons.Code)
	}

	// 5. Integrity cleanup
	wClean := httptest.NewRecorder()
	h.adminIntegrityCleanup(wClean, httptest.NewRequest("POST", "/api/admin/integrity-cleanup", nil))
	if wClean.Code != 200 {
		t.Fatalf("integrity status=%d", wClean.Code)
	}
}
