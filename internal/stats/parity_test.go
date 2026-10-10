package stats

import (
	"context"
	"testing"
	"time"
)

func TestCumulativeCompletionUsesAllHistoryWithoutMergingUsersOrServers(t *testing.T) {
	db := statsDB(t)
	for _, q := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','js','One','http://one'),('s2','js2','Two','http://two')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s','ju','Alice'),('v','s','jv','Alice'),('u2','s2','ju','Alice')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","durationMs","collectionType") VALUES('m','s','jm','Movie','Movie',600000,'movies'),('m2','s2','jm','Movie','Movie',600000,'movies'),('a','s','ja','Music','Audio',600000,'music'),('unknown','s','jx','Unknown','Movie',NULL,'movies')`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	now := time.Now().UTC()
	for i, row := range []struct {
		user, server, media string
		seconds, age        int
	}{
		{"u", "s", "m", 300, 30}, {"u", "s", "m", 200, 0}, {"v", "s", "m", 60, 0}, {"u2", "s2", "m2", 120, 0}, {"u", "s", "a", 200, 0}, {"u", "s", "unknown", 300, 0},
	} {
		at := now.AddDate(0, 0, -row.age).Format(time.RFC3339Nano)
		if _, err := db.Exec(`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","durationWatched","startedAt","endedAt") VALUES(?,?,?,?,'DirectPlay',?,?,?)`, i, row.server, row.user, row.media, row.seconds, at, at); err != nil {
			t.Fatal(err)
		}
	}
	filter := DashboardFilter{TimeRange: "7d"}
	entries, err := GetCumulativeCompletion(context.Background(), db, "sqlite", filter)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 4 {
		t.Fatalf("known distinct keys=%d", len(entries))
	}
	buckets := map[string]string{}
	for _, e := range entries {
		buckets[e.UserID+":"+e.MediaID] = e.Bucket
		if e.UserID == "u" && e.MediaID == "m" && e.WatchedSeconds != 500 {
			t.Fatalf("resumed=%+v", e)
		}
	}
	for key, want := range map[string]string{"u:m": "completed", "v:m": "abandoned", "u2:m2": "partial", "u:a": "partial"} {
		if buckets[key] != want {
			t.Fatalf("%s bucket=%s wanted=%s", key, buckets[key], want)
		}
	}
	for _, bucket := range []string{"completed", "partial", "abandoned", "skipped"} {
		clause, err := CompletionFilterClause("p", "m", bucket, "", false)
		if err != nil {
			t.Fatal(err)
		}
		rows, err := db.Query(`SELECT DISTINCT p."userId",p."serverId",p."mediaId" FROM "PlaybackHistory" p JOIN "Media" m ON m."id"=p."mediaId" WHERE p."startedAt">=? AND `+clause, now.AddDate(0, 0, -7).Format(time.RFC3339Nano))
		if err != nil {
			t.Fatal(err)
		}
		var actual int
		for rows.Next() {
			actual++
		}
		if err := rows.Err(); err != nil {
			t.Fatal(err)
		}
		rows.Close()
		wanted := 0
		for _, e := range entries {
			if e.Bucket == bucket {
				wanted++
			}
		}
		if actual != wanted {
			t.Fatalf("drilldown %s=%d chart=%d", bucket, actual, wanted)
		}
	}
	granular, err := GetGranularAnalysis(context.Background(), db, "sqlite", filter)
	if err != nil {
		t.Fatal(err)
	}
	counts := map[string]float64{}
	for _, s := range granular.DropSegments {
		counts[s.Name] = s.Value
	}
	if counts["finished"] != 1 || counts["almost"] != 2 || counts["abandoned"] != 1 || counts["skipped"] != 0 {
		t.Fatalf("segments=%v", counts)
	}
}

func TestGranularAndNetworkKeepShortSessionsAndRoundAfterSumming(t *testing.T) {
	db := statsDB(t)
	for _, q := range []string{`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','js','One','http://one')`, `INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","durationMs") VALUES('m','s','jm','Movie','Movie',600000)`} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	at := time.Now().UTC().Format(time.RFC3339Nano)
	for i := 0; i < 4; i++ {
		if _, err := db.Exec(`INSERT INTO "PlaybackHistory"("id","serverId","mediaId","playMethod","durationWatched","startedAt","endedAt","clientName","deviceName","audioLanguage","audioCodec","subtitleCodec") VALUES(?,'s','m','Transcode',10,?,?,'Browser','Living room','fre','aac','ass')`, i, at, at); err != nil {
			t.Fatal(err)
		}
	}
	f := DashboardFilter{TimeRange: "7d"}
	g, err := GetGranularAnalysis(context.Background(), db, "sqlite", f)
	if err != nil {
		t.Fatal(err)
	}
	if len(g.DailyData) == 0 {
		t.Fatal("daily data missing")
	}
	var measured float64
	for _, d := range g.DailyData {
		measured += d["totalDuration"].(float64)
	}
	if measured != 0.01 {
		t.Fatalf("rounded cumulative hours=%v", measured)
	}
	var plays int64
	for _, h := range g.HourlyData {
		plays += h.Plays
	}
	if plays != 4 {
		t.Fatalf("short sessions=%d", plays)
	}
	n, err := GetNetworkAnalysis(context.Background(), db, "sqlite", f)
	if err != nil {
		t.Fatal(err)
	}
	if n.Stats.TotalSessions != 4 {
		t.Fatalf("network=%+v", n.Stats)
	}
	d, err := GetFullDashboard(context.Background(), db, "sqlite", f)
	if err != nil {
		t.Fatal(err)
	}
	if d.TotalPlays != 0 {
		t.Fatalf("dashboard zapping policy=%d", d.TotalPlays)
	}
}
