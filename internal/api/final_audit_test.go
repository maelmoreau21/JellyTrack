package api

import (
	"encoding/json"
	"net/http/httptest"
	"testing"
)

func TestMediaServerFilterFallsBackWhenAllServersInactive(t *testing.T) {
	db := apiDB(t)
	if _, err := db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url","isActive") VALUES('a','ja','A','http://server-a',0),('b','jb','B','http://server-b',0)`); err != nil {
		t.Fatal(err)
	}
	h := New(db, "sqlite")
	read := func(want int) {
		t.Helper()
		w := httptest.NewRecorder()
		h.recoveredMediaServerOptions(w, httptest.NewRequest("GET", "/api/media/server-options", nil))
		var data struct{ Servers []map[string]any }
		if err := json.Unmarshal(w.Body.Bytes(), &data); err != nil {
			t.Fatal(err)
		}
		if w.Code != 200 || len(data.Servers) != want {
			t.Fatalf("%d %s", w.Code, w.Body.String())
		}
	}
	read(2)
	if _, err := db.Exec(`UPDATE "Server" SET "isActive"=1 WHERE "id"='b'`); err != nil {
		t.Fatal(err)
	}
	read(1)
}
