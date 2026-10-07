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
	if got := resp.Header().Get("Content-Security-Policy"); got == "" || strings.Contains(got, "unsafe-inline") {
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
