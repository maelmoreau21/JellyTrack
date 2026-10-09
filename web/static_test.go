package web

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHealthEndpointReturnsOnlyStatus(t *testing.T) {
	handler := NewHandler(slog.New(slog.NewTextHandler(io.Discard, nil)), nil, "sqlite")
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	resp := httptest.NewRecorder()
	handler.ServeHTTP(resp, req)
	if resp.Code != http.StatusOK || strings.TrimSpace(resp.Body.String()) != `{"status":"ok"}` {
		t.Fatalf("unexpected health response: %d %q", resp.Code, resp.Body.String())
	}
}

func TestFrontendAndFallbackAreServed(t *testing.T) {
	handler := NewHandler(slog.New(slog.NewTextHandler(io.Discard, nil)), nil, "sqlite")
	for _, path := range []string{"/", "/users/123", "/media/artist/Daft.Punk"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		resp := httptest.NewRecorder()
		handler.ServeHTTP(resp, req)
		if resp.Code != http.StatusOK || !strings.Contains(resp.Body.String(), "JellyTrack") {
			t.Errorf("%s returned %d with body %q", path, resp.Code, resp.Body.String())
		}
	}
}

func TestMissingAssetDoesNotReturnApplicationHTML(t *testing.T) {
	handler := NewHandler(slog.New(slog.NewTextHandler(io.Discard, nil)), nil, "sqlite")
	req := httptest.NewRequest(http.MethodGet, "/assets/not-found.js", nil)
	resp := httptest.NewRecorder()
	handler.ServeHTTP(resp, req)
	if resp.Code != http.StatusNotFound {
		t.Fatalf("missing asset returned %d", resp.Code)
	}
}

func TestSecurityHeadersArePresent(t *testing.T) {
	handler := NewHandler(slog.New(slog.NewTextHandler(io.Discard, nil)), nil, "sqlite")
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	resp := httptest.NewRecorder()
	handler.ServeHTTP(resp, req)
	if got := resp.Header().Get("Content-Security-Policy"); !strings.Contains(got, "script-src 'self';") || !strings.Contains(got, "style-src 'self' 'unsafe-inline';") || strings.Contains(got, "unsafe-eval") {
		t.Fatalf("unexpected CSP: %q", got)
	}
	if resp.Header().Get("X-Content-Type-Options") != "nosniff" || resp.Header().Get("Referrer-Policy") == "" {
		t.Fatal("required security headers are missing")
	}
}

