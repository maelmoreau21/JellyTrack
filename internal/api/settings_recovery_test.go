package api

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSettingsPartialUpdatePreservesOtherSectionsAndRejectsInvalidInput(t *testing.T) {
	db := apiDB(t)
	if _, err := db.Exec(`INSERT INTO "GlobalSettings"("id","discordWebhookUrl","ssoSettings","resolutionThresholds") VALUES('global','https://discord.com/api/webhooks/1/private','{"clientSecret":"keep"}','{"720p":{"maxW":1408,"maxH":792},"schedulerIntervals":{"backupEveryHours":24}}')`); err != nil {
		t.Fatal(err)
	}
	h := New(db, "sqlite")
	for _, body := range []string{`{"resolutionThresholds":{"showLibraryMediaBadges":false}}`, `{"schedulerIntervals":{"recentSyncEveryHours":12}}`} {
		w := httptest.NewRecorder()
		h.updateSettings(w, httptest.NewRequest("POST", "/api/settings", strings.NewReader(body)))
		if w.Code != 200 {
			t.Fatalf("save %d: %s", w.Code, w.Body.String())
		}
	}
	var raw, secret, webhook string
	if err := db.QueryRow(`SELECT "resolutionThresholds","ssoSettings","discordWebhookUrl" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&raw, &secret, &webhook); err != nil {
		t.Fatal(err)
	}
	var settings map[string]any
	json.Unmarshal([]byte(raw), &settings)
	intervals := settings["schedulerIntervals"].(map[string]any)
	if settings["720p"] == nil || intervals["backupEveryHours"] != float64(24) || intervals["recentSyncEveryHours"] != float64(12) || secret != `{"clientSecret":"keep"}` || !strings.Contains(webhook, "private") {
		t.Fatalf("unrelated configuration lost: %s", raw)
	}
	for _, body := range []string{`{"defaultLocale":"invalid","wrappedVisible":false}`, `{"schedulerIntervals":{"fullSyncEveryHours":25}}`, `{"discordWebhookUrl":"https://example.com/api/webhooks/1/2"}`, `{"maxConcurrentTranscodes":-1}`, `{"wrappedStartMonth":2,"wrappedStartDay":31}`, `{"wrappedVisible":null}`, `{"unknown":true}`} {
		w := httptest.NewRecorder()
		h.updateSettings(w, httptest.NewRequest("POST", "/api/settings", strings.NewReader(body)))
		if w.Code != 400 {
			t.Errorf("invalid input %s returned %d", body, w.Code)
		}
	}
	var visible bool
	if err := db.QueryRow(`SELECT "wrappedVisible" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&visible); err != nil || !visible {
		t.Fatal("rejected input changed saved settings")
	}
}

