package api

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/auth"
)

func TestHistoryLargeFixture(t *testing.T) {
	db := apiDB(t)
	for _, q := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','jf','Test','http://test')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s','jf-u','Test')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName","durationMs") VALUES('m','s','jf-m','Movie','Movie','Movies',7200000)`,
		`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<100000) INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","durationWatched","startedAt","endedAt","country","ipAddress") SELECT printf('p%06d',x),'s','u','m','DirectPlay',600,strftime('%Y-%m-%dT%H:%M:%SZ','now','-'||x||' seconds'),strftime('%Y-%m-%dT%H:%M:%SZ','now'),'France','8.8.8.8' FROM n`,
		`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<300) INSERT INTO "TelemetryEvent"("id","serverId","playbackId","eventType","positionMs","createdAt","metadata") SELECT p."id"||'-'||x,'s',p."id",'progress',x*1000,strftime('%Y-%m-%dT%H:%M:%SZ','now','-'||x||' seconds'),'{}' FROM n CROSS JOIN "PlaybackHistory" p WHERE p."id"<='p000050'`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	h := New(db, "sqlite")
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
			if result.Total != 100000 || len(result.Items) != 50 {
				t.Fatalf("counts: %+v", result)
			}
			if path == "/api/logs?days=all&limit=50" && len(result.Items[0].TelemetryEvents) != 200 {
				t.Fatalf("telemetry window %d", len(result.Items[0].TelemetryEvents))
			}
		}
	}
}
