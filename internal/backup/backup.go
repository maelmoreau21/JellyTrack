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
	"strconv"
	"strings"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/database"
)

const (
	DefaultMaxBackupImportBytes = 100 * 1024 * 1024 // 100MB max decompressed limit
	MaxRetainedBackups          = 10
)

var autoBackupFilePattern = regexp.MustCompile(`^JellyTrack-(auto|manuelle|manual)-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.(zip|json|jtb)$`)

type ExportData struct {
	PersonAccounts  []map[string]any `json:"personAccounts"`
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
	return createZipBackup(ctx, db, driver, false)
}

func createZipBackup(ctx context.Context, db *sql.DB, driver string, secrets bool) ([]byte, error) {
	data, err := fetchExportData(ctx, db, driver)
	if err != nil {
		return nil, fmt.Errorf("fetch export data: %w", err)
	}
	if !secrets {
		for _, server := range data.Servers {
			delete(server, "jellyfinApiKey")
		}
		redactSettings(data.Settings)
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
		"snapshotFormat":  1,
		"personAccounts":  data.PersonAccounts,
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
	isolation := sql.LevelSerializable
	if driver == "postgres" {
		isolation = sql.LevelRepeatableRead
	}
	tx, err := db.BeginTx(ctx, &sql.TxOptions{Isolation: isolation, ReadOnly: true})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	data := &ExportData{}
	destinations := []*[]map[string]any{&data.Servers, &data.Users, &data.Media, &data.PlaybackHistory, &data.TelemetryEvents, &data.DailyStats, &data.AdminAuditLogs, &data.PersonAccounts}
	for i, table := range snapshotTables {
		rows, err := exportSnapshotRows(ctx, tx, driver, table.table)
		if err != nil {
			return nil, fmt.Errorf("export %s: %w", table.table, err)
		}
		*destinations[i] = rows
	}
	data.Settings, err = exportGlobalSettings(ctx, tx, driver)
	if err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return data, nil
}

// RestoreBackupBuffer safely restores a ZIP or JSON backup into the database.
func RestoreBackupBuffer(ctx context.Context, db *sql.DB, driver string, buffer []byte, maxBytes int64) (string, error) {
	if maxBytes <= 0 {
		maxBytes = DefaultMaxBackupImportBytes
	}
	if int64(len(buffer)) > maxBytes {
		return "", errors.New("backup payload too large")
	}
	buffer, err := decryptBackup(buffer)
	if err != nil {
		return "", err
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
		if err := decodeBackupJSON(dbBytes, &parsedDB); err != nil {
			return "", fmt.Errorf("invalid database.json in zip: %w", err)
		}
	}

	var parsedSet map[string]any
	if len(setBytes) > 0 {
		if err := decodeBackupJSON(setBytes, &parsedSet); err != nil {
			return "", fmt.Errorf("invalid settings.json: %w", err)
		}
	}

	if err := applyRestoration(ctx, db, driver, parsedDB, parsedSet); err != nil {
		return "", err
	}

	return "zip", nil
}

func restoreJSON(ctx context.Context, db *sql.DB, driver string, buffer []byte) (string, error) {
	var raw map[string]any
	if err := decodeBackupJSON(buffer, &raw); err != nil {
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
	if version, ok := dbData["snapshotFormat"]; ok {
		if fmt.Sprint(version) != "1" {
			return errors.New("unsupported snapshot format")
		}
		return restoreSnapshot(ctx, db, driver, dbData, setData)
	}
	// A settings-only export must never clear playback data. Reject unrelated
	// JSON and malformed legacy tables before entering the destructive path.
	_, hasDatabase := dbData["servers"]
	if !hasDatabase {
		settings, ok := setData["settings"].(map[string]any)
		if !ok || len(settings) == 0 {
			return errors.New("invalid backup: missing database tables or settings")
		}
		for _, key := range []string{"users", "media", "playbackHistory", "telemetryEvents", "dailyStats", "adminAuditLogs", "personAccounts"} {
			if _, present := dbData[key]; present {
				return fmt.Errorf("invalid backup: %s without servers", key)
			}
		}
		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		defer tx.Rollback()
		if err := restoreGlobalSettings(ctx, tx, driver, settings); err != nil {
			return err
		}
		return tx.Commit()
	}
	for _, spec := range []struct {
		key      string
		required []string
	}{
		{"servers", []string{"id"}}, {"users", []string{"id", "serverId"}},
		{"media", []string{"id", "serverId"}}, {"playbackHistory", []string{"id", "serverId", "mediaId"}},
		{"telemetryEvents", []string{"id", "serverId", "playbackId"}}, {"dailyStats", []string{"id", "date"}},
		{"adminAuditLogs", []string{"id", "action"}}, {"personAccounts", []string{"accountId", "personId"}},
	} {
		raw, present := dbData[spec.key]
		if !present {
			continue
		}
		rows, ok := raw.([]any)
		if !ok {
			return fmt.Errorf("invalid backup table %s", spec.key)
		}
		for _, rawRow := range rows {
			row, ok := rawRow.(map[string]any)
			if !ok {
				return fmt.Errorf("invalid %s row", spec.key)
			}
			for _, key := range spec.required {
				if stringVal(row, key, "") == "" {
					return fmt.Errorf("invalid %s row: missing %s", spec.key, key)
				}
			}
		}
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// 1. Truncate / Delete in reverse foreign key order
	tables := []string{
		"AccountLinkProof", "PersonAccount", "AuthSession",
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
				id := stringVal(m, "id", "")
				if id == "" {
					continue
				}
				jid := stringVal(m, "jellyfinServerId", id)
				name := stringVal(m, "name", "Imported Server")
				url := stringVal(m, "url", "")
				apiKey := nullStringVal(m, "jellyfinApiKey")
				allowAuth := boolVal(m, "allowAuthFallback", false) != 0
				isActive := boolVal(m, "isActive", true) != 0
				createdAt := stringVal(m, "createdAt", time.Now().UTC().Format(time.RFC3339Nano))
				updatedAt := stringVal(m, "updatedAt", createdAt)

				_, err = tx.ExecContext(ctx, database.Bind(`INSERT INTO "Server" ("id","jellyfinServerId","name","url","jellyfinApiKey","allowAuthFallback","isActive","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?,?)`, driver),
					id, jid, name, url, apiKey, allowAuth, isActive, createdAt, updatedAt)
				if err != nil {
					return fmt.Errorf("insert server %s: %w", id, err)
				}
			}
		}
	}

	// 3. Insert Users
	if rawUsers, ok := dbData["users"].([]any); ok {
		for _, u := range rawUsers {
			if m, ok := u.(map[string]any); ok {
				id := stringVal(m, "id", "")
				sid := stringVal(m, "serverId", "")
				if id == "" || sid == "" {
					continue
				}
				jid := stringVal(m, "jellyfinUserId", id)
				username := stringVal(m, "username", "User")
				isActive := boolVal(m, "isActive", true) != 0
				lastActive := nullStringVal(m, "lastActive")
				createdAt := stringVal(m, "createdAt", time.Now().UTC().Format(time.RFC3339Nano))
				updatedAt := stringVal(m, "updatedAt", createdAt)

				_, err = tx.ExecContext(ctx, database.Bind(`INSERT INTO "User" ("id","serverId","jellyfinUserId","username","isActive","lastActive","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?)`, driver),
					id, sid, jid, username, isActive, lastActive, createdAt, updatedAt)
				if err != nil {
					return fmt.Errorf("insert user %s: %w", id, err)
				}
			}
		}
	}

	// 4. Insert Media
	if rawMedia, ok := dbData["media"].([]any); ok {
		for _, med := range rawMedia {
			if m, ok := med.(map[string]any); ok {
				id := stringVal(m, "id", "")
				sid := stringVal(m, "serverId", "")
				if id == "" || sid == "" {
					continue
				}
				jid := stringVal(m, "jellyfinMediaId", id)
				title := stringVal(m, "title", "Unknown")
				mType := stringVal(m, "type", "Unknown")
				collectionType := nullStringVal(m, "collectionType")
				libraryName := nullStringVal(m, "libraryName")
				genres := jsonCol(m, "genres", "[]")
				resolution := nullStringVal(m, "resolution")
				durationMs := nullIntVal(m, "durationMs")
				size := nullIntVal(m, "size")
				directors := jsonCol(m, "directors", "[]")
				actors := jsonCol(m, "actors", "[]")
				studios := jsonCol(m, "studios", "[]")
				parentId := nullStringVal(m, "parentId")
				artist := nullStringVal(m, "artist")
				dateAdded := nullStringVal(m, "dateAdded")
				createdAt := stringVal(m, "createdAt", time.Now().UTC().Format(time.RFC3339Nano))
				updatedAt := stringVal(m, "updatedAt", createdAt)

				_, err = tx.ExecContext(ctx, database.Bind(`INSERT INTO "Media" ("id","serverId","jellyfinMediaId","title","type","collectionType","libraryName","genres","resolution","durationMs","size","directors","actors","studios","parentId","artist","dateAdded","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, driver),
					id, sid, jid, title, mType, collectionType, libraryName, genres, resolution, durationMs, size, directors, actors, studios, parentId, artist, dateAdded, createdAt, updatedAt)
				if err != nil {
					return fmt.Errorf("insert media %s: %w", id, err)
				}
			}
		}
	}

	// 5. Insert PlaybackHistory
	if rawHistory, ok := dbData["playbackHistory"].([]any); ok {
		for _, h := range rawHistory {
			if m, ok := h.(map[string]any); ok {
				id := stringVal(m, "id", "")
				sid := stringVal(m, "serverId", "")
				mid := stringVal(m, "mediaId", "")
				if id == "" || sid == "" || mid == "" {
					continue
				}
				uid := nullStringVal(m, "userId")
				playMethod := stringVal(m, "playMethod", "DirectPlay")
				eventSource := stringVal(m, "eventSource", "playback")
				sourceEventId := nullStringVal(m, "sourceEventId")
				clientName := nullStringVal(m, "clientName")
				deviceName := nullStringVal(m, "deviceName")
				ipAddress := nullStringVal(m, "ipAddress")
				country := nullStringVal(m, "country")
				city := nullStringVal(m, "city")
				durationWatched := intVal(m, "durationWatched", 0)
				startedAt := stringVal(m, "startedAt", time.Now().UTC().Format(time.RFC3339Nano))
				endedAt := nullStringVal(m, "endedAt")
				audioLang := nullStringVal(m, "audioLanguage")
				audioCodec := nullStringVal(m, "audioCodec")
				subLang := nullStringVal(m, "subtitleLanguage")
				subCodec := nullStringVal(m, "subtitleCodec")
				bitrate := nullIntVal(m, "bitrate")
				pauseCount := intVal(m, "pauseCount", 0)
				audioChg := intVal(m, "audioChanges", 0)
				subChg := intVal(m, "subtitleChanges", 0)
				seekCount := intVal(m, "seekCount", 0)
				rewatchCount := intVal(m, "rewatchCount", 0)
				speedChg := intVal(m, "speedChangeCount", 0)
				maxRate := nullFloatVal(m, "maxPlaybackRate")

				_, err = tx.ExecContext(ctx, database.Bind(`INSERT INTO "PlaybackHistory" ("id","serverId","userId","mediaId","playMethod","eventSource","sourceEventId","clientName","deviceName","ipAddress","country","city","durationWatched","startedAt","endedAt","audioLanguage","audioCodec","subtitleLanguage","subtitleCodec","bitrate","pauseCount","audioChanges","subtitleChanges","seekCount","rewatchCount","speedChangeCount","maxPlaybackRate") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, driver),
					id, sid, uid, mid, playMethod, eventSource, sourceEventId, clientName, deviceName, ipAddress, country, city, durationWatched, startedAt, endedAt, audioLang, audioCodec, subLang, subCodec, bitrate, pauseCount, audioChg, subChg, seekCount, rewatchCount, speedChg, maxRate)
				if err != nil {
					return fmt.Errorf("insert playback history %s: %w", id, err)
				}
			}
		}
	}

	// 6. Insert TelemetryEvents
	if rawTelemetry, ok := dbData["telemetryEvents"].([]any); ok {
		for _, te := range rawTelemetry {
			if m, ok := te.(map[string]any); ok {
				id := stringVal(m, "id", "")
				sid := stringVal(m, "serverId", "")
				pid := stringVal(m, "playbackId", "")
				if id == "" || sid == "" || pid == "" {
					continue
				}
				evType := stringVal(m, "eventType", "progress")
				posMs := intVal(m, "positionMs", 0)
				meta := nullStringVal(m, "metadata")
				createdAt := stringVal(m, "createdAt", time.Now().UTC().Format(time.RFC3339Nano))

				_, err = tx.ExecContext(ctx, database.Bind(`INSERT INTO "TelemetryEvent" ("id","serverId","playbackId","eventType","positionMs","metadata","createdAt") VALUES (?,?,?,?,?,?,?)`, driver),
					id, sid, pid, evType, posMs, meta, createdAt)
				if err != nil {
					return fmt.Errorf("insert telemetry %s: %w", id, err)
				}
			}
		}
	}

	// 7. Insert DailyStats
	if rawDaily, ok := dbData["dailyStats"].([]any); ok {
		for _, ds := range rawDaily {
			if m, ok := ds.(map[string]any); ok {
				id := stringVal(m, "id", "")
				date := stringVal(m, "date", "")
				if id == "" || date == "" {
					continue
				}
				uid := nullStringVal(m, "userId")
				lib := nullStringVal(m, "libraryName")
				mType := nullStringVal(m, "mediaType")
				plays := intVal(m, "totalPlays", 0)
				dur := intVal(m, "totalDuration", 0)
				direct := intVal(m, "directPlays", 0)
				trans := intVal(m, "transcodes", 0)
				unique := intVal(m, "uniqueMedia", 0)
				updatedAt := stringVal(m, "updatedAt", time.Now().UTC().Format(time.RFC3339Nano))

				_, err = tx.ExecContext(ctx, database.Bind(`INSERT INTO "DailyStats" ("id","date","userId","libraryName","mediaType","totalPlays","totalDuration","directPlays","transcodes","uniqueMedia","updatedAt") VALUES (?,?,?,?,?,?,?,?,?,?,?)`, driver),
					id, date, uid, lib, mType, plays, dur, direct, trans, unique, updatedAt)
				if err != nil {
					return fmt.Errorf("insert daily stats %s: %w", id, err)
				}
			}
		}
	}

	// 8. Insert AdminAuditLogs
	if rawLogs, ok := dbData["adminAuditLogs"].([]any); ok {
		for _, al := range rawLogs {
			if m, ok := al.(map[string]any); ok {
				id := stringVal(m, "id", "")
				action := stringVal(m, "action", "")
				if id == "" || action == "" {
					continue
				}
				actorUID := nullStringVal(m, "actorUserId")
				actorUname := nullStringVal(m, "actorUsername")
				target := nullStringVal(m, "target")
				ip := nullStringVal(m, "ipAddress")
				details := jsonCol(m, "details", "{}")
				createdAt := stringVal(m, "createdAt", time.Now().UTC().Format(time.RFC3339Nano))

				_, err = tx.ExecContext(ctx, database.Bind(`INSERT INTO "AdminAuditLog" ("id","action","actorUserId","actorUsername","target","ipAddress","details","createdAt") VALUES (?,?,?,?,?,?,?,?)`, driver),
					id, action, actorUID, actorUname, target, ip, details, createdAt)
				if err != nil {
					return fmt.Errorf("insert audit log %s: %w", id, err)
				}
			}
		}
	}

	// 9. Update GlobalSettings if provided
	var sObj map[string]any
	if s, ok := setData["settings"].(map[string]any); ok && s != nil {
		sObj = s
	} else if s, ok := dbData["settings"].(map[string]any); ok && s != nil {
		sObj = s
	}
	if sObj != nil {
		if err := restoreGlobalSettings(ctx, tx, driver, sObj); err != nil {
			return err
		}
	}

	if associations, ok := dbData["personAccounts"].([]any); ok {
		for _, raw := range associations {
			a, ok := raw.(map[string]any)
			if !ok {
				return fmt.Errorf("invalid account association")
			}
			if _, err = tx.ExecContext(ctx, database.Bind(`INSERT INTO "PersonAccount"("accountId","personId","createdAt") VALUES(?,?,?)`, driver), stringVal(a, "accountId", ""), stringVal(a, "personId", ""), stringVal(a, "createdAt", time.Now().UTC().Format(time.RFC3339Nano))); err != nil {
				return fmt.Errorf("restore account association: %w", err)
			}
		}
	}

	return tx.Commit()
}

func stringVal(m map[string]any, key, fallback string) string {
	if val, ok := m[key]; ok && val != nil {
		if s, ok := val.(string); ok && strings.TrimSpace(s) != "" {
			return strings.TrimSpace(s)
		}
	}
	return fallback
}

func nullStringVal(m map[string]any, key string) any {
	if val, ok := m[key]; ok && val != nil {
		if s, ok := val.(string); ok && strings.TrimSpace(s) != "" {
			return strings.TrimSpace(s)
		}
	}
	return nil
}

func intVal(m map[string]any, key string, fallback int64) int64 {
	if val, ok := m[key]; ok && val != nil {
		switch v := val.(type) {
		case json.Number:
			value, err := v.Int64()
			if err == nil {
				return value
			}
		case float64:
			return int64(v)
		case int64:
			return v
		case int:
			return int64(v)
		case string:
			if parsed, err := strconv.ParseInt(strings.TrimSpace(v), 10, 64); err == nil {
				return parsed
			}
		}
	}
	return fallback
}

func nullIntVal(m map[string]any, key string) any {
	if val, ok := m[key]; ok && val != nil {
		switch v := val.(type) {
		case json.Number:
			value, err := v.Int64()
			if err == nil {
				return value
			}
		case float64:
			return int64(v)
		case int64:
			return v
		case int:
			return int64(v)
		case string:
			if parsed, err := strconv.ParseInt(strings.TrimSpace(v), 10, 64); err == nil {
				return parsed
			}
		}
	}
	return nil
}

func nullFloatVal(m map[string]any, key string) any {
	if val, ok := m[key]; ok && val != nil {
		switch v := val.(type) {
		case json.Number:
			value, err := v.Float64()
			if err == nil {
				return value
			}
		case float64:
			return v
		case int64:
			return float64(v)
		case int:
			return float64(v)
		case string:
			if parsed, err := strconv.ParseFloat(strings.TrimSpace(v), 64); err == nil {
				return parsed
			}
		}
	}
	return nil
}

func boolVal(m map[string]any, key string, fallback bool) int {
	if val, ok := m[key]; ok && val != nil {
		switch v := val.(type) {
		case json.Number:
			if v.String() == "1" {
				return 1
			}
			return 0
		case bool:
			if v {
				return 1
			}
			return 0
		case float64:
			if v == 1 {
				return 1
			}
			return 0
		case int:
			if v == 1 {
				return 1
			}
			return 0
		case string:
			if strings.EqualFold(v, "true") || v == "1" {
				return 1
			}
			return 0
		}
	}
	if fallback {
		return 1
	}
	return 0
}

func jsonCol(m map[string]any, key, fallback string) string {
	if val, ok := m[key]; ok && val != nil {
		switch v := val.(type) {
		case string:
			if strings.TrimSpace(v) != "" {
				return strings.TrimSpace(v)
			}
		case []any, map[string]any:
			if b, err := json.Marshal(v); err == nil {
				return string(b)
			}
		}
	}
	return fallback
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

	var zipData []byte
	var err error
	if strings.TrimSpace(os.Getenv("BACKUP_ENCRYPTION_KEY")) != "" {
		zipData, err = CreateEncryptedBackup(ctx, db, driver)
	} else {
		zipData, err = CreateZipBackup(ctx, db, driver)
	}
	if err != nil {
		return "", err
	}

	now := time.Now().UTC()
	dateStr := now.Format("2006-01-02")
	timeStr := now.Format("15-04-05")
	extension := "zip"
	if bytes.HasPrefix(zipData, encryptedMagic) {
		extension = "jtb"
	}
	fileName := fmt.Sprintf("%s%s_%s.%s", prefix, dateStr, timeStr, extension)
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

	if db != nil {
		finishIso := now.Format(time.RFC3339Nano)
		bState := map[string]any{
			"status":         "ok",
			"lastSuccessAt":  finishIso,
			"lastFinishedAt": finishIso,
			"lastFileName":   fileName,
		}
		bBytes, _ := json.Marshal(bState)
		_, _ = db.ExecContext(ctx, database.Bind(`INSERT INTO "SystemHealthState" ("id", "backup", "updatedAt") VALUES ('global', ?, ?) ON CONFLICT("id") DO UPDATE SET "backup"=excluded."backup", "updatedAt"=excluded."updatedAt"`, driver), string(bBytes), finishIso)
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
