// Package telemetry provides real-time active stream monitoring and playback telemetry.
package telemetry

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/database"
)

// ActiveStreamItem represents an ongoing playback stream.
type ActiveStreamItem struct {
	ID              string  `json:"id"`
	ServerID        string  `json:"serverId"`
	SessionID       string  `json:"sessionId"`
	PlayMethod      string  `json:"playMethod"`
	ClientName      *string `json:"clientName,omitempty"`
	DeviceName      *string `json:"deviceName,omitempty"`
	IPAddress       *string `json:"ipAddress,omitempty"`
	Country         *string `json:"country,omitempty"`
	City            *string `json:"city,omitempty"`
	User            *string `json:"user,omitempty"`
	MediaTitle      *string `json:"mediaTitle,omitempty"`
	MediaType       *string `json:"mediaType,omitempty"`
	JellyfinMediaID *string `json:"jellyfinMediaId,omitempty"`
	ProgressPercent int     `json:"progressPercent"`
	Bitrate         *int64  `json:"bitrate,omitempty"`
	StartedAt       string  `json:"startedAt"`
}

// ActiveStreamsResult holds list of streams, count, and total bandwidth.
type ActiveStreamsResult struct {
	Streams            []ActiveStreamItem `json:"streams"`
	Count              int                `json:"count"`
	TotalBandwidthMbps float64            `json:"totalBandwidthMbps"`
}

// GetActiveStreams queries active streams and computes bandwidth metrics.
func GetActiveStreams(ctx context.Context, db *sql.DB, driver string) (ActiveStreamsResult, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT s."id", s."serverId", s."sessionId", s."playMethod", s."clientName", s."deviceName",
		       s."ipAddress", s."country", s."city", s."bitrate", s."positionTicks", s."startedAt",
		       u."username", m."title", m."type", m."durationMs", m."jellyfinMediaId"
		FROM "ActiveStream" s
		LEFT JOIN "User" u ON u."id" = s."userId"
		LEFT JOIN "Media" m ON m."id" = s."mediaId"
		ORDER BY s."startedAt" DESC
	`)
	if err != nil {
		return ActiveStreamsResult{}, err
	}
	defer rows.Close()

	var streams []ActiveStreamItem
	var totalBandwidthMbps float64

	for rows.Next() {
		var id, srvID, sessID, playMethod, started string
		var client, device, ip, country, city, user, title, mType, jmid sql.NullString
		var bitrate, posTicks, durMs sql.NullInt64

		if err := rows.Scan(&id, &srvID, &sessID, &playMethod, &client, &device, &ip, &country, &city, &bitrate, &posTicks, &started, &user, &title, &mType, &durMs, &jmid); err == nil {
			var progressPercent int
			if posTicks.Int64 > 0 && durMs.Int64 > 0 {
				durTicks := durMs.Int64 * 10000
				if durTicks > 0 {
					p := int(float64(posTicks.Int64) / float64(durTicks) * 100)
					if p > 100 {
						p = 100
					}
					progressPercent = p
				}
			}
			if bitrate.Int64 > 0 {
				totalBandwidthMbps += float64(bitrate.Int64) / 1000.0
			}

			item := ActiveStreamItem{
				ID:              id,
				ServerID:        srvID,
				SessionID:       sessID,
				PlayMethod:      playMethod,
				ProgressPercent: progressPercent,
				StartedAt:       started,
			}
			if client.Valid {
				item.ClientName = &client.String
			}
			if device.Valid {
				item.DeviceName = &device.String
			}
			if ip.Valid {
				item.IPAddress = &ip.String
			}
			if country.Valid {
				item.Country = &country.String
			}
			if city.Valid {
				item.City = &city.String
			}
			if user.Valid {
				item.User = &user.String
			}
			if title.Valid {
				item.MediaTitle = &title.String
			}
			if mType.Valid {
				item.MediaType = &mType.String
			}
			if jmid.Valid {
				item.JellyfinMediaID = &jmid.String
			}
			if bitrate.Valid {
				item.Bitrate = &bitrate.Int64
			}

			streams = append(streams, item)
		}
	}

	return ActiveStreamsResult{
		Streams:            streams,
		Count:              len(streams),
		TotalBandwidthMbps: totalBandwidthMbps,
	}, nil
}

// GetStreamsTelemetry retrieves all telemetry events (pause, seek, audio/subtitles) for a playback ID.
func GetStreamsTelemetry(ctx context.Context, db *sql.DB, driver, playbackID string) ([]map[string]any, error) {
	rows, err := db.QueryContext(ctx, database.Bind(`
		SELECT "id", "eventType", "positionMs", "metadata", "createdAt"
		FROM "TelemetryEvent"
		WHERE "playbackId" = ?
		ORDER BY "positionMs" ASC, "createdAt" ASC
		LIMIT 500
	`, driver), playbackID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []map[string]any
	for rows.Next() {
		var id, kind, created string
		var pos int64
		var meta sql.NullString
		if err := rows.Scan(&id, &kind, &pos, &meta, &created); err == nil {
			item := map[string]any{
				"id":         id,
				"eventType":  kind,
				"positionMs": pos,
				"createdAt":  created,
			}
			if meta.Valid {
				var parsed any
				if json.Unmarshal([]byte(meta.String), &parsed) == nil {
					item["metadata"] = parsed
				} else {
					item["metadata"] = meta.String
				}
			}
			events = append(events, item)
		}
	}
	return events, nil
}

// CleanupOrphanStreams removes active streams that have not reported a heartbeat within timeoutSeconds.
func CleanupOrphanStreams(ctx context.Context, db *sql.DB, driver string, timeoutSeconds int) (int64, error) {
	if timeoutSeconds <= 0 {
		timeoutSeconds = 120
	}
	cutoff := time.Now().UTC().Add(-time.Duration(timeoutSeconds) * time.Second).Format(time.RFC3339Nano)

	query := database.Bind(`DELETE FROM "ActiveStream" WHERE "lastPingAt" < ?`, driver)
	res, err := db.ExecContext(ctx, query, cutoff)
	if err != nil {
		return 0, fmt.Errorf("cleanup orphan streams: %w", err)
	}
	return res.RowsAffected()
}
