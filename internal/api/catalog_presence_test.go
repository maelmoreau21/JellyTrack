package api

import (
	"net/http/httptest"
	"testing"
)

func TestArchivedMediaHiddenFromCatalogButHistoryDetailRetained(t *testing.T) {
	db := apiDB(t)
	db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','js','S','http://s')`)
	db.Exec(`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","isAvailable") VALUES('gone','s','gone','Gone','Movie',0),('current','s','current','Current','Movie',1)`)
	h := New(db, "sqlite")
	r := httptest.NewRequest("GET", "/api/media", nil)
	base, args, err := h.recoveredMediaBase(r)
	if err != nil {
		t.Fatal(err)
	}
	var count int
	if err = db.QueryRow(base+`SELECT COUNT(*) FROM catalog`, args...).Scan(&count); err != nil || count != 1 {
		t.Fatal(count, err)
	}
	r.SetPathValue("id", "gone")
	base, args, err = h.recoveredMediaDetailBase(r)
	if err != nil {
		t.Fatal(err)
	}
	if err = db.QueryRow(base+`SELECT COUNT(*) FROM catalog`, args...).Scan(&count); err != nil || count != 1 {
		t.Fatal(count, err)
	}
}
