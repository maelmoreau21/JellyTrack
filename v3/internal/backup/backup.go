// Package backup provides secure database export and restoration in ZIP and JSON formats.
package backup

import (
	"archive/zip"
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/maelmoreau21/jellytrack/v3/internal/database"
)

const (
	DefaultMaxBackupImportBytes = 100 * 1024 * 1024 // 100MB max decompressed limit
	MaxRetainedBackups          = 10
)

var autoBackupFilePattern = regexp.MustCompile(`^JellyTrack-(auto|manuelle|manual)-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.(zip|json)$`)

type ExportData struct {
	Servers         []map[string]any `json:"servers"`
	Users           []map[string]any `json:"users"`
	Media           []map[string]any `json:"media"`
	PlaybackHistory []map[string]any `json:"playbackHistory"`
	TelemetryEvents []map[string]any `json:"telemetryEvents"`
	DailyStats      []map[string]any `json:"dailyStats"`
	AdminAuditLogs  []map[string]any `json:"adminAuditLogs"`
	Settings        map[string]any   `json:"settings"`
	SystemHealth    map[string]any   `json:"systemHealth,omitempty"`
}

type Manifest struct {
	Generator  string         `json:"generator"`
	Version    string         `json:"version"`
	Format     string         `json:"format"`
	ExportDate string         `json:"exportDate"`
	Tables     map[string]int `json:"tables"`
}

// CreateZipBackup dumps all database tables and produces an in-memory ZIP buffer.
func CreateZipBackup(ctx context.Context, db *sql.DB, driver string) ([]byte, error) {
	data, err := fetchExportData(ctx, db, driver)
	if err != nil {
		return nil, fmt.Errorf("fetch export data: %w", err)
	}

	manifest := Manifest{
		Generator:  "JellyTrack Backup Engine v3.0",
		Version:    "3.0",
		Format:     "zip-json",
		ExportDate: time.Now().UTC().Format(time.RFC3339Nano),
		Tables: map[string]int{
			"servers":         len(data.Servers),
			"users":           len(data.Users),
			"media":           len(data.Media),
			"playbackHistory": len(data.PlaybackHistory),
			"telemetryEvents": len(data.TelemetryEvents),
			"dailyStats":      len(data.DailyStats),
			"adminAuditLogs":  len(data.AdminAuditLogs),
		},
	}

	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)

	// 1. manifest.json
	manBytes, _ := json.MarshalIndent(manifest, "", "  ")
	if err := addZipFile(zw, "manifest.json", manBytes); err != nil {
		return nil, err
	}

	// 2. database.json
	dbContent := map[string]any{
		"servers":         data.Servers,
		"users":           data.Users,
		"media":           data.Media,
		"playbackHistory": data.PlaybackHistory,
		"telemetryEvents": data.TelemetryEvents,
		"dailyStats":      data.DailyStats,
		"adminAuditLogs":  data.AdminAuditLogs,
	}
	dbBytes, _ := json.MarshalIndent(dbContent, "", "  ")
	if err := addZipFile(zw, "database.json", dbBytes); err != nil {
		return nil, err
	}

	// 3. settings.json
	setBytes, _ := json.MarshalIndent(map[string]any{
		"version":      "3.0",
		"exportDate":   manifest.ExportDate,
		"settings":     data.Settings,
		"systemHealth": data.SystemHealth,
	}, "", "  ")
	if err := addZipFile(zw, "settings.json", setBytes); err != nil {
		return nil, err
	}

	// 4. database.sql (summary commentary and SQL)
	sqlBuf := new(bytes.Buffer)
	fmt.Fprintf(sqlBuf, "-- JellyTrack Backup SQL Dump v3.0\n-- Exported At: %s\n\n", manifest.ExportDate)
	if err := addZipFile(zw, "database.sql", sqlBuf.Bytes()); err != nil {
		return nil, err
	}

	if err := zw.Close(); err != nil {
		return nil, err
	}

	return buf.Bytes(), nil
}

