package api

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLibraryRepairReconcilesOnlyProvisionalImportedIdentities(t *testing.T) {
	const serverID = "edd627c3-76f2-402b-b03c-d2e31e574198"
	const observed = "1234567890abcdef1234567890abcdef"
	for _, test := range []struct {
		name, stored             string
		match, conflict, allowed bool
	}{
		{"internal-id-fallback", serverID, true, false, true},
		{"historical-import-placeholder", "imported-server-1", true, false, true},
		{"missing-id", "", true, false, true},
		{"real-different-identity", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", true, false, false},
		{"unverified-placeholder", serverID, false, false, false},
		{"already-configured-server", serverID, true, true, false},
		{"same-uuid-formatting", " 12345678-90AB-CDEF-1234-567890ABCDEF ", true, false, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			db := apiDB(t)
			directory := t.TempDir()
			t.Setenv("BACKUP_DIR", directory)
			remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch r.URL.Path {
				case "/System/Info":
					json.NewEncoder(w).Encode(map[string]string{"Id": observed})
				case "/Library/VirtualFolders":
					w.Write([]byte(`[{"ItemId":"lib","Name":"Films"}]`))
				case "/Items":
					id := "movie"
					if !test.match {
						id = "other"
					}
					json.NewEncoder(w).Encode(map[string]any{"Items": []map[string]string{{"Id": id}}})
				default:
					http.NotFound(w, r)
				}
			}))
			defer remote.Close()
			if _, err := db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url","jellyfinApiKey") VALUES(?,?,'A',?,'key')`, serverID, test.stored, remote.URL); err != nil {
				t.Fatal(err)
			}
			for _, q := range []string{
				`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','` + serverID + `','ju','User')`,
				`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName") VALUES('m','` + serverID + `','movie','Film','Movie','movies')`,
				`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","durationWatched","playMethod") VALUES('p','` + serverID + `','u','m',120,'DirectPlay')`,
			} {
				if _, err := db.Exec(q); err != nil {
					t.Fatal(err)
				}
			}
			if test.conflict {
				if _, err := db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('another',?,'Another',?)`, observed, remote.URL); err != nil {
					t.Fatal(err)
				}
			}
			h := New(db, "sqlite")
			r := httptest.NewRequest("POST", "http://localhost/api/admin/repair-library-names", strings.NewReader(`{}`))
			r.Header.Set("Origin", "http://localhost")
			w := httptest.NewRecorder()
			h.repairLibraryNames(w, r)
			var jid, lib, sid, mid string
			var duration int
			if err := db.QueryRow(`SELECT "jellyfinServerId" FROM "Server" WHERE "id"=?`, serverID).Scan(&jid); err != nil {
				t.Fatal(err)
			}
			if err := db.QueryRow(`SELECT "libraryName" FROM "Media" WHERE "id"='m'`).Scan(&lib); err != nil {
				t.Fatal(err)
			}
			if err := db.QueryRow(`SELECT "serverId","mediaId","durationWatched" FROM "PlaybackHistory" WHERE "id"='p'`).Scan(&sid, &mid, &duration); err != nil {
				t.Fatal(err)
			}
			if sid != serverID || mid != "m" || duration != 120 {
				t.Fatal("history or isolation changed")
			}
			if test.allowed {
				if w.Code != 200 || lib != "Films" {
					t.Fatalf("%d %s %q", w.Code, w.Body.String(), lib)
				}
				if test.name != "same-uuid-formatting" && jid != observed {
					t.Fatalf("identity not reread: %q", jid)
				}
				var result struct{ Backup string }
				if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
					t.Fatal(err)
				}
				snapshot, err := sql.Open("sqlite", filepath.Join(directory, result.Backup))
				if err != nil {
					t.Fatal(err)
				}
				defer snapshot.Close()
				var old string
				if err = snapshot.QueryRow(`SELECT "jellyfinServerId" FROM "Server" WHERE "id"=?`, serverID).Scan(&old); err != nil || old != test.stored {
					t.Fatalf("backup lost original identity: %q %v", old, err)
				}
			} else {
				if w.Code == 200 || jid != test.stored || lib != "movies" {
					t.Fatalf("unsafe change: %d %q %q", w.Code, jid, lib)
				}
				if test.name == "real-different-identity" && (!strings.Contains(w.Body.String(), test.stored) || !strings.Contains(w.Body.String(), observed)) {
					t.Fatal("diagnostic omits identities")
				}
				if !test.conflict {
					files, _ := os.ReadDir(directory)
					if len(files) != 0 {
						t.Fatal("backup created before identity validation")
					}
				}
			}
		})
	}
}
