package api

import (
	"database/sql"
	"io"
	"net/http"
	"net/url"
	"os"
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

const fallbackPosterSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450" fill="none">
  <rect width="300" height="450" fill="#181920"/>
  <rect x="20" y="20" width="260" height="410" rx="8" fill="#21232d" stroke="#2e3240" stroke-width="2"/>
  <circle cx="150" cy="190" r="40" fill="#2e3240"/>
  <path d="M140 175l30 15-30 15z" fill="#00a4dc"/>
  <rect x="70" y="260" width="160" height="12" rx="6" fill="#3a3f52"/>
  <rect x="100" y="285" width="100" height="8" rx="4" fill="#2e3240"/>
</svg>`

const fallbackAvatarSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128" fill="none">
  <rect width="128" height="128" rx="64" fill="#21232d"/>
  <circle cx="64" cy="50" r="22" fill="#3a3f52"/>
  <path d="M34 104c0-16.569 13.431-30 30-30s30 13.431 30 30" fill="#3a3f52"/>
</svg>`

func serveFallbackPoster(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "image/svg+xml")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(fallbackPosterSVG))
}

func serveFallbackAvatar(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "image/svg+xml")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(fallbackAvatarSVG))
}

func (h *Handler) jellyfinImageProxy(w http.ResponseWriter, r *http.Request) {
	serverID := strings.TrimSpace(r.URL.Query().Get("serverId"))
	mediaID := strings.TrimSpace(r.URL.Query().Get("mediaId"))
	if mediaID == "" {
		mediaID = strings.TrimSpace(r.URL.Query().Get("id"))
	}
	if mediaID == "" {
		mediaID = strings.TrimSpace(r.URL.Query().Get("itemId"))
	}

	imageType := strings.TrimSpace(r.URL.Query().Get("imageType"))
	if imageType == "" {
		imageType = strings.TrimSpace(r.URL.Query().Get("type"))
	}
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
	if (!srvURL.Valid || srvURL.String == "") && os.Getenv("JELLYFIN_URL") != "" {
		srvURL.String = os.Getenv("JELLYFIN_URL")
		srvURL.Valid = true
		apiKey.String = os.Getenv("JELLYFIN_API_KEY")
		apiKey.Valid = true
	}

	if !srvURL.Valid || srvURL.String == "" || mediaID == "" {
		serveFallbackPoster(w)
		return
	}

	safeURL, err := security.ValidateSafeServerURL(srvURL.String)
	if err != nil {
		serveFallbackPoster(w)
		return
	}

	targetURL := strings.TrimRight(safeURL.String(), "/") + "/Items/" + url.PathEscape(mediaID) + "/Images/" + url.PathEscape(imageType)
	q := url.Values{}
	for _, param := range []string{"maxWidth", "maxHeight", "width", "height", "quality", "tag", "fillWidth", "fillHeight"} {
		if v := r.URL.Query().Get(param); v != "" {
			q.Set(param, v)
		}
	}
	if encoded := q.Encode(); encoded != "" {
		targetURL += "?" + encoded
	}

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, targetURL, nil)
	if err != nil {
		serveFallbackPoster(w)
		return
	}
	if apiKey.Valid && apiKey.String != "" {
		req.Header.Set("X-Emby-Token", apiKey.String)
	}

	resp, err := proxyHTTPClient.Do(req)
	if err != nil {
		serveFallbackPoster(w)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		serveFallbackPoster(w)
		return
	}

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
	if userID == "" {
		userID = strings.TrimSpace(r.URL.Query().Get("id"))
	}

	var srvURL, apiKey sql.NullString
	if serverID != "" {
		_ = h.db.QueryRowContext(r.Context(), database.Bind(`SELECT "url", "jellyfinApiKey" FROM "Server" WHERE "id" = ?`, h.driver), serverID).Scan(&srvURL, &apiKey)
	}
	if !srvURL.Valid || srvURL.String == "" {
		_ = h.db.QueryRowContext(r.Context(), `SELECT "url", "jellyfinApiKey" FROM "Server" WHERE "isActive" = 1 LIMIT 1`).Scan(&srvURL, &apiKey)
	}
	if (!srvURL.Valid || srvURL.String == "") && os.Getenv("JELLYFIN_URL") != "" {
		srvURL.String = os.Getenv("JELLYFIN_URL")
		srvURL.Valid = true
		apiKey.String = os.Getenv("JELLYFIN_API_KEY")
		apiKey.Valid = true
	}

	if !srvURL.Valid || srvURL.String == "" || userID == "" {
		serveFallbackAvatar(w)
		return
	}

	safeURL, err := security.ValidateSafeServerURL(srvURL.String)
	if err != nil {
		serveFallbackAvatar(w)
		return
	}

	targetURL := strings.TrimRight(safeURL.String(), "/") + "/Users/" + url.PathEscape(userID) + "/Images/Primary"
	q := url.Values{}
	for _, param := range []string{"maxWidth", "maxHeight", "width", "height", "quality", "tag"} {
		if v := r.URL.Query().Get(param); v != "" {
			q.Set(param, v)
		}
	}
	if encoded := q.Encode(); encoded != "" {
		targetURL += "?" + encoded
	}

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, targetURL, nil)
	if err != nil {
		serveFallbackAvatar(w)
		return
	}
	if apiKey.Valid && apiKey.String != "" {
		req.Header.Set("X-Emby-Token", apiKey.String)
	}

	resp, err := proxyHTTPClient.Do(req)
	if err != nil {
		serveFallbackAvatar(w)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		serveFallbackAvatar(w)
		return
	}

	for k, vv := range resp.Header {
		for _, v := range vv {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}
