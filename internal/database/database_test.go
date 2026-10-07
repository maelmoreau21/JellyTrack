package database

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestSQLiteMigrationsAreRepeatableAndEnableWAL(t *testing.T) {
	db, err := sql.Open("sqlite", sqliteDSN(filepath.Join(t.TempDir(), "jellytrack.db")))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	ctx := context.Background()
	if err := Migrate(ctx, db, driverSQLite); err != nil {
		t.Fatal(err)
	}
	if err := Migrate(ctx, db, driverSQLite); err != nil {
		t.Fatalf("second migration run: %v", err)
	}
	var tableCount int
	if err := db.QueryRowContext(ctx, `SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).Scan(&tableCount); err != nil {
		t.Fatal(err)
	}
	if tableCount != 13 { // 12 application tables and migration history.
		t.Fatalf("got %d tables, want 13", tableCount)
	}
	var journalMode string
	if err := db.QueryRowContext(ctx, "PRAGMA journal_mode").Scan(&journalMode); err != nil {
		t.Fatal(err)
	}
	if journalMode != "wal" {
		t.Fatalf("journal mode = %q, want wal", journalMode)
	}
	var foreignKeys int
	if err := db.QueryRowContext(ctx, "PRAGMA foreign_keys").Scan(&foreignKeys); err != nil {
		t.Fatal(err)
	}
	if foreignKeys != 1 {
		t.Fatal("foreign key enforcement is disabled")
	}
}

func TestPostgresBindAndSQLSplit(t *testing.T) {
	got := Bind(`SELECT '?', "?" FROM t WHERE a = ? AND b = ?`, driverPostgres)
	want := `SELECT '?', "?" FROM t WHERE a = $1 AND b = $2`
	if got != want {
		t.Fatalf("Bind() = %q, want %q", got, want)
	}
	statements := splitSQLStatements("-- comment;\nSELECT ';'; /* ; */ SELECT 2;")
	if !reflect.DeepEqual(statements, []string{"-- comment;\nSELECT ';'", "/* ; */ SELECT 2"}) {
		t.Fatalf("splitSQLStatements() = %#v", statements)
	}
}

func TestDecodePostgresJSONRow(t *testing.T) {
	columns := []string{"id", "allowAuthFallback", "genres", "createdAt", "size", "optional"}
	got, err := decodeSourceRow([]byte(`{"id":"server-1","allowAuthFallback":true,"genres":["Drama","Sci-Fi"],"createdAt":"2026-10-07T10:00:00Z","size":9223372036854775807,"optional":null}`), "Media", columns)
	if err != nil {
		t.Fatal(err)
	}
	if got[0] != "server-1" || got[1] != int64(1) || got[3] != "2026-10-07T10:00:00Z" || got[4] != int64(9223372036854775807) || got[5] != nil {
		t.Fatalf("unexpected decoded scalar values: %#v", got)
	}
	if got[2] != `["Drama","Sci-Fi"]` {
		t.Fatalf("array column = %#v", got[2])
	}
}

func TestImportPostgresRefusesExistingTargetWithoutConnecting(t *testing.T) {
	target := filepath.Join(t.TempDir(), "existing.db")
	if err := os.WriteFile(target, []byte("keep"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := ImportPostgres(context.Background(), "postgresql://invalid", target); err == nil {
		t.Fatal("expected existing target to be rejected")
	}
	contents, err := os.ReadFile(target)
	if err != nil {
		t.Fatal(err)
	}
	if string(contents) != "keep" {
		t.Fatal("existing target was modified")
	}
}
