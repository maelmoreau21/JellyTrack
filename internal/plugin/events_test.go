package plugin

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/maelmoreau21/jellytrack/internal/config"
	"github.com/maelmoreau21/jellytrack/internal/database"
	"golang.org/x/crypto/scrypt"
)

const testKey = "jt_test_plugin_key"
const testPepper = "test-plugin-pepper"

func testServer(t *testing.T) (*sql.DB, *Handler) {
	t.Helper()
	t.Setenv("PLUGIN_KEY_PEPPER", testPepper)
	t.Setenv("PLUGIN_EVENT_RATE_LIMIT_MAX", "10000")
	path := filepath.Join(t.TempDir(), "plugin.db")
	db, err := database.Open(context.Background(), config.Config{DatabaseDriver: "sqlite", DatabasePath: path})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		t.Fatal(err)
	}
	digest, err := scrypt.Key([]byte(testPepper+":"+testKey), salt, 1<<14, 8, 1, keyHashLength)
	if err != nil {
		t.Fatal(err)
	}
	hash := "s1$" + base64.RawURLEncoding.EncodeToString(salt) + "$" + base64.RawURLEncoding.EncodeToString(digest)
	if _, err := db.Exec(`INSERT INTO "GlobalSettings" ("id","pluginApiKey") VALUES ('global',?)`, hash); err != nil {
		t.Fatal(err)
	}
	return db, NewHandler(db, "sqlite", nilLogger())
}

func nilLogger() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

func send(t *testing.T, handler http.Handler, key string, payload any) *httptest.ResponseRecorder {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/plugin/events", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if key != "" {
		req.Header.Set("X-Api-Key", key)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, req)
	return response
}

func baseEvent(event string) map[string]any {
	return map[string]any{
		"event": event, "eventSchemaVersion": 3, "serverId": "jf-test", "serverName": "Jellyfin Test", "serverUrl": "http://jellyfin:8096",
		"user":      map[string]any{"jellyfinUserId": "jf-user", "username": "Alice"},
		"media":     map[string]any{"jellyfinMediaId": "jf-media", "title": "Film test", "type": "Movie", "durationMs": 600000, "libraryName": "Films"},
		"session":   map[string]any{"sessionId": "session-test", "clientName": "Jellyfin Web", "deviceName": "Browser", "playMethod": "DirectPlay"},
		"sessionId": "session-test",
	}
}

func TestPluginAuthenticationRejectsInvalidKeys(t *testing.T) {
	_, handler := testServer(t)
	response := send(t, handler, "incorrect", baseEvent("Heartbeat"))
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", response.Code)
	}
}

func TestPluginDownloadAliasesRecordCompletedViewsAndDeduplicate(t *testing.T) {
	db, handler := testServer(t)
	for _, event := range []string{"MediaDownloaded", "ItemDownloaded", "DownloadCompleted"} {
		payload := baseEvent(event)
		payload["sourceEventId"] = "source-" + event
		payload["observedAtUtc"] = "2026-05-28T12:00:00Z"
		response := send(t, handler, testKey, payload)
		if response.Code != http.StatusOK {
			t.Fatalf("%s status=%d body=%s", event, response.Code, response.Body)
		}
		var views, fullViews int
		if err := db.QueryRow(`SELECT count(*) FROM "PlaybackHistory" WHERE "eventSource"='download' AND "sourceEventId"=? AND "durationWatched"=600 AND "endedAt" IS NOT NULL`, "source-"+event).Scan(&views); err != nil {
			t.Fatal(err)
		}
		if err := db.QueryRow(`SELECT count(*) FROM "TelemetryEvent" WHERE "eventType"='download' AND "metadata" LIKE '%fullView%'`).Scan(&fullViews); err != nil {
			t.Fatal(err)
		}
		if views != 1 || fullViews < 1 {
			t.Fatalf("%s did not create a completed download view", event)
		}
		duplicate := send(t, handler, testKey, payload)
		if duplicate.Code != http.StatusOK || !bytes.Contains(duplicate.Body.Bytes(), []byte(`"duplicate":true`)) {
			t.Fatalf("duplicate %s: %d %s", event, duplicate.Code, duplicate.Body)
		}
	}
}

