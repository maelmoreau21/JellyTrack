package web

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/maelmoreau21/jellytrack/internal/config"
	"github.com/maelmoreau21/jellytrack/internal/database"
)

func TestFrontendAPIAuthenticationAndAdminPermissions(t *testing.T) {
	t.Setenv("JELLYTRACK_SECRET", "integration-test-secret-0123456789abcdef")
	t.Setenv("JELLYTRACK_LOCAL_ADMIN_USER", "auditadmin")
	t.Setenv("JELLYTRACK_LOCAL_ADMIN_PASSWORD", "Audit-test-password-2026!")
	db, err := database.Open(context.Background(), config.Config{DatabaseDriver: "sqlite", DatabasePath: filepath.Join(t.TempDir(), "http.db")})
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`INSERT INTO "GlobalSettings"("id") VALUES('global')`); err != nil {
		t.Fatal(err)
	}
	handler := NewHandler(slog.New(slog.NewTextHandler(io.Discard, nil)), db, "sqlite")
	login := httptest.NewRequest("POST", "http://localhost/api/auth/login", strings.NewReader(`{"username":"auditadmin","password":"Audit-test-password-2026!"}`))
	login.Header.Set("Origin", "http://localhost")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, login)
	if response.Code != 200 {
		t.Fatalf("login status %d", response.Code)
	}
	cookie := response.Result().Cookies()[0]
	for _, path := range []string{"/api/dashboard", "/api/stats/deep", "/api/stats/granular", "/api/stats/network", "/api/users", "/api/media", "/api/media/collections", "/api/history", "/api/search?q=audit", "/api/hardware", "/api/admin/health", "/api/admin/security/overview", "/api/admin/security/audit", "/api/admin/server-compare", "/api/settings", "/api/settings/jellyfin-servers", "/api/settings/sso", "/api/streams", "/api/newsletter", "/api/heatmap-detail", "/api/predictions"} {
		t.Run(path, func(t *testing.T) {
			anonymous := httptest.NewRecorder()
			handler.ServeHTTP(anonymous, httptest.NewRequest("GET", path, nil))
			if anonymous.Code != 401 {
				t.Fatalf("anonymous status %d", anonymous.Code)
			}
			request := httptest.NewRequest("GET", path, nil)
			request.AddCookie(cookie)
			authenticated := httptest.NewRecorder()
			handler.ServeHTTP(authenticated, request)
			if authenticated.Code != 200 {
				t.Fatalf("admin status %d: %s", authenticated.Code, authenticated.Body.String())
			}
			if !json.Valid(authenticated.Body.Bytes()) {
				t.Fatal("API response is not JSON")
			}
		})
	}
	me := httptest.NewRequest("GET", "/api/auth/me", nil)
	me.AddCookie(cookie)
	meResponse := httptest.NewRecorder()
	handler.ServeHTTP(meResponse, me)
	var identity struct {
		JellyfinUserID string `json:"jellyfinUserId"`
		ServerName     string `json:"authServerName"`
		CSRFToken      string `json:"csrfToken"`
	}
	if err := json.Unmarshal(meResponse.Body.Bytes(), &identity); err != nil {
		t.Fatal(err)
	}
	if identity.JellyfinUserID != "local-admin" || identity.ServerName != "Local Admin" {
		t.Fatalf("login identity lost after reload: %+v", identity)
	}
	mutation := httptest.NewRequest("POST", "http://localhost/api/settings", strings.NewReader(`{}`))
	mutation.AddCookie(cookie)
	mutation.Header.Set("Origin", "http://localhost")
	mutationResponse := httptest.NewRecorder()
	handler.ServeHTTP(mutationResponse, mutation)
	if mutationResponse.Code != http.StatusForbidden {
		t.Fatalf("missing CSRF status %d", mutationResponse.Code)
	}
	if _, err := db.Exec(`UPDATE "AuthSession" SET "role"='user'`); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/api/users", "/api/settings", "/api/streams", "/api/hardware", "/api/admin/health", "/api/stats/deep"} {
		request := httptest.NewRequest("GET", path, nil)
		request.AddCookie(cookie)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, request)
		if rec.Code != 403 {
			t.Fatalf("ordinary user %s status %d", path, rec.Code)
		}
	}
	if _, err := db.Exec(`UPDATE "AuthSession" SET "role"='admin'`); err != nil {
		t.Fatal(err)
	}
	revoke := httptest.NewRequest("POST", "http://localhost/api/admin/auth/session-policy", strings.NewReader(`{"action":"revoke_all"}`))
	revoke.AddCookie(cookie)
	revoke.Header.Set("Origin", "http://localhost")
	revoke.Header.Set("X-CSRF-Token", identity.CSRFToken)
	revoked := httptest.NewRecorder()
	handler.ServeHTTP(revoked, revoke)
	if revoked.Code != 200 {
		t.Fatalf("revoke status %d", revoked.Code)
	}
	oldSession := httptest.NewRecorder()
	handler.ServeHTTP(oldSession, me)
	if oldSession.Code != 401 {
		t.Fatalf("revoked cookie status %d", oldSession.Code)
	}
}

