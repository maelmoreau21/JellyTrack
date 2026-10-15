package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"sort"
	"strings"
	"testing"

	"github.com/maelmoreau21/jellytrack/internal/auth"
	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/internal/testdb"
)

func TestDetailMetricsContracts(t *testing.T) {
	t.Run("sqlite", func(t *testing.T) { testDetailMetricsContracts(t, apiDB(t), "sqlite") })
	t.Run("postgres", func(t *testing.T) { testDetailMetricsContracts(t, testdb.Postgres(t), "postgres") })
}

// Compare the compact aggregation against independent SQL panels. Mixed null
// languages, identical timestamps, negative counters and server collisions must
// keep their historical meaning even when a panel is computed in Go.
func testDetailMetricsContracts(t *testing.T, db *sql.DB, driver string) {
	for _, q := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','js','One','http://fixture'),('other','jo','Other','http://fixture')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s','ju','Alice'),('v','s','jv','Bob'),('outsider','other','ju','Alice')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","durationMs") VALUES('m','s','jm','Movie','Movie',120000),('other-m','other','jm','Other','Movie',120000)`,
		`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","durationWatched","startedAt","endedAt","audioLanguage","subtitleLanguage","pauseCount","seekCount","maxPlaybackRate") VALUES
('p1','s','u','m','DirectPlay',120,'2026-01-01T10:00:00Z','2026-01-01T11:00:00Z','fr',NULL,2,1,1.5),
('p2','s','v','m','DirectPlay',60,'2026-01-01T10:00:00Z','2026-01-01T11:00:00Z','fr','',1,2,2),
('p3','s','u','m','DirectPlay',90,'2026-01-02T10:00:00Z','2026-01-02T11:00:00Z',NULL,'en',1,-1,1),
('p4','s','v','m','DirectPlay',60,'2026-01-03T10:00:00Z','2026-01-03T11:00:00Z','','en',0,0,1),
('p5','other','outsider','other-m','DirectPlay',9000,'2026-01-01T10:00:00Z','2026-01-01T11:00:00Z','de','de',100,100,4)`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	h := New(db, driver)
	r := httptest.NewRequest("GET", "/api/media/m?servers=s", nil)
	r.SetPathValue("id", "m")
	base, args, err := h.recoveredMediaDetailBase(r)
	if err != nil {
		t.Fatal(err)
	}
	base, _, _ = strings.Cut(base, `, per_media AS (`)
	base += " "
	family := ` FROM valid p LEFT JOIN "User" u ON u."id"=p."userId" JOIN catalog c ON c."id"=p."mediaId" WHERE p."mediaId" IN (SELECT "member" FROM family WHERE "root"=?)`
	for _, runtime := range []float64{120000, 0} {
		got, err := h.recoveredDetailMetrics(r, base, args, "m", runtime, true)
		if err != nil {
			t.Fatal(err)
		}
		for _, panel := range []struct {
			key, query string
			extra      []any
		}{
			{"viewers", `SELECT u."id" AS "userId",u."username",COUNT(*) AS "plays",SUM(p."durationWatched")*1000 AS "watchTimeMs"` + family + ` GROUP BY u."id",u."username" ORDER BY SUM(p."durationWatched") DESC,u."username"`, []any{"m"}},
			{"audioDistribution", `SELECT COALESCE(p."audioLanguage",'') AS "language",COALESCE(p."audioCodec",'') AS "codec",COUNT(*) AS "count"` + family + ` GROUP BY p."audioLanguage",p."audioCodec" ORDER BY COUNT(*) DESC`, []any{"m"}},
			{"subtitleDistribution", `SELECT COALESCE(p."subtitleLanguage",'') AS "language",COALESCE(p."subtitleCodec",'') AS "codec",COUNT(*) AS "count"` + family + ` GROUP BY p."subtitleLanguage",p."subtitleCodec" ORDER BY COUNT(*) DESC`, []any{"m"}},
			{"counterTimeline", `SELECT p."startedAt",SUM(p."pauseCount") AS "pauseCount",SUM(p."seekCount") AS "seekCount",SUM(p."rewatchCount") AS "rewatchCount",SUM(p."speedChangeCount") AS "speedChangeCount",SUM(p."audioChanges") AS "audioChanges",SUM(p."subtitleChanges") AS "subtitleChanges"` + family + ` GROUP BY p."startedAt" HAVING SUM(p."pauseCount"+p."seekCount"+p."rewatchCount"+p."speedChangeCount"+p."audioChanges"+p."subtitleChanges")>0 ORDER BY p."startedAt"`, []any{"m"}},
			{"completion", `SELECT CASE WHEN p."durationWatched"*1000>=? THEN 90 ELSE CAST((p."durationWatched"*1000.0/?)/10 AS INTEGER)*10 END AS "percent",COUNT(*) AS "count"` + family + ` GROUP BY "percent" ORDER BY "percent"`, []any{runtime, runtime, "m"}},
		} {
			want := []map[string]any{}
			if panel.key != "completion" || runtime > 0 {
				want, err = h.recoveredRows(r, base+panel.query, append(append([]any{}, args...), panel.extra...)...)
				if err != nil {
					t.Fatal(err)
				}
			}
			canonical := func(value any) []string {
				encoded, _ := json.Marshal(value)
				var rows []map[string]any
				if err := json.Unmarshal(encoded, &rows); err != nil {
					t.Fatal(err)
				}
				out := []string{}
				for _, row := range rows {
					b, _ := json.Marshal(row)
					out = append(out, string(b))
				}
				// SQL leaves equal-count language rows unordered.
				if strings.HasSuffix(panel.key, "Distribution") {
					sort.Strings(out)
				}
				return out
			}
			if !reflect.DeepEqual(canonical(got[panel.key]), canonical(want)) {
				t.Fatalf("%s runtime=%v: got=%v want=%v", panel.key, runtime, got[panel.key], want)
			}
		}
		summary, err := h.recoveredDetailMetrics(r, base, args, "m", runtime, false)
		if err != nil {
			t.Fatal(err)
		}
		for key, want := range summary {
			a, _ := json.Marshal(got[key])
			b, _ := json.Marshal(want)
			if string(a) != string(b) {
				t.Fatalf("summary %s: %s != %s", key, a, b)
			}
		}
	}
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/Library/VirtualFolders" {
			w.Write([]byte(`[]`))
			return
		}
		w.Write([]byte(`{"Id":"ju","Policy":{"EnableAllFolders":true}}`))
	}))
	defer provider.Close()
	if _, err := db.Exec(database.Bind(`UPDATE "Server" SET "url"=?,"jellyfinApiKey"='fixture-key' WHERE "id"='s'`, driver), provider.URL); err != nil {
		t.Fatal(err)
	}
	self := httptest.NewRequest("GET", "/api/media/m?servers=s", nil)
	self.SetPathValue("id", "m")
	self = self.WithContext(context.WithValue(self.Context(), auth.PrincipalContextKey, auth.Principal{Role: "user", JellyfinUserID: "ju", AuthServerID: "s", IdentityVersion: 1}))
	w := httptest.NewRecorder()
	h.recoveredMediaDetail(w, self)
	var own struct {
		TotalPlays any
		Viewers    []struct{ UserID string }
	}
	if err := json.Unmarshal(w.Body.Bytes(), &own); err != nil {
		t.Fatal(err)
	}
	if w.Code != 200 || mediaNumber(own.TotalPlays) != 2 || len(own.Viewers) != 1 || own.Viewers[0].UserID != "u" {
		t.Fatalf("personal scope: %d %s", w.Code, w.Body.String())
	}
}
