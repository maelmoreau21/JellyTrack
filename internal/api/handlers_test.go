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

	// 5. Fallback to JELLYFIN_URL host when ALLOWED_JELLYFIN_HOSTS is empty
	t.Setenv("ALLOWED_JELLYFIN_HOSTS", "")
	t.Setenv("JELLYFIN_URL", "http://jf-url.internal:8096")
	wFallback := httptest.NewRecorder()
	rFallback := httptest.NewRequest("POST", "/api/webhook/jellyfin", strings.NewReader(`{"serverUrl":"http://jf-url.internal:8096","NotificationType":"PlaybackProgress"}`))
	rFallback.Header.Set("Content-Type", "application/json")
	h.jellyfinWebhook(wFallback, rFallback)
	if wFallback.Code != 200 {
		t.Fatalf("expected 200 when falling back to JELLYFIN_URL host, got %d", wFallback.Code)
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

func TestNewHandlersWrappedCollectionsNewsletterServerCompare(t *testing.T) {
	db := apiDB(t)
	_, _ = db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s1','jf1','Server 1','http://jf1')`)
	_, _ = db.Exec(`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u1','s1','jfu1','Alice')`)
	_, _ = db.Exec(`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName","durationMs") VALUES('m1','s1','jfm1','Movie 1','Movie','Films',7200000)`)
	_, _ = db.Exec(`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","durationWatched","startedAt","playMethod") VALUES('p1','s1','u1','m1',3600,'` + time.Now().UTC().Format(time.RFC3339) + `','DirectPlay')`)

	h := New(db, "sqlite")

	// 1. Collections
	wCol := httptest.NewRecorder()
	h.mediaCollections(wCol, httptest.NewRequest("GET", "/api/media/collections", nil))
	if wCol.Code != 200 {
		t.Fatalf("collections status=%d", wCol.Code)
	}
	if !strings.Contains(wCol.Body.String(), "Films") {
		t.Fatalf("expected Films in collections, got: %s", wCol.Body.String())
	}

	// 2. Newsletter data
	wNews := httptest.NewRecorder()
	h.newsletterData(wNews, httptest.NewRequest("GET", "/api/newsletter", nil))
	if wNews.Code != 200 {
		t.Fatalf("newsletter status=%d", wNews.Code)
	}
	if !strings.Contains(wNews.Body.String(), "topMedia") {
		t.Fatalf("expected topMedia in newsletter, got: %s", wNews.Body.String())
	}

	// 3. Server compare
	wComp := httptest.NewRecorder()
	h.serverCompare(wComp, httptest.NewRequest("GET", "/api/admin/server-compare", nil))
	if wComp.Code != 200 {
		t.Fatalf("server compare status=%d", wComp.Code)
	}
	if !strings.Contains(wComp.Body.String(), "Server 1") {
		t.Fatalf("expected Server 1 in serverCompare, got: %s", wComp.Body.String())
	}

	// 4. User Wrapped
	reqWrap := httptest.NewRequest("GET", "/api/wrapped/u1", nil)
	reqWrap.SetPathValue("id", "u1")
	reqWrap = reqWrap.WithContext(context.WithValue(reqWrap.Context(), auth.PrincipalContextKey, auth.Principal{Username: "Alice", Role: "user"}))
	wWrap := httptest.NewRecorder()
	h.userWrapped(wWrap, reqWrap)
	if wWrap.Code != 200 {
		t.Fatalf("userWrapped status=%d: %s", wWrap.Code, wWrap.Body.String())
	}
	if !strings.Contains(wWrap.Body.String(), "totalPlays") {
		t.Fatalf("expected totalPlays in userWrapped, got: %s", wWrap.Body.String())
	}
}

func TestDashboardParityAndEmptyDB(t *testing.T) {
	db := apiDB(t)
	h := New(db, "sqlite")

	// 1. Verify empty DB does not crash or error on any dashboard endpoint
	for _, endpoint := range []struct {
		name    string
		handler func(http.ResponseWriter, *http.Request)
		url     string
	}{
		{"dashboard", h.dashboard, "/api/dashboard?days=7"},
		{"granular", h.granularStats, "/api/stats/granular?timeRange=7d"},
		{"deep", h.deepStats, "/api/stats/deep?timeRange=7d"},
		{"network", h.networkStats, "/api/stats/network?timeRange=7d"},
		{"heatmap-date", h.heatmapDetail, "/api/heatmap-detail?date=2026-10-08"},
		{"heatmap-dayhour", h.heatmapDetail, "/api/heatmap-detail?day=1&hour=12"},
		{"predictions", h.predictions, "/api/predictions"},
	} {
		w := httptest.NewRecorder()
		req := httptest.NewRequest("GET", endpoint.url, nil)
		endpoint.handler(w, req)
		if w.Code != http.StatusOK {
			t.Errorf("endpoint %s failed on empty DB: status=%d, body=%s", endpoint.name, w.Code, w.Body.String())
		}
	}

	// 2. Populate DB and verify all dashboard data structures and charts data
	nowStr := time.Now().UTC().Format(time.RFC3339)
	_, _ = db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s1','jf1','Server 1','http://jf1')`)
	_, _ = db.Exec(`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u1','s1','jfu1','Alice')`)
	_, _ = db.Exec(`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName","durationMs","clientName","device") VALUES('m1','s1','jfm1','Inception','Movie','Films',7200000,'Jellyfin Web','Firefox')`)
	_, _ = db.Exec(`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","durationWatched","startedAt","playMethod","clientName","device","resolution","playDuration") VALUES('p1','s1','u1','m1',3600,'` + nowStr + `','DirectPlay','Jellyfin Web','Firefox','1080p',3600)`)

	wDash := httptest.NewRecorder()
	h.dashboard(wDash, httptest.NewRequest("GET", "/api/dashboard?days=7", nil))
	if wDash.Code != 200 {
		t.Fatalf("dashboard status=%d: %s", wDash.Code, wDash.Body.String())
	}

	var dMap map[string]any
	if err := json.Unmarshal(wDash.Body.Bytes(), &dMap); err != nil {
		t.Fatalf("unmarshal dashboard: %v", err)
	}

	for _, key := range []string{"totalPlays", "todayPlays", "trendData", "hourlyChartData", "dayOfWeekChartData", "categoryPieData", "completionData", "clientCategoryData", "serverLoadData", "yearlyHeatmap"} {
		if _, ok := dMap[key]; !ok {
			t.Errorf("missing key in dashboard response: %s", key)
		}
	}
}

func TestImageProxyFallbackAndAliases(t *testing.T) {
	db := apiDB(t)
	h := New(db, "sqlite")

	// 1. Image proxy fallback SVG when server/image not reachable
	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/api/jellyfin/image?id=missing-id&type=Primary", nil)
	h.jellyfinImageProxy(w, req)
	if w.Code != 200 {
		t.Fatalf("expected 200 for fallback image, got %d", w.Code)
	}
	if !strings.Contains(w.Header().Get("Content-Type"), "image/svg+xml") {
		t.Fatalf("expected image/svg+xml, got %s", w.Header().Get("Content-Type"))
	}
	if !strings.Contains(w.Body.String(), "<svg") {
		t.Fatalf("expected svg body, got %s", w.Body.String())
	}

	// 2. User image proxy fallback SVG
	wUser := httptest.NewRecorder()
	reqUser := httptest.NewRequest("GET", "/api/jellyfin/user-image?id=missing-user", nil)
	h.jellyfinUserImageProxy(wUser, reqUser)
	if wUser.Code != 200 {
		t.Fatalf("expected 200 for fallback avatar, got %d", wUser.Code)
	}
	if !strings.Contains(wUser.Header().Get("Content-Type"), "image/svg+xml") {
		t.Fatalf("expected image/svg+xml, got %s", wUser.Header().Get("Content-Type"))
	}
}

func TestUserDetailAndWrappedMeResolution(t *testing.T) {
	db := apiDB(t)
	h := New(db, "sqlite")

	_, _ = db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s1','jf1','Primary','http://jf1')`)
	_, _ = db.Exec(`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u1','s1','jfu1','Bob')`)
	_, _ = db.Exec(`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type") VALUES('m1','s1','jfm1','Movie 1','Movie')`)
	if _, err := db.Exec(`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","durationWatched","pauseCount","seekCount") VALUES('p1','s1','u1','m1','DirectPlay',1800,2,1)`); err != nil {
		t.Fatal(err)
	}

	principal := auth.Principal{
		Username:       "Bob",
		Role:           "user",
		JellyfinUserID: "jfu1",
	}

	// 1. userDetail with "me"
	wMe := httptest.NewRecorder()
	reqMe := httptest.NewRequest("GET", "/api/users/me", nil)
	reqMe.SetPathValue("id", "me")
	ctxMe := context.WithValue(reqMe.Context(), auth.PrincipalContextKey, principal)
	h.userDetail(wMe, reqMe.WithContext(ctxMe))
	if wMe.Code != 200 {
		t.Fatalf("userDetail 'me' failed: status=%d, body=%s", wMe.Code, wMe.Body.String())
	}
	var uRes map[string]any
	if err := json.Unmarshal(wMe.Body.Bytes(), &uRes); err != nil {
		t.Fatal(err)
	}
	if uRes["username"] != "Bob" || uRes["jellyfinUserId"] != "jfu1" {
		t.Fatalf("unexpected userDetail response: %+v", uRes)
	}

	// 2. mediaDetail telemetry stats
	wMed := httptest.NewRecorder()
	reqMed := httptest.NewRequest("GET", "/api/media/m1", nil)
	reqMed.SetPathValue("id", "m1")
	h.mediaDetail(wMed, reqMed)
	if wMed.Code != 200 {
		t.Fatalf("mediaDetail failed: status=%d, body=%s", wMed.Code, wMed.Body.String())
	}
	var mRes map[string]any
	if err := json.Unmarshal(wMed.Body.Bytes(), &mRes); err != nil {
		t.Fatal(err)
	}
	if int(mRes["pauseCount"].(float64)) != 2 || int(mRes["seekCount"].(float64)) != 1 {
		t.Fatalf("expected telemetry counts in mediaDetail, got: %+v", mRes)
	}
}

func TestAdminHealthAndPluginKey(t *testing.T) {
	db := apiDB(t)
	h := New(db, "sqlite")

	// Set health state in SystemHealthState
	now := time.Now().UTC().Format(time.RFC3339)
	syncJSON := `{"status":"ok","lastSuccessAt":"` + now + `","lastUsers":5,"lastMedia":100}`
	backupJSON := `{"status":"ok","lastSuccessAt":"` + now + `","lastFileName":"test.zip"}`
	_, _ = db.Exec(`INSERT INTO "SystemHealthState"("id","sync","backup") VALUES('global', ?, ?)`, syncJSON, backupJSON)

	wHealth := httptest.NewRecorder()
	h.adminHealth(wHealth, httptest.NewRequest("GET", "/api/admin/health", nil))
	if wHealth.Code != 200 {
		t.Fatalf("adminHealth failed: status=%d, body=%s", wHealth.Code, wHealth.Body.String())
	}
	var hRes map[string]any
	if err := json.Unmarshal(wHealth.Body.Bytes(), &hRes); err != nil {
		t.Fatal(err)
	}
	st := hRes["status"].(map[string]any)
	syncMap := st["sync"].(map[string]any)
	if syncMap["lastSuccessAt"] != now {
		t.Fatalf("expected sync lastSuccessAt=%s, got: %+v", now, syncMap)
	}

	// Test rotate and get plugin api key
	wRotate := httptest.NewRecorder()
	reqRotate := httptest.NewRequest("POST", "/api/admin/plugin-api-key/rotate", nil)
	h.rotatePluginApiKey(wRotate, reqRotate)
	if wRotate.Code != 200 {
		t.Fatalf("rotatePluginApiKey failed: status=%d, body=%s", wRotate.Code, wRotate.Body.String())
	}
	var rotRes map[string]any
	_ = json.Unmarshal(wRotate.Body.Bytes(), &rotRes)
	if rotRes["apiKey"] == "" || rotRes["pluginApiKey"] == "" {
		t.Fatalf("expected apiKey and pluginApiKey in rotate response, got: %+v", rotRes)
	}

	wGet := httptest.NewRecorder()
	h.getPluginApiKey(wGet, httptest.NewRequest("GET", "/api/admin/plugin-api-key", nil))
	if wGet.Code != 200 {
		t.Fatalf("getPluginApiKey failed: status=%d", wGet.Code)
	}
	var getRes map[string]any
	_ = json.Unmarshal(wGet.Body.Bytes(), &getRes)
	if getRes["apiKey"] != rotRes["apiKey"] {
		t.Fatalf("expected matching apiKey, got: %+v", getRes)
	}
}

func TestSettingsFullCoverage(t *testing.T) {
	db := apiDB(t)
	h := New(db, "sqlite")

	_, _ = db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s1','jf1','Primary','http://jf1')`)
	_, _ = db.Exec(`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName") VALUES('m1','s1','j1','Movie 1','Movie','Films'), ('m2','s1','j2','Show 1','Series','Series')`)

	wGet := httptest.NewRecorder()
	h.getSettings(wGet, httptest.NewRequest("GET", "/api/settings", nil))
	if wGet.Code != 200 {
		t.Fatalf("getSettings failed: status=%d", wGet.Code)
	}
	var sMap map[string]any
	_ = json.Unmarshal(wGet.Body.Bytes(), &sMap)
	libs := sMap["availableLibraries"].([]any)
	if len(libs) < 2 {
		t.Fatalf("expected at least 2 availableLibraries, got: %+v", libs)
	}

	// Update settings
	updateBody := `{"maxConcurrentTranscodes": 4, "discordAlertsEnabled": true, "syncCronHour": 5}`
	wUp := httptest.NewRecorder()
	h.updateSettings(wUp, httptest.NewRequest("POST", "/api/settings", strings.NewReader(updateBody)))
	if wUp.Code != 200 {
		t.Fatalf("updateSettings failed: status=%d", wUp.Code)
	}

	wGet2 := httptest.NewRecorder()
	h.getSettings(wGet2, httptest.NewRequest("GET", "/api/settings", nil))
	var sMap2 map[string]any
	_ = json.Unmarshal(wGet2.Body.Bytes(), &sMap2)
	if int(sMap2["maxConcurrentTranscodes"].(float64)) != 4 || sMap2["discordAlertsEnabled"] != true || int(sMap2["syncCronHour"].(float64)) != 5 {
		t.Fatalf("expected updated settings, got: %+v", sMap2)
	}
}


