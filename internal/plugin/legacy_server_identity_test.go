package plugin

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestLegacyIdentityWithRealPluginFixtures(t *testing.T) {
	path := os.Getenv("JELLYTRACK_CONTRACT_OUTPUT")
	if path == "" {
		t.Skip("set JELLYTRACK_CONTRACT_OUTPUT to the C# serializer fixture")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var events []map[string]any
	if err := json.Unmarshal(data, &events); err != nil {
		t.Fatal(err)
	}
	if len(events) < 7 {
		t.Fatal("incomplete plugin fixture")
	}
	db, h := testServer(t)
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, `{"Id":"contract-jellyfin"}`) }))
	defer remote.Close()
	if _, err := db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('existing','master','Existing',?)`, remote.URL); err != nil {
		t.Fatal(err)
	}
	var hash string
	if err := db.QueryRow(`SELECT "pluginApiKey" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&hash); err != nil {
		t.Fatal(err)
	}
	key, _ := ScopedKey(hash, "master")
	families := map[string]bool{}
	for _, event := range events {
		families[event["event"].(string)] = true
		if response := send(t, h, key, event); response.Code != 200 {
			t.Fatalf("%s: %d %s", event["event"], response.Code, response.Body)
		}
	}
	if len(families) != 7 {
		t.Fatalf("event families=%d", len(families))
	}
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM "Server"`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("servers=%d %v", count, err)
	}
	for _, table := range []string{"User", "Media", "PlaybackHistory", "TelemetryEvent"} {
		if err := db.QueryRow(`SELECT COUNT(*) FROM "` + table + `" WHERE "serverId"<>'existing'`).Scan(&count); err != nil || count != 0 {
			t.Fatalf("%s routed to wrong server: %d %v", table, count, err)
		}
	}
}

func TestLegacyScopedServerIdentity(t *testing.T) {
	const actual = "00112233445566778899aabbccddeeff"
	for _, tc := range []struct {
		name, scope, remoteBody string
		status, expected        int
	}{
		{"master alias", "master", `{"Id":"` + actual + `"}`, 200, 200},
		{"host alias", "srv:jellyfin_8096", `{"Id":"` + actual + `"}`, 200, 200},
		{"UUID representation", "master", `{"Id":"00112233-4455-6677-8899-AABBCCDDEEFF"}`, 200, 200},
		{"other Jellyfin", "master", `{"Id":"different-server"}`, 200, 403},
		{"empty identity", "master", `{"Id":""}`, 200, 403},
		{"invalid JSON", "master", `{`, 200, 403},
		{"oversized response", "master", strings.Repeat(" ", 65537), 200, 403},
		{"unavailable", "master", `{"Id":"` + actual + `"}`, 503, 403},
		{"distinct established UUID", "ffffffffffffffffffffffffffffffff", `{"Id":"` + actual + `"}`, 200, 403},
	} {
		t.Run(tc.name, func(t *testing.T) {
			db, h := testServer(t)
			var probes atomic.Int32
			remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				probes.Add(1)
				if r.URL.Path != "/jellyfin/System/Info/Public" || r.Header.Get("Authorization") != "" || r.Header.Get("X-MediaBrowser-Token") != "" {
					t.Errorf("unexpected probe: %s", r.URL.Path)
				}
				w.WriteHeader(tc.status)
				fmt.Fprint(w, tc.remoteBody)
			}))
			defer remote.Close()
			configuredURL := remote.URL + "/jellyfin"
			if _, err := db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('existing',?,'Existing',?)`, tc.scope, configuredURL); err != nil {
				t.Fatal(err)
			}
			var hash string
			if err := db.QueryRow(`SELECT "pluginApiKey" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&hash); err != nil {
				t.Fatal(err)
			}
			key, _ := ScopedKey(hash, tc.scope)
			p := baseEvent("Heartbeat")
			p["serverId"] = actual
			p["serverUrl"] = "http://untrusted-plugin-url:8096"
			p["serverName"] = "Untrusted name"
			response := send(t, h, key, p)
			if response.Code != tc.expected {
				t.Fatalf("status=%d want=%d: %s", response.Code, tc.expected, response.Body)
			}
			var count int
			if err := db.QueryRow(`SELECT COUNT(*) FROM "Server"`).Scan(&count); err != nil || count != 1 {
				t.Fatalf("server count=%d %v", count, err)
			}
			var id, name, storedURL string
			if err := db.QueryRow(`SELECT "jellyfinServerId","name","url" FROM "Server" WHERE "id"='existing'`).Scan(&id, &name, &storedURL); err != nil || id != tc.scope || name != "Existing" || storedURL != configuredURL {
				t.Fatalf("existing server altered: %q %q %q %v", id, name, storedURL, err)
			}
			if tc.expected == 200 {
				if response := send(t, h, key, p); response.Code != 200 {
					t.Fatalf("cached heartbeat: %d", response.Code)
				}
				if probes.Load() != 1 {
					t.Fatalf("excess probes: %d", probes.Load())
				}
				remote.Close()
				h.identityMu.Lock()
				for key := range h.verifiedIdentities {
					h.verifiedIdentities[key] = time.Now().Add(-time.Second)
				}
				h.identityMu.Unlock()
				if response := send(t, h, key, p); response.Code != 403 {
					t.Fatalf("offline expired verification accepted: %d", response.Code)
				}
			}
		})
	}
}

func TestLegacyIdentityProbeDoesNotFollowRedirects(t *testing.T) {
	db, h := testServer(t)
	var reached atomic.Bool
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { reached.Store(true); fmt.Fprint(w, `{"Id":"actual"}`) }))
	defer target.Close()
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, target.URL, http.StatusFound) }))
	defer remote.Close()
	if _, err := db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','master','S',?)`, remote.URL); err != nil {
		t.Fatal(err)
	}
	if _, ok := h.verifiedLegacyServer(t.Context(), "master", "actual"); ok || reached.Load() {
		t.Fatal("redirect trusted or followed")
	}
}

func TestLegacyIdentityRejectsUnknownInactiveAndConflictingServers(t *testing.T) {
	for _, mode := range []string{"unknown", "inactive", "conflicting"} {
		t.Run(mode, func(t *testing.T) {
			db, h := testServer(t)
			remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { t.Error("untrusted mapping reached remote probe") }))
			defer remote.Close()
			if mode != "unknown" {
				if _, err := db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url","isActive") VALUES('s','master','S',?,?)`, remote.URL, mode != "inactive"); err != nil {
					t.Fatal(err)
				}
			}
			if mode == "conflicting" {
				if _, err := db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('other','actual','Other','http://other')`); err != nil {
					t.Fatal(err)
				}
			}
			if _, ok := h.verifiedLegacyServer(t.Context(), "master", "actual"); ok {
				t.Fatal("unsafe legacy mapping accepted")
			}
		})
	}
}
