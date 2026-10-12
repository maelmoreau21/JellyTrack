package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/maelmoreau21/jellytrack/internal/jellyfin"
)

func TestOIDCProfileNameMatchesHistoricalMain(t *testing.T) {
	for _, tc := range []struct {
		claims map[string]any
		want   string
	}{
		{map[string]any{"name": " Maël Moreau ", "preferred_username": "mmoreau", "email": "mail@example.test", "sub": "subject"}, "Maël Moreau"},
		{map[string]any{"name": " ", "preferred_username": "mmoreau", "sub": "subject"}, "mmoreau"},
		{map[string]any{"username": "login", "nickname": "nickname"}, "login"},
		{map[string]any{"name": 42, "email": "mail@example.test"}, "mail@example.test"},
		{map[string]any{"sub": "subject"}, "subject"},
		{map[string]any{}, ""},
	} {
		if got := oidcProfileName(tc.claims); got != tc.want {
			t.Fatalf("got %q, want %q", got, tc.want)
		}
	}
}

func TestOIDCReconcilesAuthentikFullNameToRealJellyfinAccount(t *testing.T) {
	m, db := testManager(t)
	duplicate := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		users := []jellyfin.AuthenticatedUser{
			{ID: "login-account", Name: "mmoreau"},
			{ID: "full-name-account", Name: "Maël Moreau"},
		}
		if duplicate {
			users = append(users, jellyfin.AuthenticatedUser{ID: "duplicate", Name: "Maël Moreau"})
		}
		json.NewEncoder(w).Encode(users)
	}))
	defer server.Close()
	t.Setenv("JELLYFIN_URL", server.URL)
	t.Setenv("JELLYFIN_API_KEY", "test-key")
	t.Setenv("JELLYFIN_SERVER_ID", "s1")
	if _, err := db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url","jellyfinApiKey") VALUES('s1','jf1','Server',?,'test-key')`, server.URL); err != nil {
		t.Fatal(err)
	}
	account, sid, err := m.oidcAccount(context.Background(), map[string]any{"name": "Maël Moreau", "preferred_username": "mmoreau", "sub": "subject"})
	if err != nil || sid != "s1" || account.ID != "full-name-account" || account.Name != "Maël Moreau" {
		t.Fatalf("wrong linked account: %+v %s %v", account, sid, err)
	}
	duplicate = true
	if _, _, err = m.oidcAccount(context.Background(), map[string]any{"name": "Maël Moreau", "preferred_username": "mmoreau", "sub": "subject"}); err == nil {
		t.Fatal("ambiguous full name selected another account")
	}

}
