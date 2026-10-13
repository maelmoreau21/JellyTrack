package auth

import (
	"encoding/json"
	"os"
)

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
