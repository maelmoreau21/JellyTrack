package scheduler

import (
	"context"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/config"
	"github.com/maelmoreau21/jellytrack/internal/database"
)

func TestSavedPlanningChangesRunningScheduleWithoutRestart(t *testing.T) {
	db, err := database.Open(context.Background(), config.Config{DatabaseDriver: "sqlite", DatabasePath: filepath.Join(t.TempDir(), "planning.db")})
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	r := New(db, "sqlite", slog.New(slog.NewTextHandler(io.Discard, nil)), DefaultConfig())
	db.Exec(`INSERT INTO "GlobalSettings"("id","resolutionThresholds","syncCronHour","syncCronMinute") VALUES('global','{"schedulerIntervals":{"recentSyncEveryHours":6,"fullSyncEveryHours":48,"logRetentionDays":0}}',2,15)`)
	first, err := r.readPlanning(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	at := time.Date(2026, 10, 9, 6, 15, 0, 0, time.UTC)
	if !planningDue(at, "recent sync", first, 6*time.Hour) {
		t.Fatal("original schedule not due")
	}
	db.Exec(`UPDATE "GlobalSettings" SET "resolutionThresholds"='{"schedulerIntervals":{"recentSyncEveryHours":12,"logRetentionDays":7}}'`)
	next, err := r.readPlanning(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if planningDue(at, "recent sync", next, 6*time.Hour) || !planningDue(at.Add(6*time.Hour), "recent sync", next, 6*time.Hour) || next.LogRetentionDays != 7 {
		t.Fatal("saved configuration did not change due jobs")
	}
	if !planningDue(time.Date(2026, 10, 9, 3, 45, 0, 0, time.UTC), "daily maintenance", next, 24*time.Hour) || planningDue(at, "daily maintenance", next, 24*time.Hour) {
		t.Fatal("nightly consolidation time differs from main")
	}
}

func TestLogRetentionOnlyRemovesOldLogsInsideTestDirectory(t *testing.T) {
	dir := t.TempDir()
	now := time.Now()
	cutoff := now.AddDate(0, 0, -30)
	for _, name := range []string{"old.log", "recent.log", "data.db"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("QA"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	for _, name := range []string{"old.log", "data.db"} {
		os.Chtimes(filepath.Join(dir, name), cutoff.Add(-time.Hour), cutoff.Add(-time.Hour))
	}
	count, err := removeExpiredLogs(dir, cutoff)
	if err != nil || count != 1 {
		t.Fatalf("retention=%d err=%v", count, err)
	}
	for _, name := range []string{"recent.log", "data.db"} {
		if _, err := os.Stat(filepath.Join(dir, name)); err != nil {
			t.Fatal("nonexpired/nonlog file removed")
		}
	}
}
