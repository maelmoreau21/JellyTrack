// Package users provides user management, analytics, duplicate detection, and merging.
package users

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/internal/security"
)

// ListUsers returns all users with their watch statistics and last active timestamp.
func ListUsers(ctx context.Context, db *sql.DB, driver string) ([]map[string]any, error) {
	query := database.Bind(`
		SELECT u."id", u."serverId", u."jellyfinUserId", u."username", u."isActive", u."lastActive", u."createdAt",
		       s."name" AS "serverName",
		       COUNT(p."id") AS "totalPlays",
		       COALESCE(SUM(p."durationWatched"), 0) AS "totalDuration"
		FROM "User" u
		JOIN "Server" s ON s."id" = u."serverId"
		LEFT JOIN "PlaybackHistory" p ON p."userId" = u."id"
		GROUP BY u."id", u."serverId", u."jellyfinUserId", u."username", u."isActive", u."lastActive", u."createdAt", s."name"
		ORDER BY u."username" ASC
	`, driver)

	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("list users query: %w", err)
	}
	defer rows.Close()

	var list []map[string]any
	for rows.Next() {
		var id, srvID, jID, uname, srvName, createdAt string
		var isActive bool
		var lastActive sql.NullString
		var totalPlays, totalDuration int64

		if err := rows.Scan(&id, &srvID, &jID, &uname, &isActive, &lastActive, &createdAt, &srvName, &totalPlays, &totalDuration); err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}

		item := map[string]any{
			"id":             id,
			"serverId":       srvID,
			"serverName":     srvName,
			"jellyfinUserId": jID,
			"username":       uname,
			"isActive":       isActive,
			"totalPlays":     totalPlays,
			"totalDuration":  totalDuration,
			"createdAt":      createdAt,
		}
		if lastActive.Valid {
			item["lastActive"] = lastActive.String
		}
		list = append(list, item)
	}
	return list, nil
}

// UserDetail returns a user's details, recent activity, and top media.
func GetUserDetail(ctx context.Context, db *sql.DB, driver, userID string) (map[string]any, error) {
	var id, srvID, jID, uname, srvName, createdAt string
	var isActive bool
	var lastActive sql.NullString

	q := database.Bind(`
		SELECT u."id", u."serverId", u."jellyfinUserId", u."username", u."isActive", u."lastActive", u."createdAt", s."name"
		FROM "User" u
		JOIN "Server" s ON s."id" = u."serverId"
		WHERE u."id" = ?
	`, driver)

	if err := db.QueryRowContext(ctx, q, userID).Scan(&id, &srvID, &jID, &uname, &isActive, &lastActive, &createdAt, &srvName); err != nil {
		return nil, err
	}

	var totalPlays, totalDuration int64
	_ = db.QueryRowContext(ctx, database.Bind(`SELECT COUNT(*), COALESCE(SUM("durationWatched"),0) FROM "PlaybackHistory" WHERE "userId"=?`, driver), userID).Scan(&totalPlays, &totalDuration)

	// Recent activity
	recentQ := database.Bind(`
		SELECT p."id", p."mediaId", p."playMethod", p."eventSource", p."durationWatched", p."startedAt", m."title", m."type"
		FROM "PlaybackHistory" p
		JOIN "Media" m ON m."id" = p."mediaId"
		WHERE p."userId" = ?
		ORDER BY p."startedAt" DESC
		LIMIT 20
	`, driver)

	recentRows, err := db.QueryContext(ctx, recentQ, userID)
	var recent []map[string]any
	if err == nil {
		defer recentRows.Close()
		for recentRows.Next() {
			var pid, mid, method, source, started, title, mtype string
			var dur int64
			if err := recentRows.Scan(&pid, &mid, &method, &source, &dur, &started, &title, &mtype); err == nil {
				recent = append(recent, map[string]any{
					"id":              pid,
					"mediaId":         mid,
					"mediaTitle":      title,
					"mediaType":       mtype,
					"playMethod":      method,
					"eventSource":     source,
					"durationWatched": dur,
					"startedAt":       started,
				})
			}
		}
	}

	res := map[string]any{
		"user": map[string]any{
			"id":             id,
			"serverId":       srvID,
			"serverName":     srvName,
			"jellyfinUserId": jID,
			"username":       uname,
			"isActive":       isActive,
			"totalPlays":     totalPlays,
			"totalDuration":  totalDuration,
			"createdAt":      createdAt,
			"lastActive":     nullableStr(lastActive),
		},
		"recentActivity": recent,
	}

	return res, nil
}