func addZipFile(zw *zip.Writer, name string, content []byte) error {
	w, err := zw.Create(name)
	if err != nil {
		return err
	}
	_, err = w.Write(content)
	return err
}

func fetchExportData(ctx context.Context, db *sql.DB, driver string) (*ExportData, error) {
	out := &ExportData{
		Servers:         []map[string]any{},
		Users:           []map[string]any{},
		Media:           []map[string]any{},
		PlaybackHistory: []map[string]any{},
		TelemetryEvents: []map[string]any{},
		DailyStats:      []map[string]any{},
		AdminAuditLogs:  []map[string]any{},
		Settings:        map[string]any{},
	}

	// Fetch servers
	sRows, err := db.QueryContext(ctx, `SELECT "id","jellyfinServerId","name","url","allowAuthFallback","isActive","createdAt","updatedAt" FROM "Server"`)
	if err == nil {
		for sRows.Next() {
			var id, jid, name, url, created, updated string
			var allow, active int
			if sRows.Scan(&id, &jid, &name, &url, &allow, &active, &created, &updated) == nil {
				out.Servers = append(out.Servers, map[string]any{"id": id, "jellyfinServerId": jid, "name": name, "url": url, "allowAuthFallback": allow == 1, "isActive": active == 1, "createdAt": created, "updatedAt": updated})
			}
		}
		sRows.Close()
	}

	// Fetch users
	uRows, err := db.QueryContext(ctx, `SELECT "id","serverId","jellyfinUserId","username","isActive","lastActive","createdAt","updatedAt" FROM "User"`)
	if err == nil {
		for uRows.Next() {
			var id, sid, jid, uname, created, updated string
			var active int
			var lastActive sql.NullString
			if uRows.Scan(&id, &sid, &jid, &uname, &active, &lastActive, &created, &updated) == nil {
				out.Users = append(out.Users, map[string]any{"id": id, "serverId": sid, "jellyfinUserId": jid, "username": uname, "isActive": active == 1, "lastActive": lastActive.String, "createdAt": created, "updatedAt": updated})
			}
		}
		uRows.Close()
	}

	// Fetch media
	mRows, err := db.QueryContext(ctx, `SELECT "id","serverId","jellyfinMediaId","title","type","collectionType","libraryName","genres","resolution","durationMs","size","directors","actors","studios","parentId","artist","dateAdded","createdAt","updatedAt" FROM "Media"`)
	if err == nil {
		for mRows.Next() {
			var id, sid, jid, title, mType, genres, directors, actors, studios, created, updated string
			var coll, lib, res, parent, artist, dateAdded sql.NullString
			var dur, sz sql.NullInt64
			if mRows.Scan(&id, &sid, &jid, &title, &mType, &coll, &lib, &genres, &res, &dur, &sz, &directors, &actors, &studios, &parent, &artist, &dateAdded, &created, &updated) == nil {
				out.Media = append(out.Media, map[string]any{
					"id": id, "serverId": sid, "jellyfinMediaId": jid, "title": title, "type": mType,
					"collectionType": coll.String, "libraryName": lib.String, "genres": parseJSONList(genres),
					"resolution": res.String, "durationMs": dur.Int64, "size": sz.Int64,
					"directors": parseJSONList(directors), "actors": parseJSONList(actors), "studios": parseJSONList(studios),
					"parentId": parent.String, "artist": artist.String, "dateAdded": dateAdded.String,
					"createdAt": created, "updatedAt": updated,
				})
			}
		}
		mRows.Close()
	}

	// Fetch playback history
	pRows, err := db.QueryContext(ctx, `SELECT "id","serverId","userId","mediaId","playMethod","eventSource","sourceEventId","clientName","deviceName","ipAddress","country","city","durationWatched","startedAt","endedAt","audioLanguage","audioCodec","subtitleLanguage","subtitleCodec","bitrate","pauseCount","audioChanges","subtitleChanges","seekCount","rewatchCount","speedChangeCount","maxPlaybackRate" FROM "PlaybackHistory"`)
	if err == nil {
		for pRows.Next() {
			var id, sid, mid, playMethod, eventSource, started string
			var uid, sourceEventId, clientName, deviceName, ip, country, city, ended, audioLang, audioCodec, subLang, subCodec sql.NullString
			var dur int64
			var bitrate, pauses, audioChg, subChg, seeks, rewatches, speedChg sql.NullInt64
			var maxRate sql.NullFloat64
			if pRows.Scan(&id, &sid, &uid, &mid, &playMethod, &eventSource, &sourceEventId, &clientName, &deviceName, &ip, &country, &city, &dur, &started, &ended, &audioLang, &audioCodec, &subLang, &subCodec, &bitrate, &pauses, &audioChg, &subChg, &seeks, &rewatches, &speedChg, &maxRate) == nil {
				out.PlaybackHistory = append(out.PlaybackHistory, map[string]any{
					"id": id, "serverId": sid, "userId": uid.String, "mediaId": mid, "playMethod": playMethod,
					"eventSource": eventSource, "sourceEventId": sourceEventId.String, "clientName": clientName.String,
					"deviceName": deviceName.String, "ipAddress": ip.String, "country": country.String, "city": city.String,
					"durationWatched": dur, "startedAt": started, "endedAt": ended.String,
					"audioLanguage": audioLang.String, "audioCodec": audioCodec.String,
					"subtitleLanguage": subLang.String, "subtitleCodec": subCodec.String,
					"bitrate": bitrate.Int64, "pauseCount": pauses.Int64, "audioChanges": audioChg.Int64,
					"subtitleChanges": subChg.Int64, "seekCount": seeks.Int64, "rewatchCount": rewatches.Int64,
					"speedChangeCount": speedChg.Int64, "maxPlaybackRate": maxRate.Float64,
				})
			}
		}
		pRows.Close()
	}

	// Fetch settings
	var discordUrl, discordCond, defLocale, timeFmt, exclLibs sql.NullString
	var alertsEnabled, maxTranscodes, syncH, syncM, bH, bM, wrapVis, wrapPer, wrapSM, wrapSD, wrapEM, wrapED int
	err = db.QueryRowContext(ctx, `SELECT "discordWebhookUrl","discordAlertCondition","discordAlertsEnabled","maxConcurrentTranscodes","excludedLibraries","syncCronHour","syncCronMinute","backupCronHour","backupCronMinute","defaultLocale","timeFormat","wrappedVisible","wrappedPeriodEnabled","wrappedStartMonth","wrappedStartDay","wrappedEndMonth","wrappedEndDay" FROM "GlobalSettings" WHERE "id" = 'global'`).Scan(
		&discordUrl, &discordCond, &alertsEnabled, &maxTranscodes, &exclLibs, &syncH, &syncM, &bH, &bM, &defLocale, &timeFmt, &wrapVis, &wrapPer, &wrapSM, &wrapSD, &wrapEM, &wrapED)
	if err == nil {
		out.Settings = map[string]any{
			"discordWebhookUrl":       discordUrl.String,
			"discordAlertCondition":   discordCond.String,
			"discordAlertsEnabled":    alertsEnabled == 1,
			"maxConcurrentTranscodes": maxTranscodes,
			"excludedLibraries":       parseJSONList(exclLibs.String),
			"syncCronHour":            syncH,
			"syncCronMinute":          syncM,
			"backupCronHour":          bH,
			"backupCronMinute":        bM,
			"defaultLocale":           defLocale.String,
			"timeFormat":              timeFmt.String,
			"wrappedVisible":          wrapVis == 1,
			"wrappedPeriodEnabled":    wrapPer == 1,
			"wrappedStartMonth":       wrapSM,
			"wrappedStartDay":         wrapSD,
			"wrappedEndMonth":         wrapEM,
			"wrappedEndDay":           wrapED,
		}
	}

	return out, nil
}

