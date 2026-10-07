package api

import (
	"database/sql"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/maelmoreau21/jellytrack/internal/database"
)

func (h *Handler) jellyfinImageProxy(w http.ResponseWriter, r *http.Request) {
	serverID := strings.TrimSpace(r.URL.Query().Get("serverId"))
	mediaID := strings.TrimSpace(r.URL.Query().Get("mediaId"))
	imageType := strings.TrimSpace(r.URL.Query().Get("imageType"))
	if imageType == "" {
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

	targetURL := strings.TrimRight(srvURL.String, "/") + "/Items/" + url.PathEscape(mediaID) + "/Images/" + url.PathEscape(imageType)
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, targetURL, nil)
	if err != nil {
		http.Error(w, "Proxy error", http.StatusBadGateway)
		return
	}
	if apiKey.Valid && apiKey.String != "" {
		req.Header.Set("X-Emby-Token", apiKey.String)
	}

	resp, err := http.DefaultClient.Do(req)
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

	targetURL := strings.TrimRight(srvURL.String, "/") + "/Users/" + url.PathEscape(userID) + "/Images/Primary"
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, targetURL, nil)
	if err != nil {
		http.Error(w, "Proxy error", http.StatusBadGateway)
		return
	}
	if apiKey.Valid && apiKey.String != "" {
		req.Header.Set("X-Emby-Token", apiKey.String)
	}

	resp, err := http.DefaultClient.Do(req)
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
