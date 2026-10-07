// Package cleanup provides database maintenance: orphaned sessions cleanup, history consolidation, and telemetry retention.
package cleanup

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"time"

	"github.com/maelmoreau21/jellytrack/v3/internal/database"
)

// CleanupOrphanedSessions closes open playback histories that have no active stream or exceed 24 hours,
// and deletes ghost ActiveStream entries with stale lastPingAt.
func CleanupOrphanedSessions(ctx context.Context, db *sql.DB, driver string, heartbeatTimeoutSec int) (int, int, error) {
	if heartbeatTimeoutSec <= 0 {
		heartbeatTimeoutSec = 600 // 10 minutes default
	}
	now := time.Now().UTC()
	staleThreshold := now.Add(-time.Duration(heartbeatTimeoutSec) * time.Second).Format(time.RFC3339Nano)

	// 1. Delete stale ActiveStream entries
	delRes, err := db.ExecContext(ctx, database.Bind(`DELETE FROM "ActiveStream" WHERE "lastPingAt" < ?`, driver), staleThreshold)
	if err != nil {
		return 0, 0, fmt.Errorf("delete stale active streams: %w", err)
	}
	deletedStreams, _ := delRes.RowsAffected()

	// 2. Find open PlaybackHistory (endedAt IS NULL)
	rows, err := db.QueryContext(ctx, `SELECT p."id", p."userId", p."mediaId", p."startedAt", p."durationWatched", COALESCE(m."durationMs", 0) FROM "PlaybackHistory" p JOIN "Media" m ON m."id" = p."mediaId" WHERE p."endedAt" IS NULL`)
	if err != nil {
		return int(deletedStreams), 0, fmt.Errorf("query open playback history: %w", err)
	}
	defer rows.Close()

	type openItem struct {
		id, startedAt string
		userId        sql.NullString
		mediaId       string
		duration      int64
		mediaDuration int64
	}
	var openList []openItem
	for rows.Next() {
		var item openItem
		if err := rows.Scan(&item.id, &item.userId, &item.mediaId, &item.startedAt, &item.duration, &item.mediaDuration); err != nil {
			return int(deletedStreams), 0, err
		}
		openList = append(openList, item)
	}
	if err := rows.Err(); err != nil {
		return int(deletedStreams), 0, err
	}

	closedCount := 0
	const maxAge = 24 * time.Hour
	for _, item := range openList {
		// Check if there is still an active stream for this user + media
		var activeExists bool
		if item.userId.Valid {
			err = db.QueryRowContext(ctx, database.Bind(`SELECT EXISTS(SELECT 1 FROM "ActiveStream" WHERE "userId" = ? AND "mediaId" = ?)`, driver), item.userId.String, item.mediaId).Scan(&activeExists)
		} else {
			err = db.QueryRowContext(ctx, database.Bind(`SELECT EXISTS(SELECT 1 FROM "ActiveStream" WHERE "mediaId" = ?)`, driver), item.mediaId).Scan(&activeExists)
		}
		if err != nil {
			continue
		}

		started, _ := time.Parse(time.RFC3339Nano, item.startedAt)
		if started.IsZero() {
			started, _ = time.Parse(time.RFC3339, item.startedAt)
		}
		age := now.Sub(started)

		if !activeExists || age > maxAge {
			ended := now
			if age > maxAge && !started.IsZero() {
				ended = started.Add(maxAge)
			}
			cappedDuration := item.duration
			if item.mediaDuration > 0 {
				mediaDurationSec := item.mediaDuration / 1000
				if cappedDuration > mediaDurationSec {
					cappedDuration = mediaDurationSec
				}
			}
			_, updateErr := db.ExecContext(ctx, database.Bind(`UPDATE "PlaybackHistory" SET "endedAt" = ?, "durationWatched" = ? WHERE "id" = ?`, driver), ended.Format(time.RFC3339Nano), cappedDuration, item.id)
			if updateErr == nil {
				closedCount++
			}
		}
	}

	return int(deletedStreams), closedCount, nil
}

