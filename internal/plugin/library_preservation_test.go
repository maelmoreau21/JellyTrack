package plugin

import (
	"context"
	"testing"
)

func TestSparsePluginEventsPreserveLibraryAndParent(t *testing.T) {
	db, h := testServer(t)
	if _, err := db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','js','S','http://s')`); err != nil {
		t.Fatal(err)
	}
	for _, payload := range []map[string]any{{"libraryName": "Séries", "parentId": "season"}, {}, {"libraryName": "", "parentId": ""}} {
		id, _, _, err := h.upsertMedia(context.Background(), "s", payload, "episode", "Episode", "Episode", "tvshows")
		if err != nil {
			t.Fatal(err)
		}
		var library, parent string
		if err = db.QueryRow(`SELECT "libraryName","parentId" FROM "Media" WHERE "id"=?`, id).Scan(&library, &parent); err != nil {
			t.Fatal(err)
		}
		if library != "Séries" || parent != "season" {
			t.Fatalf("metadata lost: %q %q", library, parent)
		}
	}
}
