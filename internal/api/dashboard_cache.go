package api

import (
	"net/http"
	"time"
)

type dashboardCacheEntry struct {
	data    []byte
	expires time.Time
}

func (h *Handler) cachedDashboard(key string) []byte {
	h.dashboardCacheMu.Lock()
	defer h.dashboardCacheMu.Unlock()
	entry, ok := h.dashboardCache[key]
	if !ok || !time.Now().Before(entry.expires) {
		return nil
	}
	return entry.data
}
func (h *Handler) storeDashboard(key string, data []byte) {
	h.dashboardCacheMu.Lock()
	defer h.dashboardCacheMu.Unlock()
	if h.dashboardCache == nil || len(h.dashboardCache) >= 32 {
		h.dashboardCache = map[string]dashboardCacheEntry{}
	}
	h.dashboardCache[key] = dashboardCacheEntry{data: data, expires: time.Now().Add(5 * time.Second)}
}
func writeDashboardJSON(w http.ResponseWriter, data []byte) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "private, no-store")
	_, _ = w.Write(data)
}
