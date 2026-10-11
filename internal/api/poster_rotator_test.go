package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPosterRotatorHistoricalServerUUIDAndSuccessStatuses(t *testing.T) {
	firstCalls, secondCalls := 0, 0
	first := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { firstCalls++; w.WriteHeader(200) }))
	defer first.Close()
	status := 201
	second := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		secondCalls++
		if r.Header.Get("X-Emby-Token") != "key2" || !strings.Contains(r.URL.Path, "00112233445566778899aabbccddeeff") {
			t.Errorf("request=%s", r.URL.Path)
		}
		w.WriteHeader(status)
		if status == 500 {
			_, _ = w.Write([]byte(`{"error":"pool empty"}`))
		}
	}))
	defer second.Close()
	db := apiDB(t)
	for _, row := range []struct{ id, url, key string }{{"s1", first.URL, "key1"}, {"s2", second.URL, "key2"}} {
		if _, err := db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url","jellyfinApiKey") VALUES(?,?,?,?,?)`, row.id, row.id, row.id, row.url, row.key); err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec(`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type") VALUES(?,?,'00112233445566778899aabbccddeeff','Movie','Movie')`, row.id+"m", row.id); err != nil {
			t.Fatal(err)
		}
	}
	for _, tc := range []struct {
		status, want int
		code         string
	}{{201, 200, "poster_rotated"}, {204, 200, "poster_rotated"}, {500, 404, "pool_missing"}} {
		status = tc.status
		r := httptest.NewRequest("POST", "/api/media/id/poster-rotator/rotate", strings.NewReader(`{"serverId":"s2"}`))
		r.SetPathValue("id", "00112233-4455-6677-8899-AABBCCDDEEFF")
		w := httptest.NewRecorder()
		New(db, "sqlite").posterRotatorRotate(w, r)
		var data map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &data)
		if w.Code != tc.want || data["code"] != tc.code {
			t.Fatalf("status%d response%d %s", status, w.Code, w.Body.String())
		}
	}
	if firstCalls != 0 || secondCalls != 3 {
		t.Fatalf("wrong server first=%d second=%d", firstCalls, secondCalls)
	}
}