func TestJellyfinLoginCannotBindUnregisteredServerOrDuplicateUUIDAccount(t *testing.T) {
	for _, registered := range []bool{false, true} {
		t.Run(map[bool]string{false: "unregistered environment server", true: "registered compact UUID login"}[registered], func(t *testing.T) {
			mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{"User":{"Id":"0123456789abcdef0123456789abcdef","Name":"Same","Policy":{"IsAdministrator":false}}}`))
			}))
			defer mock.Close()
			t.Setenv("JELLYTRACK_SECRET", "integration-test-secret-0123456789abcdef")
			t.Setenv("JELLYTRACK_LOCAL_ADMIN_USER", "admin")
			t.Setenv("JELLYTRACK_LOCAL_ADMIN_PASSWORD", "Audit-test-password-2026!")
			t.Setenv("JELLYFIN_URL", mock.URL)
			db, err := database.Open(context.Background(), config.Config{DatabaseDriver: "sqlite", DatabasePath: filepath.Join(t.TempDir(), "login.db")})
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			for _, query := range []string{`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('other','jf-other','Other','http://other.invalid')`, `INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('other-user','other','01234567-89ab-cdef-0123-456789abcdef','Same')`} {
				if _, err := db.Exec(query); err != nil {
					t.Fatal(err)
				}
			}
			if registered {
				if _, err := db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('own','jf-own','Own',?)`, " "+mock.URL+"/ "); err != nil {
					t.Fatal(err)
				}
				if _, err := db.Exec(`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('own-user','own','01234567-89ab-cdef-0123-456789abcdef','Same')`); err != nil {
					t.Fatal(err)
				}
			}
			handler := NewHandler(slog.New(slog.NewTextHandler(io.Discard, nil)), db, "sqlite")
			login := httptest.NewRequest("POST", "http://localhost/api/auth/login", strings.NewReader(`{"username":"Same","password":"test-only"}`))
			login.Header.Set("Origin", "http://localhost")
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, login)
			if w.Code != 200 {
				t.Fatalf("login=%d", w.Code)
			}
			cookie := w.Result().Cookies()[0]
			for _, path := range []string{"/api/history?days=all", "/api/users/me", "/api/users/me/active-stream", "/api/wrapped/me"} {
				request := httptest.NewRequest("GET", path, nil)
				request.AddCookie(cookie)
				recorder := httptest.NewRecorder()
				handler.ServeHTTP(recorder, request)
				want := 403
				if registered {
					want = 200
				}
				if recorder.Code != want {
					t.Fatalf("%s status=%d want=%d", path, recorder.Code, want)
				}
			}
			if registered {
				var count int
				if err := db.QueryRow(`SELECT COUNT(*) FROM "User" WHERE "serverId"='own'`).Scan(&count); err != nil {
					t.Fatal(err)
				}
				if count != 1 {
					t.Fatalf("duplicate UUID account count=%d", count)
				}
			}
		})
	}
}
