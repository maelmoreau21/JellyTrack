package api

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/maelmoreau21/jellytrack/internal/auth"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/maelmoreau21/jellytrack/internal/testdb"
)

func TestMultiServerConfigurationPreservesIdentityOnBothDatabases(t *testing.T) {
	for _, driver := range []string{"sqlite", "postgres"} {
		t.Run(driver, func(t *testing.T) {
			db := testdb.Open(t, driver)
			h := New(db, driver)
			remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, `{"Id":"canonical","ServerName":"A"}`) }))
			defer remote.Close()
			other := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, `{"Id":"other","ServerName":"B"}`) }))
			defer other.Close()
			call := func(handler http.HandlerFunc, payload map[string]any) *httptest.ResponseRecorder {
				raw, _ := json.Marshal(payload)
				w := httptest.NewRecorder()
				handler(w, httptest.NewRequest("POST", "/api/servers", strings.NewReader(string(raw))))
				return w
			}
			payload := map[string]any{"name": "A", "url": remote.URL, "apiKey": "qa-key", "allowAuthFallback": false, "isActive": true}
			w := call(h.saveServer, payload)
			if w.Code != 200 {
				t.Fatalf("add=%d %s", w.Code, w.Body)
			}
			var body map[string]any
			json.Unmarshal(w.Body.Bytes(), &body)
			id := body["id"].(string)
			if w := call(h.saveServer, payload); w.Code != 409 {
				t.Fatalf("duplicate=%d %s", w.Code, w.Body)
			}
			if w := call(h.updateServer, map[string]any{"id": id, "name": "Renamed", "isActive": false}); w.Code != 200 {
				t.Fatalf("update=%d %s", w.Code, w.Body)
			}
			var active, fallback bool
			var name, address string
			if err := db.QueryRow(`SELECT "name","url","isActive","allowAuthFallback" FROM "Server"`).Scan(&name, &address, &active, &fallback); err != nil || active || fallback || name != "Renamed" {
				t.Fatalf("not persisted %s %v %v %v", name, active, fallback, err)
			}
			if w := call(h.updateServer, map[string]any{"id": id, "url": other.URL}); w.Code != 409 {
				t.Fatalf("wrong identity update=%d", w.Code)
			}
			payload["id"] = id
			payload["url"] = other.URL
			if w := call(h.saveServer, payload); w.Code != 409 {
				t.Fatalf("wrong identity save=%d", w.Code)
			}
			if err := db.QueryRow(`SELECT "url" FROM "Server"`).Scan(&address); err != nil || address != remote.URL {
				t.Fatalf("identity protection did not preserve URL %s %v", address, err)
			}
		})
	}
}

func TestMultiServerImagesNeverFallbackToAnotherServer(t *testing.T) {
	db := apiDB(t)
	hits := map[string]int{}
	for _, id := range []string{"a", "b"} {
		id := id
		remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			hits[id]++
			w.Header().Set("Content-Type", "image/png")
			fmt.Fprint(w, `<svg xmlns="http://www.w3.org/2000/svg"/>`)
		}))
		defer remote.Close()
		if _, err := db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES(?,?,?,?)`, id, "j"+id, id, remote.URL); err != nil {
			t.Fatal(err)
		}
	}
	h := New(db, "sqlite")
	for _, handler := range []http.HandlerFunc{h.jellyfinImageProxy, h.jellyfinUserImageProxy} {
		for _, scope := range []string{"", "missing"} {
			w := httptest.NewRecorder()
			handler(w, httptest.NewRequest("GET", "/image?id=same&userId=same&fallback=none&serverId="+scope, nil))
			if w.Code != 404 {
				t.Fatalf("ambiguous image=%d", w.Code)
			}
		}
		w := httptest.NewRecorder()
		request := httptest.NewRequest("GET", "/image?id=same&userId=same&serverId=b", nil)
		request = request.WithContext(context.WithValue(request.Context(), auth.PrincipalContextKey, auth.Principal{Role: "super_admin"}))
		handler(w, request)
		if w.Code != 200 {
			t.Fatalf("scoped image=%d", w.Code)
		}
	}
	if hits["a"] != 0 || hits["b"] != 2 {
		t.Fatalf("misrouted images: %+v", hits)
	}
}
