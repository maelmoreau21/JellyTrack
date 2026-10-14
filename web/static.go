// Package web serves the embedded SPA and mounts the HTTP API.
package web

import (
	"database/sql"
	"embed"
	"io/fs"
	"log/slog"
	"net/http"
	"net/http/pprof"
	"os"
	"strings"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/api"
	"github.com/maelmoreau21/jellytrack/internal/auth"
	"github.com/maelmoreau21/jellytrack/internal/plugin"
)

//go:embed all:svelte
var frontend embed.FS

func NewHandler(logger *slog.Logger, db *sql.DB, driver string, enablePprof ...bool) http.Handler {
	var staticFiles fs.FS
	if fi, err := os.Stat("web/svelte"); err == nil && fi.IsDir() {
		staticFiles = os.DirFS("web/svelte")
	} else if fi, err := os.Stat("svelte"); err == nil && fi.IsDir() {
		staticFiles = os.DirFS("svelte")
	} else {
		sub, err := fs.Sub(frontend, "svelte")
		if err != nil {
			panic(err)
		}
		staticFiles = sub
	}
	fileServer := textAssets(staticFiles, http.FileServer(http.FS(staticFiles)))

	mux := http.NewServeMux()
	authManager := auth.New(db, driver)
	if len(enablePprof) > 0 && enablePprof[0] {
		diagnostics := http.NewServeMux()
		diagnostics.HandleFunc("GET /debug/pprof/", pprof.Index)
		diagnostics.HandleFunc("GET /debug/pprof/cmdline", pprof.Cmdline)
		diagnostics.HandleFunc("GET /debug/pprof/profile", pprof.Profile)
		diagnostics.HandleFunc("GET /debug/pprof/symbol", pprof.Symbol)
		diagnostics.HandleFunc("GET /debug/pprof/trace", pprof.Trace)
		diagnostics.Handle("GET /debug/pprof/goroutine", pprof.Handler("goroutine"))
		diagnostics.Handle("GET /debug/pprof/heap", pprof.Handler("heap"))
		diagnostics.Handle("GET /debug/pprof/threadcreate", pprof.Handler("threadcreate"))
		diagnostics.Handle("GET /debug/pprof/block", pprof.Handler("block"))
		mux.Handle("/debug/pprof/", authManager.AdminMiddleware(diagnostics))
	}
	authManager.Routes(mux)
	pluginH := plugin.NewHandler(db, driver, logger)
	api.New(db, driver, pluginH).Register(mux, authManager.Middleware, authManager.AdminMiddleware)
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
	mux.Handle("/api/plugin/events", pluginH)
	privateAPI := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
	})
	mux.Handle("/api/", authManager.Middleware(privateAPI))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path != "" {
			if _, err := fs.Stat(staticFiles, path); err == nil {
				fileServer.ServeHTTP(w, r)
				return
			}
			if strings.HasPrefix(path, "assets/") || strings.HasPrefix(path, "_app/") {
				http.NotFound(w, r)
				return
			}
		}
		r.URL.Path = "/"
		fileServer.ServeHTTP(w, r)
	})

	return securityHeaders(requestLogger(logger, compressHistory(mux)))
}

func requestLogger(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		next.ServeHTTP(w, r)
		logger.Info("request", "method", r.Method, "path", r.URL.Path, "remote_addr", r.RemoteAddr, "duration_ms", float64(time.Since(started).Microseconds())/1000)
	})
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := w.Header()
		// Chart.js and the existing SPA set dynamic element styles. Keep scripts
		// restricted to bundled files while allowing those presentation attributes.
		header.Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'")
		header.Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
		header.Set("X-Content-Type-Options", "nosniff")
		header.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		header.Set("X-Frame-Options", "DENY")
		next.ServeHTTP(w, r)
	})
}
