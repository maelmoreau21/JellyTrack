package auth

import (
	"context"
	"net/http/httptest"
	"testing"
)

func TestAccountResolutionPinsServerAndNormalizesOnlyUUIDs(t *testing.T) {
	m, db := testManager(t)
	for _, query := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s1','jf1','One','http://one'),('s2','jf2','Two','http://two')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u1','s1','01234567-89ab-cdef-0123-456789abcdef','Same'),('u2','s2','01234567-89ab-cdef-0123-456789abcdef','Same')`,
	} {
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	bound := Principal{Username: "Same", Role: "user", AuthServerID: "s1", JellyfinUserID: "0123456789ABCDEF0123456789ABCDEF"}
	identity, err := ResolveAccount(context.Background(), db, "sqlite", bound)
	if err != nil || identity.ID != "u1" || identity.ServerID != "s1" {
		t.Fatalf("bound resolution %+v error %v", identity, err)
	}
	for _, alias := range []string{"u1", "me", "@me", "Same", "0123456789ABCDEF0123456789ABCDEF", "01234567-89ab-cdef-0123-456789abcdef"} {
		if !identity.Matches(alias) {
			t.Fatalf("legitimate alias rejected: %s", alias)
		}
	}
	for _, alias := range []string{"u2", "0123456-789ab-cdef-0123-456789abcdef", "0123456789abcdef0123456789abcdeff"} {
		if identity.Matches(alias) {
			t.Fatalf("unrelated or malformed alias accepted: %s", alias)
		}
	}
	if _, err := ResolveAccount(context.Background(), db, "sqlite", Principal{Username: "Same", Role: "user"}); err == nil {
		t.Fatal("ambiguous old session accepted")
	}
	request := httptest.NewRequest("GET", "/", nil)
	recorder := httptest.NewRecorder()
	if _, err := m.createSessionIdentity(recorder, request, bound); err != nil {
		t.Fatal(err)
	}
	request.AddCookie(recorder.Result().Cookies()[0])
	restored, ok := m.authenticate(request)
	if !ok || restored.AuthServerID != "s1" || restored.JellyfinUserID != bound.JellyfinUserID {
		t.Fatal("server identity not persisted in session")
	}
}