// RestoreBackupBuffer safely restores a ZIP or JSON backup into the database.
func RestoreBackupBuffer(ctx context.Context, db *sql.DB, driver string, buffer []byte, maxBytes int64) (string, error) {
	if maxBytes <= 0 {
		maxBytes = DefaultMaxBackupImportBytes
	}
	if int64(len(buffer)) > maxBytes {
		return "", errors.New("backup payload too large")
	}

	// Attempt ZIP extraction
	zr, err := zip.NewReader(bytes.NewReader(buffer), int64(len(buffer)))
	if err == nil {
		return restoreZip(ctx, db, driver, zr, maxBytes)
	}

	// Fallback to raw JSON
	return restoreJSON(ctx, db, driver, buffer)
}

func restoreZip(ctx context.Context, db *sql.DB, driver string, zr *zip.Reader, maxBytes int64) (string, error) {
	var dbBytes, setBytes []byte
	var totalExtracted int64

	for _, file := range zr.File {
		cleanName := filepath.Clean(file.Name)
		// Security: Prevent Zip Slip / Path Traversal
		if strings.HasPrefix(cleanName, "..") || strings.HasPrefix(cleanName, "/") || strings.HasPrefix(cleanName, "\\") {
			return "", fmt.Errorf("zip entry path traversal rejected: %s", file.Name)
		}

		if cleanName == "database.json" || cleanName == "settings.json" {
			rc, err := file.Open()
			if err != nil {
				return "", err
			}
			lr := io.LimitReader(rc, maxBytes-totalExtracted+1)
			data, err := io.ReadAll(lr)
			rc.Close()
			if err != nil {
				return "", err
			}
			totalExtracted += int64(len(data))
			if totalExtracted > maxBytes {
				return "", errors.New("uncompressed zip contents exceed size limit")
			}
			if cleanName == "database.json" {
				dbBytes = data
			} else {
				setBytes = data
			}
		}
	}

	if len(dbBytes) == 0 && len(setBytes) == 0 {
		return "", errors.New("invalid backup archive: missing database.json or settings.json")
	}

	var parsedDB map[string]any
	if len(dbBytes) > 0 {
		if err := json.Unmarshal(dbBytes, &parsedDB); err != nil {
			return "", fmt.Errorf("invalid database.json in zip: %w", err)
		}
	}

	var parsedSet map[string]any
	if len(setBytes) > 0 {
		_ = json.Unmarshal(setBytes, &parsedSet)
	}

	if err := applyRestoration(ctx, db, driver, parsedDB, parsedSet); err != nil {
		return "", err
	}

	return "zip", nil
}

