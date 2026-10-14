package web

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log/slog"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
)

func TestSvelteKitDeliveryAndAllCompiledModules(t *testing.T) {
	files, err := fs.Sub(frontend, "svelte")
	if err != nil {
		t.Fatal(err)
	}
	raw, err := fs.ReadFile(files, "frontend-manifest.json")
	if err != nil {
		t.Fatal(err)
	}
	var manifest struct {
		Framework, Version string
		Files              map[string]string
	}
	if err := json.Unmarshal(raw, &manifest); err != nil {
		t.Fatal(err)
	}
	if manifest.Framework != "SvelteKit" || manifest.Version == "" {
		t.Fatal("missing framework manifest")
	}
	handler := NewHandler(slog.New(slog.NewTextHandler(io.Discard, nil)), nil, "sqlite")
	scriptCount := 0
	for name, hash := range manifest.Files {
		data, err := fs.ReadFile(files, name)
		if err != nil || fmt.Sprintf("%x", sha256.Sum256(data)) != hash {
			t.Fatalf("invalid compiled file %s: %v", name, err)
		}
		if !strings.HasSuffix(name, ".js") {
			continue
		}
		scriptCount++
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest("GET", "/"+name, nil))
		if response.Code != 200 || !strings.Contains(response.Header().Get("Content-Type"), "javascript") || string(data) != response.Body.String() {
			t.Fatalf("compiled module %s was not served correctly", name)
		}
	}
	if scriptCount < 5 {
		t.Fatal("compiled route modules missing")
	}
	html, err := fs.ReadFile(files, "index.html")
	if err != nil {
		t.Fatal(err)
	}
	for _, script := range regexp.MustCompile(`(?s)<script\b([^>]*)>(.*?)</script>`).FindAllSubmatch(html, -1) {
		if len(strings.TrimSpace(string(script[2]))) > 0 || !strings.Contains(string(script[1]), "src=") {
			t.Fatal("inline bootstrap violates the Go CSP")
		}
	}
	if strings.Contains(string(html), "/assets/app.js") || strings.Contains(string(html), "/assets/navigation.js") {
		t.Fatal("standalone legacy scripts remain in delivery")
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest("GET", "/_app/missing-module.js", nil))
	if response.Code != 404 {
		t.Fatal("missing compiled module returned the application fallback")
	}
}