func TestPluginDownloadRejectsMissingDurationAndHonorsExcludedLibraries(t *testing.T) {
	db, handler := testServer(t)
	missing := baseEvent("MediaDownloaded")
	missing["media"].(map[string]any)["durationMs"] = 0
	if response := send(t, handler, testKey, missing); response.Code != http.StatusBadRequest {
		t.Fatalf("missing duration status=%d", response.Code)
	}
	_, err := db.Exec(`UPDATE "GlobalSettings" SET "excludedLibraries"=? WHERE "id"='global'`, ` ["Films"] `)
	if err != nil {
		t.Fatal(err)
	}
	if response := send(t, handler, testKey, baseEvent("MediaDownloaded")); response.Code != http.StatusOK || !bytes.Contains(response.Body.Bytes(), []byte(`"ignored":true`)) {
		t.Fatalf("excluded library response: %d %s", response.Code, response.Body)
	}
}

func TestEveryPluginEventType(t *testing.T) {
	db, handler := testServer(t)
	start := send(t, handler, testKey, baseEvent("PlaybackStart"))
	if start.Code != 200 {
		t.Fatalf("PlaybackStart: %d %s", start.Code, start.Body)
	}
	progress := baseEvent("PlaybackProgress")
	progress["positionTicks"] = int64(150_000_000)
	if response := send(t, handler, testKey, progress); response.Code != 200 {
		t.Fatalf("PlaybackProgress: %d %s", response.Code, response.Body)
	}
	for _, change := range []string{"pause", "resume", "seek", "audio_change", "subtitle_change", "speed_change"} {
		payload := baseEvent("PlaybackStateChanged")
		payload["changeType"] = change
		payload["positionTicks"] = int64(200_000_000)
		payload["metadata"] = map[string]any{"fromTicks": int64(100_000_000), "toTicks": int64(200_000_000), "toRate": 1.25}
		if response := send(t, handler, testKey, payload); response.Code != 200 {
			t.Fatalf("PlaybackStateChanged %s: %d %s", change, response.Code, response.Body)
		}
	}
	if response := send(t, handler, testKey, baseEvent("Heartbeat")); response.Code != 200 {
		t.Fatalf("Heartbeat: %d %s", response.Code, response.Body)
	}
	items := baseEvent("LibraryChanged")
	items["items"] = []any{map[string]any{"id": "jf-extra", "title": "Extra", "type": "Movie"}}
	if response := send(t, handler, testKey, items); response.Code != 200 {
		t.Fatalf("LibraryChanged: %d %s", response.Code, response.Body)
	}
	if response := send(t, handler, testKey, baseEvent("PlaybackStop")); response.Code != 200 {
		t.Fatalf("PlaybackStop: %d %s", response.Code, response.Body)
	}
	if response := send(t, handler, testKey, baseEvent("SessionEnded")); response.Code != 200 {
		t.Fatalf("SessionEnded: %d %s", response.Code, response.Body)
	}
	var types int
	if err := db.QueryRow(`SELECT count(*) FROM "TelemetryEvent" WHERE "eventType" IN ('pause','resume','seek','audio_change','subtitle_change','speed_change','stop')`).Scan(&types); err != nil {
		t.Fatal(err)
	}
	if types < 7 {
		t.Fatalf("stored only %d event types", types)
	}
	var pauseCount, seekCount, audioChanges, subtitleChanges, speedChanges int
	var maxRate sql.NullFloat64
	if err := db.QueryRow(`SELECT "pauseCount","seekCount","audioChanges","subtitleChanges","speedChangeCount","maxPlaybackRate" FROM "PlaybackHistory" LIMIT 1`).Scan(&pauseCount, &seekCount, &audioChanges, &subtitleChanges, &speedChanges, &maxRate); err != nil {
		t.Fatal(err)
	}
	if pauseCount != 1 || seekCount != 1 || audioChanges != 1 || subtitleChanges != 1 || speedChanges != 1 || !maxRate.Valid || maxRate.Float64 != 1.25 {
		t.Fatalf("unexpected playback counters: pause=%d seek=%d audio=%d subtitle=%d speed=%d maxRate=%v", pauseCount, seekCount, audioChanges, subtitleChanges, speedChanges, maxRate)
	}
	var active int
	if err := db.QueryRow(`SELECT count(*) FROM "ActiveStream"`).Scan(&active); err != nil {
		t.Fatal(err)
	}
	if active != 0 {
		t.Fatalf("%d active streams remain after stop", active)
	}
}

