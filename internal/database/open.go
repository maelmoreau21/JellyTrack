package database

import (
	"context"
	"database/sql"
	"fmt"
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/maelmoreau21/jellytrack/internal/config"
	"github.com/maelmoreau21/jellytrack/migrations"
	_ "modernc.org/sqlite"
)

const (
	driverSQLite   = "sqlite"
	driverPostgres = "postgres"
)

func Open(ctx context.Context, cfg config.Config) (*sql.DB, error) {
	var db *sql.DB
	var err error
	switch cfg.DatabaseDriver {
	case driverSQLite:
		if err := os.MkdirAll(filepath.Dir(cfg.DatabasePath), 0o750); err != nil {
			return nil, fmt.Errorf("create database directory: %w", err)
		}
		db, err = sql.Open("sqlite", sqliteDSN(cfg.DatabasePath))
	case driverPostgres:
		db, err = sql.Open("pgx", cfg.DatabaseURL)
	default:
		return nil, fmt.Errorf("unsupported database driver %q", cfg.DatabaseDriver)
	}
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	if cfg.DatabaseDriver == driverSQLite {
		db.SetMaxOpenConns(4)
		db.SetMaxIdleConns(4)
	} else {
		db.SetMaxOpenConns(5)
		db.SetMaxIdleConns(2)
		db.SetConnMaxLifetime(5 * time.Minute)
	}

	pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := db.PingContext(pingCtx); err != nil {
		db.Close()
		return nil, fmt.Errorf("connect to %s database: %w", cfg.DatabaseDriver, err)
	}
	if err := Migrate(ctx, db, cfg.DatabaseDriver); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

func sqliteDSN(path string) string {
	absPath, err := filepath.Abs(path)
	if err == nil {
		path = absPath
	}
	path = filepath.ToSlash(path)
	if filepath.VolumeName(path) != "" && !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	query := url.Values{}
	query.Add("_pragma", "journal_mode(WAL)")
	query.Add("_pragma", "busy_timeout(5000)")
	query.Add("_pragma", "synchronous(NORMAL)")
	query.Add("_pragma", "foreign_keys(ON)")
	return (&url.URL{Scheme: "file", Path: path, RawQuery: query.Encode()}).String()
}

func Migrate(ctx context.Context, db *sql.DB, driver string) error {
	if driver != driverSQLite && driver != driverPostgres {
		return fmt.Errorf("unsupported migration driver %q", driver)
	}
	versionType := "INTEGER"
	if driver == driverPostgres {
		versionType = "BIGINT"
	}
	if _, err := db.ExecContext(ctx, "CREATE TABLE IF NOT EXISTS \"schema_migrations\" (\"version\" "+versionType+" PRIMARY KEY, \"applied_at\" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)"); err != nil {
		return fmt.Errorf("prepare migration history: %w", err)
	}

	directory := driver
	files, err := fs.Glob(migrations.Files, directory+"/*.sql")
	if err != nil {
		return fmt.Errorf("list migrations: %w", err)
	}
	sort.Strings(files)
	for _, name := range files {
		base := filepath.Base(name)
		versionText := strings.SplitN(base, "_", 2)[0]
		version, err := strconv.ParseInt(versionText, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid migration name %q: %w", base, err)
		}
		var applied bool
		checkQuery := Bind("SELECT EXISTS (SELECT 1 FROM \"schema_migrations\" WHERE \"version\" = ?)", driver)
		if err := db.QueryRowContext(ctx, checkQuery, version).Scan(&applied); err != nil {
			return fmt.Errorf("check migration %s with %q: %w", base, checkQuery, err)
		}
		if applied {
			continue
		}
		source, err := migrations.Files.ReadFile(name)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", base, err)
		}
		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			return fmt.Errorf("start migration %s: %w", base, err)
		}
		for _, statement := range splitSQLStatements(string(source)) {
			if _, err = tx.ExecContext(ctx, Bind(statement, driver)); err != nil {
				err = fmt.Errorf("statement %q: %w", statement, err)
				break
			}
		}
		if err == nil {
			_, err = tx.ExecContext(ctx, Bind("INSERT INTO \"schema_migrations\" (\"version\") VALUES (?)", driver), version)
		}
		if err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("apply migration %s: %w", base, err)
		}
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("commit migration %s: %w", base, err)
		}
	}
	return nil
}

// Bind converts positional question marks to PostgreSQL placeholders while
// leaving question marks inside SQL string and identifier literals untouched.
func Bind(query, driver string) string {
	if driver != driverPostgres {
		return query
	}
	var out strings.Builder
	out.Grow(len(query) + 8)
	var quote byte
	parameter := 0
	for i := 0; i < len(query); i++ {
		c := query[i]
		if quote != 0 {
			out.WriteByte(c)
			if c == quote {
				if i+1 < len(query) && query[i+1] == quote {
					i++
					out.WriteByte(query[i])
				} else {
					quote = 0
				}
			}
			continue
		}
		if c == '\'' || c == '"' {
			quote = c
			out.WriteByte(c)
			continue
		}
		if c == '?' {
			parameter++
			out.WriteByte('$')
			out.WriteString(strconv.Itoa(parameter))
			continue
		}
		out.WriteByte(c)
	}
	return out.String()
}

func splitSQLStatements(source string) []string {
	statements := make([]string, 0)
	start := 0
	var quote byte
	lineComment, blockComment := false, false
	for i := 0; i < len(source); i++ {
		c := source[i]
		if lineComment {
			if c == '\n' {
				lineComment = false
			}
			continue
		}
		if blockComment {
			if c == '*' && i+1 < len(source) && source[i+1] == '/' {
				blockComment = false
				i++
			}
			continue
		}
		if quote != 0 {
			if c == quote {
				if i+1 < len(source) && source[i+1] == quote {
					i++
				} else {
					quote = 0
				}
			}
			continue
		}
		if c == '-' && i+1 < len(source) && source[i+1] == '-' {
			lineComment = true
			i++
			continue
		}
		if c == '/' && i+1 < len(source) && source[i+1] == '*' {
			blockComment = true
			i++
			continue
		}
		if c == '\'' || c == '"' {
			quote = c
			continue
		}
		if c == ';' {
			if statement := strings.TrimSpace(source[start:i]); statement != "" {
				statements = append(statements, statement)
			}
			start = i + 1
		}
	}
	if statement := strings.TrimSpace(source[start:]); statement != "" {
		statements = append(statements, statement)
	}
	return statements
}
