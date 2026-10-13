package stats

import (
	"context"
	"fmt"
	"path/filepath"
	"testing"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/config"
	"github.com/maelmoreau21/jellytrack/internal/database"
)

func BenchmarkDashboardLargeHistory(b *testing.B) {
	ctx := context.Background()
	db, err := database.Open(ctx, config.Config{DatabaseDriver: "sqlite", DatabasePath: filepath.Join(b.TempDir(), "benchmark.db")})
	if err != nil {
		b.Fatal(err)
	}
	defer db.Close()
	for _, q := range []string{`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','j','Fixture','http://fixture')`, `INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s','ju','Alice')`, `INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","durationMs","libraryName") VALUES('m','s','jm','Film','Movie',600000,'Films')`} {
		if _, err = db.Exec(q); err != nil {
			b.Fatal(err)
		}
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		b.Fatal(err)
	}
	statement, err := tx.Prepare(`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","durationWatched","startedAt","endedAt","playMethod","clientName") VALUES(?,'s','u','m',600,?,?,'DirectPlay','Web')`)
	if err != nil {
		b.Fatal(err)
	}
	first := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	for i := 0; i < 10000; i++ {
		date := first.Add(time.Duration(i) * time.Hour)
		if _, err = statement.Exec(fmt.Sprint(i), date.Format(time.RFC3339Nano), date.Add(10*time.Minute).Format(time.RFC3339Nano)); err != nil {
			b.Fatal(err)
		}
	}
	statement.Close()
	if err = tx.Commit(); err != nil {
		b.Fatal(err)
	}
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		result, err := GetFullDashboard(ctx, db, "sqlite", DashboardFilter{TimeRange: "all"})
		if err != nil || result.TotalPlays != 10000 {
			b.Fatalf("incorrect benchmark totals: %d %v", result.TotalPlays, err)
		}
	}
}
