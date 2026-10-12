package api

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/plugin"
	"github.com/maelmoreau21/jellytrack/internal/security"
	"github.com/maelmoreau21/jellytrack/internal/settings"
)

func TestSecurityOverviewReflectsAcceptedHeartbeat(t *testing.T) {
	db := apiDB(t)
	if _, err := db.Exec(`INSERT INTO "GlobalSettings"("id") VALUES('global')`); err != nil {
		t.Fatal(err)
	}
	key, err := settings.RotateGlobalPluginKey(t.Context(), db, "sqlite")
	if err != nil {
		t.Fatal(err)
	}
	h := New(db, "sqlite")
	read := func() security.SecurityOverviewResult {
		w := httptest.NewRecorder()
		h.securityOverview(w, httptest.NewRequest("GET", "/api/admin/security/overview", nil))
		if w.Code != 200 {
			t.Fatalf("overview: %d %s", w.Code, w.Body)
		}
		if strings.Contains(w.Body.String(), key) || strings.Contains(w.Body.String(), "pluginApiKey") {
			t.Fatal("overview exposes key")
		}
		var result security.SecurityOverviewResult
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		return result
	}
	before := read()
	if before.Plugin.Connected || before.Plugin.LastSeen != nil {
		t.Fatal("plugin online before receiving an event")
	}
	receiver := plugin.NewHandler(db, "sqlite", slog.New(slog.NewTextHandler(io.Discard, nil)))
	payload := `{"event":"Heartbeat","eventSchemaVersion":3,"serverId":"jf-test","serverName":"My Jellyfin","pluginVersion":"2.1.0.0","users":[]}`
	req := httptest.NewRequest("POST", "/api/plugin/events", strings.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+key)
	w := httptest.NewRecorder()
	receiver.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("heartbeat: %d %s", w.Code, w.Body)
	}
	after := read()
	if !after.Plugin.Connected || after.Plugin.ServerName == nil || *after.Plugin.ServerName != "My Jellyfin" || after.Plugin.Version == nil || *after.Plugin.Version != "2.1.0.0" || after.Plugin.LastSeen == nil {
		t.Fatalf("heartbeat missing from overview: %+v", after.Plugin)
	}
	if _, err := db.Exec(`UPDATE "GlobalSettings" SET "pluginLastSeen"=? WHERE "id"='global'`, time.Now().Add(-11*time.Minute).UTC().Format(time.RFC3339Nano)); err != nil {
		t.Fatal(err)
	}
	stale := read()
	if stale.Plugin.Connected || stale.Plugin.LastSeen == nil || stale.Plugin.Version == nil {
		t.Fatal("stale status must go offline and retain last received metadata")
	}
}

func TestSecurityOverviewPluginTimeoutAndMissingTelemetry(t *testing.T) {
	for _, tc := range []struct {
		name, seen, timeout string
		connected           bool
	}{
		{"never received", "", "600", false},
		{"malformed", "bad-date", "600", false},
		{"future", time.Now().Add(time.Hour).UTC().Format(time.RFC3339Nano), "600", false},
		{"custom timeout", time.Now().Add(-3 * time.Minute).UTC().Format(time.RFC3339Nano), "120", false},
		{"default ten minutes", time.Now().Add(-3 * time.Minute).UTC().Format(time.RFC3339Nano), "600", true},
		{"invalid timeout fallback", time.Now().Add(-3 * time.Minute).UTC().Format(time.RFC3339Nano), "invalid", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("PLUGIN_HEARTBEAT_TIMEOUT_SEC", tc.timeout)
			db := apiDB(t)
			if _, err := db.Exec(`INSERT INTO "GlobalSettings"("id","pluginLastSeen") VALUES('global',?)`, tc.seen); err != nil {
				t.Fatal(err)
			}
			w := httptest.NewRecorder()
			New(db, "sqlite").securityOverview(w, httptest.NewRequest("GET", "/api/admin/security/overview", nil))
			var response struct {
				Plugin security.PluginStatus `json:"plugin"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
				t.Fatal(err)
			}
			if w.Code != 200 || response.Plugin.Connected != tc.connected {
				t.Fatalf("unexpected overview: %d %s", w.Code, w.Body)
			}
		})
	}
}
