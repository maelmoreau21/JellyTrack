// Package history provides playback history queries, deduplication, consolidation, and cumulative completion logic.
package history

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/internal/models"
)

// ZappingClause returns the SQL condition that excludes short "zapped" sessions (<60s)
// while always preserving completed downloads and currently active streams (endedAt is null).
func ZappingClause(alias string) string {
	if alias != "" {
		alias += "."
	}
	return fmt.Sprintf(`(%s"eventSource" = 'download' OR %s"durationWatched" >= 60 OR %s"endedAt" IS NULL)`, alias, alias, alias)
}

// IsZapped returns true if a session was a quick skip (< 60s) without being a download.
func IsZapped(durationWatched int64, eventSource string, endedAt *time.Time) bool {
	if eventSource == "download" {
		return false
	}
	if endedAt == nil {
		return false // currently active stream
	}
	return durationWatched < 60
}

// CompletionBucket classifies a media item's completion status.
type CompletionBucket string

const (
	BucketCompleted CompletionBucket = "completed"
	BucketPartial   CompletionBucket = "partial"
	BucketAbandoned CompletionBucket = "abandoned"
	BucketSkipped   CompletionBucket = "skipped"
)

// CumulativeEntry stores aggregated watch progress for a single user + server + media tuple.
type CumulativeEntry struct {
	Key             string           `json:"key"`
	ServerID        string           `json:"serverId"`
	UserID          string           `json:"userId"`
	MediaID         string           `json:"mediaId"`
	MediaTitle      string           `json:"mediaTitle"`
	MediaType       string           `json:"mediaType"`
	DurationWatched int64            `json:"durationWatched"` // total seconds watched across sessions
	MediaDurationS  int64            `json:"mediaDurationS"`  // media runtime in seconds
	Percent         float64          `json:"percent"`
	Bucket          CompletionBucket `json:"bucket"`
}

// CalculateCumulativeCompletion aggregates watch durations across multiple history records
// per (userId, serverId, mediaId) and computes the completion metric.
func CalculateCumulativeCompletion(sessions []models.PlaybackHistory, mediaDurations map[string]int64, mediaTitles map[string]string, mediaTypes map[string]string) []CumulativeEntry {
	type keyTuple struct {
		user, server, media string
	}
	totals := make(map[keyTuple]int64)

	for _, s := range sessions {
		uid := ""
		if s.UserID != nil {
			uid = *s.UserID
		}
		k := keyTuple{user: uid, server: s.ServerID, media: s.MediaID}
		totals[k] += s.DurationWatched
	}

	results := make([]CumulativeEntry, 0, len(totals))
	for k, watched := range totals {
		durS := mediaDurations[k.media]
		var percent float64
		bucket := BucketSkipped

		if durS > 0 && watched > 0 {
			percent = math.Min(100.0, (float64(watched)/float64(durS))*100.0)
			if percent >= 90.0 {
				bucket = BucketCompleted
			} else if percent >= 10.0 {
				bucket = BucketPartial
			} else {
				bucket = BucketAbandoned
			}
		}

		title := mediaTitles[k.media]
		mType := mediaTypes[k.media]

		results = append(results, CumulativeEntry{
			Key:             fmt.Sprintf("%s::%s::%s", k.user, k.server, k.media),
			ServerID:        k.server,
			UserID:          k.user,
			MediaID:         k.media,
			MediaTitle:      title,
			MediaType:       mType,
			DurationWatched: watched,
			MediaDurationS:  durS,
			Percent:         math.Round(percent*10) / 10,
			Bucket:          bucket,
		})
	}

	return results
}

// ConsolidationResult provides details on the consolidated playback history entries.
type ConsolidationResult struct {
	MergedCount    int   `json:"mergedCount"`
	DeletedCount   int   `json:"deletedCount"`
	DurationGained int64 `json:"durationGained"`
	DryRun         bool  `json:"dryRun"`
}

