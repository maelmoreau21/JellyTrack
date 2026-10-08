package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strings"
	"testing"

	"github.com/maelmoreau21/jellytrack/internal/config"
	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/web"
)

func TestEndToEndServerLifecycle(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test_e2e.db")
	backupDir := filepath.Join(tempDir, "backups")

	t.Setenv("DATABASE_DRIVER", "sqlite")
	t.Setenv("DATABASE_PATH", dbPath)
	t.Setenv("BACKUP_DIR", backupDir)
	t.Setenv("JELLYTRACK_SECRET", "super-secret-at-least-32-chars-long!!")
	t.Setenv("JELLYTRACK_LOCAL_ADMIN_USER", "admin")
	t.Setenv("JELLYTRACK_LOCAL_ADMIN_PASSWORD", "SuperPassword123!")
	t.Setenv("PLUGIN_KEY_PEPPER", "random-pepper-for-tests-1234567")

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("config.Load failed: %v", err)
	}

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	ctx := context.Background()

	db, err := database.Open(ctx, cfg)
	if err != nil {
		t.Fatalf("database.Open failed: %v", err)
	}
	defer db.Close()

	handler := web.NewHandler(logger, db, cfg.DatabaseDriver, false)
	ts := httptest.NewServer(handler)
	defer ts.Close()

	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatalf("cookiejar.New failed: %v", err)
	}
	client := &http.Client{Jar: jar}

	// 1. Healthcheck
	resp, err := client.Get(ts.URL + "/api/health")
	if err != nil {
		t.Fatalf("GET /api/health failed: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/health status = %d, expected 200", resp.StatusCode)
	}
	var healthBody map[string]string
	_ = json.NewDecoder(resp.Body).Decode(&healthBody)
	resp.Body.Close()
	if healthBody["status"] != "ok" {
		t.Fatalf("unexpected health body: %v", healthBody)
	}

	// 2. Static SPA
	resp, err = client.Get(ts.URL + "/")
	if err != nil {
		t.Fatalf("GET / failed: %v", err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if !strings.Contains(string(body), "JellyTrack") {
		t.Fatalf("GET / should contain 'JellyTrack'")
	}

	// 3. Static Assets
	for _, asset := range []string{"/assets/app.js", "/assets/app.css", "/assets/messages/fr.json"} {
		resp, err = client.Get(ts.URL + asset)
		if err != nil {
			t.Fatalf("GET %s failed: %v", asset, err)
		}
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("GET %s status = %d", asset, resp.StatusCode)
		}
		resp.Body.Close()
	}

	// 4. Protected API before authentication
	resp, err = client.Get(ts.URL + "/api/dashboard")
	if err != nil {
		t.Fatalf("GET /api/dashboard failed: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 Unauthorized for /api/dashboard, got %d", resp.StatusCode)
	}

	// 5. CSRF Token
	resp, err = client.Get(ts.URL + "/api/auth/csrf")
	if err != nil {
		t.Fatalf("GET /api/auth/csrf failed: %v", err)
	}
	var csrfData map[string]string
	_ = json.NewDecoder(resp.Body).Decode(&csrfData)
	resp.Body.Close()
	csrfToken := csrfData["csrfToken"]
	if csrfToken == "" {
		t.Fatalf("missing csrfToken in response")
	}

	// 6. Admin Login
	loginPayload, _ := json.Marshal(map[string]string{
		"username": "admin",
		"password": "SuperPassword123!",
	})
	loginReq, _ := http.NewRequest(http.MethodPost, ts.URL+"/api/auth/login", bytes.NewReader(loginPayload))
	loginReq.Header.Set("Content-Type", "application/json")
	loginReq.Header.Set("X-CSRF-Token", csrfToken)
	loginReq.Header.Set("Origin", ts.URL)
	resp, err = client.Do(loginReq)
	if err != nil {
		t.Fatalf("POST /api/auth/login failed: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		loginBody, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		t.Fatalf("login failed with status %d: %s", resp.StatusCode, string(loginBody))
	}
	var loginPrincipal struct {
		Username  string `json:"username"`
		Role      string `json:"role"`
		CSRFToken string `json:"csrfToken"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&loginPrincipal)
	resp.Body.Close()
	sessionCSRF := loginPrincipal.CSRFToken
	if sessionCSRF == "" {
		t.Fatalf("login did not return session CSRF token")
	}

	// 7. Verify /api/auth/me
	resp, err = client.Get(ts.URL + "/api/auth/me")
	if err != nil {
		t.Fatalf("GET /api/auth/me failed: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/auth/me status = %d", resp.StatusCode)
	}
	var meData map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&meData)
	resp.Body.Close()
	if meData["username"] != "admin" || meData["role"] != "admin" {
		t.Fatalf("unexpected me payload: %v", meData)
	}

	// 8. Authenticated Dashboard & Other APIs
	apisToTest := []string{
		"/api/dashboard",
		"/api/users",
		"/api/media",
		"/api/media/collections",
		"/api/settings",
		"/api/settings/jellyfin-servers",
		"/api/logs/system",
		"/api/backup/export",
	}
	for _, endpoint := range apisToTest {
		resp, err = client.Get(ts.URL + endpoint)
		if err != nil {
			t.Fatalf("GET %s failed: %v", endpoint, err)
		}
		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			t.Fatalf("GET %s returned %d: %s", endpoint, resp.StatusCode, string(body))
		}
		resp.Body.Close()
	}

	// 9. Logout
	logoutReq, _ := http.NewRequest(http.MethodPost, ts.URL+"/api/auth/logout", nil)
	logoutReq.Header.Set("X-CSRF-Token", sessionCSRF)
	logoutReq.Header.Set("Origin", ts.URL)
	resp, err = client.Do(logoutReq)
	if err != nil {
		t.Fatalf("POST /api/auth/logout failed: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/auth/logout status = %d", resp.StatusCode)
	}
	resp.Body.Close()

	// 10. Dashboard after logout should be Unauthorized
	resp, err = client.Get(ts.URL + "/api/dashboard")
	if err != nil {
		t.Fatalf("GET /api/dashboard failed: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 after logout, got %d", resp.StatusCode)
	}
}

func TestHealthcheckCLI(t *testing.T) {
	// With server running
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/health" {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"status":"ok"}`))
			return
		}
		http.NotFound(w, r)
	}))
	defer ts.Close()

	u, _ := url.Parse(ts.URL)
	port := u.Port()

	t.Setenv("PORT", port)
	t.Setenv("JELLYTRACK_SECRET", "super-secret-at-least-32-chars-long!!")
	t.Setenv("DATABASE_DRIVER", "sqlite")

	if err := healthcheck(); err != nil {
		t.Fatalf("healthcheck() failed: %v", err)
	}
}
