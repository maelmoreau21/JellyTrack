package backup

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/base64"
	"io"
	"path/filepath"
	"testing"

	"database/sql"
	"github.com/maelmoreau21/jellytrack/internal/config"
	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/internal/testdb"
)

func TestStandardBackupRedactsSecretsAndEncryptedBackupRestoresConnections(t *testing.T) {
	ctx := context.Background()
	db, err := database.Open(ctx, config.Config{DatabaseDriver: "sqlite", DatabasePath: filepath.Join(t.TempDir(), "source.db")})
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	verifyEncryptedBackupRoundtrip(t, db, "sqlite")
}

func TestPostgresEncryptedBackupRoundtrip(t *testing.T) {
	verifyEncryptedBackupRoundtrip(t, testdb.Postgres(t), "postgres")
}

func verifyEncryptedBackupRoundtrip(t *testing.T, db *sql.DB, driver string) {
	ctx := context.Background()
	for _, q := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url","jellyfinApiKey") VALUES('s','j','Server','http://server','private-server-key')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s','ju','Alice')`,
		`INSERT INTO "PersonAccount"("accountId","personId","createdAt") VALUES('u','person','2025-01-01')`,
		`INSERT INTO "GlobalSettings"("id","pluginApiKey","discordWebhookUrl","ssoSettings") VALUES('global','private-plugin-key','private-webhook','{"clientSecret":"private-oidc-key"}')`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	genres := any(`["Drama"]`)
	if driver == "postgres" {
		genres = []string{"Drama"}
	}
	if _, err := db.Exec(database.Bind(`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","genres","size","isAvailable") VALUES('m','s','jm','Film','Movie',?,?,0)`, driver), genres, int64(9007199254740993)); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","durationWatched") VALUES('p','s','u','m','DirectPlay',3600)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "TelemetryEvent"("id","serverId","playbackId","eventType","positionMs") VALUES('t','s','p','progress',0)`); err != nil {
		t.Fatal(err)
	}
	standard, err := CreateZipBackup(ctx, db, driver)
	if err != nil {
		t.Fatal(err)
	}
	zr, err := zip.NewReader(bytes.NewReader(standard), int64(len(standard)))
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range zr.File {
		if f.Name == "database.sql" {
			t.Fatal("fake SQL dump remains")
		}
		r, _ := f.Open()
		content, _ := io.ReadAll(r)
		r.Close()
		if bytes.Contains(content, []byte("private-")) {
			t.Fatalf("plaintext export exposes secret in %s", f.Name)
		}
	}
	t.Setenv("BACKUP_ENCRYPTION_KEY", base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{42}, 32)))
	encrypted, err := CreateEncryptedBackup(ctx, db, driver)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.HasPrefix(encrypted, encryptedMagic) || bytes.Contains(encrypted, []byte("private-")) {
		t.Fatal("unencrypted complete export")
	}
	var target *sql.DB
	if driver == "postgres" {
		target = testdb.Postgres(t)
	} else {
		target, err = database.Open(ctx, config.Config{DatabaseDriver: "sqlite", DatabasePath: filepath.Join(t.TempDir(), "target.db")})
	}
	if err != nil {
		t.Fatal(err)
	}
	defer target.Close()
	if _, err := RestoreBackupBuffer(ctx, target, driver, encrypted, DefaultMaxBackupImportBytes); err != nil {
		t.Fatal(err)
	}
	var key, plugin, person string
	if err := target.QueryRow(`SELECT "jellyfinApiKey" FROM "Server" WHERE "id"='s'`).Scan(&key); err != nil {
		t.Fatal(err)
	}
	target.QueryRow(`SELECT "pluginApiKey" FROM "GlobalSettings"`).Scan(&plugin)
	target.QueryRow(`SELECT "personId" FROM "PersonAccount"`).Scan(&person)
	if key != "private-server-key" || plugin != "private-plugin-key" || person != "person" {
		t.Fatalf("complete restore loses data: %s %s %s", key, plugin, person)
	}
	var size int64
	var available bool
	var telemetry int
	if err := target.QueryRow(`SELECT "size","isAvailable" FROM "Media" WHERE "id"='m'`).Scan(&size, &available); err != nil {
		t.Fatal(err)
	}
	if err := target.QueryRow(`SELECT COUNT(*) FROM "TelemetryEvent" WHERE "playbackId"='p'`).Scan(&telemetry); err != nil {
		t.Fatal(err)
	}
	if size != 9007199254740993 || available || telemetry != 1 {
		t.Fatalf("snapshot lost columns or integer precision: %d %v %d", size, available, telemetry)
	}
	encrypted[len(encrypted)-1] ^= 1
	if _, err := RestoreBackupBuffer(ctx, target, driver, encrypted, DefaultMaxBackupImportBytes); err == nil {
		t.Fatal("tampered ciphertext restored")
	}
	var count int
	target.QueryRow(`SELECT COUNT(*) FROM "Server"`).Scan(&count)
	if count != 1 {
		t.Fatal("failed authentication changed target database")
	}
}
