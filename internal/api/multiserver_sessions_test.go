package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/maelmoreau21/jellytrack/internal/auth"
	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/internal/testdb"
)

func TestMultiServerRemoteSessionsKeepOriginAndPermissions(t *testing.T) {
	for _, driver := range []string{"sqlite", "postgres"} {
		t.Run(driver, func(t *testing.T) {
			db := testdb.Open(t, driver)
			offline := false
			for _, id := range []string{"a", "b"} {
				id := id
				remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					if id == "b" && offline {
						w.WriteHeader(503)
						return
					}
					fmt.Fprint(w, `[{"Id":"same-session","UserId":"same-user","UserName":"Alice"},{"Id":"private","UserId":"other-user","UserName":"Other"}]`)
				}))
				defer remote.Close()
				_, err := db.Exec(database.Bind(`INSERT INTO "Server"("id","jellyfinServerId","name","url","jellyfinApiKey") VALUES(?,?,?,?,?)`, driver), id, id, id, remote.URL, "qa-key")
				if err != nil {
					t.Fatal(err)
				}
			}
			if _, err := db.Exec(`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('ua','a','same-user','Alice')`); err != nil {
				t.Fatal(err)
			}
			h := New(db, driver)
			call := func(query string, p auth.Principal) map[string]any {
				r := httptest.NewRequest("GET", "/api/jellyfin/sessions"+query, nil)
				r = r.WithContext(context.WithValue(r.Context(), auth.PrincipalContextKey, p))
				w := httptest.NewRecorder()
				h.sessions(w, r)
				if w.Code != 200 {
					t.Fatalf("sessions=%d %s", w.Code, w.Body)
				}
				var body map[string]any
				json.Unmarshal(w.Body.Bytes(), &body)
				return body
			}
			admin := auth.Principal{Role: "admin"}
			if body := call("", admin); len(body["items"].([]any)) != 4 {
				t.Fatalf("remote servers not combined %+v", body)
			}
			if body := call("?servers=b", admin); len(body["items"].([]any)) != 2 || body["items"].([]any)[0].(map[string]any)["serverId"] != "b" {
				t.Fatalf("filter %+v", body)
			}
			user := auth.Principal{Role: "user", Username: "Alice", AuthServerID: "a", JellyfinUserID: "same-user", IdentityVersion: 1}
			if body := call("", user); len(body["items"].([]any)) != 1 || body["items"].([]any)[0].(map[string]any)["UserId"] != "same-user" {
				t.Fatalf("private remote sessions exposed %+v", body)
			}
			if body := call("?servers=b", user); len(body["items"].([]any)) != 0 {
				t.Fatalf("foreign remote sessions %+v", body)
			}
			offline = true
			body := call("", admin)
			if len(body["items"].([]any)) != 2 || len(body["failedServers"].([]any)) != 1 {
				t.Fatalf("server outage blocked other sessions %+v", body)
			}
		})
	}
}