// DuplicateGroup represents users that share the same username across servers or same jellyfinUserId.
type DuplicateGroup struct {
	Username string           `json:"username"`
	Count    int              `json:"count"`
	Users    []map[string]any `json:"users"`
}

// DetectDuplicates finds accounts sharing identical usernames.
func DetectDuplicates(ctx context.Context, db *sql.DB) ([]DuplicateGroup, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT u."id", u."serverId", u."jellyfinUserId", u."username", u."isActive", s."name" AS "serverName"
		FROM "User" u
		JOIN "Server" s ON s."id" = u."serverId"
		WHERE u."username" IN (
			SELECT "username" FROM "User" GROUP BY "username" HAVING COUNT(*) > 1
		)
		ORDER BY u."username" ASC, u."createdAt" ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	grouped := make(map[string][]map[string]any)
	for rows.Next() {
		var id, srvID, jID, uname, srvName string
		var isActive bool
		if err := rows.Scan(&id, &srvID, &jID, &uname, &isActive, &srvName); err == nil {
			item := map[string]any{
				"id":             id,
				"serverId":       srvID,
				"serverName":     srvName,
				"jellyfinUserId": jID,
				"username":       uname,
				"isActive":       isActive,
			}
			grouped[uname] = append(grouped[uname], item)
		}
	}

	result := make([]DuplicateGroup, 0, len(grouped))
	for uname, usersList := range grouped {
		result = append(result, DuplicateGroup{
			Username: uname,
			Count:    len(usersList),
			Users:    usersList,
		})
	}
	return result, nil
}

// MergeResult provides details about a user merge operation.
type MergeResult struct {
	SourceUserID      string `json:"sourceUserId"`
	TargetUserID      string `json:"targetUserId"`
	SessionsMoved     int64  `json:"sessionsMoved"`
	StreamsMoved      int64  `json:"streamsMoved"`
	DailyStatsUpdated int    `json:"dailyStatsUpdated"`
}

