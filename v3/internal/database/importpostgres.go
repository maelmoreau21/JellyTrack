// Package database provides storage connections, migrations, and data import.
package database

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type ImportCount struct {
	Source int64
	Target int64
}

var importTables = []string{
	"Server",
	"User",
	"Media",
	"PlaybackHistory",
	"TelemetryEvent",
	"ActiveStream",
	"GlobalSettings",
	"AdminAuditLog",
	"SystemHealthState",
	"SystemHealthEvent",
	"DailyStats",
}

var jsonStorageColumns = map[string]map[string]bool{
	"Media":             {"genres": true, "directors": true, "actors": true, "studios": true},
	"GlobalSettings":    {"excludedLibraries": true, "pluginTelemetrySettings": true, "resolutionThresholds": true, "ssoSettings": true},
	"AdminAuditLog":     {"details": true},
	"SystemHealthState": {"monitor": true, "sync": true, "backup": true},
	"SystemHealthEvent": {"details": true},
}

// RunPostgresImport is the import-postgres subcommand entry point.
func RunPostgresImport(args []string) error {
	flags := flag.NewFlagSet("import-postgres", flag.ContinueOnError)
	targetPath := flags.String("target", "./jellytrack.db", "new SQLite database path (must not already exist)")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if flags.NArg() != 0 {
		return fmt.Errorf("unexpected positional arguments")
	}
	sourceURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if sourceURL == "" {
		return fmt.Errorf("DATABASE_URL must contain the source PostgreSQL connection URL")
	}
	ctx := context.Background()
	counts, err := ImportPostgres(ctx, sourceURL, *targetPath)
	if err != nil {
		return err
	}
	for _, table := range importTables {
		count := counts[table]
		fmt.Printf("%-22s %d rows verified\n", table, count.Target)
	}
	fmt.Printf("SQLite database created: %s\n", *targetPath)
	return nil
}

