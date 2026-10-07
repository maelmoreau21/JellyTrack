// Package scheduler provides background task execution for synchronization, backups, session integrity, and retention.
package scheduler

import (
	"context"
	"database/sql"
	"log/slog"
	"os"
	"sync"
	"time"

	"github.com/maelmoreau21/jellytrack/v3/internal/backup"
	"github.com/maelmoreau21/jellytrack/v3/internal/cleanup"
	"github.com/maelmoreau21/jellytrack/v3/internal/jellyfin"
)

type Config struct {
	RecentSyncEveryHours     int
	FullSyncEveryHours       int
	BackupEveryHours         int
	IntegrityCheckEveryHours int
	TelemetryRetentionDays   int
	ConsolidationWindowMin   int
}

type Runner struct {
	db     *sql.DB
	driver string
	logger *slog.Logger
	cfg    Config
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

func DefaultConfig() Config {
	return Config{
		RecentSyncEveryHours:     6,
		FullSyncEveryHours:       48,
		BackupEveryHours:         24,
		IntegrityCheckEveryHours: 6,
		TelemetryRetentionDays:   90,
		ConsolidationWindowMin:   60,
	}
}

func New(db *sql.DB, driver string, logger *slog.Logger, cfg Config) *Runner {
	if cfg.RecentSyncEveryHours <= 0 {
		cfg.RecentSyncEveryHours = 6
	}
	if cfg.FullSyncEveryHours <= 0 {
		cfg.FullSyncEveryHours = 48
	}
	if cfg.BackupEveryHours <= 0 {
		cfg.BackupEveryHours = 24
	}
	if cfg.IntegrityCheckEveryHours <= 0 {
		cfg.IntegrityCheckEveryHours = 6
	}
	if cfg.TelemetryRetentionDays <= 0 {
		cfg.TelemetryRetentionDays = 90
	}
	if cfg.ConsolidationWindowMin <= 0 {
		cfg.ConsolidationWindowMin = 60
	}
	return &Runner{
		db:     db,
		driver: driver,
		logger: logger,
		cfg:    cfg,
	}
}

// Start launches the background loops.
func (r *Runner) Start(ctx context.Context) {
	ctx, cancel := context.WithCancel(ctx)
	r.cancel = cancel

	r.logger.Info("starting background scheduler",
		"recent_sync_hours", r.cfg.RecentSyncEveryHours,
		"full_sync_hours", r.cfg.FullSyncEveryHours,
		"backup_hours", r.cfg.BackupEveryHours,
		"integrity_hours", r.cfg.IntegrityCheckEveryHours,
	)

	// 1. Recent sync ticker
	r.startTask(ctx, time.Duration(r.cfg.RecentSyncEveryHours)*time.Hour, "recent sync", func(ctx context.Context) {
		r.runSync(ctx, true)
	})

	// 2. Full sync ticker
	r.startTask(ctx, time.Duration(r.cfg.FullSyncEveryHours)*time.Hour, "full sync", func(ctx context.Context) {
		r.runSync(ctx, false)
	})

	// 3. Auto backup ticker
	r.startTask(ctx, time.Duration(r.cfg.BackupEveryHours)*time.Hour, "auto backup", func(ctx context.Context) {
		r.runBackup(ctx)
	})

	// 4. Integrity check ticker
	r.startTask(ctx, time.Duration(r.cfg.IntegrityCheckEveryHours)*time.Hour, "integrity cleanup", func(ctx context.Context) {
		deleted, closed, err := cleanup.CleanupOrphanedSessions(ctx, r.db, r.driver, 600)
		if err != nil {
			r.logger.Error("integrity cleanup failed", "error", err)
		} else {
			r.logger.Info("integrity cleanup completed", "deleted_streams", deleted, "closed_sessions", closed)
		}
	})

	// 5. Daily maintenance ticker (runs consolidation and retention at fixed intervals, e.g. every 24h)
	r.startTask(ctx, 24*time.Hour, "daily maintenance", func(ctx context.Context) {
		merged, pruned, err := cleanup.ConsolidatePlaybackHistory(ctx, r.db, r.driver, r.cfg.ConsolidationWindowMin)
		if err != nil {
			r.logger.Error("history consolidation failed", "error", err)
		} else {
			r.logger.Info("history consolidation completed", "merged_clusters", merged, "pruned_sessions", pruned)
		}

		deletedTel, err := cleanup.TelemetryRetention(ctx, r.db, r.driver, r.cfg.TelemetryRetentionDays)
		if err != nil {
			r.logger.Error("telemetry retention failed", "error", err)
		} else {
			r.logger.Info("telemetry retention completed", "deleted_events", deletedTel)
		}
	})
}

// Stop gracefully stops all scheduled tasks and waits for ongoing jobs to complete.
func (r *Runner) Stop() {
	if r.cancel != nil {
		r.cancel()
	}
	r.wg.Wait()
	r.logger.Info("scheduler stopped cleanly")
}

func (r *Runner) startTask(ctx context.Context, interval time.Duration, name string, task func(context.Context)) {
	r.wg.Add(1)
	go func() {
		defer r.wg.Done()
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				r.logger.Info("executing scheduled task", "task", name)
				task(ctx)
			}
		}
	}()
}

func (r *Runner) runSync(ctx context.Context, recentOnly bool) {
	baseURL := os.Getenv("JELLYFIN_URL")
	apiKey := os.Getenv("JELLYFIN_API_KEY")
	if baseURL == "" || apiKey == "" {
		return
	}
	syncCtx, cancel := context.WithTimeout(ctx, 30*time.Minute)
	defer cancel()

	res, err := jellyfin.SyncOne(syncCtx, r.db, r.driver, "", os.Getenv("JELLYFIN_SERVER_ID"), "Jellyfin", baseURL, apiKey, recentOnly)
	if err != nil {
		r.logger.Error("scheduled sync failed", "recent_only", recentOnly, "error", err)
	} else {
		r.logger.Info("scheduled sync succeeded", "recent_only", recentOnly, "media_count", res.Media, "user_count", res.Users)
	}
}

func (r *Runner) runBackup(ctx context.Context) {
	bDir, err := backup.GetBackupDirectory()
	if err != nil {
		r.logger.Error("scheduled backup failed: cannot resolve backup directory", "error", err)
		return
	}
	backupCtx, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()

	fileName, err := backup.TriggerAutoBackup(backupCtx, r.db, r.driver, bDir, "auto")
	if err != nil {
		r.logger.Error("scheduled backup failed", "error", err)
	} else {
		r.logger.Info("scheduled backup created", "file_name", fileName)
	}
}
