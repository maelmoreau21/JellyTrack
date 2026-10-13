package api

import (
	"database/sql"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/auth"
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

var proxyHTTPClient = security.ServerHTTPClient(10 * time.Second)

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

func writeProxyImage(w http.ResponseWriter, resp *http.Response) bool {
	contentType, _, err := mime.ParseMediaType(resp.Header.Get("Content-Type"))
	if err != nil {
		return false
	}
	switch contentType {
	case "image/jpeg", "image/png", "image/gif", "image/webp", "image/avif":
	default:
		return false
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, (16<<20)+1))
	if err != nil || len(data) > 16<<20 {
		return false
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
	return true
}

func (h *Handler) jellyfinImageProxy(w http.ResponseWriter, r *http.Request) {
	// Historical components render their own type-specific fallback. Keep the
	// existing proxy placeholder for callers that do not opt into that behavior.
	fallback := func() {
		if r.URL.Query().Get("fallback") == "none" {
			http.NotFound(w, r)
			return
		}
		serveFallbackPoster(w)
	}
	serverID := strings.TrimSpace(r.URL.Query().Get("serverId"))
	mediaID := strings.TrimSpace(r.URL.Query().Get("mediaId"))
	if mediaID == "" {
		mediaID = strings.TrimSpace(r.URL.Query().Get("id"))
	}
	if mediaID == "" {
		mediaID = strings.TrimSpace(r.URL.Query().Get("itemId"))
	}

	imageType := strings.TrimSpace(r.URL.Query().Get("imageType"))
	access, accessArgs := h.libraryAccessClause(r, "m")
	if access != "1=1" {
		if serverID == "" && len(accessArgs) > 0 {
			serverID, _ = accessArgs[0].(string)
		}
		query := `SELECT COUNT(*) FROM "Media" m WHERE (m."id"=? OR m."jellyfinMediaId"=?) AND (` + access + `)`
		args := append([]any{mediaID, mediaID}, accessArgs...)
		if serverID != "" {
			query += ` AND m."serverId"=?`
			args = append(args, serverID)
		}
		var count int
		if err := h.db.QueryRowContext(r.Context(), database.Bind(query, h.driver), args...).Scan(&count); err != nil || count == 0 {
			http.NotFound(w, r)
			return
		}
	}
	if imageType == "" {
		imageType = strings.TrimSpace(r.URL.Query().Get("type"))
	}
	if _, ok := allowedImageTypes[imageType]; !ok {
		imageType = "Primary"
	}

	srvURL, apiKey := h.imageServer(r, serverID)

	if !srvURL.Valid || srvURL.String == "" || mediaID == "" {
		fallback()
		return
	}

	safeURL, err := security.ValidateSafeServerURL(srvURL.String)
	if err != nil {
		fallback()
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
		fallback()
		return
	}
	if apiKey.Valid && apiKey.String != "" {
		req.Header.Set("X-Emby-Token", apiKey.String)
	}

	resp, err := proxyHTTPClient.Do(req)
	if err != nil {
		fallback()
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		fallback()
		return
	}

	if !writeProxyImage(w, resp) {
		fallback()
	}
}

func (h *Handler) jellyfinUserImageProxy(w http.ResponseWriter, r *http.Request) {
	fallback := func() {
		if r.URL.Query().Get("fallback") == "none" {
			w.Header().Set("Cache-Control", "private, max-age=60")
			w.WriteHeader(http.StatusNotFound)
			return
		}
		serveFallbackAvatar(w)
	}
	serverID := strings.TrimSpace(r.URL.Query().Get("serverId"))
	userID := strings.TrimSpace(r.URL.Query().Get("userId"))
	if userID == "" {
		userID = strings.TrimSpace(r.URL.Query().Get("id"))
	}
	p, ok := auth.PrincipalFromContext(r.Context())
	if !ok {
		http.NotFound(w, r)
		return
	}
	if !p.IsAdmin() {
		identity, err := auth.ResolveAccount(r.Context(), h.db, h.driver, p)
		if err != nil || (serverID != "" && serverID != identity.ServerID) || !sameLibraryID(userID, identity.JellyfinUserID) {
			http.NotFound(w, r)
			return
		}
		serverID, userID = identity.ServerID, identity.JellyfinUserID
	}
	w.Header().Set("Cache-Control", "private, no-store")

	srvURL, apiKey := h.imageServer(r, serverID)

	if !srvURL.Valid || srvURL.String == "" || userID == "" {
		fallback()
		return
	}

	safeURL, err := security.ValidateSafeServerURL(srvURL.String)
	if err != nil {
		fallback()
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
		fallback()
		return
	}
	if apiKey.Valid && apiKey.String != "" {
		req.Header.Set("X-Emby-Token", apiKey.String)
	}

	resp, err := proxyHTTPClient.Do(req)
	if err != nil {
		fallback()
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		fallback()
		return
	}

	if !writeProxyImage(w, resp) {
		fallback()
	}
}

// Never fall through from an explicit invalid server to another server.
func (h *Handler) imageServer(r *http.Request, id string) (sql.NullString, sql.NullString) {
	var address, key sql.NullString
	if id != "" {
		_ = h.db.QueryRowContext(r.Context(), database.Bind(`SELECT "url","jellyfinApiKey" FROM "Server" WHERE "id"=? OR "jellyfinServerId"=?`, h.driver), id, id).Scan(&address, &key)
		return address, key
	}
	var count int
	if h.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM "Server"`).Scan(&count) != nil || count > 1 {
		return address, key
	}
	if count == 1 {
		_ = h.db.QueryRowContext(r.Context(), `SELECT "url","jellyfinApiKey" FROM "Server" WHERE "isActive"=TRUE`).Scan(&address, &key)
		return address, key
	}
	if raw := os.Getenv("JELLYFIN_URL"); raw != "" {
		address = sql.NullString{String: raw, Valid: true}
		key = sql.NullString{String: os.Getenv("JELLYFIN_API_KEY"), Valid: true}
	}
	return address, key
}