// ConsolidateHistory merges fragmented playback sessions for the same user, server, and media
// within a specified time window (in minutes).
func ConsolidateHistory(ctx context.Context, db *sql.DB, driver string, windowMinutes int, dryRun bool) (ConsolidationResult, error) {
	if windowMinutes <= 0 {
		windowMinutes = 60
	}

	// Find playback records ordered by user, media, startedAt
	rows, err := db.QueryContext(ctx, `
		SELECT "id", "serverId", COALESCE("userId",''), "mediaId", "durationWatched", "startedAt", "endedAt",
		       "pauseCount", "seekCount", "rewatchCount", "speedChangeCount", "audioChanges", "subtitleChanges"
		FROM "PlaybackHistory"
		WHERE "eventSource" != 'download'
		ORDER BY "serverId", "userId", "mediaId", "startedAt" ASC
	`)
	if err != nil {
		return ConsolidationResult{}, fmt.Errorf("query history for consolidation: %w", err)
	}
	defer rows.Close()

	type rawRecord struct {
		id, serverID, userID, mediaID string
		durationWatched               int64
		startedAt                     time.Time
		endedAt                       *time.Time
		pauseCount, seekCount         int
		rewatchCount, speedChange     int
		audioChanges, subChanges      int
	}

	var all []rawRecord
	for rows.Next() {
		var r rawRecord
		var endStr sql.NullString
		var startStr string
		if err := rows.Scan(&r.id, &r.serverID, &r.userID, &r.mediaID, &r.durationWatched, &startStr, &endStr,
			&r.pauseCount, &r.seekCount, &r.rewatchCount, &r.speedChange, &r.audioChanges, &r.subChanges); err != nil {
			return ConsolidationResult{}, fmt.Errorf("scan history row: %w", err)
		}
		if t, err := time.Parse(time.RFC3339Nano, startStr); err == nil {
			r.startedAt = t
		} else if t, err := time.Parse("2006-01-02 15:04:05.999999999-07:00", startStr); err == nil {
			r.startedAt = t
		} else if t, err := time.Parse("2006-01-02 15:04:05", startStr); err == nil {
			r.startedAt = t
		}
		if endStr.Valid {
			if t, err := time.Parse(time.RFC3339Nano, endStr.String); err == nil {
				r.endedAt = &t
			}
		}
		all = append(all, r)
	}

	if len(all) == 0 {
		return ConsolidationResult{DryRun: dryRun}, nil
	}

	type group struct {
		primary  rawRecord
		toDelete []string
	}

	var groups []group
	window := time.Duration(windowMinutes) * time.Minute

	var currentGroup *group

	for _, rec := range all {
		if currentGroup == nil {
			currentGroup = &group{primary: rec}
			continue
		}

		sameEntity := currentGroup.primary.serverID == rec.serverID &&
			currentGroup.primary.userID == rec.userID &&
			currentGroup.primary.mediaID == rec.mediaID

		referenceTime := currentGroup.primary.startedAt
		if currentGroup.primary.endedAt != nil {
			referenceTime = *currentGroup.primary.endedAt
		}

		closeInTime := rec.startedAt.Sub(referenceTime) <= window && rec.startedAt.After(referenceTime)

		if sameEntity && closeInTime {
			currentGroup.primary.durationWatched += rec.durationWatched
			currentGroup.primary.pauseCount += rec.pauseCount
			currentGroup.primary.seekCount += rec.seekCount
			currentGroup.primary.rewatchCount += rec.rewatchCount
			currentGroup.primary.speedChange += rec.speedChange
			currentGroup.primary.audioChanges += rec.audioChanges
			currentGroup.primary.subChanges += rec.subChanges
			if rec.endedAt != nil {
				currentGroup.primary.endedAt = rec.endedAt
			}
			currentGroup.toDelete = append(currentGroup.toDelete, rec.id)
		} else {
			if len(currentGroup.toDelete) > 0 {
				groups = append(groups, *currentGroup)
			}
			currentGroup = &group{primary: rec}
		}
	}
	if currentGroup != nil && len(currentGroup.toDelete) > 0 {
		groups = append(groups, *currentGroup)
	}

	var mergedCount, deletedCount int
	var durationGained int64

	for _, g := range groups {
		mergedCount++
		deletedCount += len(g.toDelete)
		durationGained += g.primary.durationWatched

		if !dryRun {
			tx, err := db.BeginTx(ctx, nil)
			if err != nil {
				return ConsolidationResult{}, err
			}

			var endVal any
			if g.primary.endedAt != nil {
				endVal = g.primary.endedAt.Format(time.RFC3339Nano)
			}

			updateQ := database.Bind(`
				UPDATE "PlaybackHistory"
				SET "durationWatched" = ?, "endedAt" = ?, "pauseCount" = ?, "seekCount" = ?,
				    "rewatchCount" = ?, "speedChangeCount" = ?, "audioChanges" = ?, "subtitleChanges" = ?
				WHERE "id" = ?
			`, driver)

			if _, err := tx.ExecContext(ctx, updateQ,
				g.primary.durationWatched, endVal, g.primary.pauseCount, g.primary.seekCount,
				g.primary.rewatchCount, g.primary.speedChange, g.primary.audioChanges, g.primary.subChanges,
				g.primary.id,
			); err != nil {
				_ = tx.Rollback()
				return ConsolidationResult{}, fmt.Errorf("update primary consolidated record: %w", err)
			}

			// Delete absorbed records
			for _, delID := range g.toDelete {
				delQ := database.Bind(`DELETE FROM "PlaybackHistory" WHERE "id" = ?`, driver)
				if _, err := tx.ExecContext(ctx, delQ, delID); err != nil {
					_ = tx.Rollback()
					return ConsolidationResult{}, fmt.Errorf("delete absorbed history record: %w", err)
				}
			}

			if err := tx.Commit(); err != nil {
				return ConsolidationResult{}, fmt.Errorf("commit consolidation transaction: %w", err)
			}
		}
	}

	return ConsolidationResult{
		MergedCount:    mergedCount,
		DeletedCount:   deletedCount,
		DurationGained: durationGained,
		DryRun:         dryRun,
	}, nil
}

