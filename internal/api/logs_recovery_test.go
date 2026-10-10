package api

import (
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRecoveredSystemFilesMetadataRetentionAndDownload(t *testing.T) {
	directory := t.TempDir()
	t.Setenv("LOG_DIR", directory)
	for name, content := range map[string]string{"jellytrack.log": "one\ntwo\n", "archive.log": "last line", "ignored.txt": "private"} {
		if err := os.WriteFile(filepath.Join(directory, name), []byte(content), 0600); err != nil {
			t.Fatal(err)
		}
	}
	db := apiDB(t)
	if _, err := db.Exec(`INSERT INTO "GlobalSettings"("id","resolutionThresholds") VALUES('global','{"schedulerIntervals":{"logRetentionDays":7}}')`); err != nil {
		t.Fatal(err)
	}
	handler := New(db, "sqlite")
	w := httptest.NewRecorder()
	handler.getSystemLogs(w, httptest.NewRequest("GET", "/api/logs/system", nil))
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	var result struct {
		Files []struct {
			Filename  string
			LineCount int
			IsCurrent bool
		}
		RetentionDays  int
		TotalSizeBytes int
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if len(result.Files) != 2 || result.Files[0].Filename != "jellytrack.log" || result.Files[0].LineCount != 2 || result.Files[1].LineCount != 1 || result.RetentionDays != 7 || result.TotalSizeBytes != 17 {
		t.Fatalf("metadata=%+v", result)
	}
	for _, tc := range []struct {
		query  string
		status int
		body   string
	}{{"", 200, "one\ntwo\n"}, {"?file=archive.log", 200, "last line"}, {"?file=missing.log", 404, ""}, {"?file=..%2Fjellytrack.log", 404, ""}, {"?file=ignored.txt", 404, ""}} {
		w := httptest.NewRecorder()
		handler.downloadSystemLogs(w, httptest.NewRequest("GET", "/api/logs/system/download"+tc.query, nil))
		if w.Code != tc.status {
			t.Fatalf("%s status=%d body=%s", tc.query, w.Code, w.Body.String())
		}
		if tc.body != "" && (w.Body.String() != tc.body || !strings.Contains(w.Header().Get("Content-Type"), "text/plain")) {
			t.Fatalf("download=%s headers=%v", w.Body.String(), w.Header())
		}
	}
}

func TestRecoveredLogDeletionPreservesActiveAndReportsFailures(t *testing.T) {
	directory := t.TempDir()
	t.Setenv("LOG_DIR", directory)
	db := apiDB(t)
	handler := New(db, "sqlite")
	for _, name := range []string{"jellytrack.log", "archive.log"} {
		if err := os.WriteFile(filepath.Join(directory, name), []byte("content\n"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	for _, query := range []string{"?file=jellytrack.log", "?file=missing.log", "?file=..%2Fjellytrack.log"} {
		w := httptest.NewRecorder()
		handler.clearSystemLogs(w, httptest.NewRequest("DELETE", "/api/logs/system"+query, nil))
		if w.Code != 400 {
			t.Fatalf("%s status=%d", query, w.Code)
		}
	}
	w := httptest.NewRecorder()
	handler.clearSystemLogs(w, httptest.NewRequest("DELETE", "/api/logs/system?file=archive.log", nil))
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if _, err := os.Stat(filepath.Join(directory, "archive.log")); !os.IsNotExist(err) {
		t.Fatalf("archive still exists: %v", err)
	}
	w = httptest.NewRecorder()
	handler.clearSystemLogs(w, httptest.NewRequest("DELETE", "/api/logs/system", nil))
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	content, err := os.ReadFile(filepath.Join(directory, "jellytrack.log"))
	if err != nil || len(content) != 0 {
		t.Fatalf("active not truncated: %q %v", content, err)
	}
}

func TestLogCountAcceptsLongLines(t *testing.T) {
	path := filepath.Join(t.TempDir(), "long.log")
	if err := os.WriteFile(path, []byte(strings.Repeat("x", 150000)+"\nfinal"), 0600); err != nil {
		t.Fatal(err)
	}
	lines, err := recoveryLogLines(path)
	if err != nil || lines != 2 {
		t.Fatalf("lines=%d err=%v", lines, err)
	}
}
