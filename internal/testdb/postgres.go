// Package testdb provides isolated schemas for optional PostgreSQL contract tests.
package testdb

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/config"
	"github.com/maelmoreau21/jellytrack/internal/database"
)

func Postgres(t *testing.T) *sql.DB {
	t.Helper()
	raw := os.Getenv("JELLYTRACK_TEST_POSTGRES_URL")
	if raw == "" {
		t.Skip("JELLYTRACK_TEST_POSTGRES_URL not configured")
	}
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatal("invalid test database URL")
	}
	if u.Hostname() != "127.0.0.1" && u.Hostname() != "localhost" {
		t.Fatal("PostgreSQL fixtures require an explicit local test instance")
	}
	admin, err := sql.Open("pgx", raw)
	if err != nil {
		t.Fatal(err)
	}
	schema := fmt.Sprintf("jellytrack_qa_%d", time.Now().UnixNano())
	if _, err = admin.Exec(`CREATE SCHEMA "` + schema + `"`); err != nil {
		admin.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() { admin.Exec(`DROP SCHEMA "` + schema + `" CASCADE`); admin.Close() })
	q := u.Query()
	q.Set("search_path", schema)
	u.RawQuery = q.Encode()
	db, err := database.Open(context.Background(), config.Config{DatabaseDriver: "postgres", DatabaseURL: u.String()})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}
