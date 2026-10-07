package security

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/maelmoreau21/jellytrack/internal/config"
	"github.com/maelmoreau21/jellytrack/internal/database"
)

func TestSecurityAuditLoggingAndOverview(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "sec_test.db")
	db, err := database.Open(context.Background(), config.Config{
		DatabaseDriver: "sqlite",
		DatabasePath:   dbPath,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	ctx := context.Background()
	user := "admin"
	ip := "127.0.0.1"

	err = LogAudit(ctx, db, "sqlite", "plugin.events.unauthorized", nil, &user, nil, &ip, map[string]any{"reason": "bad key"})
	if err != nil {
		t.Fatal(err)
	}

	overview, err := GetSecurityOverview(ctx, db, "sqlite")
	if err != nil {
		t.Fatal(err)
	}
	if overview.Unauthorized24h != 1 {
		t.Errorf("expected 1 unauthorized event, got %d", overview.Unauthorized24h)
	}
	if len(overview.RecentSecurityEvents) != 1 {
		t.Errorf("expected 1 recent event, got %d", len(overview.RecentSecurityEvents))
	}

	logs, total, err := ListAuditLogs(ctx, db, "sqlite", 1, 10, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if total != 1 || len(logs) != 1 {
		t.Fatalf("expected 1 log item, got total=%d len=%d", total, len(logs))
	}
}
