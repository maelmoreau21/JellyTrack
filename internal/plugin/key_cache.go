package plugin

import (
	"crypto/sha256"
	"time"
)

type verifiedPluginKey struct{ until time.Time }

// Cache only successful expensive scrypt checks. The current persisted hash is
// part of the key: rotation/revocation still takes effect on the next event.
// Previous-key expiry is checked separately on EVERY request by verifyKey.
// Neither the bearer token nor failed guesses are retained.
func (h *Handler) verifyRepeatedHash(token, stored string) bool {
	key := sha256.Sum256([]byte(stored + "\x00" + token))
	h.keyMu.Lock()
	defer h.keyMu.Unlock()
	now := time.Now()
	if entry, ok := h.verifiedKeys[key]; ok && now.Before(entry.until) {
		return true
	}
	if !verifyHash(token, stored, h.peppers) {
		return false
	}
	if h.verifiedKeys == nil {
		h.verifiedKeys = make(map[[32]byte]verifiedPluginKey)
	}
	for k, entry := range h.verifiedKeys {
		if !now.Before(entry.until) {
			delete(h.verifiedKeys, k)
		}
	}
	if len(h.verifiedKeys) >= 16 {
		for k := range h.verifiedKeys {
			delete(h.verifiedKeys, k)
			break
		}
	}
	h.verifiedKeys[key] = verifiedPluginKey{until: now.Add(time.Minute)}
	return true
}