// ImportPostgres copies one consistent PostgreSQL snapshot into a newly created
// SQLite file, verifies every table count, then atomically publishes that file.
// It never reads all source rows into memory and never overwrites an existing file.
func ImportPostgres(ctx context.Context, sourceURL, targetPath string) (map[string]ImportCount, error) {
	if strings.TrimSpace(sourceURL) == "" {
		return nil, fmt.Errorf("source PostgreSQL URL is required")
	}
	if strings.TrimSpace(targetPath) == "" {
		return nil, fmt.Errorf("target SQLite path is required")
	}
	if _, err := os.Stat(targetPath); err == nil {
		return nil, fmt.Errorf("target already exists; choose a new SQLite file path")
	} else if !os.IsNotExist(err) {
		return nil, fmt.Errorf("inspect target path: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(targetPath), 0o750); err != nil {
		return nil, fmt.Errorf("create target directory: %w", err)
	}

	source, err := sql.Open("pgx", sourceURL)
	if err != nil {
		return nil, fmt.Errorf("open source PostgreSQL: %w", err)
	}
	defer source.Close()
	source.SetMaxOpenConns(2)
	source.SetMaxIdleConns(1)
	if err := source.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("connect to source PostgreSQL: %w", err)
	}

	sourceTx, err := source.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		return nil, fmt.Errorf("start consistent source snapshot: %w", err)
	}
	defer sourceTx.Rollback()
	expected := make(map[string]int64, len(importTables))
	for _, table := range importTables {
		var count int64
		if err := sourceTx.QueryRowContext(ctx, `SELECT count(*) FROM `+quoteIdentifier(table)).Scan(&count); err != nil {
			return nil, fmt.Errorf("count source table %s: %w", table, err)
		}
		expected[table] = count
	}

	tempFile, err := os.CreateTemp(filepath.Dir(targetPath), ".jellytrack-import-*.db")
	if err != nil {
		return nil, fmt.Errorf("create temporary SQLite file: %w", err)
	}
	tempPath := tempFile.Name()
	if err := tempFile.Close(); err != nil {
		return nil, fmt.Errorf("close temporary SQLite file: %w", err)
	}
	published := false
	defer func() {
		if !published {
			_ = os.Remove(tempPath)
			_ = os.Remove(tempPath + "-wal")
			_ = os.Remove(tempPath + "-shm")
		}
	}()

	target, err := sql.Open("sqlite", sqliteDSN(tempPath))
	if err != nil {
		return nil, fmt.Errorf("open temporary SQLite database: %w", err)
	}
	target.SetMaxOpenConns(1)
	target.SetMaxIdleConns(1)
	closeTarget := func() error { return target.Close() }
	defer closeTarget()
	if err := target.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("initialize temporary SQLite database: %w", err)
	}
	if err := Migrate(ctx, target, driverSQLite); err != nil {
		return nil, err
	}

	counts := make(map[string]ImportCount, len(importTables))
	for _, table := range importTables {
		inserted, err := copyTable(ctx, sourceTx, target, table)
		if err != nil {
			return nil, err
		}
		var targetCount int64
		if err := target.QueryRowContext(ctx, `SELECT count(*) FROM `+quoteIdentifier(table)).Scan(&targetCount); err != nil {
			return nil, fmt.Errorf("verify target table %s: %w", table, err)
		}
		counts[table] = ImportCount{Source: expected[table], Target: targetCount}
		if inserted != expected[table] || targetCount != expected[table] {
			return counts, fmt.Errorf("row count mismatch in %s: source=%d imported=%d target=%d", table, expected[table], inserted, targetCount)
		}
	}
	if err := sourceTx.Commit(); err != nil {
		return nil, fmt.Errorf("finish source snapshot: %w", err)
	}
	if _, err := target.ExecContext(ctx, "PRAGMA wal_checkpoint(TRUNCATE)"); err != nil {
		return nil, fmt.Errorf("checkpoint imported SQLite database: %w", err)
	}
	if err := closeTarget(); err != nil {
		return nil, fmt.Errorf("close imported SQLite database: %w", err)
	}
	if err := os.Link(tempPath, targetPath); err != nil {
		return nil, fmt.Errorf("publish imported SQLite database: %w", err)
	}
	published = true
	if err := os.Remove(tempPath); err != nil {
		return counts, fmt.Errorf("remove temporary SQLite link: %w", err)
	}
	return counts, nil
}

func copyTable(ctx context.Context, source *sql.Tx, target *sql.DB, table string) (int64, error) {
	rows, err := source.QueryContext(ctx, `SELECT row_to_json(t)::text FROM `+quoteIdentifier(table)+` AS t`)
	if err != nil {
		return 0, fmt.Errorf("read source table %s: %w", table, err)
	}
	defer rows.Close()

	columns, err := sqliteColumns(ctx, target, table)
	if err != nil {
		return 0, err
	}
	placeholders := strings.TrimRight(strings.Repeat("?,", len(columns)), ",")
	quotedColumns := make([]string, len(columns))
	for i, column := range columns {
		quotedColumns[i] = quoteIdentifier(column)
	}
	insertSQL := "INSERT INTO " + quoteIdentifier(table) + " (" + strings.Join(quotedColumns, ",") + ") VALUES (" + placeholders + ")"
	tx, err := target.BeginTx(ctx, nil)
	if err != nil {
		return 0, fmt.Errorf("start target import for %s: %w", table, err)
	}
	statement, err := tx.PrepareContext(ctx, insertSQL)
	if err != nil {
		_ = tx.Rollback()
		return 0, fmt.Errorf("prepare target import for %s: %w", table, err)
	}
	var copied int64
	for rows.Next() {
		var encoded []byte
		if err := rows.Scan(&encoded); err != nil {
			_ = statement.Close()
			_ = tx.Rollback()
			return copied, fmt.Errorf("read row from %s: %w", table, err)
		}
		values, err := decodeSourceRow(encoded, table, columns)
		if err != nil {
			_ = statement.Close()
			_ = tx.Rollback()
			return copied, fmt.Errorf("convert row in %s: %w", table, err)
		}
		if _, err := statement.ExecContext(ctx, values...); err != nil {
			_ = statement.Close()
			_ = tx.Rollback()
			return copied, fmt.Errorf("write row to %s: %w", table, err)
		}
		copied++
	}
	if err := rows.Err(); err != nil {
		_ = statement.Close()
		_ = tx.Rollback()
		return copied, fmt.Errorf("finish reading source table %s: %w", table, err)
	}
	if err := statement.Close(); err != nil {
		_ = tx.Rollback()
		return copied, fmt.Errorf("close target import for %s: %w", table, err)
	}
	if err := tx.Commit(); err != nil {
		return copied, fmt.Errorf("commit target table %s: %w", table, err)
	}
	return copied, nil
}

