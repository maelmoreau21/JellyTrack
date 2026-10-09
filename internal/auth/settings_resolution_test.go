package auth

import (
	"context"
	"testing"
)

func TestSSODatabaseSettingsApplyPerFieldAndRespectEnvironmentLocks(t *testing.T) {
	for _, key := range []string{"OIDC_ENABLED", "OIDC_ISSUER", "OIDC_URL", "AUTHENTIK_URL", "JELLYTRACK_AUTHENTIK_URL", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "OIDC_USER_GROUP", "OIDC_ADMIN_GROUP", "OIDC_AUTO_REDIRECT", "OIDC_AUTO_LOGIN"} {
		t.Setenv(key, "")
	}
	m, db := testManager(t)
	if _, err := db.Exec(`INSERT INTO "GlobalSettings"("id","ssoSettings") VALUES('global','{"enabled":true,"url":"https://issuer.example","clientId":"database-client","clientSecret":"database-secret","userGroup":"members","adminGroup":"admins","autoRedirect":true}')`); err != nil {
		t.Fatal(err)
	}
	cfg := m.resolveOIDC(context.Background())
	if !cfg.enabled || cfg.clientID != "database-client" || cfg.clientSecret != "database-secret" || !cfg.autoRedirect {
		t.Fatalf("database settings ignored: enabled=%v client=%s", cfg.enabled, cfg.clientID)
	}
	if _, err := db.Exec(`UPDATE "GlobalSettings" SET "ssoSettings"='{"enabled":false,"url":"https://issuer.example","clientId":"new-client","autoRedirect":false}'`); err != nil {
		t.Fatal(err)
	}
	cfg = m.resolveOIDC(context.Background())
	if cfg.enabled || cfg.clientID != "new-client" || cfg.autoRedirect {
		t.Fatal("SSO saved changes require restart")
	}
	t.Setenv("OIDC_ENABLED", "false")
	t.Setenv("OIDC_CLIENT_ID", "locked-client")
	m = New(db, "sqlite")
	cfg = m.resolveOIDC(context.Background())
	if cfg.enabled || cfg.clientID != "locked-client" {
		t.Fatal("database configuration bypassed env locks")
	}
}
