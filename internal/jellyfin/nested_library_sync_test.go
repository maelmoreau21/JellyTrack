package jellyfin

import (
	"context"
	"fmt"
	"github.com/maelmoreau21/jellytrack/internal/testdb"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSyncAssignsActualLibraryToNestedMediaWithoutLoadedParents(t *testing.T) {
	db := testdb.Open(t, "sqlite")
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/System/Info":
			fmt.Fprint(w, `{"Id":"js"}`)
		case "/Users":
			fmt.Fprint(w, `[]`)
		case "/Library/VirtualFolders":
			fmt.Fprint(w, `[{"ItemId":"tv","Name":"Mes séries","CollectionType":"tvshows"},{"ItemId":"music","Name":"Mes musiques","CollectionType":"music"}]`)
		case "/Items":
			if r.URL.Query().Get("ParentId") == "tv" {
				fmt.Fprint(w, `{"Items":[{"Id":"episode","Name":"Episode","Type":"Episode","ParentId":"missing-season"}]}`)
			} else if r.URL.Query().Get("ParentId") == "music" {
				fmt.Fprint(w, `{"Items":[{"Id":"track","Name":"Track","Type":"Audio","ParentId":"missing-album"}]}`)
			} else {
				t.Error("unscoped catalogue query")
				fmt.Fprint(w, `{"Items":[]}`)
			}
		default:
			http.NotFound(w, r)
		}
	}))
	defer remote.Close()
	if _, err := db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','js','S',?)`, remote.URL); err != nil {
		t.Fatal(err)
	}
	for _, recent := range []bool{true, false} {
		result, err := SyncOne(context.Background(), db, "sqlite", "s", "js", "S", remote.URL, "key", recent)
		if err != nil || result.Media != 2 {
			t.Fatal(result, err)
		}
	}
	for id, want := range map[string]string{"episode": "Mes séries", "track": "Mes musiques"} {
		var got string
		if err := db.QueryRow(`SELECT "libraryName" FROM "Media" WHERE "serverId"='s' AND "jellyfinMediaId"=?`, id).Scan(&got); err != nil || got != want {
			t.Fatalf("%s: %q %v", id, got, err)
		}
	}
}