func sqliteColumns(ctx context.Context, db *sql.DB, table string) ([]string, error) {
	rows, err := db.QueryContext(ctx, "PRAGMA table_info("+quoteIdentifier(table)+")")
	if err != nil {
		return nil, fmt.Errorf("read target columns for %s: %w", table, err)
	}
	defer rows.Close()
	var columns []string
	for rows.Next() {
		var cid, notNull, primaryKey int
		var name, dataType string
		var defaultValue sql.NullString
		if err := rows.Scan(&cid, &name, &dataType, &notNull, &defaultValue, &primaryKey); err != nil {
			return nil, fmt.Errorf("scan target columns for %s: %w", table, err)
		}
		columns = append(columns, name)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("finish target column scan for %s: %w", table, err)
	}
	if len(columns) == 0 {
		return nil, fmt.Errorf("target table %s has no columns", table)
	}
	return columns, nil
}

func decodeSourceRow(encoded []byte, table string, columns []string) ([]any, error) {
	decoder := json.NewDecoder(bytes.NewReader(encoded))
	decoder.UseNumber()
	var record map[string]json.RawMessage
	if err := decoder.Decode(&record); err != nil {
		return nil, err
	}
	values := make([]any, len(columns))
	for i, column := range columns {
		raw, ok := record[column]
		if !ok {
			return nil, fmt.Errorf("source row lacks column %s", column)
		}
		if bytes.Equal(raw, []byte("null")) {
			continue
		}
		if jsonStorageColumns[table][column] {
			var value any
			decoder := json.NewDecoder(bytes.NewReader(raw))
			decoder.UseNumber()
			if err := decoder.Decode(&value); err != nil {
				return nil, err
			}
			serialized, err := json.Marshal(value)
			if err != nil {
				return nil, err
			}
			values[i] = string(serialized)
			continue
		}
		value, err := decodeScalar(raw)
		if err != nil {
			return nil, fmt.Errorf("column %s: %w", column, err)
		}
		values[i] = value
	}
	return values, nil
}

func decodeScalar(raw []byte) (any, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return nil, err
	}
	switch typed := value.(type) {
	case json.Number:
		if integer, err := typed.Int64(); err == nil {
			return integer, nil
		}
		floating, err := strconv.ParseFloat(typed.String(), 64)
		if err != nil || math.IsInf(floating, 0) || math.IsNaN(floating) {
			return nil, fmt.Errorf("invalid numeric value %q", typed)
		}
		return floating, nil
	case bool:
		if typed {
			return int64(1), nil
		}
		return int64(0), nil
	case map[string]any, []any:
		serialized, err := json.Marshal(typed)
		if err != nil {
			return nil, err
		}
		return string(serialized), nil
	default:
		return typed, nil
	}
}

func quoteIdentifier(identifier string) string {
	return `"` + strings.ReplaceAll(identifier, `"`, `""`) + `"`
}
