package stats

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/config"
	"github.com/maelmoreau21/jellytrack/internal/database"
)

func statsDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := database.Open(context.Background(), config.Config{DatabaseDriver: "sqlite", DatabasePath: filepath.Join(t.TempDir(), "stats.db")})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func TestCategorizeClient(t *testing.T) {
	tests := []struct {
		client string
		expect string
	}{
		{"Jellyfin Web", "Web"},
		{"Firefox", "Web"},
		{"Android TV", "TV"},
		{"Apple TV", "TV"},
		{"Kodi", "TV"},
		{"Findroid", "Mobile"},
		{"iPhone", "Mobile"},
		{"Jellyfin Media Player", "Desktop"},
		{"Feishin", "Desktop"},
		{"Finamp", "Mobile"},
		{"SomethingElse", "Autre"},
	}
	for _, tc := range tests {
		got := CategorizeClient(tc.client)
		if got != tc.expect {
			t.Errorf("CategorizeClient(%q) = %q, want %q", tc.client, got, tc.expect)
		}
	}
}

func TestNormalizeResolution(t *testing.T) {
	tests := []struct {
		res    string
		expect string
	}{
		{"3840x2160", "4K"},
		{"4k", "4K"},
		{"1920x1080", "1080p"},
		{"1080p", "1080p"},
		{"720p", "720p"},
		{"480p", "SD"},
		{"", "Unknown"},
		{"directplay", "Unknown"},
	}
	for _, tc := range tests {
		got := NormalizeResolution(tc.res)
		if got != tc.expect {
			t.Errorf("NormalizeResolution(%q) = %q, want %q", tc.res, got, tc.expect)
		}
	}
}

func TestFullDashboardEmptyDatabaseResilience(t *testing.T) {
	db := statsDB(t)
	res, err := GetFullDashboard(context.Background(), db, "sqlite", DashboardFilter{TimeRange: "7d"})
	if err != nil {
		t.Fatalf("unexpected error on empty database: %v", err)
	}
	if res.TotalPlays != 0 {
		t.Errorf("expected 0 plays, got %d", res.TotalPlays)
	}
	if res.TotalUsers != 0 {
		t.Errorf("expected 0 users, got %d", res.TotalUsers)
	}
	if len(res.HourlyChartData) != 24 {
		t.Errorf("expected 24 hourly points, got %d", len(res.HourlyChartData))
	}
	if len(res.DayOfWeekChartData) != 7 {
		t.Errorf("expected 7 day of week points, got %d", len(res.DayOfWeekChartData))
	}
}

func TestFullDashboardPopulated(t *testing.T) {
	db := statsDB(t)
	now := time.Now().UTC()
	startStr := now.Add(-2 * time.Hour).Format(time.RFC3339Nano)

	for _, q := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s1','jf1','HomeServer','http://jf')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u1','s1','jfu1','Alice')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","durationMs","genres") VALUES('m1','s1','jfm1','Inception','Movie',7200000,'["Sci-Fi","Action"]')`,
		`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","clientName","durationWatched","startedAt") VALUES('p1','s1','u1','m1','DirectPlay','Android TV',3600,'` + startStr + `')`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatalf("setup failed on %s: %v", q, err)
		}
	}

	res, err := GetFullDashboard(context.Background(), db, "sqlite", DashboardFilter{TimeRange: "7d"})
	if err != nil {
		t.Fatalf("GetFullDashboard error: %v", err)
	}

	if res.TotalPlays != 1 {
		t.Errorf("expected 1 play, got %d", res.TotalPlays)
	}
	if res.HoursWatched != 1.0 {
		t.Errorf("expected 1.0h, got %f", res.HoursWatched)
	}
	if res.DirectPlayPercent != 100 {
		t.Errorf("expected 100%% direct play, got %d", res.DirectPlayPercent)
	}
	if res.Breakdown.MovieViews != 1 {
		t.Errorf("expected 1 movie view, got %d", res.Breakdown.MovieViews)
	}
	if len(res.TopUsers) != 1 || res.TopUsers[0].Username != "Alice" {
		t.Errorf("expected top user Alice, got %+v", res.TopUsers)
	}
	if len(res.PlatformChartData) != 1 || res.PlatformChartData[0].Name != "Android TV" {
		t.Errorf("expected platform Android TV, got %+v", res.PlatformChartData)
	}
	if len(res.ClientCategoryData) != 1 || res.ClientCategoryData[0].Category != "TV" {
		t.Errorf("expected TV category, got %+v", res.ClientCategoryData)
	}
}

func TestGranularAndNetworkAnalysis(t *testing.T) {
	db := statsDB(t)
	now := time.Now().UTC()
	startStr := now.Add(-3 * time.Hour).Format(time.RFC3339Nano)

	for _, q := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s1','jf1','HomeServer','http://jf')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u1','s1','jfu1','Bob')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","durationMs","resolution") VALUES('m1','s1','jfm1','Big Movie','Movie',7200000,'1080p')`,
		`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","clientName","durationWatched","startedAt","subtitleLanguage","subtitleCodec") VALUES('p1','s1','u1','m1','Transcode','Jellyfin Web',3600,'` + startStr + `','fre','ass')`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatalf("setup failed: %v", err)
		}
	}

	gran, err := GetGranularAnalysis(context.Background(), db, "sqlite", DashboardFilter{TimeRange: "7d"})
	if err != nil {
		t.Fatalf("GetGranularAnalysis error: %v", err)
	}
	if len(gran.HourlyData) != 24 {
		t.Errorf("expected 24 hourly items, got %d", len(gran.HourlyData))
	}

	netw, err := GetNetworkAnalysis(context.Background(), db, "sqlite", DashboardFilter{TimeRange: "7d"})
	if err != nil {
		t.Fatalf("GetNetworkAnalysis error: %v", err)
	}
	if netw.Stats.TranscodeSessions != 1 {
		t.Errorf("expected 1 transcode session, got %d", netw.Stats.TranscodeSessions)
	}
	if len(netw.CoupableTable) != 1 || netw.CoupableTable[0].MainReason != "subtitlesBurnIn" {
		t.Errorf("expected subtitlesBurnIn reason, got %+v", netw.CoupableTable)
	}
}
