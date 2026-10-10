package api

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// The file inventory remains distinct from the additional database audit log.
func recoveryLogFiles(directory string) ([]map[string]any, int64, error) {
	files := []map[string]any{}
	entries, err := os.ReadDir(directory)
	if os.IsNotExist(err) {
		return files, 0, nil
	}
	if err != nil {
		return nil, 0, err
	}
	var total int64
	for _, entry := range entries {
		if !entry.Type().IsRegular() || !strings.HasSuffix(entry.Name(), ".log") {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			return nil, 0, err
		}
		path, err := recoveryLogPath(directory, entry.Name())
		if err != nil {
			return nil, 0, err
		}
		lines, err := recoveryLogLines(path)
		if err != nil {
			return nil, 0, err
		}
		total += info.Size()
		role := "archive"
		if entry.Name() == "jellytrack.log" {
			role = "master"
		} else if strings.Contains(entry.Name(), time.Now().Format("2006-01-02")) {
			role = "daily"
		}
		size := fmt.Sprintf("%d B", info.Size())
		if info.Size() >= 1024*1024 {
			size = fmt.Sprintf("%.2f Mo", float64(info.Size())/(1024*1024))
		} else if info.Size() >= 1024 {
			size = fmt.Sprintf("%.1f Ko", float64(info.Size())/1024)
		}
		files = append(files, map[string]any{"filename": entry.Name(), "name": entry.Name(), "sizeBytes": info.Size(), "formattedSize": size, "updatedAt": info.ModTime().UTC().Format(time.RFC3339), "modifiedAt": info.ModTime().UTC().Format(time.RFC3339), "isCurrent": entry.Name() == "jellytrack.log", "fileRole": role, "lineCount": lines})
	}
	sort.SliceStable(files, func(i, j int) bool {
		if files[i]["isCurrent"] != files[j]["isCurrent"] {
			return files[i]["isCurrent"].(bool)
		}
		return files[i]["updatedAt"].(string) > files[j]["updatedAt"].(string)
	})
	return files, total, nil
}

func recoveryLogPath(directory, filename string) (string, error) {
	if filename == "" || filename != filepath.Base(filename) || strings.ContainsAny(filename, "/\\\r\n") || !strings.HasSuffix(filename, ".log") {
		return "", fmt.Errorf("invalid log filename")
	}
	path := filepath.Join(directory, filename)
	info, err := os.Lstat(path)
	if err != nil {
		return "", err
	}
	if !info.Mode().IsRegular() {
		return "", fmt.Errorf("invalid log file")
	}
	return path, nil
}

func recoveryLogDisposition(filename string) string {
	return mime.FormatMediaType("attachment", map[string]string{"filename": filename})
}

// Streaming count handles large logs and long lines without loading the file.
func recoveryLogLines(path string) (int64, error) {
	file, err := os.Open(path)
	if err != nil {
		return 0, err
	}
	defer file.Close()
	buffer := make([]byte, 64*1024)
	var lines int64
	last := byte('\n')
	nonempty := false
	for {
		n, err := file.Read(buffer)
		if n > 0 {
			nonempty = true
			last = buffer[n-1]
			lines += int64(bytes.Count(buffer[:n], []byte{'\n'}))
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			return 0, err
		}
	}
	if nonempty && last != '\n' {
		lines++
	}
	return lines, nil
}

func (h *Handler) recoveryLogRetention(r *http.Request) int {
	var raw sql.NullString
	if h.db.QueryRowContext(r.Context(), `SELECT "resolutionThresholds" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&raw) != nil {
		return 30
	}
	var settings struct {
		Intervals map[string]int `json:"schedulerIntervals"`
	}
	if json.Unmarshal([]byte(raw.String), &settings) != nil {
		return 30
	}
	if days, ok := settings.Intervals["logRetentionDays"]; ok && days >= 0 && days <= 365 {
		return days
	}
	return 30
}