func TestSettingsFailedWriteRollsBackAllFields(t *testing.T) {
	db := apiDB(t)
	for _, q := range []string{`INSERT INTO "GlobalSettings"("id","maxConcurrentTranscodes") VALUES('global',3)`, `CREATE TRIGGER fail_wrapped BEFORE UPDATE OF "wrappedVisible" ON "GlobalSettings" BEGIN SELECT RAISE(FAIL,'synthetic failure'); END`} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	w := httptest.NewRecorder()
	New(db, "sqlite").updateSettings(w, httptest.NewRequest("POST", "/api/settings", strings.NewReader(`{"maxConcurrentTranscodes":8,"wrappedVisible":false}`)))
	if w.Code != 500 {
		t.Fatalf("failed write reported %d", w.Code)
	}
	var max int
	if err := db.QueryRow(`SELECT "maxConcurrentTranscodes" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&max); err != nil || max != 3 {
		t.Fatal("partial update was not rolled back")
	}
}

func TestSSOSavePreservesSecretAndEnvironmentSources(t *testing.T) {
	db := apiDB(t)
	if _, err := db.Exec(`INSERT INTO "GlobalSettings"("id","ssoSettings") VALUES('global','{"enabled":true,"url":"https://issuer.example","clientId":"client","clientSecret":"private-secret","userGroup":"members","adminGroup":"admins"}')`); err != nil {
		t.Fatal(err)
	}
	h := New(db, "sqlite")
	for _, body := range []string{`{"autoRedirect":false}`, `{"clientSecret":"pri••••••••ret","keepExistingSecret":true}`} {
		w := httptest.NewRecorder()
		h.updateSSO(w, httptest.NewRequest("PUT", "/api/settings/sso", strings.NewReader(body)))
		if w.Code != 200 || strings.Contains(w.Body.String(), "private-secret") {
			t.Fatalf("SSO save %d leaked/failed %s", w.Code, w.Body.String())
		}
	}
	var raw string
	db.QueryRow(`SELECT "ssoSettings" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&raw)
	var config map[string]any
	json.Unmarshal([]byte(raw), &config)
	if config["clientSecret"] != "private-secret" || config["clientId"] != "client" || config["autoRedirect"] != false {
		t.Fatalf("SSO was reset: %s", raw)
	}
	t.Setenv("OIDC_CLIENT_ID", "env-client")
	w := httptest.NewRecorder()
	h.getSSO(w, httptest.NewRequest("GET", "/api/settings/sso", nil))
	var result map[string]any
	json.Unmarshal(w.Body.Bytes(), &result)
	if result["clientId"] != "env-client" || result["dbConfig"].(map[string]any)["clientId"] != "client" {
		t.Fatal("environment precedence was not preserved")
	}
}

func TestServerPluginCopyDoesNotRotateOrExposeStoredRoot(t *testing.T) {
	db := apiDB(t)
	for _, q := range []string{`INSERT INTO "GlobalSettings"("id","pluginApiKey") VALUES('global','root-secret')`, `INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('server','jf-server','QA','http://127.0.0.1:9')`} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	h := New(db, "sqlite")
	var previous string
	for i := 0; i < 2; i++ {
		w := httptest.NewRecorder()
		h.recoveredServerPluginKey(w, httptest.NewRequest("POST", "/api/settings/jellyfin-servers/plugin-key", strings.NewReader(`{"id":"server","regenerate":false}`)))
		if w.Code != 200 {
			t.Fatal(w.Body.String())
		}
		var result map[string]any
		json.Unmarshal(w.Body.Bytes(), &result)
		token := result["pluginApiKey"].(string)
		if !strings.HasPrefix(token, "jts4.") || (i > 0 && token != previous) || strings.Contains(w.Body.String(), "root-secret") {
			t.Fatal("copy changed/exposed root key")
		}
		previous = token
	}
	var root string
	db.QueryRow(`SELECT "pluginApiKey" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&root)
	if root != "root-secret" {
		t.Fatal("copy rotated root key")
	}
	w := httptest.NewRecorder()
	h.getPluginApiKey(w, httptest.NewRequest("GET", "/api/plugin/api-key", nil))
	if strings.Contains(w.Body.String(), "root-secret") {
		t.Fatal("plugin metadata leaked stored key")
	}
}

func TestSmartThresholdSaveKeepsMediaAndPlanning(t *testing.T) {
	db := apiDB(t)
	db.Exec(`INSERT INTO "GlobalSettings"("id","resolutionThresholds") VALUES('global','{"720p":{"maxW":1408},"schedulerIntervals":{"backupEveryHours":24}}')`)
	w := httptest.NewRecorder()
	New(db, "sqlite").updateSmartSettings(w, httptest.NewRequest("PATCH", "/api/admin/security/smart-settings", strings.NewReader(`{"thresholds":{"ipAttemptThreshold":50,"ipWindowMinutes":60,"newCountryGraceMinutes":120}}`)))
	var raw string
	db.QueryRow(`SELECT "resolutionThresholds" FROM "GlobalSettings"`).Scan(&raw)
	if w.Code != 200 || !strings.Contains(raw, "720p") || !strings.Contains(raw, "backupEveryHours") {
		t.Fatalf("smart save destroyed other settings: %d %s", w.Code, raw)
	}
}
