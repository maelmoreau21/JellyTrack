package jellyfin

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/maelmoreau21/jellytrack/internal/testdb"
)

func TestSyncRecognizesLegacyHostAliasWithoutChangingHistoryOrPluginScope(t *testing.T) {
	const internalID = "edd627c3-76f2-402b-b03c-d2e31e574198"
	const systemID = "1866d4f56378459384d54b130423a9e8"
	for _, alias := range []string{"srv:jellyfin_8096", "master"} {
		t.Run(alias, func(t *testing.T) {
			db := testdb.Open(t, "sqlite")
			remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch r.URL.Path {
				case "/System/Info":
					fmt.Fprintf(w, `{"Id":%q,"ServerName":"Jellyfin"}`, systemID)
				case "/Users":
					fmt.Fprint(w, `[{"Id":"user","Name":"User"}]`)
				case "/Library/VirtualFolders":
					fmt.Fprint(w, `[{"ItemId":"films","Name":"Films","CollectionType":"movies"}]`)
				case "/Items":
					fmt.Fprint(w, `{"Items":[{"Id":"movie","Name":"Film","Type":"Movie","ParentId":"films"}],"TotalRecordCount":1}`)
				default:
					http.NotFound(w, r)
				}
			}))
			defer remote.Close()
			if _, err := db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url","jellyfinApiKey") VALUES(?,?,'Jellyfin',?,'key')`, internalID, alias, remote.URL); err != nil {
				t.Fatal(err)
			}
			for _, q := range []string{
				`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','` + internalID + `','user','User')`,
				`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName") VALUES('m','` + internalID + `','movie','Film','Movie','Films')`,
				`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","durationWatched","playMethod") VALUES('p','` + internalID + `','u','m',120,'DirectPlay')`,
			} {
				if _, err := db.Exec(q); err != nil {
					t.Fatal(err)
				}
			}
			for _, recent := range []bool{true, false} {
				result, err := SyncOne(context.Background(), db, "sqlite", internalID, alias, "Jellyfin", remote.URL, "key", recent)
				if err != nil || result.Media != 1 || result.Users != 1 {
					t.Fatalf("recent=%v: %+v %v", recent, result, err)
				}
			}
			var id, stored string
			if err := db.QueryRow(`SELECT "id","jellyfinServerId" FROM "Server"`).Scan(&id, &stored); err != nil || id != internalID || stored != alias {
				t.Fatalf("server/plugin scope changed: %q %q %v", id, stored, err)
			}
			var sid, uid, mid string
			var watched int
			if err := db.QueryRow(`SELECT "serverId","userId","mediaId","durationWatched" FROM "PlaybackHistory" WHERE "id"='p'`).Scan(&sid, &uid, &mid, &watched); err != nil || sid != internalID || uid != "u" || mid != "m" || watched != 120 {
				t.Fatalf("history changed %q %q %q %d %v", sid, uid, mid, watched, err)
			}
			for _, table := range []string{"Server", "User", "Media", "PlaybackHistory"} {
				var count int
				if err := db.QueryRow(`SELECT COUNT(*) FROM "` + table + `"`).Scan(&count); err != nil || count != 1 {
					t.Fatalf("duplicate %s: %d %v", table, count, err)
				}
			}
		})
	}
}

func TestLegacySyncRejectsChangedURLOrConflictingServer(t *testing.T) {
	for _, conflict := range []bool{false, true} {
		t.Run(fmt.Sprint(conflict), func(t *testing.T) {
			db := testdb.Open(t, "sqlite")
			remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				fmt.Fprint(w, `{"Id":"1866d4f56378459384d54b130423a9e8"}`)
			}))
			defer remote.Close()
			configured := remote.URL
			if !conflict {
				configured += "/different"
			}
			if _, err := db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','srv:jellyfin_8096','S',?)`, configured); err != nil {
				t.Fatal(err)
			}
			if conflict {
				if _, err := db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('other','1866d4f5-6378-4593-84d5-4b130423a9e8','Other',?)`, remote.URL); err != nil {
					t.Fatal(err)
				}
			}
			if _, err := db.Exec(`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type") VALUES('m','s','movie','Film','Movie')`); err != nil {
				t.Fatal(err)
			}
			if _, err := SyncOne(context.Background(), db, "sqlite", "s", "srv:jellyfin_8096", "S", remote.URL, "key"); err == nil {
				t.Fatal("unsafe sync accepted")
			}
			var id, url string
			if err := db.QueryRow(`SELECT "jellyfinServerId","url" FROM "Server" WHERE "id"='s'`).Scan(&id, &url); err != nil || id != "srv:jellyfin_8096" || url != configured {
				t.Fatal("configuration changed", id, url, err)
			}
		})
	}
}
