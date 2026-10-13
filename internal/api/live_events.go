package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type capturedResponse struct {
	header http.Header
	status int
	bytes.Buffer
}

func (r *capturedResponse) Header() http.Header    { return r.header }
func (r *capturedResponse) WriteHeader(status int) { r.status = status }

// One authenticated connection replaces the dashboard's three polling loops.
// Re-authorize each delivery and reconnect before the server's write timeout.
func (h *Handler) dashboardLive(w http.ResponseWriter, r *http.Request, protect func(http.Handler) http.Handler) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		jsonError(w, 500, "Flux indisponible.")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("X-Accel-Buffering", "no")
	fmt.Fprint(w, "retry: 1000\n\n")
	flusher.Flush()
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	deadline := time.NewTimer(24 * time.Second)
	defer deadline.Stop()
	previous := []byte(nil)
	tick := 0
	for {
		authorized := false
		guard := &capturedResponse{header: http.Header{}}
		protect(http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) { authorized = true })).ServeHTTP(guard, r)
		if !authorized {
			fmt.Fprint(w, "event: revoked\ndata: {}\n\n")
			flusher.Flush()
			return
		}
		snapshot := map[string]json.RawMessage{}
		loaders := map[string]http.HandlerFunc{"streams": h.streams}
		if tick%5 == 0 {
			loaders["hardware"] = h.hardware
		}
		if tick%15 == 0 {
			loaders["health"] = h.recoveredAdminHealth
		}
		for name, loader := range loaders {
			result := &capturedResponse{header: http.Header{}}
			loader(result, r)
			if result.status >= 400 || !json.Valid(result.Bytes()) {
				continue
			}
			snapshot[name] = append([]byte{}, result.Bytes()...)
		}
		data, err := json.Marshal(snapshot)
		if err != nil {
			return
		}
		if !bytes.Equal(data, previous) {
			if _, err = fmt.Fprintf(w, "event: dashboard\ndata: %s\n\n", data); err != nil {
				return
			}
			previous = data
			flusher.Flush()
		} else if tick%5 == 0 {
			if _, err = fmt.Fprint(w, ": heartbeat\n\n"); err != nil {
				return
			}
			flusher.Flush()
		}
		select {
		case <-r.Context().Done():
			return
		case <-deadline.C:
			return
		case <-ticker.C:
			tick++
		}
	}
}
