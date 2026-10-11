package api

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/internal/jellyfin"
	"github.com/maelmoreau21/jellytrack/internal/security"
	"github.com/maelmoreau21/jellytrack/internal/settings"
)

func maskedConfigurationSecret(value string) string {
	if value == "" {
		return ""
	}
	return "••••••••"
}

func (h *Handler) recoveredServers(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	rows, err := h.db.QueryContext(r.Context(), `SELECT "id","jellyfinServerId","name","url",COALESCE("jellyfinApiKey",''),"allowAuthFallback","isActive" FROM "Server" ORDER BY "createdAt","id"`)
	if err != nil {
		jsonError(w, 500, "Impossible de lire les serveurs.")
		return
	}
	type serverConfig struct {
		id, jid, name, url, key string
		fallback, active        bool
	}
	configs := []serverConfig{}
	for rows.Next() {
		var c serverConfig
		if err = rows.Scan(&c.id, &c.jid, &c.name, &c.url, &c.key, &c.fallback, &c.active); err != nil {
			rows.Close()
			jsonError(w, 500, "Impossible de lire les serveurs.")
			return
		}
		configs = append(configs, c)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		jsonError(w, 500, "Impossible de lire les serveurs.")
		return
	}
	var key, lastSeen, version sql.NullString
	err = h.db.QueryRowContext(r.Context(), `SELECT "pluginApiKey","pluginLastSeen","pluginVersion" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&key, &lastSeen, &version)
	if err != nil && err != sql.ErrNoRows {
		jsonError(w, 500, "Impossible de lire le plugin.")
		return
	}
	ready := key.Valid && key.String != ""
	connected := false
	if seen, e := time.Parse(time.RFC3339Nano, lastSeen.String); e == nil {
		connected = time.Since(seen) < 2*time.Minute
	}
	primaryURL := strings.TrimRight(strings.TrimSpace(os.Getenv("JELLYFIN_URL")), "/")
	servers := make([]map[string]any, len(configs))
	var wg sync.WaitGroup
	// Bound concurrent connection probes and avoid holding database rows while
	// contacting Jellyfin (SQLite often has only one connection available).
	limit := make(chan struct{}, 4)
	for i, c := range configs {
		wg.Add(1)
		go func(i int, c serverConfig) {
			defer wg.Done()
			primary := strings.TrimRight(c.url, "/") == primaryURL
			if primaryURL == "" {
				primary = i == 0
			}
			item := map[string]any{"id": c.id, "jellyfinServerId": c.jid, "name": c.name, "url": c.url, "isPrimary": primary, "hasApiKey": c.key != "", "apiKeyMasked": maskedConfigurationSecret(c.key), "isActive": c.active, "allowAuthFallback": c.fallback, "hasPluginKey": ready, "pluginKeyMasked": maskedConfigurationSecret(key.String), "connectionState": "no_api_key", "connectionMessage": "Clé API non configurée.", "isLegacy": false}
			servers[i] = item
			if c.key == "" {
				return
			}
			select {
			case limit <- struct{}{}:
				defer func() { <-limit }()
			case <-r.Context().Done():
				return
			}
			ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
			defer cancel()
			item["connectionState"] = "offline"
			item["connectionMessage"] = "Jellyfin indisponible."
			if _, e := security.ValidateSafeServerURL(c.url); e != nil {
				return
			}
			client, e := jellyfin.New(c.url, c.key)
			if e != nil {
				return
			}
			info, e := client.SystemInfo(ctx)
			if e != nil {
				return
			}
			item["connectionState"] = "online"
			item["connectionMessage"] = "Jellyfin connecté."
			item["version"] = info.Version
			major, _ := strconv.Atoi(strings.Split(info.Version, ".")[0])
			item["isLegacy"] = major < 12
		}(i, c)
	}
	wg.Wait()
	if r.Context().Err() != nil {
		return
	}
	jsonResponse(w, 200, map[string]any{"servers": servers, "isMultiMode": len(configs) >= 2, "pluginKeyReady": ready, "pluginLastSeen": nullable(lastSeen), "pluginVersion": nullable(version), "pluginEndpointPath": "/api/plugin/events", "pluginConnected": connected})
}

func (h *Handler) recoveredServerPluginKey(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	var input struct {
		ID               string `json:"id"`
		ServerID         string `json:"serverId"`
		JellyfinServerID string `json:"jellyfinServerId"`
		Regenerate       bool   `json:"regenerate"`
	}
	if json.NewDecoder(r.Body).Decode(&input) != nil {
		jsonError(w, 400, "Payload JSON invalide.")
		return
	}
	id := first(input.ID, input.ServerID)
	if id == "" && input.JellyfinServerID == "" {
		jsonError(w, 400, "Serveur requis.")
		return
	}
	var jid, name, serverURL string
	query := `SELECT "id","jellyfinServerId","name","url" FROM "Server" WHERE "id"=?`
	search := id
	if id == "" {
		query = `SELECT "id","jellyfinServerId","name","url" FROM "Server" WHERE "jellyfinServerId"=?`
		search = input.JellyfinServerID
	}
	if err := h.db.QueryRowContext(r.Context(), database.Bind(query, h.driver), search).Scan(&id, &jid, &name, &serverURL); err != nil {
		jsonError(w, 404, "Serveur introuvable.")
		return
	}
	var current sql.NullString
	if err := h.db.QueryRowContext(r.Context(), `SELECT "pluginApiKey" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&current); err != nil && err != sql.ErrNoRows {
		jsonError(w, 500, "Impossible de lire la clé plugin.")
		return
	}
	if !current.Valid || current.String == "" || input.Regenerate {
		if _, err := h.db.ExecContext(r.Context(), `INSERT INTO "GlobalSettings"("id") VALUES('global') ON CONFLICT DO NOTHING`); err != nil {
			jsonError(w, 500, "Impossible de créer la clé.")
			return
		}
		if _, err := settings.RotateGlobalPluginKey(r.Context(), h.db, h.driver); err != nil {
			jsonError(w, 500, "Impossible de renouveler la clé.")
			return
		}
		if err := h.db.QueryRowContext(r.Context(), `SELECT "pluginApiKey" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&current); err != nil {
			jsonError(w, 500, "Impossible de lire la clé.")
			return
		}
	}
	mac := hmac.New(sha256.New, []byte(current.String))
	mac.Write([]byte("JellyTrack scoped plugin key v1"))
	mac.Write([]byte{0})
	mac.Write([]byte(jid))
	token := "jts4." + base64.RawURLEncoding.EncodeToString([]byte(jid)) + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	jsonResponse(w, 200, map[string]any{"pluginApiKey": token, "pluginEndpointPath": "/api/plugin/events", "server": map[string]any{"id": id, "jellyfinServerId": jid, "name": name, "url": serverURL}})
}

func (h *Handler) recoveredPluginKeyInfo(w http.ResponseWriter, r *http.Request) {
	var key, previous, grace, created, expires, seen, version, name sql.NullString
	if err := h.db.QueryRowContext(r.Context(), `SELECT "pluginApiKey","pluginPreviousApiKey","pluginPreviousApiKeyExpiresAt","pluginKeyCreatedAt","pluginKeyExpiresAt","pluginLastSeen","pluginVersion","pluginServerName" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&key, &previous, &grace, &created, &expires, &seen, &version, &name); err != nil && err != sql.ErrNoRows {
		jsonError(w, 500, "Impossible de lire le plugin.")
		return
	}
	connected := false
	oldActive := false
	var days any
	if t, e := time.Parse(time.RFC3339Nano, seen.String); e == nil {
		connected = time.Since(t) < 2*time.Minute
	}
	if t, e := time.Parse(time.RFC3339Nano, grace.String); e == nil {
		oldActive = previous.Valid && previous.String != "" && t.After(time.Now())
	}
	if t, e := time.Parse(time.RFC3339Nano, expires.String); e == nil {
		days = int(time.Until(t).Hours() / 24)
	}
	w.Header().Set("Cache-Control", "no-store")
	jsonResponse(w, 200, map[string]any{"hasApiKey": key.Valid && key.String != "", "hasKey": key.Valid && key.String != "", "pluginLastSeen": nullable(seen), "pluginVersion": nullable(version), "pluginServerName": nullable(name), "isConnected": connected, "keyCreatedAt": nullable(created), "keyExpiresAt": nullable(expires), "previousKeyGraceUntil": nullable(grace), "previousKeyActive": oldActive, "expiresInDays": days, "autoRotated": false})
}

func (h *Handler) recoveredRotatePluginKey(w http.ResponseWriter, r *http.Request) {
	if _, err := h.db.ExecContext(r.Context(), `INSERT INTO "GlobalSettings"("id") VALUES('global') ON CONFLICT DO NOTHING`); err != nil {
		jsonError(w, 500, "Impossible de créer la clé.")
		return
	}
	key, err := settings.RotateGlobalPluginKey(r.Context(), h.db, h.driver)
	if err != nil {
		jsonError(w, 500, "Impossible de renouveler la clé.")
		return
	}
	var created, expires, grace sql.NullString
	if err = h.db.QueryRowContext(r.Context(), `SELECT "pluginKeyCreatedAt","pluginKeyExpiresAt","pluginPreviousApiKeyExpiresAt" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&created, &expires, &grace); err != nil {
		jsonError(w, 500, "Impossible de lire les métadonnées.")
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	jsonResponse(w, 200, map[string]any{"success": true, "apiKey": key, "pluginApiKey": key, "hasApiKey": true, "keyCreatedAt": nullable(created), "keyExpiresAt": nullable(expires), "previousKeyGraceUntil": nullable(grace)})
}
