package plugin

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/security"
)

type legacyIdentityKey struct{ scope, remoteID, url string }

// Older installations used aliases such as "master" before the plugin sent
// Jellyfin's SystemId. Resolve only those aliases against the configured server.
// A different established UUID never qualifies for this compatibility path.
func (h *Handler) verifiedLegacyServer(ctx context.Context, scope, remoteID string) (serverInfo, bool) {
	if compactJellyfinUUID.MatchString(scope) || dashedJellyfinUUID.MatchString(scope) || remoteID == "" {
		return serverInfo{}, false
	}
	var configured serverInfo
	if err := h.queryRow(ctx, `SELECT "jellyfinServerId","name","url" FROM "Server" WHERE "jellyfinServerId"=? AND "isActive"=TRUE`, scope).Scan(&configured.id, &configured.name, &configured.url); err != nil {
		return serverInfo{}, false
	}
	// Do not map an alias onto an identity already assigned to another row.
	rows, err := h.db.QueryContext(ctx, `SELECT "jellyfinServerId" FROM "Server"`)
	if err != nil {
		return serverInfo{}, false
	}
	conflict := false
	for rows.Next() {
		var id string
		if rows.Scan(&id) != nil {
			rows.Close()
			return serverInfo{}, false
		}
		if id != scope && normalizeID(id) == normalizeID(remoteID) {
			conflict = true
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil || conflict {
		return serverInfo{}, false
	}
	parsed, err := security.ValidateSafeServerURL(configured.url)
	if err != nil || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return serverInfo{}, false
	}
	key := legacyIdentityKey{scope, normalizeID(remoteID), configured.url}
	h.identityMu.Lock()
	expires := h.verifiedIdentities[key]
	h.identityMu.Unlock()
	if time.Now().Before(expires) {
		return configured, true
	}
	probeCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	parsed.Path = strings.TrimRight(parsed.Path, "/") + "/System/Info/Public"
	parsed.RawPath = ""
	req, err := http.NewRequestWithContext(probeCtx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return serverInfo{}, false
	}
	req.Header.Set("Accept", "application/json")
	// No credentials are transmitted. Redirects must not change the configured
	// source of truth, and TLS verification remains enabled.
	client := security.ServerHTTPClient(10 * time.Second)
	response, err := client.Do(req)
	if err != nil {
		return serverInfo{}, false
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return serverInfo{}, false
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, 64*1024+1))
	if err != nil || len(body) > 64*1024 {
		return serverInfo{}, false
	}
	var info struct {
		ID string `json:"Id"`
	}
	if json.Unmarshal(body, &info) != nil || strings.TrimSpace(info.ID) == "" || normalizeID(info.ID) != key.remoteID {
		return serverInfo{}, false
	}
	h.identityMu.Lock()
	if h.verifiedIdentities == nil || len(h.verifiedIdentities) >= 256 {
		h.verifiedIdentities = make(map[legacyIdentityKey]time.Time)
	}
	h.verifiedIdentities[key] = time.Now().Add(30 * time.Second)
	h.identityMu.Unlock()
	return configured, true
}
