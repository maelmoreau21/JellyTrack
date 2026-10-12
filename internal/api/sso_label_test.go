package api

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSSOButtonLabelPersistsWithoutChangingPolicy(t *testing.T) {
	db := apiDB(t)
	db.Exec(`INSERT INTO "GlobalSettings"("id","resolutionThresholds","ssoSettings") VALUES('global','{"schedulerIntervals":{"backupEveryHours":48}}','{"enabled":false}')`)
	h := New(db, "sqlite")
	for _, body := range []string{`{"ssoButtonLabel":"Connexion Authentik"}`, `{"timeFormat":"24h"}`} {
		w := httptest.NewRecorder()
		h.updateSettings(w, httptest.NewRequest("POST", "/api/settings", strings.NewReader(body)))
		if w.Code != 200 {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	var raw, policy string
	if err := db.QueryRow(`SELECT "resolutionThresholds","ssoSettings" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&raw, &policy); err != nil {
		t.Fatal(err)
	}
	var saved map[string]any
	json.Unmarshal([]byte(raw), &saved)
	if saved["ssoButtonLabel"] != "Connexion Authentik" || saved["schedulerIntervals"] == nil || policy != `{"enabled":false}` {
		t.Fatal(raw, policy)
	}
	w := httptest.NewRecorder()
	h.updateSettings(w, httptest.NewRequest("POST", "/api/settings", strings.NewReader(`{"ssoButtonLabel":"`+strings.Repeat("x", 81)+`"}`)))
	if w.Code != 400 {
		t.Fatal(w.Code)
	}
}
