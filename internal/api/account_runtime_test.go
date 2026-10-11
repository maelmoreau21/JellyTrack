package api

import (
	"context"
	"encoding/json"
	"github.com/maelmoreau21/jellytrack/internal/auth"
	"net/http/httptest"
	"testing"
)

func TestMyAccountAdminResolvesServerAndUUIDAlias(t *testing.T) {
	db := apiDB(t)
	for _, query := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s1','j1','One','http://one'),('s2','j2','Two','http://two')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('other','s1','00112233445566778899aabbccddeeff','Alice'),('own','s2','00112233-4455-6677-8899-aabbccddeeff','Alice')`,
	} {
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	h := New(db, "sqlite")
	principal := auth.Principal{Username: "Alice", Role: "admin", JellyfinUserID: "00112233445566778899AABBCCDDEEFF", AuthServerID: "s2", IdentityVersion: 1}
	call := func(id string, p auth.Principal) *httptest.ResponseRecorder {
		r := httptest.NewRequest("GET", "/api/users/"+id, nil)
		r.SetPathValue("id", id)
		r = r.WithContext(context.WithValue(r.Context(), auth.PrincipalContextKey, p))
		w := httptest.NewRecorder()
		h.userDetail(w, r)
		return w
	}
	for _, id := range []string{"me", "@me"} {
		w := call(id, principal)
		if w.Code != 200 {
			t.Fatalf("%s: %d %s", id, w.Code, w.Body)
		}
		var result map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		if result["id"] != "own" || result["serverId"] != "s2" {
			t.Fatalf("wrong linked account: %+v", result)
		}
	}
	w := call("me", auth.Principal{Username: "admin", Role: "admin", JellyfinUserID: "local-admin", IdentityVersion: 1})
	if w.Code != 404 {
		t.Fatalf("unlinked local account fabricates profile: %d", w.Code)
	}
	w = call("00112233-4455-6677-8899-aabbccddeeff", principal)
	if w.Code != 200 {
		t.Fatalf("explicit UUID lookup: %d %s", w.Code, w.Body)
	}
}
