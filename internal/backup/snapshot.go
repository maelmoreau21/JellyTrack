package backup

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/database"
)

var snapshotTables = []struct{ key, table string }{
	{"servers", "Server"}, {"users", "User"}, {"media", "Media"}, {"playbackHistory", "PlaybackHistory"},
	{"telemetryEvents", "TelemetryEvent"}, {"dailyStats", "DailyStats"}, {"adminAuditLogs", "AdminAuditLog"}, {"personAccounts", "PersonAccount"},
}

type snapshotReader interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

// Export every persisted column and fail on errors, rather than silently
// omitting rows/tables. Authentication sessions and one-time proofs are excluded.
func exportSnapshotRows(ctx context.Context, db snapshotReader, driver, table string) ([]map[string]any, error) {
	query := `SELECT * FROM "` + table + `"`
	if driver == "postgres" {
		query = `SELECT row_to_json(t)::text FROM "` + table + `" t`
	}
	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []map[string]any{}
	if driver == "postgres" {
		for rows.Next() {
			var raw string
			if err = rows.Scan(&raw); err != nil {
				return nil, err
			}
			var row map[string]any
			decoder := json.NewDecoder(strings.NewReader(raw))
			decoder.UseNumber()
			if err = decoder.Decode(&row); err != nil {
				return nil, err
			}
			result = append(result, row)
		}
	} else {
		columns, err := rows.Columns()
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			values := make([]any, len(columns))
			pointers := make([]any, len(columns))
			for i := range values {
				pointers[i] = &values[i]
			}
			if err = rows.Scan(pointers...); err != nil {
				return nil, err
			}
			row := map[string]any{}
			for i, column := range columns {
				value := values[i]
				if b, ok := value.([]byte); ok {
					value = string(b)
				}
				if date, ok := value.(time.Time); ok {
					value = date.UTC().Format(time.RFC3339Nano)
				}
				row[column] = value
			}
			result = append(result, row)
		}
	}
	return result, rows.Err()
}

func decodeBackupJSON(data []byte, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return fmt.Errorf("backup JSON must contain exactly one value")
	}
	return nil
}

func restoreSnapshotTable(ctx context.Context, tx *sql.Tx, driver, table string, raw any) error {
	source, ok := raw.([]any)
	if !ok {
		return fmt.Errorf("backup table %s is missing or invalid", table)
	}
	metadata, err := tx.QueryContext(ctx, `SELECT * FROM "`+table+`" LIMIT 0`)
	if err != nil {
		return err
	}
	types, err := metadata.ColumnTypes()
	metadata.Close()
	if err != nil {
		return err
	}
	known := map[string]bool{}
	for _, column := range types {
		known[column.Name()] = true
	}
	for _, item := range source {
		row, ok := item.(map[string]any)
		if !ok || len(row) == 0 {
			return fmt.Errorf("invalid %s backup row", table)
		}
		for key := range row {
			if !known[key] {
				return fmt.Errorf("unknown %s column %s", table, key)
			}
		}
		columns, marks := []string{}, []string{}
		values := []any{}
		for _, column := range types {
			value, present := row[column.Name()]
			if !present {
				continue
			}
			typ := strings.ToUpper(column.DatabaseTypeName())
			if n, ok := value.(json.Number); ok {
				if integer, err := n.Int64(); err == nil {
					value = integer
				} else {
					number, err := n.Float64()
					if err != nil {
						return err
					}
					value = number
				}
			}
			if driver == "postgres" && typ == "BOOL" {
				switch v := value.(type) {
				case int64:
					value = v != 0
				case float64:
					value = v != 0
				}
			}
			if driver == "postgres" && (typ == "_TEXT" || typ == "TEXT[]") {
				switch v := value.(type) {
				case string:
					var array []string
					if err := json.Unmarshal([]byte(v), &array); err != nil {
						return err
					}
					value = array
				case []any:
					array := []string{}
					for _, item := range v {
						text, ok := item.(string)
						if !ok {
							return fmt.Errorf("invalid text array")
						}
						array = append(array, text)
					}
					value = array
				}
			} else {
				switch value.(type) {
				case []any, map[string]any:
					b, err := json.Marshal(value)
					if err != nil {
						return err
					}
					value = string(b)
				}
			}
			columns = append(columns, `"`+column.Name()+`"`)
			marks = append(marks, "?")
			values = append(values, value)
		}
		_, err = tx.ExecContext(ctx, database.Bind(`INSERT INTO "`+table+`" (`+strings.Join(columns, ",")+`) VALUES (`+strings.Join(marks, ",")+`)`, driver), values...)
		if err != nil {
			return fmt.Errorf("restore %s: %w", table, err)
		}
	}
	return nil
}

func restoreSnapshot(ctx context.Context, db *sql.DB, driver string, data, settings map[string]any) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, table := range []string{"AccountLinkProof", "AuthSession", "PersonAccount", "ActiveStream", "TelemetryEvent", "PlaybackHistory", "DailyStats", "Media", "User", "Server", "AdminAuditLog", "SystemHealthEvent", "SystemHealthState"} {
		if _, err = tx.ExecContext(ctx, `DELETE FROM "`+table+`"`); err != nil {
			return err
		}
	}
	for _, table := range snapshotTables {
		if err = restoreSnapshotTable(ctx, tx, driver, table.table, data[table.key]); err != nil {
			return err
		}
	}
	actual, ok := settings["settings"].(map[string]any)
	if !ok {
		return fmt.Errorf("backup settings missing")
	}
	if err = restoreGlobalSettings(ctx, tx, driver, actual); err != nil {
		return err
	}
	return tx.Commit()
}
