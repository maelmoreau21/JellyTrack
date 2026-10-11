package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/maelmoreau21/jellytrack/internal/jellyfin"
)

func policyUser(provider string, disabled bool) jellyfin.AuthenticatedUser {
	var u jellyfin.AuthenticatedUser
	u.ID, u.Name = "0123456789abcdef0123456789abcdef", "alice"
	u.Policy.AuthenticationProviderID, u.Policy.IsDisabled = provider, disabled
	return u
}

func TestPasswordPolicyPreflightAndRecheck(t *testing.T) {
	t.Setenv("LDAP_SSO_ONLY", "true")
	for _, tc := range []struct {
		name, provider, after string
		disabled, outage      bool
		unrestricted          bool
		success               bool
		calls                 int
	}{
		{name: "local", provider: jellyfin.LocalAuthenticationProvider, after: jellyfin.LocalAuthenticationProvider, success: true, calls: 1},
		{name: "ldap", provider: jellyfin.LDAPAuthenticationProvider},
		{name: "ldap classic allowed", provider: jellyfin.LDAPAuthenticationProvider, after: jellyfin.LDAPAuthenticationProvider, unrestricted: true, success: true, calls: 1},
		{name: "missing"}, {name: "unknown", provider: "other"},
		{name: "disabled", provider: jellyfin.LocalAuthenticationProvider, disabled: true},
		{name: "outage", outage: true},
		{name: "provider changed", provider: jellyfin.LocalAuthenticationProvider, after: jellyfin.LDAPAuthenticationProvider, calls: 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if tc.unrestricted {
				t.Setenv("LDAP_SSO_ONLY", "false")
			}
			calls := 0
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/Users/AuthenticateByName" {
					calls++
					json.NewEncoder(w).Encode(map[string]any{"User": policyUser(tc.provider, false)})
					return
				}
				if r.Header.Get("X-MediaBrowser-Token") != "test-key" {
					t.Error("missing administrative token")
				}
				if tc.outage {
					w.WriteHeader(503)
					return
				}
				if r.URL.Path == "/Users" {
					json.NewEncoder(w).Encode([]jellyfin.AuthenticatedUser{policyUser(tc.provider, tc.disabled)})
					return
				}
				json.NewEncoder(w).Encode(policyUser(tc.after, false))
			}))
			defer srv.Close()
			_, denied, err := authenticateLocal(context.Background(), srv.URL, "test-key", "ALICE", "correct")
			if (err == nil) != tc.success || denied == tc.success || calls != tc.calls {
				t.Fatalf("err=%v denied=%v password calls=%d", err, denied, calls)
			}
		})
	}
}

func TestOIDCPolicyUsesTrustedIDsNotNames(t *testing.T) {
	m, db := testManager(t)
	provider := jellyfin.LDAPAuthenticationProvider
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { json.NewEncoder(w).Encode(policyUser(provider, false)) }))
	defer srv.Close()
	if _, err := db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url","jellyfinApiKey") VALUES('s1','jf1','One',?,'test-key')`, srv.URL); err != nil {
		t.Fatal(err)
	}
	claims := map[string]any{"sub": "subject", "preferred_username": "unrelated-name", "jellyfin_server_id": "s1", "jellyfin_user_id": policyUser(provider, false).ID}
	u, id, err := m.oidcAccount(context.Background(), claims)
	if err != nil || id != "s1" || u.Name != "alice" {
		t.Fatalf("%+v %s %v", u, id, err)
	}
	provider = jellyfin.LocalAuthenticationProvider
	if _, _, err = m.oidcAccount(context.Background(), claims); err == nil {
		t.Fatal("native account accepted through SSO")
	}
	for _, key := range []string{"sub", "jellyfin_server_id", "jellyfin_user_id"} {
		invalid := map[string]any{}
		for k, v := range claims {
			if k != key {
				invalid[k] = v
			}
		}
		if _, _, err = m.oidcAccount(context.Background(), invalid); err == nil {
			t.Fatalf("missing %s accepted", key)
		}
	}
}

func TestLDAPPasswordCannotReachFallbackOrCreateSession(t *testing.T) {
	m, db := testManager(t)
	fallbackCalls := 0
	primary := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			t.Error("LDAP password transmitted")
		}
		json.NewEncoder(w).Encode([]jellyfin.AuthenticatedUser{policyUser(jellyfin.LDAPAuthenticationProvider, false)})
	}))
	defer primary.Close()
	fallback := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { fallbackCalls++; w.WriteHeader(500) }))
	defer fallback.Close()
	t.Setenv("JELLYFIN_URL", primary.URL)
	t.Setenv("JELLYFIN_API_KEY", "test-key")
	if _, err := db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url","jellyfinApiKey","allowAuthFallback") VALUES('s1','jf1','Fallback',?,'test-key',TRUE)`, fallback.URL); err != nil {
		t.Fatal(err)
	}
	for i, username := range []string{"alice", "admin"} {
		body, _ := json.Marshal(map[string]string{"username": username, "password": "correct"})
		req := httptest.NewRequest("POST", "http://localhost/api/auth/login", bytes.NewReader(body))
		req.Header.Set("Origin", "http://localhost")
		req.RemoteAddr = []string{"192.0.2.12:1000", "192.0.2.13:1000"}[i]
		w := httptest.NewRecorder()
		m.login(w, req)
		if w.Code == 200 || len(w.Result().Cookies()) != 0 {
			t.Fatal("forbidden password created session")
		}
	}
	var sessions int
	db.QueryRow(`SELECT COUNT(*) FROM "AuthSession"`).Scan(&sessions)
	if sessions != 0 || fallbackCalls != 0 {
		t.Fatalf("sessions=%d fallback calls=%d", sessions, fallbackCalls)
	}
}

func TestPrePolicySessionRequiresFreshLogin(t *testing.T) {
	m, db := testManager(t)
	req := httptest.NewRequest("GET", "/", nil)
	w := httptest.NewRecorder()
	if _, err := m.createSessionIdentity(w, req, Principal{Username: "alice", Role: "user"}); err != nil {
		t.Fatal(err)
	}
	req.AddCookie(w.Result().Cookies()[0])
	if _, err := db.Exec(`UPDATE "AuthSession" SET "identity"='{"identityVersion":1,"jellyfinUserId":"ldap-user"}'`); err != nil {
		t.Fatal(err)
	}
	if _, ok := m.authenticate(req); ok {
		t.Fatal("historical session bypassed new login policy")
	}
}

func TestDisabledJellyfinLoginCannotContactServer(t *testing.T) {
	m, _ := testManager(t)
	t.Setenv("JELLYFIN_AUTH_ENABLED", "false")
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls++; w.WriteHeader(500) }))
	defer srv.Close()
	t.Setenv("JELLYFIN_URL", srv.URL)
	req := httptest.NewRequest("POST", "/api/auth/login", bytes.NewBufferString(`{"username":"alice","password":"password"}`))
	req.RemoteAddr = "198.51.100.20:1234"
	w := httptest.NewRecorder()
	m.login(w, req)
	if w.Code != 403 || calls != 0 {
		t.Fatalf("disabled login: status=%d calls=%d", w.Code, calls)
	}
	w = httptest.NewRecorder()
	m.authProviders(w, httptest.NewRequest("GET", "/api/auth/providers", nil))
	var providers map[string]any
	json.Unmarshal(w.Body.Bytes(), &providers)
	if providers["credentials"] != nil {
		t.Fatal("disabled classic provider advertised")
	}
}