func TestPluginDiagnosticsAreMountedAtContractPath(t *testing.T) {
	handler := NewHandler(slog.New(slog.NewTextHandler(io.Discard, nil)), nil, "sqlite")
	req := httptest.NewRequest(http.MethodGet, "/api/plugin/events", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"method":"POST"`) {
		t.Fatalf("unexpected plugin diagnostics response: status=%d body=%s", rec.Code, rec.Body.String())
	}
	preflight := httptest.NewRecorder()
	handler.ServeHTTP(preflight, httptest.NewRequest(http.MethodOptions, "/api/plugin/events", nil))
	if preflight.Code != http.StatusNoContent || preflight.Header().Get("Access-Control-Allow-Headers") == "" {
		t.Fatalf("unexpected preflight response: status=%d", preflight.Code)
	}
}

func TestPprofEndpoints(t *testing.T) {
	// Disabled by default
	disabledHandler := NewHandler(slog.New(slog.NewTextHandler(io.Discard, nil)), nil, "sqlite", false)
	reqDisabled := httptest.NewRequest(http.MethodGet, "/debug/pprof/", nil)
	recDisabled := httptest.NewRecorder()
	disabledHandler.ServeHTTP(recDisabled, reqDisabled)
	if recDisabled.Code != http.StatusOK || strings.Contains(recDisabled.Body.String(), "Types of profiles available") {
		// When disabled, it gets caught by the SPA fallback and serves index.html, not pprof!
		if !strings.Contains(recDisabled.Body.String(), "JellyTrack") {
			t.Fatalf("expected SPA fallback when pprof is disabled, got %d %q", recDisabled.Code, recDisabled.Body.String())
		}
	}

	// Enabled
	enabledHandler := NewHandler(slog.New(slog.NewTextHandler(io.Discard, nil)), nil, "sqlite", true)
	reqEnabled := httptest.NewRequest(http.MethodGet, "/debug/pprof/", nil)
	recEnabled := httptest.NewRecorder()
	enabledHandler.ServeHTTP(recEnabled, reqEnabled)
	if recEnabled.Code != http.StatusOK || !strings.Contains(recEnabled.Body.String(), "Types of profiles available") {
		t.Fatalf("expected pprof index when enabled, got %d %q", recEnabled.Code, recEnabled.Body.String())
	}
}

func TestApiRoutingAndAuthCompatibility(t *testing.T) {
	handler := NewHandler(slog.New(slog.NewTextHandler(io.Discard, nil)), nil, "sqlite")

	// 1. /api/health
	reqHealth := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	recHealth := httptest.NewRecorder()
	handler.ServeHTTP(recHealth, reqHealth)
	if recHealth.Code != http.StatusOK || strings.TrimSpace(recHealth.Body.String()) != `{"status":"ok"}` {
		t.Fatalf("expected {\"status\":\"ok\"}, got %d %s", recHealth.Code, recHealth.Body.String())
	}

	// 2. Auth session: /api/auth/session returns {} when unauthenticated
	reqSess := httptest.NewRequest(http.MethodGet, "/api/auth/session", nil)
	recSess := httptest.NewRecorder()
	handler.ServeHTTP(recSess, reqSess)
	if recSess.Code != http.StatusOK || strings.TrimSpace(recSess.Body.String()) != `{}` {
		t.Fatalf("expected {} for empty session, got %d %s", recSess.Code, recSess.Body.String())
	}

	// 3. Auth CSRF: /api/auth/csrf
	reqCSRF := httptest.NewRequest(http.MethodGet, "/api/auth/csrf", nil)
	recCSRF := httptest.NewRecorder()
	handler.ServeHTTP(recCSRF, reqCSRF)
	if recCSRF.Code != http.StatusOK || !strings.Contains(recCSRF.Body.String(), `"csrfToken"`) {
		t.Fatalf("expected csrfToken in /api/auth/csrf, got %d %s", recCSRF.Code, recCSRF.Body.String())
	}

	// 4. Auth providers: /api/auth/providers
	reqProv := httptest.NewRequest(http.MethodGet, "/api/auth/providers", nil)
	recProv := httptest.NewRecorder()
	handler.ServeHTTP(recProv, reqProv)
	if recProv.Code != http.StatusOK || !strings.Contains(recProv.Body.String(), `"credentials"`) {
		t.Fatalf("expected credentials in /api/auth/providers, got %d %s", recProv.Code, recProv.Body.String())
	}

	// 5. Webhook GET delegates to plugin diagnostics
	reqWebGet := httptest.NewRequest(http.MethodGet, "/api/webhook/jellyfin", nil)
	recWebGet := httptest.NewRecorder()
	handler.ServeHTTP(recWebGet, reqWebGet)
	if recWebGet.Code != http.StatusOK || !strings.Contains(recWebGet.Body.String(), `"endpoint":"/api/plugin/events"`) {
		t.Fatalf("expected plugin diagnostics on webhook GET, got %d %s", recWebGet.Code, recWebGet.Body.String())
	}

	// 6. Webhook OPTIONS returns 204 with CORS
	reqWebOpt := httptest.NewRequest(http.MethodOptions, "/api/webhook/jellyfin", nil)
	recWebOpt := httptest.NewRecorder()
	handler.ServeHTTP(recWebOpt, reqWebOpt)
	if recWebOpt.Code != http.StatusNoContent || recWebOpt.Header().Get("Access-Control-Allow-Origin") == "" {
		t.Fatalf("expected 204 with CORS on webhook OPTIONS, got %d", recWebOpt.Code)
	}
}

func TestAllRequiredFrontendRoutesServed(t *testing.T) {
	handler := NewHandler(slog.New(slog.NewTextHandler(io.Discard, nil)), nil, "sqlite")
	routes := []string{
		"/",
		"/login",
		"/setup",
		"/about",
		"/recent",
		"/newsletter",
		"/users",
		"/users/test-user-id",
		"/wrapped/test-user-id",
		"/media",
		"/media/all",
		"/media/analysis",
		"/media/collections",
		"/media/popular",
		"/media/artist/Daft.Punk",
		"/media/test-media-id",
		"/logs",
		"/settings",
		"/settings/overview",
		"/settings/dataBackups",
		"/settings/jellyfin",
		"/settings/media",
		"/settings/network",
		"/settings/notifications",
		"/settings/plugin",
		"/settings/plugin/security",
		"/settings/sso",
		"/settings/scheduler",
		"/settings/scheduler/schedules",
		"/settings/scheduler/tasks",
		"/admin/cleanup",
		"/admin/health",
		"/admin/system-health",
		"/admin/log-health",
		"/admin/plugin-health",
		"/admin/server-compare",
	}

	for _, path := range routes {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		resp := httptest.NewRecorder()
		handler.ServeHTTP(resp, req)
		if resp.Code != http.StatusOK {
			t.Errorf("route %s returned status %d", path, resp.Code)
		}
		if !strings.Contains(resp.Body.String(), "JellyTrack") {
			t.Errorf("route %s did not contain JellyTrack brand, body: %q", path, resp.Body.String()[:100])
		}
	}
}

func TestStaticAssetsAreServed(t *testing.T) {
	handler := NewHandler(slog.New(slog.NewTextHandler(io.Discard, nil)), nil, "sqlite")
	assets := []struct {
		path        string
		contentType string
	}{
		{"/assets/app.css", "text/css"},
		{"/assets/app.js", "javascript"},
		{"/assets/navigation.css", "text/css"},
		{"/assets/navigation.js", "javascript"},
		{"/assets/flags/fr.png", "image/png"},
		{"/assets/chart.min.js", "javascript"},
		{"/assets/logo.svg", "image/svg+xml"},
		{"/assets/icon.svg", "image/svg+xml"},
		{"/assets/messages/fr.json", "application/json"},
		{"/assets/messages/en.json", "application/json"},
	}

	for _, a := range assets {
		req := httptest.NewRequest(http.MethodGet, a.path, nil)
		resp := httptest.NewRecorder()
		handler.ServeHTTP(resp, req)
		if resp.Code != http.StatusOK {
			t.Errorf("asset %s returned %d", a.path, resp.Code)
		}
		ct := resp.Header().Get("Content-Type")
		if !strings.Contains(ct, a.contentType) && !strings.Contains(ct, "text/plain") {
			t.Errorf("asset %s expected content-type %s, got %s", a.path, a.contentType, ct)
		}
	}
}
