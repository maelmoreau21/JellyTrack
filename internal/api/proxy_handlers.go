package api

import (
	"database/sql"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/internal/security"
)

var allowedImageTypes = map[string]struct{}{
	"Primary":  {},
	"Thumb":    {},
	"Backdrop": {},
	"Banner":   {},
	"Logo":     {},
	"Art":      {},
}

var proxyHTTPClient = &http.Client{
	Timeout: 10 * time.Second,
}

func (h *Handler) jellyfinImageProxy(w http.ResponseWriter, r *http.Request) {
	serverID := strings.TrimSpace(r.URL.Query().Get("serverId"))
	mediaID := strings.TrimSpace(r.URL.Query().Get("mediaId"))
	imageType := strings.TrimSpace(r.URL.Query().Get("imageType"))
	if _, ok := allowedImageTypes[imageType]; !ok {
		imageType = "Primary"
	}

	var srvURL, apiKey sql.NullString
	if serverID != "" {
		_ = h.db.QueryRowContext(r.Context(), database.Bind(`SELECT "url", "jellyfinApiKey" FROM "Server" WHERE "id" = ?`, h.driver), serverID).Scan(&srvURL, &apiKey)
	}
	if !srvURL.Valid || srvURL.String == "" {
		_ = h.db.QueryRowContext(r.Context(), `SELECT "url", "jellyfinApiKey" FROM "Server" WHERE "isActive" = 1 LIMIT 1`).Scan(&srvURL, &apiKey)
	}

	if !srvURL.Valid || srvURL.String == "" || mediaID == "" {
		http.NotFound(w, r)
		return
	}

	safeURL, err := security.ValidateSafeServerURL(srvURL.String)
	if err != nil {
		http.Error(w, "Invalid server URL", http.StatusBadGateway)
		return
	}

	targetURL := strings.TrimRight(safeURL.String(), "/") + "/Items/" + url.PathEscape(mediaID) + "/Images/" + url.PathEscape(imageType)
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, targetURL, nil)
	if err != nil {
		http.Error(w, "Proxy error", http.StatusBadGateway)
		return
	}
	if apiKey.Valid && apiKey.String != "" {
		req.Header.Set("X-Emby-Token", apiKey.String)
	}

	resp, err := proxyHTTPClient.Do(req)
	if err != nil {
		http.Error(w, "Jellyfin unreachable", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	for k, vv := range resp.Header {
		for _, v := range vv {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

func (h *Handler) jellyfinUserImageProxy(w http.ResponseWriter, r *http.Request) {
	serverID := strings.TrimSpace(r.URL.Query().Get("serverId"))
	userID := strings.TrimSpace(r.URL.Query().Get("userId"))

	var srvURL, apiKey sql.NullString
	if serverID != "" {
		_ = h.db.QueryRowContext(r.Context(), database.Bind(`SELECT "url", "jellyfinApiKey" FROM "Server" WHERE "id" = ?`, h.driver), serverID).Scan(&srvURL, &apiKey)
	}
	if !srvURL.Valid || srvURL.String == "" {
		_ = h.db.QueryRowContext(r.Context(), `SELECT "url", "jellyfinApiKey" FROM "Server" WHERE "isActive" = 1 LIMIT 1`).Scan(&srvURL, &apiKey)
	}

	if !srvURL.Valid || srvURL.String == "" || userID == "" {
		http.NotFound(w, r)
		return
	}

	safeURL, err := security.ValidateSafeServerURL(srvURL.String)
	if err != nil {
		http.Error(w, "Invalid server URL", http.StatusBadGateway)
		return
	}

	targetURL := strings.TrimRight(safeURL.String(), "/") + "/Users/" + url.PathEscape(userID) + "/Images/Primary"
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, targetURL, nil)
	if err != nil {
		http.Error(w, "Proxy error", http.StatusBadGateway)
		return
	}
	if apiKey.Valid && apiKey.String != "" {
		req.Header.Set("X-Emby-Token", apiKey.String)
	}

	resp, err := proxyHTTPClient.Do(req)
	if err != nil {
		http.Error(w, "Jellyfin unreachable", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	for k, vv := range resp.Header {
		for _, v := range vv {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}
