package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/maelmoreau21/jellytrack/internal/auth"
	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/internal/testdb"
)

func allowTestLibraryAccess(t *testing.T, db *sql.DB, serverID, userID string) {
	t.Helper()
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/Users/"+userID {
			http.NotFound(w, r)
			return
		}
		fmt.Fprintf(w, `{"Id":%q,"Policy":{"EnableAllFolders":true}}`, userID)
	}))
	t.Cleanup(provider.Close)
	if _, err := db.Exec(`UPDATE "Server" SET "url"=?,"jellyfinApiKey"='fixture-key' WHERE "id"=?`, provider.URL, serverID); err != nil {
		t.Fatal(err)
	}
}

func TestPersonalHistoryRechecksLibraryPermissions(t *testing.T) {
	for _, driver := range []string{"sqlite", "postgres"} {
		t.Run(driver, func(t *testing.T) {
			db := testdb.Open(t, driver)
			policy := `{"Id":"ju","Policy":{"EnabledFolders":["films"]}}`
			folders := `[{"ItemId":"films","Name":"Films"},{"ItemId":"music","Name":"Music"}]`
			provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch r.URL.Path {
				case "/Users/ju":
					fmt.Fprint(w, policy)
				case "/Library/VirtualFolders":
					fmt.Fprint(w, folders)
				default:
					http.NotFound(w, r)
				}
			}))
			defer provider.Close()
			for _, query := range []string{
				`INSERT INTO "Server"("id","jellyfinServerId","name","url","jellyfinApiKey") VALUES('s','js','Server','http://placeholder','test-key'),('other','jo','Other','http://other','test-key')`,
				`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s','ju','User'),('other-user','other','ju','User')`,
				`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName","parentId") VALUES('film','s','jf-film','Visible Film','Episode','Films','jf-track'),('track','s','jf-track','Secret Track','Audio','Music',NULL),('other-film','other','jf-film','Other Film','Movie','Films',NULL)`,
				`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","durationWatched","clientName","playMethod") VALUES('allowed','s','u','film',120,'Web','DirectPlay'),('secret','s','u','track',120,'Secret Client','DirectPlay'),('foreign','other','other-user','other-film',120,'Foreign Client','DirectPlay')`,
				`INSERT INTO "TelemetryEvent"("id","serverId","playbackId","eventType","positionMs","metadata") VALUES('visible-event','s','allowed','pause',10,'{}'),('secret-event','s','secret','pause',10,'{"secret":true}')`,
			} {
				if _, err := db.Exec(database.Bind(query, driver)); err != nil {
					t.Fatal(err)
				}
			}
			if _, err := db.Exec(database.Bind(`UPDATE "Server" SET "url"=? WHERE "id"='s'`, driver), provider.URL); err != nil {
				t.Fatal(err)
			}
			h := New(db, driver)
			request := func(path, role string) *http.Request {
				r := httptest.NewRequest("GET", path, nil)
				return r.WithContext(context.WithValue(r.Context(), auth.PrincipalContextKey, auth.Principal{Role: role, Username: "User", JellyfinUserID: "ju", AuthServerID: "s", IdentityVersion: 1}))
			}
			// Warm the catalogue cache, then revoke without clearing it. Personal
			// history must use the fresh provider policy, including exports and facets.
			h.libraryAccessClause(request("/api/media", "user"), "m")
			for _, tc := range []struct {
				name, policy, folders string
				count                 int
			}{
				{"restricted", policy, folders, 1},
				{"revoked", `{"Id":"ju","Policy":{"EnabledFolders":[]}}`, folders, 0},
				{"all folders", `{"Id":"ju","Policy":{"EnableAllFolders":true}}`, folders, 2},
				{"disabled", `{"Id":"ju","Policy":{"EnableAllFolders":true,"IsDisabled":true}}`, folders, 0},
				{"wrong identity", `{"Id":"other","Policy":{"EnableAllFolders":true}}`, folders, 0},
				{"provider unavailable", `invalid`, folders, 0},
				{"ambiguous name", `{"Id":"ju","Policy":{"EnabledFolders":["films"]}}`, `[{"ItemId":"films","Name":"Films"},{"ItemId":"hidden","Name":"Films"}]`, 0},
			} {
				t.Run(tc.name, func(t *testing.T) {
					policy, folders = tc.policy, tc.folders
					for _, path := range []string{"/api/history?days=all&servers=all", "/api/logs/export?format=json&days=all", "/api/logs/export?format=csv&days=all"} {
						w := httptest.NewRecorder()
						h.history(w, request(path, "user"))
						if w.Code != 200 {
							t.Fatalf("%s: %d %s", path, w.Code, w.Body.String())
						}
						if tc.count < 2 && strings.Contains(w.Body.String(), "Secret") {
							t.Fatalf("revoked library leaks through %s: %s", path, w.Body.String())
						}
						if strings.Contains(w.Body.String(), "Other Film") {
							t.Fatal("foreign server history leaked")
						}
						if strings.HasPrefix(path, "/api/history") {
							var body struct {
								Total int
								Items []any
							}
							if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
								t.Fatal(err)
							}
							if body.Total != tc.count || len(body.Items) != tc.count {
								t.Fatalf("count/page=%d/%d expected=%d body=%s", body.Total, len(body.Items), tc.count, w.Body.String())
							}
						}
					}
					r := request("/api/users/me?limit=1&type=Movie", "user")
					profile, err := h.userProfileData(r, "u", "s")
					if err != nil {
						t.Fatal(err)
					}
					if profile["totalPlays"] != tc.count {
						t.Fatalf("profile plays=%v expected=%d", profile["totalPlays"], tc.count)
					}
					encoded, _ := json.Marshal(profile)
					if tc.count < 2 && strings.Contains(string(encoded), "Secret") {
						t.Fatalf("hidden profile/facet leaked: %s", encoded)
					}
					events, err := h.profileTelemetry(r, "secret", "u", "s")
					if err != nil {
						t.Fatal(err)
					}
					expected := 0
					if tc.count == 2 {
						expected = 1
					}
					if len(events) != expected {
						t.Fatalf("hidden telemetry=%v", events)
					}
					r.SetPathValue("id", "me")
					w := httptest.NewRecorder()
					h.userDetail(w, r)
					if w.Code != 200 || (tc.count < 2 && strings.Contains(w.Body.String(), "Secret")) {
						t.Fatalf("profile recent activity disclosure: %d %s", w.Code, w.Body.String())
					}
				})
			}
			// Administrator access remains available even while the provider fails.
			policy = "invalid"
			w := httptest.NewRecorder()
			h.history(w, request("/api/history?days=all", "super_admin"))
			if w.Code != 200 || !strings.Contains(w.Body.String(), "Secret Track") || !strings.Contains(w.Body.String(), "Other Film") {
				t.Fatalf("administrator regression: %d %s", w.Code, w.Body.String())
			}
		})
	}
}
