package auth

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/go-jose/go-jose/v4"
	"github.com/maelmoreau21/jellytrack/internal/jellyfin"
)

func TestSignedOIDCCallbackEnforcesProviderAndStableClaims(t *testing.T) {
	for _, tc := range []struct {
		name, provider                                 string
		groupClaim                                     any
		missing, tamper                                bool
		success                                        bool
		admin, restricted, unrestricted, requiredGroup bool
	}{
		{name: "ldap", provider: jellyfin.LDAPAuthenticationProvider, success: true},
		{name: "local", provider: jellyfin.LocalAuthenticationProvider},
		{name: "local unrestricted", provider: jellyfin.LocalAuthenticationProvider, unrestricted: true, success: true},
		{name: "admin without groups", provider: jellyfin.LDAPAuthenticationProvider, admin: true, success: true},
		{name: "Jellyfin admin cannot bypass explicit group", provider: jellyfin.LDAPAuthenticationProvider, admin: true, requiredGroup: true},
		{name: "signed scalar admin group", provider: jellyfin.LDAPAuthenticationProvider, admin: true, requiredGroup: true, groupClaim: "admins", success: true},
		{name: "signed array admin group", provider: jellyfin.LDAPAuthenticationProvider, admin: true, requiredGroup: true, groupClaim: []string{"admins"}, success: true},
		{name: "signed scalar wrong group", provider: jellyfin.LDAPAuthenticationProvider, admin: true, requiredGroup: true, groupClaim: "users,admins"},
		{name: "missing stable claim", provider: jellyfin.LDAPAuthenticationProvider, missing: true},
		{name: "invalid signature", provider: jellyfin.LDAPAuthenticationProvider, tamper: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			m, db := testManager(t)
			for _, key := range []string{"OIDC_ENABLED", "OIDC_ISSUER", "OIDC_URL", "AUTHENTIK_URL", "JELLYTRACK_AUTHENTIK_URL", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "OIDC_USER_GROUP", "OIDC_ADMIN_GROUP"} {
				t.Setenv(key, "")
				os.Unsetenv(key)
			}
			jf := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				u := policyUser(tc.provider, false)
				u.Policy.IsAdministrator = tc.admin
				json.NewEncoder(w).Encode(u)
			}))
			defer jf.Close()
			if _, err := db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url","jellyfinApiKey") VALUES('s1','jf1','One',?,'key')`, jf.URL); err != nil {
				t.Fatal(err)
			}
			key, err := rsa.GenerateKey(rand.Reader, 2048)
			if err != nil {
				t.Fatal(err)
			}
			var issuer, token string
			idp := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				switch r.URL.Path {
				case "/.well-known/openid-configuration":
					json.NewEncoder(w).Encode(map[string]any{"issuer": issuer, "authorization_endpoint": issuer + "/authorize", "token_endpoint": issuer + "/token", "jwks_uri": issuer + "/jwks", "id_token_signing_alg_values_supported": []string{"RS256"}})
				case "/jwks":
					json.NewEncoder(w).Encode(jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{Key: &key.PublicKey, KeyID: "key1", Algorithm: "RS256", Use: "sig"}}})
				case "/token":
					r.ParseForm()
					if r.Form.Get("code_verifier") != "verifier" {
						t.Error("PKCE verifier missing")
					}
					json.NewEncoder(w).Encode(map[string]any{"access_token": "opaque", "token_type": "Bearer", "id_token": token})
				default:
					w.WriteHeader(404)
				}
			}))
			defer idp.Close()
			issuer = idp.URL
			signer, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.RS256, Key: jose.JSONWebKey{Key: key, KeyID: "key1"}}, nil)
			if err != nil {
				t.Fatal(err)
			}
			claims := map[string]any{"iss": issuer, "aud": "test-client", "sub": "immutable-subject", "exp": time.Now().Add(time.Hour).Unix(), "iat": time.Now().Unix(), "nonce": "nonce", "preferred_username": "different-name", "jellyfin_server_id": "s1", "jellyfin_user_id": policyUser(tc.provider, false).ID}
			if tc.groupClaim != nil {
				claims["groups"] = tc.groupClaim
			}
			if tc.missing {
				delete(claims, "jellyfin_user_id")
			}
			raw, _ := json.Marshal(claims)
			signed, err := signer.Sign(raw)
			if err != nil {
				t.Fatal(err)
			}
			token, err = signed.CompactSerialize()
			if err != nil {
				t.Fatal(err)
			}
			if tc.tamper {
				token = token[:len(token)-8] + "AAAAAAAA"
			}
			t.Setenv("OIDC_ISSUER", issuer)
			t.Setenv("OIDC_ENABLED", "true")
			t.Setenv("OIDC_CLIENT_ID", "test-client")
			t.Setenv("LDAP_SSO_ONLY", "true")
			if tc.unrestricted {
				t.Setenv("LDAP_SSO_ONLY", "false")
			}
			if tc.requiredGroup {
				t.Setenv("OIDC_ADMIN_GROUP", "admins")
			}
			req := httptest.NewRequest("GET", "http://localhost/api/auth/callback/oidc?state=state&code=code", nil)
			req.AddCookie(&http.Cookie{Name: oidcFlowCookie, Value: "state.nonce.verifier"})
			w := httptest.NewRecorder()
			m.oidcCallback(w, req)
			var count int
			if err := db.QueryRow(`SELECT COUNT(*) FROM "AuthSession"`).Scan(&count); err != nil {
				t.Fatal(err)
			}
			if tc.success {
				if count != 1 || w.Header().Get("Location") != "/" {
					t.Fatalf("successful LDAP SSO refused: %d %s", count, w.Header().Get("Location"))
				}
				for _, cookie := range w.Result().Cookies() {
					if cookie.Name == cookieName {
						req.AddCookie(cookie)
					}
				}
				p, ok := m.authenticate(req)
				if ok && (p.IsAdmin() || (p.Role == "server_admin") != tc.admin) {
					t.Fatalf("wrong role: %+v", p)
				}
				if !ok || p.Username != "alice" || p.AuthServerID != "s1" || p.OIDCSubject != "immutable-subject" || p.OIDCIssuer != issuer {
					t.Fatalf("identity not persisted: %+v %v", p, ok)
				}
			} else if count != 0 || w.Header().Get("Location") == "/" {
				t.Fatalf("forbidden SSO created session: %d", count)
			}
		})
	}
}
