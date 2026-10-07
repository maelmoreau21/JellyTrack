// Package logging provides system and audit log management, retrieval, and CSV exports.
package logging

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/csv"
	"fmt"
	"strings"

	"github.com/maelmoreau21/jellytrack/internal/database"
)

// LogItem represents an entry in the system log.
type LogItem struct {
	ID        string  `json:"id"`
	Action    string  `json:"action"`
	Actor     *string `json:"actor,omitempty"`
	Target    *string `json:"target,omitempty"`
	IP        *string `json:"ip,omitempty"`
	Details   *string `json:"details,omitempty"`
	CreatedAt string  `json:"createdAt"`
}

// GetSystemLogs returns paginated logs.
func GetSystemLogs(ctx context.Context, db *sql.DB, driver string, page, pageSize int, actionFilter string) ([]LogItem, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 200 {
		pageSize = 50
	}
	offset := (page - 1) * pageSize

	var conditions []string
	var args []any

	if actionFilter != "" {
		conditions = append(conditions, `"action" = ?`)
		args = append(args, actionFilter)
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
		SELECT "id", "action", "actorUsername", "target", "ipAddress", "details", "createdAt"
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

	var logs []LogItem
	for rows.Next() {
		var id, action, createdAt string
		var actor, target, ip, details sql.NullString
		if err := rows.Scan(&id, &action, &actor, &target, &ip, &details, &createdAt); err == nil {
			item := LogItem{
				ID:        id,
				Action:    action,
				CreatedAt: createdAt,
			}
			if actor.Valid {
				item.Actor = &actor.String
			}
			if target.Valid {
				item.Target = &target.String
			}
			if ip.Valid {
				item.IP = &ip.String
			}
			if details.Valid {
				item.Details = &details.String
			}
			logs = append(logs, item)
		}
	}

	return logs, total, nil
}

// ClearSystemLogs removes all audit log entries.
func ClearSystemLogs(ctx context.Context, db *sql.DB, driver string) error {
	_, err := db.ExecContext(ctx, database.Bind(`DELETE FROM "AdminAuditLog"`, driver))
	return err
}

// ExportLogsCSV exports logs as formatted CSV bytes.
func ExportLogsCSV(ctx context.Context, db *sql.DB, driver string) ([]byte, error) {
	rows, err := db.QueryContext(ctx, database.Bind(`
		SELECT "id", "action", COALESCE("actorUsername", ''), COALESCE("target", ''), COALESCE("ipAddress", ''), COALESCE("details", ''), "createdAt"
		FROM "AdminAuditLog"
		ORDER BY "createdAt" DESC
		LIMIT 5000
	`, driver))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	_ = w.Write([]string{"ID", "Action", "Actor", "Target", "IPAddress", "Details", "CreatedAt"})

	for rows.Next() {
		var id, action, actor, target, ip, details, createdAt string
		if err := rows.Scan(&id, &action, &actor, &target, &ip, &details, &createdAt); err == nil {
			_ = w.Write([]string{id, action, actor, target, ip, details, createdAt})
		}
	}
	w.Flush()

	return buf.Bytes(), nil
}
