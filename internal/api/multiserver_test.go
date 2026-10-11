package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/maelmoreau21/jellytrack/internal/auth"
	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/internal/testdb"
)

func TestMultiServerAPIIdentityFiltersAndPresentation(t *testing.T) {
	for _, driver := range []string{"sqlite", "postgres"} {
		t.Run(driver, func(t *testing.T) {
			db := testdb.Open(t, driver)
			for _, q := range []string{
				`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('a','ja','A','http://a'),('b','jb','B','http://b')`,
				`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('ua','a','same-user','Alice'),('ub','b','same-user','Alice')`,
				`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","providerIds") VALUES('ma','a','same-media','Film','Movie','{"Imdb":"tt1"}'),('mb','b','same-media','Film','Movie','{"Imdb":"tt2"}')`,
				`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","durationWatched","startedAt","endedAt") VALUES('pa','a','ua','ma','DirectPlay',1200,'2026-10-11T10:00:00Z','2026-10-11T10:20:00Z'),('pb','b','ub','mb','DirectPlay',2400,'2026-10-11T10:00:00Z','2026-10-11T10:40:00Z')`,
				`INSERT INTO "ActiveStream"("id","serverId","sessionId","userId","mediaId","playMethod") VALUES('sa','a','same-session','ua','ma','DirectPlay'),('sb','b','same-session','ub','mb','DirectPlay')`,
			} {
				if _, err := db.Exec(q); err != nil {
					t.Fatal(err)
				}
			}
			h := New(db, driver)
			principal := auth.Principal{Role: "admin", Username: "admin"}
			call := func(handler http.HandlerFunc, path, id string) (int, map[string]any) {
				r := httptest.NewRequest("GET", path, nil)
				if id != "" {
					r.SetPathValue("id", id)
				}
				r = r.WithContext(context.WithValue(r.Context(), auth.PrincipalContextKey, principal))
				w := httptest.NewRecorder()
				handler(w, r)
				var body map[string]any
				if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
					t.Fatalf("%s %s", path, w.Body)
				}
				return w.Code, body
			}
			if code, servers := call(h.listServers, "/api/servers", ""); code != 200 || len(servers["servers"].([]any)) != 2 {
				t.Fatalf("server list %d %+v", code, servers)
			}
			if code, servers := call(h.serverCompare, "/api/server-compare", ""); code != 200 || len(servers["servers"].([]any)) != 2 {
				t.Fatalf("server comparison %d %+v", code, servers)
			}
			for _, id := range []string{"same-user", "Alice"} {
				if code, _ := call(h.userDetail, "/api/users/"+id, id); code != 409 {
					t.Fatalf("ambiguous profile %s=%d", id, code)
				}
			}
			for _, server := range []string{"a", "b"} {
				code, list := call(h.users, "/api/users?servers="+server, "")
				if code != 200 || list["total"] != float64(1) || list["items"].([]any)[0].(map[string]any)["serverId"] != server {
					t.Fatalf("users filter %d %+v", code, list)
				}
				code, profile := call(h.userDetail, "/api/users/same-user?serverId="+server, "same-user")
				if code != 200 || profile["serverId"] != server {
					t.Fatalf("profile %s %d %+v", server, code, profile)
				}
				if profile["stats"].(map[string]any)["sessionsCount"] != float64(1) {
					t.Fatalf("merged profile %+v", profile)
				}
				code, hist := call(h.history, "/api/history?servers="+server, "")
				if code != 200 || hist["total"] != float64(1) {
					t.Fatalf("history %d %+v", code, hist)
				}
				rows := hist["items"].([]any)
				if rows[0].(map[string]any)["serverId"] != server {
					t.Fatal("history mixed")
				}
				if rows[0].(map[string]any)["serverName"] == nil {
					t.Fatal("server name missing")
				}
				code, streams := call(h.streams, "/api/streams?servers="+server, "")
				if code != 200 || streams["count"] != float64(1) {
					t.Fatalf("streams %d %+v", code, streams)
				}
				code, media := call(h.recoveredMediaDetail, "/api/media/same-media?serverId="+server, "same-media")
				if code != 200 || len(media["availableServers"].([]any)) != 1 {
					t.Fatalf("same name falsely identified as same film: %d %+v", code, media)
				}
				code, dash := call(h.dashboard, "/api/dashboard?timeRange=all&servers="+server, "")
				if code != 200 || dash["totalPlays"] != float64(1) {
					t.Fatalf("dashboard %d %+v", code, dash)
				}
				if len(dash["serverActivity"].([]any)) != 1 {
					t.Fatal("comparison ignored filter")
				}
			}
			if _, err := db.Exec(`UPDATE "Media" SET "providerIds"='{"Imdb":"tt1"}' WHERE "id"='mb'`); err != nil {
				t.Fatal(err)
			}
			code, media := call(h.recoveredMediaDetail, "/api/media/ma", "ma")
			if code != 200 || len(media["availableServers"].([]any)) != 2 {
				t.Fatalf("provider availability %d %+v", code, media)
			}
			principal = auth.Principal{Role: "user", Username: "Alice", JellyfinUserID: "same-user", AuthServerID: "a", IdentityVersion: 1}
			if code, _ := call(h.userDetail, "/api/users/ub", "ub"); code != 403 {
				t.Fatalf("permission=%d", code)
			}
			if code, profile := call(h.userDetail, "/api/users/me", "me"); code != 200 || profile["serverId"] != "a" {
				t.Fatalf("own profile %d %+v", code, profile)
			}
			code, hist := call(h.history, "/api/history?servers=b", "")
			if code != 200 || hist["total"] != float64(0) {
				t.Fatalf("foreign history %d %+v", code, hist)
			}
			code, streams := call(h.streams, "/api/streams?servers=b", "")
			if code != 200 || streams["count"] != float64(0) {
				t.Fatalf("foreign streams %d %+v", code, streams)
			}
			t.Setenv("JELLYTRACK_MODE", "single")
			if _, nav := call(h.navigation, "/api/navigation", ""); nav["multiServer"] != true {
				t.Fatal("two configured servers hidden")
			}
			if err := database.RecordServerConnection(context.Background(), db, driver, "a", true, int64(7)); err != nil {
				t.Fatal(err)
			}
			code, health := call(h.adminHealth, "/api/admin/health", "")
			if code != 200 || len(health["servers"].([]any)) != 2 {
				t.Fatalf("health %d %+v", code, health)
			}
			// Remove the isolated second server and its own test rows only.
			for _, table := range []string{"ActiveStream", "PlaybackHistory", "Media", "User"} {
				if _, err := db.Exec(`DELETE FROM "` + table + `" WHERE "serverId"='b'`); err != nil {
					t.Fatal(err)
				}
			}
			if _, err := db.Exec(`DELETE FROM "Server" WHERE "id"='b'`); err != nil {
				t.Fatal(err)
			}
			t.Setenv("JELLYTRACK_MODE", "multi")
			if _, nav := call(h.navigation, "/api/navigation", ""); nav["multiServer"] != false {
				t.Fatal("mono server overloaded")
			}
		})
	}
}
