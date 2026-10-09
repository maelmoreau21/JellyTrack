package api

import (
	"encoding/json"
	"net/http/httptest"
	"testing"
	"time"
)

func TestHistoricalWrappedNavigationBoundaries(t *testing.T) {
	loc := time.FixedZone("Paris test", 2*60*60)
	for _, tc := range []struct {
		date           string
		sm, sd, em, ed int
		want           bool
	}{
		{"2026-10-09T12:00:00+02:00", 12, 1, 1, 31, false},
		{"2026-12-01T00:00:00+02:00", 12, 1, 1, 31, true},
		{"2026-01-09T12:00:00+02:00", 12, 1, 1, 31, false},
		{"2026-10-09T00:00:00+02:00", 10, 1, 10, 9, true},
		{"2026-10-09T00:00:01+02:00", 10, 1, 10, 9, false},
		{"2026-12-01T00:00:00+02:00", 0, 0, 0, 0, true},
	} {
		now, _ := time.Parse(time.RFC3339, tc.date)
		if got := historicalWrappedVisible(now.In(loc), tc.sm, tc.sd, tc.em, tc.ed); got != tc.want {
			t.Errorf("%s: got %v, want %v", tc.date, got, tc.want)
		}
	}
}

func TestNavigationContextDoesNotExposeSettingsSecrets(t *testing.T) {
	db := apiDB(t)
	if _, err := db.Exec(`INSERT INTO "GlobalSettings"("id","wrappedVisible","wrappedPeriodEnabled","pluginApiKey","discordWebhookUrl") VALUES('global',TRUE,FALSE,'secret-plugin','secret-discord')`); err != nil {
		t.Fatal(err)
	}
	t.Setenv("JELLYTRACK_MODE", "MULTI")
	t.Setenv("APP_VERSION", "qa-version")
	w := httptest.NewRecorder()
	New(db, "sqlite").navigation(w, httptest.NewRequest("GET", "/api/navigation", nil))
	var result map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if len(result) != 3 || result["multiServer"] != true || result["wrappedVisible"] != true || result["appVersion"] != "qa-version" {
		t.Fatalf("unexpected context: %v", result)
	}
	if _, err := db.Exec(`UPDATE "GlobalSettings" SET "wrappedVisible"=FALSE`); err != nil {
		t.Fatal(err)
	}
	w = httptest.NewRecorder()
	New(db, "sqlite").navigation(w, httptest.NewRequest("GET", "/api/navigation", nil))
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result["wrappedVisible"] != false {
		t.Fatal("globally hidden Wrapped exposed in navigation")
	}
}
