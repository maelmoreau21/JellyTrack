package api

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strings"

	"github.com/maelmoreau21/jellytrack/internal/database"
)

// The historical export contract shares the displayed filters, but exports all
// matching rows rather than imposing the history page's limit or default period.
func (h *Handler) writeHistoryExport(w http.ResponseWriter, r *http.Request, items []map[string]any) {
	type liveValues struct {
		bitrate any
		codec   string
	}
	active := map[string]liveValues{}
	rows, err := h.db.QueryContext(r.Context(), database.Bind(`SELECT "serverId", "userId", "mediaId", "bitrate", COALESCE("audioCodec",'') FROM "ActiveStream" ORDER BY "lastPingAt" ASC`, h.driver))
	if err != nil {
		jsonError(w, 500, "Impossible d’exporter l’historique.")
		return
	}
	for rows.Next() {
		var server, user, media, codec string
		var rate any
		if err = rows.Scan(&server, &user, &media, &rate, &codec); err != nil {
			break
		}
		active[server+"\x00"+user+"\x00"+media] = liveValues{rate, codec}
	}
	if err == nil {
		err = rows.Err()
	}
	rows.Close()
	if err != nil {
		jsonError(w, 500, "Impossible d’exporter l’historique.")
		return
	}
	exported := make([]map[string]any, 0, len(items))
	for _, item := range items {
		live := active[firstStringValue(item["serverId"])+"\x00"+firstStringValue(item["userId"])+"\x00"+firstStringValue(item["mediaId"])]
		rate := item["bitrate"] // History already normalizes to kbps.
		if rate == nil {
			if n, ok := live.bitrate.(int64); ok && n > 0 {
				value := float64(n)
				if value >= 10000 {
					value /= 1000
				}
				rate = value
			}
		}
		codec := firstStringValue(item["audioCodec"])
		if codec == "" {
			codec = live.codec
		}
		exported = append(exported, map[string]any{
			"id": item["id"], "startedAt": item["startedAt"],
			"user":       first(firstStringValue(item["username"]), "Unknown"),
			"mediaTitle": first(firstStringValue(item["title"]), "Unknown"),
			"mediaType":  first(firstStringValue(item["type"]), "Unknown"),
			"clientName": firstStringValue(item["clientName"]), "deviceName": firstStringValue(item["deviceName"]),
			"ipAddress": firstStringValue(item["ipAddress"]), "country": firstStringValue(item["country"]),
			"playMethod":             first(firstStringValue(item["playMethod"]), "DirectPlay"),
			"eventSource":            first(firstStringValue(item["eventSource"]), "playback"),
			"durationWatchedSeconds": item["durationWatched"], "resolution": firstStringValue(item["resolution"]),
			"audioBitrateKbps": rate, "audioCodec": nilIfEmpty(codec),
			"audioLanguage": item["audioLanguage"], "subtitleCodec": item["subtitleCodec"],
		})
	}
	if r.URL.Query().Get("format") == "json" {
		w.Header().Set("Content-Disposition", `attachment; filename="jellytrack_logs_export.json"`)
		jsonResponse(w, http.StatusOK, exported)
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="jellytrack_logs_export.csv"`)
	writer := csv.NewWriter(w)
	_ = writer.Write([]string{"Id", "Date", "User", "Media Title", "Media Type", "Client", "Device", "IP Address", "Country", "Play Method", "Event Source", "Duration (s)", "Resolution", "Audio Bitrate (kbps)", "Audio Codec", "Audio Language", "Subtitle Codec"})
	keys := []string{"id", "startedAt", "user", "mediaTitle", "mediaType", "clientName", "deviceName", "ipAddress", "country", "playMethod", "eventSource", "durationWatchedSeconds", "resolution", "audioBitrateKbps", "audioCodec", "audioLanguage", "subtitleCodec"}
	for _, item := range exported {
		record := make([]string, len(keys))
		for i, key := range keys {
			if item[key] == nil {
				continue
			}
			record[i] = fmt.Sprint(item[key])
			if trimmed := strings.TrimLeft(record[i], " \t\r\n"); trimmed != "" && strings.ContainsRune("=+@-", rune(trimmed[0])) {
				record[i] = "'" + record[i]
			}
		}
		if writer.Write(record) != nil {
			return
		}
	}
	writer.Flush()
}

func nilIfEmpty(value string) any {
	if value == "" {
		return nil
	}
	return value
}
