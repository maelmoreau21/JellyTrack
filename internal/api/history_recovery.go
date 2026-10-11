package api

import (
	"database/sql"
	"encoding/json"
	"math"
	"net/http"
	"net/netip"
	"sort"
	"strings"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/database"
)

// Fetch telemetry once for the visible page. Main limited each session to its
// 200 latest events; the same window keeps page payloads and query cost bounded.
func (h *Handler) enrichHistory(r *http.Request, items []map[string]any) error {
	if len(items) == 0 {
		return nil
	}
	// Profile exports are not paginated. Bound parameter lists so exports
	// above a database bind limit retain all their recorded events.
	if len(items) > 500 {
		for start := 0; start < len(items); start += 500 {
			end := start + 500
			if end > len(items) {
				end = len(items)
			}
			if err := h.enrichHistory(r, items[start:end]); err != nil {
				return err
			}
		}
		return nil
	}
	marks := make([]string, len(items))
	args := make([]any, len(items))
	byID := map[string]map[string]any{}
	for i, item := range items {
		marks[i] = "?"
		args[i] = item["id"]
		byID[item["id"].(string)] = item
		item["telemetryEvents"] = []map[string]any{}
		item["audioBitrateKbps"] = nil
	}
	query := `SELECT "playbackId","eventType","positionMs","createdAt","metadata" FROM (SELECT t."playbackId",t."eventType",t."positionMs",t."createdAt",t."metadata",ROW_NUMBER() OVER(PARTITION BY t."playbackId" ORDER BY t."createdAt" DESC,t."id" DESC) AS event_rank FROM "TelemetryEvent" t JOIN "PlaybackHistory" p ON p."id"=t."playbackId" AND p."serverId"=t."serverId" WHERE t."playbackId" IN (` + strings.Join(marks, ",") + `)) ranked WHERE event_rank<=200 ORDER BY "createdAt" DESC`
	rows, err := h.db.QueryContext(r.Context(), database.Bind(query, h.driver), args...)
	if err != nil {
		return err
	}
	for rows.Next() {
		var id, kind, created string
		var pos int64
		var raw sql.NullString
		if err = rows.Scan(&id, &kind, &pos, &created, &raw); err != nil {
			rows.Close()
			return err
		}
		var meta any
		if raw.Valid {
			_ = json.Unmarshal([]byte(raw.String), &meta)
		}
		item := byID[id]
		if item == nil {
			continue
		}
		events := item["telemetryEvents"].([]map[string]any)
		item["telemetryEvents"] = append(events, map[string]any{"eventType": kind, "positionMs": pos, "createdAt": created, "metadata": meta})
		// Events are newest first. A separately recorded audio bitrate is a
		// stronger source than the combined stream bitrate stored on history.
		if metadata, ok := meta.(map[string]any); ok && item["audioBitrateKbps"] == nil {
			if rate := recordedHistoryAudioBitrate(metadata); rate != nil {
				item["audioBitrateKbps"] = *rate
			}
		}
		if metadata, ok := meta.(map[string]any); ok && item["versionName"] == nil {
			for _, key := range []string{"versionName", "edition", "mediaSourceName"} {
				if name, ok := metadata[key].(string); ok && strings.TrimSpace(name) != "" {
					item["versionName"] = name
					break
				}
			}
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, item := range items {
		item["mediaSubtitle"] = h.profileMediaSubtitle(r, item["serverId"].(string), item["type"].(string), firstStringValue(item["parentId"]), firstStringValue(item["artist"]))
		if item["audioBitrateKbps"] == nil {
			// history/profile handlers already return kbps; normalising again
			// would turn a 12 Mbps video into a fictitious 12 kbps audio stream.
			// A low combined video bitrate still does not identify an audio
			// track. Only audio-only media can safely reuse this fallback.
			if rate, ok := item["bitrate"].(float64); ok && rate > 0 {
				kind := firstStringValue(item["type"])
				if kind == "Audio" || kind == "Track" || kind == "MusicTrack" || kind == "MusicAlbum" || kind == "AudioBook" {
					item["audioBitrateKbps"] = rate
				}
			}
		}
	}
	return nil
}

// Only explicit audio fields are eligible: an unqualified metadata bitrate
// could describe a video or the combined stream. Telemetry is already joined
// to the requested playback and its server before this helper is called.
func recordedHistoryAudioBitrate(metadata map[string]any) *float64 {
	positive := func(value any) (float64, bool) {
		rate, ok := value.(float64)
		return rate, ok && rate > 0 && !math.IsNaN(rate) && !math.IsInf(rate, 0)
	}
	if rate, ok := positive(metadata["audioBitrateKbps"]); ok {
		return &rate
	}
	if rate, ok := positive(metadata["audioBitrate"]); ok {
		if rate >= 10000 {
			rate /= 1000
		}
		return &rate
	}
	if stream, ok := metadata["audioStream"].(map[string]any); ok {
		for _, key := range []string{"BitRate", "bitRate", "bitrate"} {
			if rate, ok := positive(stream[key]); ok {
				rate /= 1000 // Jellyfin MediaStream.BitRate is explicitly bits/s.
				return &rate
			}
		}
	}
	return nil
}

func (h *Handler) historyAlerts(r *http.Request, items []map[string]any) (int, []map[string]any, error) {
	threshold, window, grace := 50, 1440, 5
	var raw sql.NullString
	if h.db.QueryRowContext(r.Context(), `SELECT "resolutionThresholds" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&raw) == nil {
		var stored map[string]any
		if json.Unmarshal([]byte(raw.String), &stored) == nil {
			source := stored
			if nested, ok := stored["smartSecurityThresholds"].(map[string]any); ok {
				source = nested
			}
			for key, value := range source {
				n, ok := value.(float64)
				if !ok || n < 1 {
					continue
				}
				switch key {
				case "ipAttemptThreshold":
					threshold = int(n)
				case "ipWindowMinutes":
					window = int(n)
				case "newCountryGraceMinutes":
					grace = int(n)
				}
			}
		}
	}
	countries := map[string]time.Time{}
	hot := map[string]int{}
	users, ips := []string{}, []string{}
	seenUsers, seenIPs := map[string]bool{}, map[string]bool{}
	for _, item := range items {
		user, _ := item["userId"].(string)
		if user != "" && !seenUsers[user] {
			seenUsers[user] = true
			users = append(users, user)
		}
		ip, _ := item["ipAddress"].(string)
		address, err := netip.ParseAddr(ip)
		if err == nil && !address.Unmap().IsPrivate() && !address.IsLoopback() && !address.IsLinkLocalUnicast() && !address.IsUnspecified() && !seenIPs[ip] {
			seenIPs[ip] = true
			ips = append(ips, ip)
		}
	}
	marksArgs := func(values []string) (string, []any) {
		marks := make([]string, len(values))
		args := make([]any, len(values))
		for i, value := range values {
			marks[i] = "?"
			args[i] = value
		}
		return strings.Join(marks, ","), args
	}
	if len(users) > 0 {
		marks, args := marksArgs(users)
		rows, err := h.db.QueryContext(r.Context(), database.Bind(`SELECT "userId","country",MIN("startedAt") FROM "PlaybackHistory" WHERE "userId" IN (`+marks+`) AND "country" IS NOT NULL AND "country"<>'Unknown' GROUP BY "userId","country"`, h.driver), args...)
		if err != nil {
			return 0, nil, err
		}
		for rows.Next() {
			var user, country, first string
			if err = rows.Scan(&user, &country, &first); err != nil {
				rows.Close()
				return 0, nil, err
			}
			timestamp, _ := time.Parse(time.RFC3339Nano, first)
			if timestamp.IsZero() {
				timestamp, _ = time.Parse("2006-01-02 15:04:05", first)
			}
			countries[user+":"+country] = timestamp
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return 0, nil, err
		}
	}
	if len(ips) > 0 {
		marks, args := marksArgs(ips)
		args = append(args, time.Now().UTC().Add(-time.Duration(window)*time.Minute).Format(time.RFC3339Nano))
		date := `"startedAt">=?`
		if h.driver != "postgres" {
			date = `datetime("startedAt")>=datetime(?)`
		}
		rows, err := h.db.QueryContext(r.Context(), database.Bind(`SELECT "ipAddress",COUNT(*) FROM "PlaybackHistory" WHERE "ipAddress" IN (`+marks+`) AND `+date+` GROUP BY "ipAddress"`, h.driver), args...)
		if err != nil {
			return 0, nil, err
		}
		for rows.Next() {
			var ip string
			var count int
			if err = rows.Scan(&ip, &count); err != nil {
				rows.Close()
				return 0, nil, err
			}
			if count >= threshold {
				hot[ip] = count
			}
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return 0, nil, err
		}
	}
	count := 0
	for _, item := range items {
		flags := []string{}
		user, _ := item["userId"].(string)
		country, _ := item["country"].(string)
		started, _ := time.Parse(time.RFC3339Nano, item["startedAt"].(string))
		first := countries[user+":"+country]
		if !first.IsZero() && !started.IsZero() {
			delta := started.Sub(first)
			if delta < 0 {
				delta = -delta
			}
			if delta <= time.Duration(grace)*time.Minute {
				flags = append(flags, "new_country")
				count++
			}
		}
		if hot[firstStringValue(item["ipAddress"])] >= threshold {
			flags = append(flags, "ip_burst")
		}
		item["anomalyFlags"] = flags
	}
	top := []map[string]any{}
	for ip, count := range hot {
		top = append(top, map[string]any{"ipAddress": ip, "attempts": count})
	}
	sort.Slice(top, func(i, j int) bool { return top[i]["attempts"].(int) > top[j]["attempts"].(int) })
	if len(top) > 3 {
		top = top[:3]
	}
	return count, top, nil
}