// ListHistory retrieves paginated playback history with optional filters.
func ListHistory(ctx context.Context, db *sql.DB, driver string, page, pageSize int, serverID, userID, mediaID string, zappedOnly, includeZapped bool) ([]map[string]any, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 25
	}
	offset := (page - 1) * pageSize

	var conditions []string
	var args []any

	if serverID != "" {
		conditions = append(conditions, `p."serverId" = ?`)
		args = append(args, serverID)
	}
	if userID != "" {
		conditions = append(conditions, `p."userId" = ?`)
		args = append(args, userID)
	}
	if mediaID != "" {
		conditions = append(conditions, `p."mediaId" = ?`)
		args = append(args, mediaID)
	}

	if zappedOnly {
		conditions = append(conditions, `p."eventSource" != 'download' AND p."durationWatched" < 60 AND p."endedAt" IS NOT NULL`)
	} else if !includeZapped {
		conditions = append(conditions, ZappingClause("p"))
	}

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = "WHERE " + strings.Join(conditions, " AND ")
	}

	countQ := database.Bind(fmt.Sprintf(`SELECT COUNT(*) FROM "PlaybackHistory" p %s`, whereClause), driver)
	var total int64
	if err := db.QueryRowContext(ctx, countQ, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count history: %w", err)
	}

	query := database.Bind(fmt.Sprintf(`
		SELECT p."id", p."serverId", p."userId", p."mediaId", p."playMethod", p."eventSource",
		       p."sourceEventId", p."clientName", p."deviceName", p."ipAddress", p."country", p."city",
		       p."durationWatched", p."startedAt", p."endedAt", p."audioLanguage", p."audioCodec",
		       p."subtitleLanguage", p."subtitleCodec", p."bitrate", p."pauseCount", p."seekCount",
		       p."rewatchCount", p."speedChangeCount",
		       u."username", m."title", m."type", m."durationMs", m."libraryName", m."resolution"
		FROM "PlaybackHistory" p
		LEFT JOIN "User" u ON u."id" = p."userId"
		LEFT JOIN "Media" m ON m."id" = p."mediaId"
		%s
		ORDER BY p."startedAt" DESC
		LIMIT ? OFFSET ?
	`, whereClause), driver)

	queryArgs := append(args, pageSize, offset)
	rows, err := db.QueryContext(ctx, query, queryArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("query history: %w", err)
	}
	defer rows.Close()

	items := make([]map[string]any, 0, pageSize)
	for rows.Next() {
		var id, srvID, mID, playMethod, eventSource, startedAt string
		var uID, sourceEventID, clientName, deviceName, ip, country, city sql.NullString
		var endedAt, audioLang, audioCodec, subLang, subCodec sql.NullString
		var username, title, mType, libraryName, resolution sql.NullString
		var durationWatched, pauseCount, seekCount, rewatchCount, speedChange int64
		var bitrate, durMs sql.NullInt64

		if err := rows.Scan(
			&id, &srvID, &uID, &mID, &playMethod, &eventSource,
			&sourceEventID, &clientName, &deviceName, &ip, &country, &city,
			&durationWatched, &startedAt, &endedAt, &audioLang, &audioCodec,
			&subLang, &subCodec, &bitrate, &pauseCount, &seekCount,
			&rewatchCount, &speedChange,
			&username, &title, &mType, &durMs, &libraryName, &resolution,
		); err != nil {
			return nil, 0, fmt.Errorf("scan history: %w", err)
		}

		item := map[string]any{
			"id":               id,
			"serverId":         srvID,
			"userId":           nullableStr(uID),
			"mediaId":          mID,
			"playMethod":       playMethod,
			"eventSource":      eventSource,
			"sourceEventId":    nullableStr(sourceEventID),
			"clientName":       nullableStr(clientName),
			"deviceName":       nullableStr(deviceName),
			"ipAddress":        nullableStr(ip),
			"country":          nullableStr(country),
			"city":             nullableStr(city),
			"durationWatched":  durationWatched,
			"startedAt":        startedAt,
			"endedAt":          nullableStr(endedAt),
			"audioLanguage":    nullableStr(audioLang),
			"audioCodec":       nullableStr(audioCodec),
			"subtitleLanguage": nullableStr(subLang),
			"subtitleCodec":    nullableStr(subCodec),
			"bitrate":          nullableInt(bitrate),
			"pauseCount":       pauseCount,
			"seekCount":        seekCount,
			"rewatchCount":     rewatchCount,
			"speedChangeCount": speedChange,
			"username":         nullableStr(username),
			"mediaTitle":       nullableStr(title),
			"mediaType":        nullableStr(mType),
			"mediaDurationMs":  nullableInt(durMs),
			"libraryName":      nullableStr(libraryName),
			"resolution":       nullableStr(resolution),
		}
		items = append(items, item)
	}

	return items, total, nil
}

func nullableStr(ns sql.NullString) any {
	if ns.Valid {
		return ns.String
	}
	return nil
}

func nullableInt(ni sql.NullInt64) any {
	if ni.Valid {
		return ni.Int64
	}
	return nil
}
