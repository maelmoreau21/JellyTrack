package stats

import (
	"context"
	"testing"
	"time"
)

func TestAnalyticsHonorPeriodMediaAndServerFilters(t *testing.T) {
	db := statsDB(t)
	for _, query := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s1','jf1','One','http://one'),('s2','jf2','Two','http://two')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","durationMs") VALUES('m1','s1','jf1','Movie','Movie',3600000),('m2','s1','jf2','Episode','Episode',3600000),('m3','s2','jf3','Other','Movie',3600000)`,
	} {
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	now := time.Now().UTC()
	for i, row := range []struct {
		server, media string
		age           int
	}{{"s1", "m1", 2}, {"s1", "m1", 50}, {"s1", "m1", 400}, {"s1", "m2", 2}, {"s2", "m3", 2}} {
		_, err := db.Exec(`INSERT INTO "PlaybackHistory"("id","serverId","mediaId","playMethod","durationWatched","startedAt","endedAt") VALUES(?,?,?,'DirectPlay',1800,?,?)`, i, row.server, row.media, now.AddDate(0, 0, -row.age).Format(time.RFC3339), now.AddDate(0, 0, -row.age).Add(time.Hour).Format(time.RFC3339))
		if err != nil {
			t.Fatal(err)
		}
	}
	for _, tc := range []struct {
		name   string
		filter DashboardFilter
		want   int64
	}{
		{"7d", DashboardFilter{TimeRange: "7d", MediaType: "Movie", ServerIDs: []string{"s1"}}, 1},
		{"90d", DashboardFilter{TimeRange: "90d", MediaType: "Movie", ServerIDs: []string{"s1"}}, 2},
		{"365d", DashboardFilter{TimeRange: "365d", MediaType: "Movie", ServerIDs: []string{"s1"}}, 2},
		{"all", DashboardFilter{TimeRange: "all", MediaType: "Movie", ServerIDs: []string{"s1"}}, 3},
		{"series includes episodes", DashboardFilter{TimeRange: "all", MediaType: "Series", ServerIDs: []string{"s1"}}, 1},
		{"24h alias", DashboardFilter{TimeRange: "1d"}, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			network, err := GetNetworkAnalysis(context.Background(), db, "sqlite", tc.filter)
			if err != nil {
				t.Fatal(err)
			}
			if network.Stats.TotalSessions != tc.want {
				t.Fatalf("network=%d want %d", network.Stats.TotalSessions, tc.want)
			}
			granular, err := GetGranularAnalysis(context.Background(), db, "sqlite", tc.filter)
			if err != nil {
				t.Fatal(err)
			}
			var plays int64
			for _, point := range granular.HourlyData {
				plays += point.Plays
			}
			if plays != tc.want {
				t.Fatalf("granular=%d want %d", plays, tc.want)
			}
			deep, err := GetDetailedDeepInsights(context.Background(), db, "sqlite", tc.filter)
			if err != nil {
				t.Fatal(err)
			}
			var count int64
			for _, client := range deep.TopClients {
				count += client.Count
			}
			if count != tc.want {
				t.Fatalf("deep=%d want %d", count, tc.want)
			}
			if tc.filter.TimeRange == "all" && tc.filter.MediaType == "Series" {
				dashboard, err := GetFullDashboard(context.Background(), db, "sqlite", tc.filter)
				if err != nil {
					t.Fatal(err)
				}
				if dashboard.Media != 1 {
					t.Fatalf("catalog scope=%d", dashboard.Media)
				}
				var total int64
				for _, cell := range dashboard.YearlyHeatmap.DataByType["Series"] {
					total += cell.Count
				}
				if total != 1 {
					t.Fatalf("scoped yearly series=%d", total)
				}
				if _, exists := dashboard.YearlyHeatmap.DataByType["Movie"]; exists {
					t.Fatal("yearly map included another media family")
				}
			}
		})
	}
}

func TestCustomAnalyticsBoundsIncludeEndDayButExcludeNextMidnight(t *testing.T) {
	db := statsDB(t)
	for _, query := range []string{`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','jf','One','http://one')`, `INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type") VALUES('m','s','jf','Movie','Movie')`, `INSERT INTO "PlaybackHistory"("id","serverId","mediaId","playMethod","durationWatched","startedAt") VALUES('a','s','m','DirectPlay',1800,'2026-01-02T23:59:59Z'),('b','s','m','DirectPlay',1800,'2026-01-03T00:00:00Z')`} {
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	filter := DashboardFilter{TimeRange: "custom", From: "2026-01-02", To: "2026-01-02"}
	network, err := GetNetworkAnalysis(context.Background(), db, "sqlite", filter)
	if err != nil {
		t.Fatal(err)
	}
	if network.Stats.TotalSessions != 1 {
		t.Fatalf("network %+v", network.Stats)
	}
	dashboard, err := GetFullDashboard(context.Background(), db, "sqlite", filter)
	if err != nil {
		t.Fatal(err)
	}
	if dashboard.TotalPlays != 1 {
		t.Fatalf("dashboard plays %d", dashboard.TotalPlays)
	}
}