type playItem struct {
	id, startedAt string
	endedAt       sql.NullString
	duration      int64
	pauses        int
	seeks         int
	rewatches     int
	speedChanges  int
	audioChanges  int
	subChanges    int
	mediaDuration int64
	parsedStart   time.Time
	parsedEnd     time.Time
}

// ConsolidatePlaybackHistory merges fragmented playback sessions (same user & media within merge window).
func ConsolidatePlaybackHistory(ctx context.Context, db *sql.DB, driver string, mergeWindowMinutes int) (int, int, error) {
	if mergeWindowMinutes <= 0 {
		mergeWindowMinutes = 60
	}
	mergeWindow := time.Duration(mergeWindowMinutes) * time.Minute

	// Query candidate groups with > 1 entry
	rows, err := db.QueryContext(ctx, `SELECT "serverId", "userId", "mediaId" FROM "PlaybackHistory" WHERE "userId" IS NOT NULL GROUP BY "serverId", "userId", "mediaId" HAVING COUNT("id") > 1`)
	if err != nil {
		return 0, 0, fmt.Errorf("find candidate history groups: %w", err)
	}
	defer rows.Close()

	type groupKey struct {
		serverId, userId, mediaId string
	}
	var candidates []groupKey
	for rows.Next() {
		var g groupKey
		if err := rows.Scan(&g.serverId, &g.userId, &g.mediaId); err == nil {
			candidates = append(candidates, g)
		}
	}
	if err := rows.Err(); err != nil {
		return 0, 0, err
	}

	clustersMerged := 0
	sessionsPruned := 0

	for _, g := range candidates {
		sRows, err := db.QueryContext(ctx, database.Bind(`SELECT p."id", p."startedAt", p."endedAt", p."durationWatched", p."pauseCount", p."seekCount", p."rewatchCount", p."speedChangeCount", p."audioChanges", p."subtitleChanges", COALESCE(m."durationMs", 0) FROM "PlaybackHistory" p JOIN "Media" m ON m."id" = p."mediaId" WHERE p."serverId" = ? AND p."userId" = ? AND p."mediaId" = ? ORDER BY p."startedAt" ASC`, driver), g.serverId, g.userId, g.mediaId)
		if err != nil {
			continue
		}

		var sessions []playItem
		for sRows.Next() {
			var it playItem
			if err := sRows.Scan(&it.id, &it.startedAt, &it.endedAt, &it.duration, &it.pauses, &it.seeks, &it.rewatches, &it.speedChanges, &it.audioChanges, &it.subChanges, &it.mediaDuration); err == nil {
				it.parsedStart, _ = time.Parse(time.RFC3339Nano, it.startedAt)
				if it.parsedStart.IsZero() {
					it.parsedStart, _ = time.Parse(time.RFC3339, it.startedAt)
				}
				if it.endedAt.Valid {
					it.parsedEnd, _ = time.Parse(time.RFC3339Nano, it.endedAt.String)
					if it.parsedEnd.IsZero() {
						it.parsedEnd, _ = time.Parse(time.RFC3339, it.endedAt.String)
					}
				}
				sessions = append(sessions, it)
			}
		}
		sRows.Close()

		if len(sessions) <= 1 {
			continue
		}

		// Cluster sessions
		var currentCluster []playItem
		for _, s := range sessions {
			if len(currentCluster) == 0 {
				currentCluster = append(currentCluster, s)
				continue
			}
			last := currentCluster[len(currentCluster)-1]
			var referenceTime time.Time
			if !last.parsedEnd.IsZero() {
				referenceTime = last.parsedEnd
			} else {
				referenceTime = last.parsedStart
			}
			diff := s.parsedStart.Sub(referenceTime)
			if diff < 0 {
				diff = -diff
			}
			if diff <= mergeWindow {
				currentCluster = append(currentCluster, s)
			} else {
				if len(currentCluster) > 1 {
					if mergeCluster(ctx, db, driver, currentCluster) {
						clustersMerged++
						sessionsPruned += len(currentCluster) - 1
					}
				}
				currentCluster = []playItem{s}
			}
		}
		if len(currentCluster) > 1 {
			if mergeCluster(ctx, db, driver, currentCluster) {
				clustersMerged++
				sessionsPruned += len(currentCluster) - 1
			}
		}
	}

	return clustersMerged, sessionsPruned, nil
}

