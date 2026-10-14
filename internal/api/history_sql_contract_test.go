package api

import (
	"fmt"
	"net/http/httptest"
	"testing"

	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/internal/testdb"
)

func TestHistoryTelemetryLatestWindowAndServerBinding(t *testing.T) {
	for _, driver := range []string{"sqlite", "postgres"} {
		t.Run(driver, func(t *testing.T) {
			db := testdb.Open(t, driver)
			for _, q := range []string{
				`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','jf','Test','http://test'),('other','other','Other','http://other')`,
				`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s','u','Test')`,
				`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type") VALUES('m','s','m','Movie','Movie')`,
				`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod") VALUES('p','s','u','m','DirectPlay')`,
			} {
				if _, err := db.Exec(q); err != nil {
					t.Fatal(err)
				}
			}
			tx, err := db.Begin()
			if err != nil {
				t.Fatal(err)
			}
			for i := 0; i < 205; i++ {
				if _, err := tx.Exec(database.Bind(`INSERT INTO "TelemetryEvent"("id","serverId","playbackId","eventType","positionMs","createdAt","metadata") VALUES(?,'s','p','progress',?,'2026-10-14T12:00:00Z','{}')`, driver), fmt.Sprintf("e%03d", i), i); err != nil {
					tx.Rollback()
					t.Fatal(err)
				}
			}
			if _, err := tx.Exec(`INSERT INTO "TelemetryEvent"("id","serverId","playbackId","eventType","positionMs","createdAt","metadata") VALUES('foreign','other','p','progress',999,'2026-10-14T13:00:00Z','{}')`); err != nil {
				tx.Rollback()
				t.Fatal(err)
			}
			if err := tx.Commit(); err != nil {
				t.Fatal(err)
			}
			items := []map[string]any{{"id": "p", "serverId": "s", "type": "Movie"}}
			if err := New(db, driver).enrichHistory(httptest.NewRequest("GET", "/api/logs", nil), items); err != nil {
				t.Fatal(err)
			}
			events := items[0]["telemetryEvents"].([]map[string]any)
			if len(events) != 200 {
				t.Fatalf("window=%d", len(events))
			}
			seen := map[int64]bool{}
			for _, event := range events {
				seen[event["positionMs"].(int64)] = true
			}
			for i := int64(5); i < 205; i++ {
				if !seen[i] {
					t.Fatalf("latest tie-break event missing=%d", i)
				}
			}
			if seen[999] {
				t.Fatal("foreign-server event leaked")
			}
		})
	}
}

func TestHistoryExcludedLibrariesMatchesSQLiteSQLSemantics(t *testing.T) {
	db := apiDB(t)
	for _, q := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','jf','Test','http://test')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName") VALUES('a','s','a','A','Movie','Movies'),('b','s','b','B','Movie',NULL),('c','s','c','C','Movie','Kids')`,
		`INSERT INTO "GlobalSettings"("id","excludedLibraries") VALUES('global','[]')`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	h := New(db, "sqlite")
	r := httptest.NewRequest("GET", "/api/logs", nil)
	for _, value := range []string{`[]`, `["Kids"]`, `["Movies","Kids",null]`} {
		if _, err := db.Exec(`UPDATE "GlobalSettings" SET "excludedLibraries"=?`, value); err != nil {
			t.Fatal(err)
		}
		clause, args, err := h.historyExcludedLibraries(r)
		if err != nil {
			t.Fatal(err)
		}
		var oldCount, newCount int
		if err := db.QueryRow(`SELECT COUNT(*) FROM "Media" m WHERE ` + excludedLibrariesClause("sqlite", "m")).Scan(&oldCount); err != nil {
			t.Fatal(err)
		}
		if err := db.QueryRow(`SELECT COUNT(*) FROM "Media" m WHERE `+clause, args...).Scan(&newCount); err != nil {
			t.Fatal(err)
		}
		if oldCount != newCount {
			t.Fatalf("%s old=%d new=%d", value, oldCount, newCount)
		}
	}
	if _, err := db.Exec(`UPDATE "GlobalSettings" SET "excludedLibraries"='malformed'`); err != nil {
		t.Fatal(err)
	}
	if _, _, err := h.historyExcludedLibraries(r); err == nil {
		t.Fatal("malformed exclusion JSON accepted")
	}
}
