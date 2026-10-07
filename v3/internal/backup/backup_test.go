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

func TestV2BackupZipRestoration(t *testing.T) {
	ctx := context.Background()
	db, err := database.Open(ctx, config.Config{DatabaseDriver: "sqlite", DatabasePath: filepath.Join(t.TempDir(), "v2_restore_test.db")})
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	// Simulate exact v2 export structure
	dbJSON := []byte(`{
		"servers": [
			{"id": "srv-1", "jellyfinServerId": "jf-srv-1", "name": "Mon Serveur Jellyfin", "url": "http://192.168.1.50:8096", "isActive": true}
		],
		"users": [
			{"id": "usr-1", "serverId": "srv-1", "jellyfinUserId": "jf-u-1", "username": "Mael", "isActive": true, "lastActive": "2026-10-07T20:00:00.000Z"}
		],
		"media": [
			{"id": "med-1", "serverId": "srv-1", "jellyfinMediaId": "jf-m-1", "title": "Inception", "type": "Movie", "libraryName": "Films", "durationMs": 8880000, "genres": ["Action", "Sci-Fi"]}
		],
		"playbackHistory": [
			{"id": "pb-1", "serverId": "srv-1", "userId": "usr-1", "mediaId": "med-1", "playMethod": "DirectPlay", "durationWatched": 5400, "startedAt": "2026-10-07T21:00:00.000Z", "clientName": "Jellyfin Web", "deviceName": "Chrome"}
		],
		"dailyStats": [
			{"id": "ds-1", "date": "2026-10-07", "userId": "usr-1", "totalPlays": 1, "totalDuration": 5400, "directPlays": 1}
		],
		"adminAuditLogs": [
			{"id": "log-1", "action": "LOGIN", "actorUsername": "admin", "details": {"ip": "127.0.0.1"}}
		]
	}`)

	settingsJSON := []byte(`{
		"version": "2.0",
		"settings": {
			"excludedLibraries": ["Musique"],
			"discordWebhookUrl": "https://discord.com/webhook/test",
			"defaultLocale": "fr"
		}
	}`)

	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)
	w, _ := zw.Create("database.json")
	_, _ = w.Write(dbJSON)
	w2, _ := zw.Create("settings.json")
	_, _ = w2.Write(settingsJSON)
	_ = zw.Close()

	mode, err := RestoreBackupBuffer(ctx, db, "sqlite", buf.Bytes(), 10*1024*1024)
	if err != nil {
		t.Fatalf("failed to restore v2 backup zip: %v", err)
	}
	if mode != "zip" {
		t.Fatalf("expected mode 'zip', got %s", mode)
	}

	// Verify all tables were populated
	var serverName, userName, mediaTitle, clientName, excludedLibs string
	var watchDur int64
	if err := db.QueryRowContext(ctx, `SELECT "name" FROM "Server" WHERE "id"='srv-1'`).Scan(&serverName); err != nil || serverName != "Mon Serveur Jellyfin" {
		t.Fatalf("server restore failed: %v, got %s", err, serverName)
	}
	if err := db.QueryRowContext(ctx, `SELECT "username" FROM "User" WHERE "id"='usr-1'`).Scan(&userName); err != nil || userName != "Mael" {
		t.Fatalf("user restore failed: %v, got %s", err, userName)
	}
	if err := db.QueryRowContext(ctx, `SELECT "title" FROM "Media" WHERE "id"='med-1'`).Scan(&mediaTitle); err != nil || mediaTitle != "Inception" {
		t.Fatalf("media restore failed: %v, got %s", err, mediaTitle)
	}
	if err := db.QueryRowContext(ctx, `SELECT "clientName","durationWatched" FROM "PlaybackHistory" WHERE "id"='pb-1'`).Scan(&clientName, &watchDur); err != nil || clientName != "Jellyfin Web" || watchDur != 5400 {
		t.Fatalf("playback restore failed: %v, client=%s, dur=%d", err, clientName, watchDur)
	}
	if err := db.QueryRowContext(ctx, `SELECT "excludedLibraries" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&excludedLibs); err != nil || excludedLibs != `["Musique"]` {
		t.Fatalf("settings restore failed: %v, got %s", err, excludedLibs)
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