// MergeUsers merges source user into target user:
// 1. Reassigns PlaybackHistory rows
// 2. Reassigns ActiveStream rows
// 3. Merges DailyStats rows safely without collision
// 4. Deletes the source user
// 5. Records an audit log
func MergeUsers(ctx context.Context, db *sql.DB, driver, sourceUserID, targetUserID string, actorUsername, actorUserID *string) (MergeResult, error) {
	if sourceUserID == targetUserID {
		return MergeResult{}, errors.New("cannot merge user into itself")
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return MergeResult{}, err
	}
	defer tx.Rollback()

	// Verify both users exist
	var srcName, tgtName string
	if err := tx.QueryRowContext(ctx, database.Bind(`SELECT "username" FROM "User" WHERE "id"=?`, driver), sourceUserID).Scan(&srcName); err != nil {
		return MergeResult{}, fmt.Errorf("source user not found: %w", err)
	}
	if err := tx.QueryRowContext(ctx, database.Bind(`SELECT "username" FROM "User" WHERE "id"=?`, driver), targetUserID).Scan(&tgtName); err != nil {
		return MergeResult{}, fmt.Errorf("target user not found: %w", err)
	}

	// 1. Reassign PlaybackHistory
	histRes, err := tx.ExecContext(ctx, database.Bind(`UPDATE "PlaybackHistory" SET "userId"=? WHERE "userId"=?`, driver), targetUserID, sourceUserID)
	if err != nil {
		return MergeResult{}, fmt.Errorf("reassign history: %w", err)
	}
	sessionsMoved, _ := histRes.RowsAffected()

	// 2. Reassign ActiveStream
	streamRes, err := tx.ExecContext(ctx, database.Bind(`UPDATE "ActiveStream" SET "userId"=? WHERE "userId"=?`, driver), targetUserID, sourceUserID)
	if err != nil {
		return MergeResult{}, fmt.Errorf("reassign streams: %w", err)
	}
	streamsMoved, _ := streamRes.RowsAffected()

	// 3. Merge DailyStats
	dailyRows, err := tx.QueryContext(ctx, database.Bind(`
		SELECT "id", "date", "libraryName", "mediaType", "totalPlays", "totalDuration", "directPlays", "transcodes", "uniqueMedia"
		FROM "DailyStats"
		WHERE "userId"=?
	`, driver), sourceUserID)
	if err != nil {
		return MergeResult{}, fmt.Errorf("query source daily stats: %w", err)
	}

	type dailyStat struct {
		id, date, libName, mType string
		plays, dur, dp, tc, uniq int
	}
	var srcStats []dailyStat
	for dailyRows.Next() {
		var s dailyStat
		var lib, mt sql.NullString
		if err := dailyRows.Scan(&s.id, &s.date, &lib, &mt, &s.plays, &s.dur, &s.dp, &s.tc, &s.uniq); err == nil {
			s.libName = lib.String
			s.mType = mt.String
			srcStats = append(srcStats, s)
		}
	}
	dailyRows.Close()

	dailyStatsUpdated := 0
	for _, stat := range srcStats {
		var existingID string
		var ePlays, eDur, eDP, eTC, eUniq int

		findQ := database.Bind(`
			SELECT "id", "totalPlays", "totalDuration", "directPlays", "transcodes", "uniqueMedia"
			FROM "DailyStats"
			WHERE "date"=? AND "userId"=? AND COALESCE("libraryName",'')=? AND COALESCE("mediaType",'')=?
		`, driver)

		err := tx.QueryRowContext(ctx, findQ, stat.date, targetUserID, stat.libName, stat.mType).Scan(&existingID, &ePlays, &eDur, &eDP, &eTC, &eUniq)
		if err == nil {
			// Update existing record with sum/max
			maxUniq := eUniq
			if stat.uniq > maxUniq {
				maxUniq = stat.uniq
			}
			updateQ := database.Bind(`
				UPDATE "DailyStats"
				SET "totalPlays"=?, "totalDuration"=?, "directPlays"=?, "transcodes"=?, "uniqueMedia"=?, "updatedAt"=?
				WHERE "id"=?
			`, driver)
			_, _ = tx.ExecContext(ctx, updateQ, ePlays+stat.plays, eDur+stat.dur, eDP+stat.dp, eTC+stat.tc, maxUniq, time.Now().UTC().Format(time.RFC3339Nano), existingID)
			// Delete source record
			_, _ = tx.ExecContext(ctx, database.Bind(`DELETE FROM "DailyStats" WHERE "id"=?`, driver), stat.id)
		} else {
			// Reassign record to target user
			_, _ = tx.ExecContext(ctx, database.Bind(`UPDATE "DailyStats" SET "userId"=? WHERE "id"=?`, driver), targetUserID, stat.id)
		}
		dailyStatsUpdated++
	}

	// 4. Delete source user
	if _, err := tx.ExecContext(ctx, database.Bind(`DELETE FROM "User" WHERE "id"=?`, driver), sourceUserID); err != nil {
		return MergeResult{}, fmt.Errorf("delete source user: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return MergeResult{}, err
	}

	// 5. Audit log
	details := map[string]any{
		"sourceUserId":      sourceUserID,
		"sourceUsername":    srcName,
		"targetUserId":      targetUserID,
		"targetUsername":    tgtName,
		"sessionsMoved":     sessionsMoved,
		"streamsMoved":      streamsMoved,
		"dailyStatsUpdated": dailyStatsUpdated,
	}
	_ = security.LogAudit(ctx, db, driver, "admin.users.merge", actorUserID, actorUsername, &targetUserID, nil, details)

	return MergeResult{
		SourceUserID:      sourceUserID,
		TargetUserID:      targetUserID,
		SessionsMoved:     sessionsMoved,
		StreamsMoved:      streamsMoved,
		DailyStatsUpdated: dailyStatsUpdated,
	}, nil
}

// DeleteUser removes a user and their cascades.
func DeleteUser(ctx context.Context, db *sql.DB, driver, userID string) error {
	_, err := db.ExecContext(ctx, database.Bind(`DELETE FROM "User" WHERE "id"=?`, driver), userID)
	return err
}

func nullableStr(ns sql.NullString) any {
	if ns.Valid {
		return ns.String
	}
	return nil
}
