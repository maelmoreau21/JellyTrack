package plugin

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/internal/jellyfin"
	"github.com/maelmoreau21/jellytrack/internal/testdb"
)

func TestMultiServerSyncPluginCollisions(t *testing.T) {
	for _, driver := range []string{"sqlite", "postgres"} {
		t.Run(driver, func(t *testing.T) {
			db := testdb.Open(t, driver)
			ctx := context.Background()
			const uid = "00112233445566778899aabbccddeeff"
			const mid = "aabbccddeeff00112233445566778899"
			servers := []string{"one", "two"}
			for _, id := range servers {
				id := id
				remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					switch r.URL.Path {
					case "/System/Info":
						fmt.Fprintf(w, `{"Id":%q,"ServerName":"Same name"}`, id)
					case "/Users":
						fmt.Fprintf(w, `[{"Id":%q,"Name":"Alice"}]`, uid)
					case "/Library/VirtualFolders":
						fmt.Fprint(w, `[]`)
					case "/Items":
						fmt.Fprintf(w, `{"Items":[{"Id":%q,"Name":"Same film","Type":"Movie","ProviderIds":{"Imdb":"tt123"},"Genres":["Drama"]}]}`, mid)
					default:
						http.NotFound(w, r)
					}
				}))
				defer remote.Close()
				_, err := db.Exec(database.Bind(`INSERT INTO "Server"("id","jellyfinServerId","name","url","jellyfinApiKey") VALUES(?,?,?,?,?)`, driver), id, id, "Same name", remote.URL, "test-key")
				if err != nil {
					t.Fatal(err)
				}
			}
			// Restrict the pool to expose held-row deadlocks during synchronization.
			db.SetMaxOpenConns(1)
			for run := 0; run < 2; run++ {
				result, err := jellyfin.SyncAllServers(ctx, db, driver)
				if err != nil || result.Users != 2 || result.Media != 2 {
					t.Fatalf("sync %+v: %v", result, err)
				}
			}
			const hash = "test-scoped-key-hash"
			// Legacy sync rows may have uppercase compact UUIDs.
			for _, q := range []string{`UPDATE "User" SET "jellyfinUserId"=UPPER(REPLACE("jellyfinUserId",'-','')) WHERE "serverId"='one'`, `UPDATE "Media" SET "jellyfinMediaId"=UPPER(REPLACE("jellyfinMediaId",'-','')) WHERE "serverId"='one'`} {
				if _, err := db.Exec(q); err != nil {
					t.Fatal(err)
				}
			}
			if _, err := db.Exec(database.Bind(`INSERT INTO "GlobalSettings"("id","pluginApiKey") VALUES('global',?)`, driver), hash); err != nil {
				t.Fatal(err)
			}
			h := NewHandler(db, driver, nilLogger())
			for _, id := range servers {
				key, err := ScopedKey(hash, id)
				if err != nil {
					t.Fatal(err)
				}
				p := baseEvent("PlaybackStart")
				p["serverId"] = id
				delete(p, "serverUrl")
				delete(p, "serverName")
				p["user"] = map[string]any{"id": uid, "name": "Alice"}
				p["media"] = map[string]any{"id": mid, "title": "Same film", "type": "Movie", "durationMs": 600000}
				p["sourceEventId"] = "same-event"
				for i := 0; i < 2; i++ {
					response := send(t, h, key, p)
					if response.Code != 200 {
						t.Fatalf("start %s: %d %s", id, response.Code, response.Body)
					}
				}
				// Scoped keys cannot route an event to the other server.
				p["serverId"] = "wrong"
				if response := send(t, h, key, p); response.Code != 403 {
					t.Fatalf("scope=%d", response.Code)
				}
			}
			if _, err := jellyfin.SyncAllServers(ctx, db, driver); err != nil {
				t.Fatal(err)
			}
			for _, table := range []string{"Server", "User", "Media", "ActiveStream", "PlaybackHistory"} {
				var count int
				if err := db.QueryRow(`SELECT COUNT(*) FROM "` + table + `"`).Scan(&count); err != nil || count != 2 {
					t.Fatalf("%s count=%d %v", table, count, err)
				}
			}
			var mismatch int
			if err := db.QueryRow(`SELECT COUNT(*) FROM "PlaybackHistory" p JOIN "User" u ON u."id"=p."userId" JOIN "Media" m ON m."id"=p."mediaId" WHERE p."serverId"<>u."serverId" OR p."serverId"<>m."serverId"`).Scan(&mismatch); err != nil || mismatch != 0 {
				t.Fatalf("cross-server references=%d %v", mismatch, err)
			}
			// Missing identity must never be routed through mono-server environment defaults.
			p := baseEvent("Heartbeat")
			delete(p, "serverId")
			key, _ := ScopedKey(hash, "one")
			if response := send(t, h, key, p); response.Code != 400 {
				t.Fatalf("missing identity=%d", response.Code)
			}
			// Stopping one identical session leaves the other intact.
			p = baseEvent("PlaybackStop")
			p["serverId"] = "one"
			p["positionTicks"] = int64(1200000000)
			if response := send(t, h, key, p); response.Code != 200 {
				t.Fatalf("stop=%d %s", response.Code, response.Body)
			}
			var remaining string
			if err := db.QueryRow(`SELECT "serverId" FROM "ActiveStream"`).Scan(&remaining); err != nil || remaining != "two" {
				t.Fatalf("other session lost: %s %v", remaining, err)
			}
			// A failed connection reports partial failure, retains prior contact and syncs the other target.
			if _, err := db.Exec(`UPDATE "Server" SET "url"='http://127.0.0.1:1' WHERE "id"='one'`); err != nil {
				t.Fatal(err)
			}
			bounded, cancel := context.WithTimeout(ctx, 5*time.Second)
			defer cancel()
			result, err := jellyfin.SyncAllServers(bounded, db, driver)
			if err == nil || result.Users != 1 || result.Media != 1 {
				t.Fatalf("partial failure %+v %v", result, err)
			}
			var status string
			var last string
			if err := db.QueryRow(`SELECT "status","lastConnectedAt" FROM "ServerConnectionState" WHERE "serverId"='one'`).Scan(&status, &last); err != nil || status != "offline" || last == "" {
				t.Fatalf("failure state %s %s %v", status, last, err)
			}
		})
	}
}

func ScopedKey(hash, id string) (string, error) {
	mac := hmac.New(sha256.New, []byte(hash))
	mac.Write([]byte(keyPepperContext))
	mac.Write([]byte{0})
	mac.Write([]byte(id))
	return "jts4." + base64.RawURLEncoding.EncodeToString([]byte(id)) + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}
