# Mixed Jellyfin and SSO login

Local implementation on develop; no deployment or production database changes.

Configuration: OIDC_ENABLED=true, JELLYFIN_AUTH_ENABLED=true, LDAP_SSO_ONLY=true, OIDC_AUTO_REDIRECT=false. OIDC credentials and verified stable Jellyfin identity claims remain required.

SSO is environment-only. Old database settings are ignored and preserved. PUT /api/settings/sso returns 410. Settings SSO tab/form removed; old route redirects to Jellyfin settings.

Empty OIDC_USER_GROUP and OIDC_ADMIN_GROUP use verified Jellyfin administrator status. Explicit groups remain mandatory and determine roles; Jellyfin administrator status never bypasses their allowlist.

Files changed: .env.example, docker-compose.yml, README.md; internal/auth/{auth.go,login_policy.go,login_policy_test.go,oidc_policy_test.go,settings_resolution_test.go}; internal/api/{admin_handlers.go,handlers_test.go,settings_recovery.go,settings_recovery_test.go}; web/dist/assets/{app.js,navigation.js,settings.js}.

Executed successfully:
- go test ./... -count=1 -timeout=120s
- go vet ./internal/auth ./internal/api ./web
- node --check for app.js, settings.js and navigation.js
- git diff --check
- Playwright Chromium against a disposable SQLite fixture: SSO tab/form absent, old route redirected, Jellyfin login accessible alongside SSO without emergency administrator, no browser JavaScript errors.

Authentication cases include LDAP password blocked by default and accepted with LDAP_SSO_ONLY=false, native SSO rejected by default and accepted with LDAP_SSO_ONLY=false, classic login disabled before contacting Jellyfin, missing stable claims and invalid signatures rejected, administrator role from verified Jellyfin policy without groups, and explicit group restriction not bypassed by Jellyfin administrators.

PostgreSQL and a real identity provider were not exercised for this change. No schema or SQL query changes were introduced in authentication policy. The disposable QA server was stopped after verification.
