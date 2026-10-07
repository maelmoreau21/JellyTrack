package backup

import (
	"archive/zip"
	"bytes"
	"context"
	"path/filepath"
	"testing"

	"github.com/maelmoreau21/jellytrack/v3/internal/config"
	"github.com/maelmoreau21/jellytrack/v3/internal/database"
)

func TestBackupExportAndRestore(t *testing.T) {
	ctx := context.Background()
	db, err := database.Open(ctx, config.Config{DatabaseDriver: "sqlite", DatabasePath: filepath.Join(t.TempDir(), "backup_test.db")})
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	// Seed data
	_, err = db.ExecContext(ctx, `INSERT INTO "Server" ("id","jellyfinServerId","name","url") VALUES ('srv1','js1','Backup Server','http://localhost')`)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.ExecContext(ctx, `INSERT INTO "User" ("id","serverId","jellyfinUserId","username") VALUES ('u1','srv1','ju1','Mael')`)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.ExecContext(ctx, `INSERT INTO "Media" ("id","serverId","jellyfinMediaId","title","type") VALUES ('m1','srv1','jm1','Movie A','Movie')`)
	if err != nil {
		t.Fatal(err)
	}

	// 1. Create ZIP backup
	zipBytes, err := CreateZipBackup(ctx, db, "sqlite")
	if err != nil {
		t.Fatalf("failed to create zip backup: %v", err)
	}
	if len(zipBytes) == 0 {
		t.Fatal("empty zip bytes returned")
	}

	// 2. Clear database
	_, _ = db.ExecContext(ctx, `DELETE FROM "Media"`)
	_, _ = db.ExecContext(ctx, `DELETE FROM "User"`)
	_, _ = db.ExecContext(ctx, `DELETE FROM "Server"`)

	// 3. Restore ZIP backup
	mode, err := RestoreBackupBuffer(ctx, db, "sqlite", zipBytes, 10*1024*1024)
	if err != nil {
		t.Fatalf("failed to restore zip backup: %v", err)
	}
	if mode != "zip" {
		t.Fatalf("expected mode 'zip', got %s", mode)
	}

	// Verify restored data
	var count int
	_ = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM "Server"`).Scan(&count)
	if count != 1 {
		t.Fatalf("expected 1 restored server, got %d", count)
	}
	_ = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM "User"`).Scan(&count)
	if count != 1 {
		t.Fatalf("expected 1 restored user, got %d", count)
	}
	_ = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM "Media"`).Scan(&count)
	if count != 1 {
		t.Fatalf("expected 1 restored media, got %d", count)
	}
}

func TestZipSlipRejection(t *testing.T) {
	ctx := context.Background()
	db, err := database.Open(ctx, config.Config{DatabaseDriver: "sqlite", DatabasePath: filepath.Join(t.TempDir(), "zipslip_test.db")})
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	// Build malicious zip with ../../evil.json
	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)
	w, err := zw.Create("../../evil.json")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = w.Write([]byte(`{}`))
	_ = zw.Close()

	_, err = RestoreBackupBuffer(ctx, db, "sqlite", buf.Bytes(), 10*1024*1024)
	if err == nil {
		t.Fatal("expected zip slip attempt to be rejected with error")
	}
}

func TestAutoBackupManager(t *testing.T) {
	ctx := context.Background()
	tempDir := t.TempDir()
	db, err := database.Open(ctx, config.Config{DatabaseDriver: "sqlite", DatabasePath: filepath.Join(tempDir, "auto_test.db")})
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	fileName, err := TriggerAutoBackup(ctx, db, "sqlite", tempDir, "auto")
	if err != nil {
		t.Fatalf("failed to trigger auto backup: %v", err)
	}

	items, err := ListAutoBackups(tempDir)
	if err != nil {
		t.Fatalf("failed to list auto backups: %v", err)
	}
	if len(items) != 1 || items[0].Name != fileName {
		t.Fatalf("unexpected backup list: %+v", items)
	}

	resolved, err := ResolveAutoBackupFile(tempDir, fileName)
	if err != nil {
		t.Fatalf("failed to resolve backup file: %v", err)
	}
	if resolved == "" {
		t.Fatal("empty resolved path")
	}

	// Test traversal rejection in resolve
	_, err = ResolveAutoBackupFile(tempDir, "../evil.zip")
	if err == nil {
		t.Fatal("expected traversal in filename to be rejected")
	}
}
