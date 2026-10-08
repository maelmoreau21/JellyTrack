package main

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

func TestRootHealthcheck(t *testing.T) {
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
		t.Fatalf("root healthcheck() failed: %v", err)
	}
}
