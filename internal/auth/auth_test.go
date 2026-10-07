package auth

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/maelmoreau21/jellytrack/internal/config"
	"github.com/maelmoreau21/jellytrack/internal/database"
)

func testManager(t *testing.T) (*Manager, *sql.DB) {
	t.Helper()
	t.Setenv("NEXTAUTH_SECRET", "0123456789abcdef0123456789abcdef")
	t.Setenv("JELLYTRACK_LOCAL_ADMIN_USER", "admin")
	t.Setenv("JELLYTRACK_LOCAL_ADMIN_PASSWORD", "A-strong-passphrase-2026!")
	db, err := database.Open(context.Background(), config.Config{DatabaseDriver: "sqlite", DatabasePath: filepath.Join(t.TempDir(), "auth.db")})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return New(db, "sqlite"), db
}
func TestLoginAndCSRFProtectedLogout(t *testing.T) {
	m, _ := testManager(t)
	body, _ := json.Marshal(map[string]string{"username": "admin", "password": "A-strong-passphrase-2026!"})
	req := httptest.NewRequest("POST", "/api/auth/login", bytes.NewReader(body))
	req.Host = "localhost:3000"
	req.Header.Set("Origin", "http://localhost:3000")
	w := httptest.NewRecorder()
	m.login(w, req)
	if w.Code != 200 {
		t.Fatalf("login status %d: %s", w.Code, w.Body.String())
	}
	var result Principal
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	cookies := w.Result().Cookies()
	if len(cookies) != 1 || !cookies[0].HttpOnly || !cookies[0].Secure || cookies[0].SameSite != http.SameSiteLaxMode {
		t.Fatalf("cookie attributes: %#v", cookies)
	}
	logout := httptest.NewRequest("POST", "/api/auth/logout", nil)
	logout.Host = req.Host
	logout.Header.Set("Origin", req.Header.Get("Origin"))
	logout.Header.Set("X-CSRF-Token", result.CSRFToken)
	logout.AddCookie(cookies[0])
	out := httptest.NewRecorder()
	m.logout(out, logout)
	if out.Code != 200 {
		t.Fatalf("logout status %d: %s", out.Code, out.Body.String())
	}
}
func TestWeakAdminPasswordDisablesLocalLogin(t *testing.T) {
	t.Setenv("NEXTAUTH_SECRET", "0123456789abcdef0123456789abcdef")
	t.Setenv("JELLYTRACK_LOCAL_ADMIN_USER", "admin")
	t.Setenv("JELLYTRACK_LOCAL_ADMIN_PASSWORD", "password")
	db, err := database.Open(context.Background(), config.Config{DatabaseDriver: "sqlite", DatabasePath: filepath.Join(t.TempDir(), "auth.db")})
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	m := New(db, "sqlite")
	req := httptest.NewRequest("POST", "/api/auth/login", bytes.NewBufferString(`{"username":"admin","password":"password"}`))
	req.Host = "localhost"
	req.Header.Set("Origin", "http://localhost")
	w := httptest.NewRecorder()
	m.login(w, req)
	if w.Code != 503 {
		t.Fatalf("status=%d expected configuration refusal", w.Code)
	}
}

func TestAdminMiddlewareEnforcesRole(t *testing.T) {
	m, _ := testManager(t)

	// Create user session and admin session
	userReq := httptest.NewRequest("GET", "/", nil)
	userRec := httptest.NewRecorder()
	userCSRF, err := m.createSession(userRec, userReq, "regular_user", "user")
	if err != nil {
		t.Fatal(err)
	}
	_ = userCSRF
	userCookie := userRec.Result().Cookies()[0]

	adminReq := httptest.NewRequest("GET", "/", nil)
	adminRec := httptest.NewRecorder()
	adminCSRF, err := m.createSession(adminRec, adminReq, "admin_user", "admin")
	if err != nil {
		t.Fatal(err)
	}
	_ = adminCSRF
	adminCookie := adminRec.Result().Cookies()[0]

	protectedHandler := m.AdminMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("admin-ok"))
	}))

	// User role access should return 403 Forbidden
	reqUser := httptest.NewRequest("GET", "/api/admin/test", nil)
	reqUser.AddCookie(userCookie)
	wUser := httptest.NewRecorder()
	protectedHandler.ServeHTTP(wUser, reqUser)
	if wUser.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for user role, got %d", wUser.Code)
	}

	// Admin role access should succeed
	reqAdmin := httptest.NewRequest("GET", "/api/admin/test", nil)
	reqAdmin.AddCookie(adminCookie)
	wAdmin := httptest.NewRecorder()
	protectedHandler.ServeHTTP(wAdmin, reqAdmin)
	if wAdmin.Code != http.StatusOK {
		t.Fatalf("expected 200 for admin role, got %d", wAdmin.Code)
	}
}

func TestCSRFProtectionRejectsInvalidToken(t *testing.T) {
	m, _ := testManager(t)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/", nil)
	_, err := m.createSession(rec, req, "admin", "admin")
	if err != nil {
		t.Fatal(err)
	}
	cookie := rec.Result().Cookies()[0]

	postHandler := m.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// POST without CSRF token should return 403
	postReq := httptest.NewRequest("POST", "/api/test", nil)
	postReq.Host = "localhost:3000"
	postReq.Header.Set("Origin", "http://localhost:3000")
	postReq.AddCookie(cookie)
	w := httptest.NewRecorder()
	postHandler.ServeHTTP(w, postReq)
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for missing CSRF token, got %d", w.Code)
	}
}
