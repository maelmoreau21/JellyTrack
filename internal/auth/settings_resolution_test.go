package auth

import (
	"context"
	"os"
	"testing"
)

func TestSSOEnvironmentOnlyIgnoresDatabaseSettings(t *testing.T) {
	for _, key := range []string{"OIDC_ENABLED", "OIDC_ISSUER", "OIDC_URL", "AUTHENTIK_URL", "JELLYTRACK_AUTHENTIK_URL", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "OIDC_USER_GROUP", "OIDC_ADMIN_GROUP", "OIDC_AUTO_REDIRECT", "OIDC_AUTO_LOGIN"} {
		t.Setenv(key, "")
		os.Unsetenv(key)
	}
	m, db := testManager(t)
	if _, err := db.Exec(`INSERT INTO "GlobalSettings"("id","ssoSettings") VALUES('global','{"enabled":true,"url":"https://issuer.example","clientSecret":"database-secret","userGroup":"members"}')`); err != nil {
		t.Fatal(err)
	}
	cfg := m.resolveOIDC(context.Background())
	if cfg.enabled || cfg.issuer != "" || cfg.clientSecret != "" || cfg.userGroup != "" {
		t.Fatal("legacy database SSO settings are still active")
	}
	t.Setenv("OIDC_ENABLED", "true")
	t.Setenv("OIDC_URL", "https://env.example")
	t.Setenv("OIDC_CLIENT_SECRET", "env-secret")
	cfg = m.resolveOIDC(context.Background())
	if !cfg.enabled || cfg.issuer != "https://env.example" || cfg.clientSecret != "env-secret" {
		t.Fatal("environment configuration ignored")
	}
	t.Setenv("OIDC_ISSUER", "")
	if m.resolveOIDC(context.Background()).issuer != "" {
		t.Fatal("explicit empty issuer lost precedence")
	}
}