func restoreJSON(ctx context.Context, db *sql.DB, driver string, buffer []byte) (string, error) {
	var raw map[string]any
	if err := json.Unmarshal(buffer, &raw); err != nil {
		return "", errors.New("invalid backup format: must be valid ZIP or JSON")
	}

	candidate := raw
	if dataMap, ok := raw["data"].(map[string]any); ok {
		candidate = dataMap
	}

	if err := applyRestoration(ctx, db, driver, candidate, candidate); err != nil {
		return "", err
	}
	return "json", nil
}

func applyRestoration(ctx context.Context, db *sql.DB, driver string, dbData map[string]any, setData map[string]any) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// 1. Truncate / Delete in reverse foreign key order
	tables := []string{
		"ActiveStream", "TelemetryEvent", "PlaybackHistory", "DailyStats",
		"Media", "User", "Server", "AdminAuditLog", "SystemHealthEvent", "SystemHealthState",
	}
	for _, tbl := range tables {
		if _, err := tx.ExecContext(ctx, fmt.Sprintf(`DELETE FROM "%s"`, tbl)); err != nil {
			return fmt.Errorf("clear table %s: %w", tbl, err)
		}
	}

	// 2. Insert Servers
	if rawServers, ok := dbData["servers"].([]any); ok {
		for _, s := range rawServers {
			if m, ok := s.(map[string]any); ok {
				id, _ := m["id"].(string)
				jid, _ := m["jellyfinServerId"].(string)
				name, _ := m["name"].(string)
				url, _ := m["url"].(string)
				if id == "" {
					continue
				}
				if jid == "" {
					jid = id
				}
				if name == "" {
					name = "Imported Server"
				}
				_, _ = tx.ExecContext(ctx, database.Bind(`INSERT INTO "Server" ("id","jellyfinServerId","name","url") VALUES (?,?,?,?)`, driver), id, jid, name, url)
			}
		}
	}

	// 3. Insert Users
	if rawUsers, ok := dbData["users"].([]any); ok {
		for _, u := range rawUsers {
			if m, ok := u.(map[string]any); ok {
				id, _ := m["id"].(string)
				sid, _ := m["serverId"].(string)
				jid, _ := m["jellyfinUserId"].(string)
				username, _ := m["username"].(string)
				if id == "" || sid == "" {
					continue
				}
				if jid == "" {
					jid = id
				}
				if username == "" {
					username = "User"
				}
				_, _ = tx.ExecContext(ctx, database.Bind(`INSERT INTO "User" ("id","serverId","jellyfinUserId","username") VALUES (?,?,?,?)`, driver), id, sid, jid, username)
			}
		}
	}

	// 4. Insert Media
	if rawMedia, ok := dbData["media"].([]any); ok {
		for _, med := range rawMedia {
			if m, ok := med.(map[string]any); ok {
				id, _ := m["id"].(string)
				sid, _ := m["serverId"].(string)
				jid, _ := m["jellyfinMediaId"].(string)
				title, _ := m["title"].(string)
				mType, _ := m["type"].(string)
				lib, _ := m["libraryName"].(string)
				dur, _ := m["durationMs"].(float64)
				if id == "" || sid == "" {
					continue
				}
				if jid == "" {
					jid = id
				}
				if mType == "" {
					mType = "Unknown"
				}
				_, _ = tx.ExecContext(ctx, database.Bind(`INSERT INTO "Media" ("id","serverId","jellyfinMediaId","title","type","libraryName","durationMs") VALUES (?,?,?,?,?,?,?)`, driver), id, sid, jid, title, mType, lib, int64(dur))
			}
		}
	}

	// 5. Insert PlaybackHistory
	if rawHistory, ok := dbData["playbackHistory"].([]any); ok {
		for _, h := range rawHistory {
			if m, ok := h.(map[string]any); ok {
				id, _ := m["id"].(string)
				sid, _ := m["serverId"].(string)
				uid, _ := m["userId"].(string)
				mid, _ := m["mediaId"].(string)
				playMethod, _ := m["playMethod"].(string)
				started, _ := m["startedAt"].(string)
				dur, _ := m["durationWatched"].(float64)
				if id == "" || sid == "" || mid == "" {
					continue
				}
				if playMethod == "" {
					playMethod = "DirectPlay"
				}
				if started == "" {
					started = time.Now().UTC().Format(time.RFC3339Nano)
				}
				var uVal any
				if uid != "" {
					uVal = uid
				}
				_, _ = tx.ExecContext(ctx, database.Bind(`INSERT INTO "PlaybackHistory" ("id","serverId","userId","mediaId","playMethod","startedAt","durationWatched") VALUES (?,?,?,?,?,?,?)`, driver), id, sid, uVal, mid, playMethod, started, int64(dur))
			}
		}
	}

	// 6. Update Settings if provided
	if sObj, ok := setData["settings"].(map[string]any); ok && sObj != nil {
		exclJSON := "[]"
		if arr, ok := sObj["excludedLibraries"].([]any); ok {
			var strList []string
			for _, item := range arr {
				if s, ok := item.(string); ok && strings.TrimSpace(s) != "" {
					strList = append(strList, strings.TrimSpace(s))
				}
			}
			b, _ := json.Marshal(strList)
			exclJSON = string(b)
		}
		_, _ = tx.ExecContext(ctx, database.Bind(`UPDATE "GlobalSettings" SET "excludedLibraries" = ? WHERE "id" = 'global'`, driver), exclJSON)
	}

	return tx.Commit()
}

