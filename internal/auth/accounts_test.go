package auth

import (
	"context"
	"database/sql"
	"encoding/json"
	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/internal/testdb"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestVoluntaryAccountLinksAreExclusiveRevocableAndDoNotMergeRoles(t *testing.T) {
	m, db := testManager(t)
	testAccountLinkContracts(t, m, db)
}

func TestPostgresAccountLinkContracts(t *testing.T) {
	db := testdb.Postgres(t)
	t.Setenv("JELLYTRACK_SECRET", "0123456789abcdef0123456789abcdef")
	testAccountLinkContracts(t, New(db, "postgres"), db)
}

func testAccountLinkContracts(t *testing.T, m *Manager, db *sql.DB) {
	for _, query := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s1','js1','One','http://one'),('s2','js2','Two','http://two'),('s3','js3','Three','http://three')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('a','s1','same','Alice'),('b','s2','same','Alice'),('c','s3','same','Alice')`,
	} {
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	mux := http.NewServeMux()
	m.Routes(mux)
	type session struct {
		cookie *http.Cookie
		csrf   string
		p      Principal
	}
	login := func(server, role string) session {
		p := Principal{Username: "Alice", Role: role, JellyfinUserID: "same", AuthServerID: server, AuthMethod: "jellyfin"}
		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "http://example.com/api/auth/login", nil)
		csrf, err := m.createSessionIdentity(w, r, p)
		if err != nil {
			t.Fatal(err)
		}
		r.AddCookie(w.Result().Cookies()[0])
		principal, ok := m.authenticate(r)
		if !ok {
			t.Fatal("session invalid")
		}
		return session{w.Result().Cookies()[0], csrf, principal}
	}
	a, b, c := login("s1", "user"), login("s2", "server_admin"), login("s3", "user")
	call := func(s session, method, path, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "http://example.com"+path, strings.NewReader(body))
		r.AddCookie(s.cookie)
		r.Header.Set("Origin", "http://example.com")
		r.Header.Set("X-CSRF-Token", s.csrf)
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		return w
	}
	proof := func(s session) string {
		w := call(s, "POST", "/api/me/accounts/proof", "{}")
		if w.Code != 200 {
			t.Fatalf("proof %d %s", w.Code, w.Body)
		}
		var data struct{ Code string }
		if err := json.Unmarshal(w.Body.Bytes(), &data); err != nil {
			t.Fatal(err)
		}
		return data.Code
	}
	link := func(s session, code string) *httptest.ResponseRecorder {
		return call(s, "POST", "/api/me/accounts/link", `{"code":"`+code+`"}`)
	}
	before, err := LinkedAccounts(context.Background(), db, m.driver, a.p)
	if err != nil || len(before) != 1 {
		t.Fatalf("name/ID collision associated accounts: %v %v", before, err)
	}
	code := proof(b)
	if w := link(a, code); w.Code != 200 {
		t.Fatalf("link: %d %s", w.Code, w.Body)
	}
	if w := link(a, code); w.Code != 400 {
		t.Fatalf("one-time proof reusable: %d", w.Code)
	}
	after, err := LinkedAccounts(context.Background(), db, m.driver, a.p)
	if err != nil || len(after) != 2 {
		t.Fatalf("explicit association missing: %v %v", after, err)
	}
	if a.p.IsAdmin() || a.p.CanAdminServer("s2") || !b.p.CanAdminServer("s2") || b.p.CanAdminServer("s1") {
		t.Fatal("permissions merged")
	}
	if w := link(c, proof(b)); w.Code != 409 {
		t.Fatalf("another person took associated account: %d %s", w.Code, w.Body)
	}
	if w := call(c, "DELETE", "/api/me/accounts/b", ""); w.Code != 404 {
		t.Fatalf("unrelated unlink: %d", w.Code)
	}
	code = proof(b)
	if w := call(a, "DELETE", "/api/me/accounts/b", ""); w.Code != 200 {
		t.Fatalf("unlink: %d %s", w.Code, w.Body)
	}
	after, err = LinkedAccounts(context.Background(), db, m.driver, a.p)
	if err != nil || len(after) != 1 {
		t.Fatalf("live membership stale: %v %v", after, err)
	}
	if w := link(a, code); w.Code != 400 {
		t.Fatalf("unlink left proof valid: %d", w.Code)
	}
	if _, err := db.Exec(database.Bind(`UPDATE "AuthSession" SET "createdAt"=? WHERE "id"=?`, m.driver), time.Now().UTC().Add(-11*time.Minute).Format(time.RFC3339Nano), a.p.sessionID); err != nil {
		t.Fatal(err)
	}
	if w := call(a, "POST", "/api/me/accounts/proof", "{}"); w.Code != 403 {
		t.Fatalf("old session can prove ownership: %d", w.Code)
	}
}

func TestForwardedOriginRequiresTrustedPeerAndRemoteAdminIsNotGlobal(t *testing.T) {
	t.Setenv("TRUST_PROXY_HEADERS", "true")
	t.Setenv("TRUSTED_PROXY_CIDRS", "10.0.0.0/8")
	r := httptest.NewRequest("POST", "http://internal/api/test", nil)
	r.RemoteAddr = "203.0.113.10:2000"
	r.Header.Set("X-Forwarded-Host", "attacker.example")
	r.Header.Set("Origin", "https://attacker.example")
	if sameOrigin(r) {
		t.Fatal("untrusted forwarded origin accepted")
	}
	r.RemoteAddr = "10.0.0.2:2000"
	if !sameOrigin(r) {
		t.Fatal("trusted proxy rejected")
	}
	p := Principal{Role: "admin", AuthServerID: "secondary", AuthMethod: "jellyfin"}
	if p.IsAdmin() {
		t.Fatal("legacy remote administrator remains global")
	}
	m, _ := testManager(t)
	w := httptest.NewRecorder()
	r = httptest.NewRequest("POST", "/", nil)
	_, err := m.createSessionIdentity(w, r, p)
	if err != nil {
		t.Fatal(err)
	}
	r.AddCookie(w.Result().Cookies()[0])
	p, ok := m.authenticate(r)
	if !ok || p.Role != "server_admin" || p.IsAdmin() {
		t.Fatalf("legacy session not downgraded: %+v", p)
	}
}

func TestExplicitGlobalIdentityGrantIsRevocable(t *testing.T) {
	m, _ := testManager(t)
	t.Setenv("JELLYTRACK_SUPER_ADMIN_IDENTITIES", `[{"serverId":"s","userId":"opaque-ID"}]`)
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/", nil)
	if _, err := m.createSessionIdentity(w, r, Principal{Role: "super_admin", AuthMethod: "jellyfin", AuthServerID: "s", JellyfinUserID: "opaque-ID"}); err != nil {
		t.Fatal(err)
	}
	r.AddCookie(w.Result().Cookies()[0])
	p, ok := m.authenticate(r)
	if !ok || !p.IsAdmin() {
		t.Fatal("explicit global grant rejected")
	}
	if globalIdentityAllowed("other", "opaque-ID") || globalIdentityAllowed("s", "opaque-id") {
		t.Fatal("grant matched another identity")
	}
	t.Setenv("JELLYTRACK_SUPER_ADMIN_IDENTITIES", "[]")
	p, ok = m.authenticate(r)
	if !ok || p.IsAdmin() {
		t.Fatal("removed grant remains privileged")
	}
}
