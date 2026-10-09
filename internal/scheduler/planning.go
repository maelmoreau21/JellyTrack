package scheduler

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type planning struct {
	Config
	syncHour, syncMinute, backupHour, backupMinute int
}

func (r *Runner) readPlanning(ctx context.Context) (planning, error) {
	p := planning{Config: r.cfg}
	var raw sql.NullString
	err := r.db.QueryRowContext(ctx, `SELECT "resolutionThresholds","syncCronHour","syncCronMinute","backupCronHour","backupCronMinute" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&raw, &p.syncHour, &p.syncMinute, &p.backupHour, &p.backupMinute)
	if err == sql.ErrNoRows {
		return p, nil
	}
	if err != nil {
		return p, err
	}
	var stored struct {
		Intervals map[string]int `json:"schedulerIntervals"`
	}
	if raw.Valid && raw.String != "" {
		if err = json.Unmarshal([]byte(raw.String), &stored); err != nil {
			return p, err
		}
	}
	for key, value := range stored.Intervals {
		switch key {
		case "recentSyncEveryHours":
			if value >= 1 && value <= 168 {
				p.RecentSyncEveryHours = value
			}
		case "fullSyncEveryHours":
			if value >= 24 && value <= 168 && value%24 == 0 {
				p.FullSyncEveryHours = value
			}
		case "backupEveryHours":
			if value >= 1 && value <= 168 {
				p.BackupEveryHours = value
			}
		case "integrityCheckEveryHours":
			if value >= 1 && value <= 168 {
				p.IntegrityCheckEveryHours = value
			}
		case "logRetentionDays":
			if value >= 0 && value <= 365 {
				p.LogRetentionDays = value
			}
		}
	}
	return p, nil
}

// Match main's buildEveryHoursCron calendar expressions, including its 12h
// fallback for intervals above 24h that are not multiples of 24.
func planningDue(now time.Time, name string, p planning, fallback time.Duration) bool {
	now = now.UTC()
	if name == "daily maintenance" {
		return now.Hour() == 3 && now.Minute() == 45
	}
	if name == "log retention" {
		return now.Hour() == 4 && now.Minute() == 0
	}
	hours := int(fallback / time.Hour)
	hour, minute := p.syncHour, p.syncMinute
	switch name {
	case "recent sync":
		hours = p.RecentSyncEveryHours
	case "full sync":
		hours = p.FullSyncEveryHours
	case "auto backup":
		hours = p.BackupEveryHours
		hour, minute = p.backupHour, p.backupMinute
	case "integrity cleanup":
		hours = p.IntegrityCheckEveryHours
	}
	if now.Minute() != minute {
		return false
	}
	if hours <= 1 {
		return true
	}
	if hours < 24 {
		return now.Hour()%hours == 0
	}
	if hours == 24 {
		return now.Hour() == hour
	}
	if hours%24 == 0 {
		return now.Hour() == hour && (now.Day()-1)%(hours/24) == 0
	}
	return now.Hour()%12 == 0
}

func (r *Runner) runLogRetention(ctx context.Context) {
	p, err := r.readPlanning(ctx)
	if err != nil {
		r.logger.Error("cannot read log retention", "error", err)
		return
	}
	if p.LogRetentionDays <= 0 {
		return
	}
	dir := os.Getenv("LOG_DIR")
	if dir == "" {
		dir = "logs"
	}
	deleted, err := removeExpiredLogs(dir, time.Now().AddDate(0, 0, -p.LogRetentionDays))
	if err != nil {
		r.logger.Error("log retention failed", "error", err)
	} else {
		r.logger.Info("log retention completed", "deleted_files", deleted)
	}
}

func removeExpiredLogs(dir string, cutoff time.Time) (int, error) {
	root, err := filepath.Abs(dir)
	if err != nil {
		return 0, err
	}
	entries, err := os.ReadDir(root)
	if os.IsNotExist(err) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	deleted := 0
	for _, entry := range entries {
		if entry.Type()&os.ModeSymlink != 0 || entry.IsDir() || strings.ToLower(filepath.Ext(entry.Name())) != ".log" {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			return deleted, err
		}
		if !info.Mode().IsRegular() || !info.ModTime().Before(cutoff) {
			continue
		}
		path := filepath.Join(root, entry.Name())
		rel, err := filepath.Rel(root, path)
		if err != nil || strings.HasPrefix(rel, "..") || filepath.IsAbs(rel) {
			return deleted, fmt.Errorf("log path outside directory")
		}
		if err = os.Remove(path); err != nil {
			return deleted, err
		}
		deleted++
	}
	return deleted, nil
}
