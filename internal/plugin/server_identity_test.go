package plugin

import (
	"net/http"
	"strings"
	"testing"
)

func TestScopedPluginUUIDIdentity(t *testing.T) {
	const dashed = "00112233-4455-6677-8899-aabbccddeeff"
	const compact = "00112233445566778899aabbccddeeff"
	for _, stored := range []string{dashed, compact, strings.ToUpper(compact)} {
		for _, tokenID := range []string{dashed, compact, strings.ToUpper(dashed)} {
			t.Run(stored+"/"+tokenID, func(t *testing.T) {
				db, h := testServer(t)
				if _, err := db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('configured',?,'Configured','http://configured:8096')`, stored); err != nil {
					t.Fatal(err)
				}
				var hash string
				if err := db.QueryRow(`SELECT "pluginApiKey" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&hash); err != nil {
					t.Fatal(err)
				}
				key, _ := ScopedKey(hash, tokenID)
				p := baseEvent("Heartbeat")
				p["serverId"] = strings.ToUpper(compact)
				delete(p, "serverUrl")
				response := send(t, h, key, p)
				if response.Code != http.StatusOK {
					t.Fatalf("heartbeat: %d %s", response.Code, response.Body)
				}
				var count int
				if err := db.QueryRow(`SELECT COUNT(*) FROM "Server"`).Scan(&count); err != nil || count != 1 {
					t.Fatalf("duplicate servers: %d %v", count, err)
				}
				var id, url string
				if err := db.QueryRow(`SELECT "jellyfinServerId","url" FROM "Server" WHERE "id"='configured'`).Scan(&id, &url); err != nil || id != stored || url != "http://configured:8096" {
					t.Fatalf("configured identity changed: %q %q %v", id, url, err)
				}
				p["serverId"] = "11112233445566778899aabbccddeeff"
				if response := send(t, h, key, p); response.Code != http.StatusForbidden {
					t.Fatalf("other server accepted: %d %s", response.Code, response.Body)
				}
			})
		}
	}
}

func TestScopedPluginOpaqueIdentityRemainsCaseSensitive(t *testing.T) {
	db, h := testServer(t)
	var hash string
	if err := db.QueryRow(`SELECT "pluginApiKey" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&hash); err != nil {
		t.Fatal(err)
	}
	key, _ := ScopedKey(hash, "Server-A")
	p := baseEvent("Heartbeat")
	p["serverId"] = "server-a"
	if response := send(t, h, key, p); response.Code != http.StatusForbidden {
		t.Fatalf("opaque identity accepted: %d", response.Code)
	}
}

func TestScopedPluginRejectsAmbiguousUUID(t *testing.T) {
	db, h := testServer(t)
	const dashed = "00112233-4455-6677-8899-aabbccddeeff"
	const compact = "00112233445566778899aabbccddeeff"
	if _, err := db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('a',?,'A','http://a:8096'),('b',?,'B','http://b:8096')`, dashed, compact); err != nil {
		t.Fatal(err)
	}
	var hash string
	if err := db.QueryRow(`SELECT "pluginApiKey" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&hash); err != nil {
		t.Fatal(err)
	}
	key, _ := ScopedKey(hash, compact)
	p := baseEvent("Heartbeat")
	p["serverId"] = compact
	if response := send(t, h, key, p); response.Code != http.StatusConflict {
		t.Fatalf("ambiguous server accepted: %d %s", response.Code, response.Body)
	}
}