// Auto-Backup management functions

func GetBackupDirectory() (string, error) {
	configured := strings.TrimSpace(os.Getenv("BACKUP_DIR"))
	candidates := []string{
		configured,
		"/data/backups",
		"backups",
		filepath.Join(os.TempDir(), "jellytrack-backups"),
	}

	for _, c := range candidates {
		if c == "" {
			continue
		}
		if err := os.MkdirAll(c, 0755); err == nil {
			testFile := filepath.Join(c, fmt.Sprintf(".write-test-%d.tmp", time.Now().UnixNano()))
			if err := os.WriteFile(testFile, []byte("ok"), 0600); err == nil {
				_ = os.Remove(testFile)
				return filepath.Abs(c)
			}
		}
	}
	return "", errors.New("no writable backup directory found")
}

type BackupItem struct {
	Name   string `json:"name"`
	Type   string `json:"type"`
	Size   int64  `json:"size"`
	SizeMb string `json:"sizeMb"`
	Date   string `json:"date"`
}

func ListAutoBackups(backupDir string) ([]BackupItem, error) {
	entries, err := os.ReadDir(backupDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []BackupItem{}, nil
		}
		return nil, err
	}

	var items []BackupItem
	for _, entry := range entries {
		if entry.IsDir() || !autoBackupFilePattern.MatchString(entry.Name()) {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		kind := "manual"
		if strings.HasPrefix(entry.Name(), "JellyTrack-auto-") {
			kind = "auto"
		}
		items = append(items, BackupItem{
			Name:   entry.Name(),
			Type:   kind,
			Size:   info.Size(),
			SizeMb: fmt.Sprintf("%.2f", float64(info.Size())/1024/1024),
			Date:   info.ModTime().UTC().Format(time.RFC3339),
		})
	}

	sort.Slice(items, func(i, j int) bool {
		return items[i].Date > items[j].Date // newest first
	})
	return items, nil
}