func mergeCluster(ctx context.Context, db *sql.DB, driver string, cluster []playItem) bool {
	leader := cluster[0]
	duplicates := cluster[1:]

	var totalDuration int64
	totalPauses := len(cluster) - 1
	var totalSeeks, totalRewatches, totalSpeedChanges, totalAudioChanges, totalSubChanges int
	hasOpen := false
	var maxEnd time.Time

	for _, s := range cluster {
		totalDuration += s.duration
		totalPauses += s.pauses
		totalSeeks += s.seeks
		totalRewatches += s.rewatches
		totalSpeedChanges += s.speedChanges
		totalAudioChanges += s.audioChanges
		totalSubChanges += s.subChanges
		if !s.endedAt.Valid {
			hasOpen = true
		} else if s.parsedEnd.After(maxEnd) {
			maxEnd = s.parsedEnd
		}
	}

	if leader.mediaDuration > 0 {
		mediaSec := leader.mediaDuration / 1000
		if totalDuration > mediaSec {
			totalDuration = mediaSec
		}
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return false
	}
	defer tx.Rollback()

	for _, dup := range duplicates {
		// Re-parent TelemetryEvent and ActiveStream
		if _, err := tx.ExecContext(ctx, database.Bind(`UPDATE "TelemetryEvent" SET "playbackId" = ? WHERE "playbackId" = ?`, driver), leader.id, dup.id); err != nil {
			return false
		}
		if _, err := tx.ExecContext(ctx, database.Bind(`UPDATE "ActiveStream" SET "playbackId" = ? WHERE "playbackId" = ?`, driver), leader.id, dup.id); err != nil {
			return false
		}
		if _, err := tx.ExecContext(ctx, database.Bind(`DELETE FROM "PlaybackHistory" WHERE "id" = ?`, driver), dup.id); err != nil {
			return false
		}
	}

	var finalEnded sql.NullString
	if !hasOpen && !maxEnd.IsZero() {
		finalEnded = sql.NullString{String: maxEnd.Format(time.RFC3339Nano), Valid: true}
	}

	_, err = tx.ExecContext(ctx, database.Bind(`UPDATE "PlaybackHistory" SET "durationWatched" = ?, "endedAt" = ?, "pauseCount" = ?, "seekCount" = ?, "rewatchCount" = ?, "speedChangeCount" = ?, "audioChanges" = ?, "subtitleChanges" = ? WHERE "id" = ?`, driver),
		totalDuration, finalEnded, totalPauses, totalSeeks, totalRewatches, totalSpeedChanges, totalAudioChanges, totalSubChanges, leader.id)
	if err != nil {
		return false
	}

	return tx.Commit() == nil
}

// TelemetryRetention removes telemetry events older than retentionDays.
func TelemetryRetention(ctx context.Context, db *sql.DB, driver string, retentionDays int) (int64, error) {
	if retentionDays <= 0 {
		retentionDays = 90
	}
	cutoff := time.Now().UTC().AddDate(0, 0, -retentionDays).Format(time.RFC3339Nano)
	res, err := db.ExecContext(ctx, database.Bind(`DELETE FROM "TelemetryEvent" WHERE "createdAt" < ?`, driver), cutoff)
	if err != nil {
		return 0, fmt.Errorf("telemetry retention cleanup: %w", err)
	}
	return res.RowsAffected()
}

func minInt64(a, b int64) int64 {
	if a < b {
		return a
	}
	return b
}

func roundSec(ticks int64) int64 {
	return int64(math.Round(float64(ticks) / 10_000_000))
}
