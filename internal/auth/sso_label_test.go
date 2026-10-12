package auth

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAuthOptionsExposeOnlySSOPresentationLabel(t *testing.T) {
	m, db := testManager(t)
	if _, err := db.Exec(`INSERT INTO "GlobalSettings"("id","resolutionThresholds") VALUES('global','{"ssoButtonLabel":"Connexion Authentik","private":"secret"}')`); err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	m.Routes(mux)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, httptest.NewRequest("GET", "/api/auth/options", nil))
	var result map[string]any
	json.Unmarshal(w.Body.Bytes(), &result)
	if result["ssoButtonLabel"] != "Connexion Authentik" || result["private"] != nil {
		t.Fatal(w.Body.String())
	}
}
