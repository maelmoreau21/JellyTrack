package api

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRepairFindsHistoricalLibraryByProviderWithoutInventingResolution(t *testing.T) {
	db := apiDB(t)
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/System/Info":
			fmt.Fprint(w, `{"Id":"js"}`)
		case "/Library/VirtualFolders":
			fmt.Fprint(w, `[{"ItemId":"films","Name":"Mes films"}]`)
		case "/Items":
			if !strings.Contains(r.URL.Query().Get("Fields"), "ProviderIds") {
				t.Error("missing provider fields")
			}
			fmt.Fprint(w, `{"Items":[{"Id":"new","Type":"Movie","ProviderIds":{"Tmdb":"123"},"MediaSources":[{"MediaStreams":[{"Type":"Video","Width":3840,"Height":2160}]}]}]}`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer remote.Close()
	db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url","jellyfinApiKey") VALUES('s','js','S',?,'key')`, remote.URL)
	if _, err := db.Exec(`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","providerIds") VALUES('old','s','old','Movie','Movie','{"Tmdb":"123"}')`); err != nil {
		t.Fatal(err)
	}
	h := New(db, "sqlite")
	changes, _, unresolved, diagnostics, err := h.planLibraryRepair(context.Background())
	if err != nil || unresolved != 0 || len(diagnostics) != 0 || len(changes) != 1 || changes[0].afterResolution != "" {
		t.Fatal(changes, unresolved, diagnostics, err)
	}
	if _, err = h.applyLibraryRepair(context.Background(), changes); err != nil {
		t.Fatal(err)
	}
	var name string
	db.QueryRow(`SELECT "libraryName" FROM "Media" WHERE "id"='old'`).Scan(&name)
	if name != "Mes films" {
		t.Fatal(name)
	}
}