func TestCanonicalJellyfinUUIDsMergeCompactAndDashedForms(t *testing.T) {
	db, handler := testServer(t)
	if response := send(t, handler, testKey, baseEvent("Heartbeat")); response.Code != 200 {
		t.Fatal(response.Body)
	}
	var serverID string
	if err := db.QueryRow(`SELECT "id" FROM "Server" WHERE "jellyfinServerId"='jf-test'`).Scan(&serverID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "User" ("id","serverId","jellyfinUserId","username") VALUES ('compact-user',?,?,?)`, serverID, "aabbccddeeff00112233445566778899", "Old"); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "Media" ("id","serverId","jellyfinMediaId","title","type") VALUES ('compact-media',?,?,?,?)`, serverID, "aabbccddeeff00112233445566778899", "Old title", "Movie"); err != nil {
		t.Fatal(err)
	}
	payload := baseEvent("PlaybackStart")
	payload["user"].(map[string]any)["jellyfinUserId"] = "aabbccdd-eeff-0011-2233-445566778899"
	payload["media"].(map[string]any)["jellyfinMediaId"] = "aabbccdd-eeff-0011-2233-445566778899"
	if response := send(t, handler, testKey, payload); response.Code != 200 {
		t.Fatalf("canonical upsert: %d %s", response.Code, response.Body)
	}
	var userCount, mediaCount int
	if err := db.QueryRow(`SELECT count(*) FROM "User" WHERE "serverId"=? AND "jellyfinUserId" LIKE 'aabbccdd%'`, serverID).Scan(&userCount); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(`SELECT count(*) FROM "Media" WHERE "serverId"=? AND "jellyfinMediaId" LIKE 'aabbccdd%'`, serverID).Scan(&mediaCount); err != nil {
		t.Fatal(err)
	}
	if userCount != 1 || mediaCount != 1 {
		t.Fatalf("normalization left duplicates: users=%d media=%d", userCount, mediaCount)
	}
}

