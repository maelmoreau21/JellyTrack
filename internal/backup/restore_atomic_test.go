package backup

import (
	"context"
	"testing"

	"github.com/maelmoreau21/jellytrack/internal/testdb"
)

func TestRestoreRejectsInvalidLegacyBackupWithoutDataLoss(t *testing.T) {
	for _, driver := range []string{"sqlite", "postgres"} {
		t.Run(driver, func(t *testing.T) { verifyRejectedRestoration(t, driver) })
	}
}

func verifyRejectedRestoration(t *testing.T, driver string) {
	ctx := context.Background()
	db := testdb.Open(t, driver)
	if _, err := db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('keep','keep','Keep','http://fixture')`); err != nil {
		t.Fatal(err)
	}
	for _, payload := range []string{
		`{}`, `null`, `{"unrelated":true}`, `{"servers":null}`, `{"servers":[{}]}`,
		`{"servers":[],"users":["invalid"]}`, `{"servers":[],"media":{}}`,
		`{"settings":{"defaultLocale":"en"},"users":[]}`,
		`{"servers":[],"telemetryEvents":[{"id":"e","serverId":"missing","playbackId":"missing"}]}`,
		`{"servers":[],"dailyStats":[{"id":"duplicate","date":"2026-10-14"},{"id":"duplicate","date":"2026-10-14"}]}`,
		`{"servers":[],"adminAuditLogs":[{"id":"duplicate","action":"TEST"},{"id":"duplicate","action":"TEST"}]}`,
	} {
		t.Run(payload, func(t *testing.T) {
			if _, err := RestoreBackupBuffer(ctx, db, driver, []byte(payload), DefaultMaxBackupImportBytes); err == nil {
				t.Fatal("invalid backup accepted")
			}
			var name string
			if err := db.QueryRow(`SELECT "name" FROM "Server" WHERE "id"='keep'`).Scan(&name); err != nil || name != "Keep" {
				t.Fatalf("original database changed: %q %v", name, err)
			}
		})
	}
	if _, err := RestoreBackupBuffer(ctx, db, driver, []byte(`{"settings":{"defaultLocale":"en"}}`), DefaultMaxBackupImportBytes); err != nil {
		t.Fatal(err)
	}
	var count int
	var locale string
	if err := db.QueryRow(`SELECT COUNT(*) FROM "Server" WHERE "id"='keep'`).Scan(&count); err != nil || count != 1 {
		t.Fatal("settings import deleted data", err)
	}
	if err := db.QueryRow(`SELECT "defaultLocale" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&locale); err != nil || locale != "en" {
		t.Fatal("settings not restored", err)
	}
}
