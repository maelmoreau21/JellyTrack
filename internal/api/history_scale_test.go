package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"runtime"
	"testing"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/auth"
)

func TestHistoryLargeFixture(t *testing.T) {
	for _, count := range []int{3000, 100000} {
		t.Run(fmt.Sprint(count), func(t *testing.T) { measureHistoryFixture(t, count) })
	}
}

func measureHistoryFixture(t *testing.T, count int) {
	db := apiDB(t)
	for _, q := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','jf','Test','http://test')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s','jf-u','Test')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName","durationMs") VALUES('m','s','jf-m','Movie','Movie','Movies',7200000)`,
		fmt.Sprintf(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<%d) INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","durationWatched","startedAt","endedAt","country","ipAddress") SELECT printf('p%%06d',x),'s','u','m','DirectPlay',600,strftime('%%Y-%%m-%%dT%%H:%%M:%%SZ','now','-'||x||' seconds'),strftime('%%Y-%%m-%%dT%%H:%%M:%%SZ','now'),'France','8.8.8.8' FROM n`, count),
		`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<300) INSERT INTO "TelemetryEvent"("id","serverId","playbackId","eventType","positionMs","createdAt","metadata") SELECT p."id"||'-'||x,'s',p."id",'progress',x*1000,strftime('%Y-%m-%dT%H:%M:%SZ','now','-'||x||' seconds'),'{}' FROM n CROSS JOIN "PlaybackHistory" p WHERE p."id"<='p000050'`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	h := New(db, "sqlite")
	// Include whole-page API costs in the scale fixture, not only the first
	// visible header. These requests share the same data and authorization.
	for _, endpoint := range []struct {
		path    string
		handler func(http.ResponseWriter, *http.Request)
	}{
		{"/api/media?limit=50", h.recoveredMediaList},
		{"/api/media/collections", h.recoveredMediaCollections},
		{"/api/dashboard?days=all", h.dashboard},
	} {
		r := httptest.NewRequest("GET", endpoint.path, nil)
		r = r.WithContext(context.WithValue(r.Context(), auth.PrincipalContextKey, auth.Principal{Role: "super_admin"}))
		w := httptest.NewRecorder()
		runtime.GC()
		var before, after runtime.MemStats
		runtime.ReadMemStats(&before)
		start := time.Now()
		endpoint.handler(w, r)
		runtime.ReadMemStats(&after)
		t.Logf("%s sessions=%d elapsed=%s allocated=%.2f MiB bytes=%d", endpoint.path, count, time.Since(start), float64(after.TotalAlloc-before.TotalAlloc)/1048576, w.Body.Len())
		if w.Code != 200 {
			t.Fatalf("%s: %d %s", endpoint.path, w.Code, w.Body.String())
		}
	}
	for _, path := range []string{"/api/logs?days=all&limit=50", "/api/logs?days=all&limit=50&sort=duration_desc", "/api/logs?days=all&limit=50&q=Movie"} {
		for attempt := 0; attempt < 1; attempt++ {
			r := httptest.NewRequest("GET", path, nil)
			r = r.WithContext(context.WithValue(r.Context(), auth.PrincipalContextKey, auth.Principal{Role: "super_admin"}))
			w := httptest.NewRecorder()
			start := time.Now()
			h.history(w, r)
			t.Logf("%s attempt=%d elapsed=%s bytes=%d", path, attempt, time.Since(start), w.Body.Len())
			if w.Code != 200 {
				t.Fatalf("%d %s", w.Code, w.Body.String())
			}
			var result struct {
				Total int
				Items []struct{ TelemetryEvents []any }
			}
			if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
				t.Fatal(err)
			}
			if result.Total != count || len(result.Items) != 50 {
				t.Fatalf("counts: %+v", result)
			}
			if path == "/api/logs?days=all&limit=50" && len(result.Items[0].TelemetryEvents) != 200 {
				t.Fatalf("telemetry window %d", len(result.Items[0].TelemetryEvents))
			}
		}
	}
	r := httptest.NewRequest("GET", "/api/users/u", nil)
	start := time.Now()
	profile, err := h.userProfileData(r, "u", "s")
	t.Logf("profile with %d sessions elapsed=%s", count, time.Since(start))
	if err != nil || profile["totalPlays"] != count {
		t.Fatalf("profile counts: %v %v", profile["totalPlays"], err)
	}
	start = time.Now()
	_, err = h.profileHistory(r, "u", "s")
	t.Logf("profileHistory with %d sessions elapsed=%s", count, time.Since(start))
	if err != nil {
		t.Fatal(err)
	}
}