func TestPluginEndpointInputValidationAndCORS(t *testing.T) {
	_, handler := testServer(t)
	for _, tc := range []struct {
		body   string
		status int
	}{{"{", 400}, {`[]`, 400}, {`{"event":"Heartbeat","eventSchemaVersion":2}`, 400}} {
		req := httptest.NewRequest(http.MethodPost, "/api/plugin/events", bytes.NewBufferString(tc.body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Api-Key", testKey)
		resp := httptest.NewRecorder()
		handler.ServeHTTP(resp, req)
		if resp.Code != tc.status {
			t.Fatalf("body %s status=%d want %d", tc.body, resp.Code, tc.status)
		}
	}
	preflight := httptest.NewRecorder()
	handler.ServeHTTP(preflight, httptest.NewRequest(http.MethodOptions, "/api/plugin/events", nil))
	if preflight.Code != 204 || preflight.Header().Get("Access-Control-Allow-Headers") == "" {
		t.Fatalf("unexpected preflight response %d", preflight.Code)
	}
}

func TestScopedPluginKeyMatchesServer(t *testing.T) {
	serverID := "jf test / 1"
	encoded := base64.RawURLEncoding.EncodeToString([]byte(serverID))
	stored := "s1$unused$unused"
	mac := hmac.New(sha256.New, []byte(stored))
	mac.Write([]byte(keyPepperContext))
	mac.Write([]byte{0})
	mac.Write([]byte(serverID))
	token := "jts4." + encoded + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	parsed, scoped := parseScopedToken(token)
	if !scoped || parsed.serverID != serverID || !verifyScoped(stored, parsed.serverID, parsed.signature) {
		t.Fatal("scoped key was not accepted")
	}
	if verifyScoped(stored, parsed.serverID, "invalid") {
		t.Fatal("invalid scoped signature accepted")
	}
}

func TestEventTimestampAndBounds(t *testing.T) {
	parsed := eventTime(map[string]any{"observedAtUtc": "2026-05-28T12:00:00Z"})
	if parsed.IsZero() || parsed.Year() != 2026 {
		t.Fatal("timestamp not parsed")
	}
	if err := validatePayload(map[string]any{"users": make([]any, maxCollectionBatchSize+1)}); err == nil {
		t.Fatal("oversized users list accepted")
	}
}

func TestPostgresPluginCompatibility(t *testing.T) {
	sourceURL := strings.TrimSpace(os.Getenv("JELLYTRACK_TEST_POSTGRES_URL"))
	if sourceURL == "" {
		t.Skip("set JELLYTRACK_TEST_POSTGRES_URL to run the external-PostgreSQL integration test")
	}
	t.Setenv("PLUGIN_KEY_PEPPER", testPepper)
	admin, err := sql.Open("pgx", sourceURL)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()
	if err := admin.PingContext(context.Background()); err != nil {
		t.Fatal(err)
	}
	name, err := newID()
	if err != nil {
		t.Fatal(err)
	}
	schema := "jt_test_" + strings.ReplaceAll(name, "-", "")
	if _, err := admin.Exec(`CREATE SCHEMA "` + schema + `"`); err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = admin.Exec(`DROP SCHEMA "` + schema + `" CASCADE`) }()
	parsed, err := url.Parse(sourceURL)
	if err != nil {
		t.Fatal(err)
	}
	query := parsed.Query()
	query.Set("search_path", schema)
	parsed.RawQuery = query.Encode()
	db, err := database.Open(context.Background(), config.Config{DatabaseDriver: "postgres", DatabaseURL: parsed.String()})
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		t.Fatal(err)
	}
	digest, err := scrypt.Key([]byte(testPepper+":"+testKey), salt, 1<<14, 8, 1, keyHashLength)
	if err != nil {
		t.Fatal(err)
	}
	hash := "s1$" + base64.RawURLEncoding.EncodeToString(salt) + "$" + base64.RawURLEncoding.EncodeToString(digest)
	if _, err := db.Exec(`INSERT INTO "GlobalSettings" ("id","pluginApiKey") VALUES ('global',$1)`, hash); err != nil {
		t.Fatal(err)
	}
	handler := NewHandler(db, "postgres", nilLogger())
	heartbeat := baseEvent("Heartbeat")
	heartbeat["users"] = []any{map[string]any{"id": "pg-user", "name": "Viewer"}}
	if response := send(t, handler, testKey, heartbeat); response.Code != 200 {
		t.Fatalf("PostgreSQL heartbeat: %d %s", response.Code, response.Body)
	}
	payload := baseEvent("MediaDownloaded")
	payload["sourceEventId"] = "pg-download-1"
	payload["media"].(map[string]any)["genres"] = []any{"Drama", "Sci-Fi"}
	if response := send(t, handler, testKey, payload); response.Code != 200 {
		t.Fatalf("PostgreSQL download: %d %s", response.Code, response.Body)
	}
	var views int
	if err := db.QueryRow(`SELECT count(*) FROM "PlaybackHistory" WHERE "eventSource"='download' AND "sourceEventId"='pg-download-1'`).Scan(&views); err != nil || views != 1 {
		t.Fatalf("PostgreSQL imported event rows=%d err=%v", views, err)
	}
	if _, err := db.Exec(`UPDATE "GlobalSettings" SET "excludedLibraries"=$1 WHERE "id"='global'`, []string{"Films"}); err != nil {
		t.Fatal(err)
	}
	if response := send(t, handler, testKey, baseEvent("MediaDownloaded")); response.Code != 200 || !strings.Contains(response.Body.String(), `"ignored":true`) {
		t.Fatalf("PostgreSQL excluded-library response: %d %s", response.Code, response.Body)
	}
}