func TriggerAutoBackup(ctx context.Context, db *sql.DB, driver, backupDir, mode string) (string, error) {
	if mode != "manuelle" && mode != "manual" {
		mode = "auto"
	}
	prefix := "JellyTrack-auto-"
	if mode == "manuelle" || mode == "manual" {
		prefix = "JellyTrack-manuelle-"
	}

	zipData, err := CreateZipBackup(ctx, db, driver)
	if err != nil {
		return "", err
	}

	now := time.Now().UTC()
	dateStr := now.Format("2006-01-02")
	timeStr := now.Format("15-04-05")
	fileName := fmt.Sprintf("%s%s_%s.zip", prefix, dateStr, timeStr)
	filePath := filepath.Join(backupDir, fileName)

	if err := os.WriteFile(filePath, zipData, 0600); err != nil {
		return "", err
	}

	// Rolling rotation: keep at most MaxRetainedBackups
	items, err := ListAutoBackups(backupDir)
	if err == nil && len(items) > MaxRetainedBackups {
		toDelete := items[MaxRetainedBackups:]
		for _, old := range toDelete {
			_ = os.Remove(filepath.Join(backupDir, old.Name))
		}
	}

	return fileName, nil
}

func ResolveAutoBackupFile(backupDir, fileName string) (string, error) {
	fileName = strings.TrimSpace(fileName)
	if !autoBackupFilePattern.MatchString(fileName) {
		return "", errors.New("invalid backup file name format")
	}
	if filepath.Base(fileName) != fileName {
		return "", errors.New("path traversal rejected")
	}

	absDir, err := filepath.Abs(backupDir)
	if err != nil {
		return "", err
	}
	absTarget, err := filepath.Abs(filepath.Join(absDir, fileName))
	if err != nil {
		return "", err
	}

	if filepath.Dir(absTarget) != absDir {
		return "", errors.New("path traversal rejected")
	}

	return absTarget, nil
}

func parseJSONList(s string) []string {
	var list []string
	if strings.TrimSpace(s) != "" {
		_ = json.Unmarshal([]byte(s), &list)
	}
	if list == nil {
		list = []string{}
	}
	return list
}
