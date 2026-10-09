package api

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSessionRevocationRollsBackWhenPolicyWriteFails(t *testing.T) {
	db := apiDB(t)
	for _, query := range []string{`INSERT INTO "GlobalSettings"("id") VALUES('global')`, `INSERT INTO "AuthSession"("id","username","role","expiresAt","createdAt") VALUES('test-session','tester','admin','2099-01-01T00:00:00Z','2026-01-01T00:00:00Z')`, `CREATE TRIGGER reject_policy_update BEFORE UPDATE ON "GlobalSettings" BEGIN SELECT RAISE(FAIL, 'test write failure'); END`} {
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	recorder := httptest.NewRecorder()
	New(db, "sqlite").updateSessionPolicy(recorder, httptest.NewRequest("POST", "/api/admin/auth/session-policy", strings.NewReader(`{"action":"revoke_all"}`)))
	if recorder.Code != 500 {
		t.Fatalf("failed revocation status=%d", recorder.Code)
	}
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM "AuthSession"`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatal("partially applied revocation did not roll back")
	}
}

func TestSessionPolicyCreatesSettingsForFreshDatabase(t *testing.T) {
	db := apiDB(t)
	w := httptest.NewRecorder()
	New(db, "sqlite").updateSessionPolicy(w, httptest.NewRequest("POST", "/api/admin/auth/session-policy", strings.NewReader(`{"rememberThirtyDays":true}`)))
	if w.Code != 200 {
		t.Fatalf("status %d", w.Code)
	}
	var remember bool
	if err := db.QueryRow(`SELECT "authRememberThirtyDaysEnabled" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&remember); err != nil {
		t.Fatal(err)
	}
	if !remember {
		t.Fatal("session retention setting was not persisted")
	}
}
