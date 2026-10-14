package auth

import (
	"context"
	"encoding/json"
	"os"
	"strings"
)

// Only a grant recorded after validating the provider token may retain global
// administration. Changing the configured group/issuer revokes that grant.
func (m *Manager) oidcAdminAllowed(ctx context.Context, p Principal) bool {
	if p.AuthMethod != "oidc" || p.OIDCAdminGroup == "" || p.OIDCIssuer == "" || p.OIDCSubject == "" {
		return false
	}
	cfg := m.resolveOIDC(ctx)
	return cfg.enabled && cfg.adminGroup != "" && strings.EqualFold(p.OIDCAdminGroup, cfg.adminGroup) && p.OIDCIssuer == cfg.issuer
}

// Global grants are explicit operator-controlled pairs, never administrator
// status inherited from a Jellyfin instance, username, email or association.
func globalIdentityAllowed(serverID, userID string) bool {
	if serverID == "" || userID == "" {
		return false
	}
	var grants []struct {
		ServerID string `json:"serverId"`
		UserID   string `json:"userId"`
	}
	if json.Unmarshal([]byte(os.Getenv("JELLYTRACK_SUPER_ADMIN_IDENTITIES")), &grants) != nil {
		return false
	}
	for _, grant := range grants {
		if grant.ServerID == serverID && sameJellyfinID(grant.UserID, userID) {
			return true
		}
	}
	return false
}
