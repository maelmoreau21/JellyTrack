package web

import (
	"database/sql"
	"embed"
	"io/fs"
	"log/slog"
	"net/http"
	"strings"

	"github.com/maelmoreau21/jellytrack/v3/internal/plugin"
)

//go:embed all:dist
var frontend embed.FS

func NewHandler(logger *slog.Logger, db *sql.DB, driver string) http.Handler {
	staticFiles, err := fs.Sub(frontend, "dist")
	if err != nil {
		panic(err)
	}
	fileServer := http.FileServer(http.FS(staticFiles))

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
	mux.Handle("/api/plugin/events", plugin.NewHandler(db, driver, logger))
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path != "" {
			if _, err := fs.Stat(staticFiles, path); err == nil {
				fileServer.ServeHTTP(w, r)
				return
			}
			if strings.HasPrefix(path, "assets/") {
				http.NotFound(w, r)
				return
			}
		}
		r.URL.Path = "/"
		fileServer.ServeHTTP(w, r)
	})

	return securityHeaders(requestLogger(logger, mux))
}

func requestLogger(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(w, r)
		logger.Info("request", "method", r.Method, "path", r.URL.Path, "remote_addr", r.RemoteAddr)
	})
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := w.Header()
		header.Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'")
		header.Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
		header.Set("X-Content-Type-Options", "nosniff")
		header.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		header.Set("X-Frame-Options", "DENY")
		next.ServeHTTP(w, r)
	})
}
