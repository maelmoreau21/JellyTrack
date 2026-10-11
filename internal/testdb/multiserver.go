// Package testdb opens disposable databases for multi-server contract tests.
package testdb

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/config"
	"github.com/maelmoreau21/jellytrack/internal/database"
)

func Open(t *testing.T, driver string) *sql.DB {
	t.Helper()
	cfg := config.Config{DatabaseDriver: driver, DatabasePath: filepath.Join(t.TempDir(), "multi.db")}
	if driver == "postgres" {
		raw := os.Getenv("JELLYTRACK_MULTI_TEST_PG_URL")
		if raw == "" {
			t.Skip("isolated PostgreSQL URL not configured")
		}
		parsed, err := url.Parse(raw)
		if err != nil || parsed.Hostname() != "127.0.0.1" || parsed.Path != "/jellytrack_multi_test" {
			t.Fatal("PostgreSQL tests require a local jellytrack_multi_test database")
		}
		admin, err := sql.Open("pgx", raw)
		if err != nil {
			t.Fatal(err)
		}
		schema := fmt.Sprintf("multi_test_%d", time.Now().UnixNano())
		if _, err = admin.Exec(`CREATE SCHEMA "` + schema + `"`); err != nil {
			admin.Close()
			t.Fatal(err)
		}
		t.Cleanup(func() {
			_, err := admin.Exec(`DROP SCHEMA "` + schema + `" CASCADE`)
			admin.Close()
			if err != nil {
				t.Error(err)
			}
		})
		q := parsed.Query()
		q.Set("options", "-csearch_path="+schema)
		parsed.RawQuery = q.Encode()
		cfg.DatabaseURL = parsed.String()
	}
	db, err := database.Open(context.Background(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}
