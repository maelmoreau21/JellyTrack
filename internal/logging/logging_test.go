package logging

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/config"
	"github.com/maelmoreau21/jellytrack/internal/database"
)

func TestSystemLogsAndExport(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "logging_test.db")
	db, err := database.Open(context.Background(), config.Config{
		DatabaseDriver: "sqlite",
		DatabasePath:   dbPath,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	ctx := context.Background()
	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, _ = db.ExecContext(ctx, `INSERT INTO "AdminAuditLog" ("id","action","actorUsername","createdAt") VALUES ('l1','system.start','System',?)`, now)

	logs, total, err := GetSystemLogs(ctx, db, "sqlite", 1, 10, "")
	if err != nil {
		t.Fatal(err)
	}
	if total != 1 || len(logs) != 1 {
		t.Fatalf("expected 1 log, got total=%d len=%d", total, len(logs))
	}

	csvBytes, err := ExportLogsCSV(ctx, db, "sqlite")
	if err != nil {
		t.Fatal(err)
	}
	if len(csvBytes) == 0 {
		t.Error("expected non-empty CSV output")
	}

	if err := ClearSystemLogs(ctx, db, "sqlite"); err != nil {
		t.Fatal(err)
	}

	logsAfter, _, _ := GetSystemLogs(ctx, db, "sqlite", 1, 10, "")
	if len(logsAfter) != 0 {
		t.Error("expected 0 logs after clear")
	}
}
