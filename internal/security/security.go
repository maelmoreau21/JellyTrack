// Package security provides administrative audit logging and security monitoring.
package security

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/database"
)

// LogAudit persists an administrative or security event into the AdminAuditLog table.
func LogAudit(ctx context.Context, db *sql.DB, driver, action string, actorUserID, actorUsername, target, ipAddress *string, details any) error {
	idBytes := make([]byte, 16)
	if _, err := rand.Read(idBytes); err != nil {
		return err
	}
	id := hex.EncodeToString(idBytes)

	var detailsJSON *string
	if details != nil {
		if b, err := json.Marshal(details); err == nil {
			s := string(b)
			detailsJSON = &s
		}
	}

	query := database.Bind(`
		INSERT INTO "AdminAuditLog" ("id", "action", "actorUserId", "actorUsername", "target", "ipAddress", "details", "createdAt")
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, driver)

	_, err := db.ExecContext(ctx, query, id, action, actorUserID, actorUsername, target, ipAddress, detailsJSON, time.Now().UTC().Format(time.RFC3339Nano))
	return err
}

// SecurityOverviewResult holds metrics on security events.
type SecurityOverviewResult struct {
	TotalAudit24h        int64            `json:"totalAudit24h"`
	Unauthorized24h      int64            `json:"unauthorized24h"`
	RateLimited24h       int64            `json:"rateLimited24h"`
	PreviousKeyUsed24h   int64            `json:"previousKeyUsed24h"`
	KeyActions30d        int64            `json:"keyActions30d"`
	Revocations30d       int64            `json:"revocations30d"`
	PolicyChanges30d     int64            `json:"policyChanges30d"`
	RecentSecurityEvents []map[string]any `json:"recentSecurityEvents"`
}

// GetSecurityOverview aggregates security activity over 24h and 30d periods.
func GetSecurityOverview(ctx context.Context, db *sql.DB, driver string) (SecurityOverviewResult, error) {
	now := time.Now().UTC()
	last24h := now.Add(-24 * time.Hour).Format(time.RFC3339Nano)
	last30d := now.AddDate(0, 0, -30).Format(time.RFC3339Nano)

	var res SecurityOverviewResult

	countQuery := func(q string, arg any) int64 {
		var c int64
		_ = db.QueryRowContext(ctx, database.Bind(q, driver), arg).Scan(&c)
		return c
	}

	res.TotalAudit24h = countQuery(`SELECT COUNT(*) FROM "AdminAuditLog" WHERE "createdAt" >= ?`, last24h)
	res.Unauthorized24h = countQuery(`SELECT COUNT(*) FROM "AdminAuditLog" WHERE "action" = 'plugin.events.unauthorized' AND "createdAt" >= ?`, last24h)
	res.RateLimited24h = countQuery(`SELECT COUNT(*) FROM "AdminAuditLog" WHERE "action" = 'plugin.events.rate_limited' AND "createdAt" >= ?`, last24h)
	res.PreviousKeyUsed24h = countQuery(`SELECT COUNT(*) FROM "AdminAuditLog" WHERE "action" = 'plugin.key.previous_key_used' AND "createdAt" >= ?`, last24h)
	res.KeyActions30d = countQuery(`SELECT COUNT(*) FROM "AdminAuditLog" WHERE "action" IN ('plugin.key.generated', 'plugin.key.rotated') AND "createdAt" >= ?`, last30d)
	res.Revocations30d = countQuery(`SELECT COUNT(*) FROM "AdminAuditLog" WHERE "action" = 'plugin.key.revoked' AND "createdAt" >= ?`, last30d)
	res.PolicyChanges30d = countQuery(`SELECT COUNT(*) FROM "AdminAuditLog" WHERE "action" = 'plugin.key.policy_updated' AND "createdAt" >= ?`, last30d)

	// Fetch 10 most recent security attempts
	recentQ := database.Bind(`
		SELECT "id", "action", "actorUsername", "ipAddress", "createdAt", "details"
		FROM "AdminAuditLog"
		WHERE "action" IN ('plugin.events.unauthorized', 'plugin.events.rate_limited', 'plugin.events.payload_too_large', 'plugin.events.invalid_payload')
		ORDER BY "createdAt" DESC
		LIMIT 10
	`, driver)

	rows, err := db.QueryContext(ctx, recentQ)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var id, action, createdAt string
			var actor, ip, details sql.NullString
			if err := rows.Scan(&id, &action, &actor, &ip, &createdAt, &details); err == nil {
				item := map[string]any{
					"id":        id,
					"action":    action,
					"createdAt": createdAt,
				}
				if actor.Valid {
					item["actorUsername"] = actor.String
				}
				if ip.Valid {
					item["ipAddress"] = ip.String
				}
				if details.Valid {
					var raw any
					if json.Unmarshal([]byte(details.String), &raw) == nil {
						item["details"] = raw
					}
				}
				res.RecentSecurityEvents = append(res.RecentSecurityEvents, item)
			}
		}
	}

	return res, nil
}

// ListAuditLogs returns paginated audit log records.
func ListAuditLogs(ctx context.Context, db *sql.DB, driver string, page, pageSize int, actionFilter, actorFilter string) ([]map[string]any, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 25
	}
	offset := (page - 1) * pageSize

	var conditions []string
	var args []any

	if actionFilter != "" {
		conditions = append(conditions, `"action" = ?`)
		args = append(args, actionFilter)
	}
	if actorFilter != "" {
		conditions = append(conditions, `("actorUsername" = ? OR "actorUserId" = ?)`)
		args = append(args, actorFilter, actorFilter)
	}

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = "WHERE " + strings.Join(conditions, " AND ")
	}

	countQ := database.Bind(fmt.Sprintf(`SELECT COUNT(*) FROM "AdminAuditLog" %s`, whereClause), driver)
	var total int64
	if err := db.QueryRowContext(ctx, countQ, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	query := database.Bind(fmt.Sprintf(`
		SELECT "id", "action", "actorUserId", "actorUsername", "target", "ipAddress", "details", "createdAt"
		FROM "AdminAuditLog"
		%s
		ORDER BY "createdAt" DESC
		LIMIT ? OFFSET ?
	`, whereClause), driver)

	queryArgs := append(args, pageSize, offset)
	rows, err := db.QueryContext(ctx, query, queryArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var logs []map[string]any
	for rows.Next() {
		var id, action, createdAt string
		var uid, uname, target, ip, details sql.NullString
		if err := rows.Scan(&id, &action, &uid, &uname, &target, &ip, &details, &createdAt); err == nil {
			item := map[string]any{
				"id":        id,
				"action":    action,
				"createdAt": createdAt,
			}
			if uid.Valid {
				item["actorUserId"] = uid.String
			}
			if uname.Valid {
				item["actorUsername"] = uname.String
			}
			if target.Valid {
				item["target"] = target.String
			}
			if ip.Valid {
				item["ipAddress"] = ip.String
			}
			if details.Valid {
				var parsed any
				if json.Unmarshal([]byte(details.String), &parsed) == nil {
					item["details"] = parsed
				}
			}
			logs = append(logs, item)
		}
	}

	return logs, total, nil
}
