package web

import (
	"bytes"
	"compress/gzip"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHistoryCompressionPreservesDataAndPrivateHeaders(t *testing.T) {
	var fixture strings.Builder
	fixture.WriteString(`{"telemetryEvents":[`)
	for i := 0; i < 10000; i++ {
		if i > 0 {
			fixture.WriteByte(',')
		}
		fmt.Fprintf(&fixture, `{"eventType":"Pause","positionMs":%d,"createdAt":"2026-10-14T10:%02d:%02dZ","metadata":{"fromMs":%d}}`, i*1000, (i/60)%60, i%60, i*1000-100)
	}
	fixture.WriteString(`]}`)
	data := []byte(fixture.String())
	for _, tc := range []struct {
		path, encoding string
		status         int
		compressed     bool
	}{
		{"/api/history", "gzip", 200, true},
		{"/api/history", "gzip;q=0", 200, false},
		{"/api/history", "gzip", 401, false},
		{"/api/logs/export", "gzip", 200, false},
		{"/api/dashboard/live", "gzip", 200, false},
	} {
		h := compressHistory(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.Header().Set("Cache-Control", "no-store")
			w.WriteHeader(tc.status)
			_, _ = w.Write(data)
		}))
		r := httptest.NewRequest("GET", tc.path, nil)
		r.Header.Set("Accept-Encoding", tc.encoding)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != tc.status || w.Header().Get("Cache-Control") != "no-store" {
			t.Fatal("response status or privacy headers changed")
		}
		actual := w.Body.Bytes()
		if tc.compressed {
			if w.Header().Get("Content-Encoding") != "gzip" {
				t.Fatal("compression missing")
			}
			reader, err := gzip.NewReader(bytes.NewReader(actual))
			if err != nil {
				t.Fatal(err)
			}
			actual, err = io.ReadAll(reader)
			reader.Close()
			if err != nil {
				t.Fatal(err)
			}
			t.Logf("synthetic history transfer: %d -> %d bytes", len(data), w.Body.Len())
		} else if w.Header().Get("Content-Encoding") != "" {
			t.Fatal("unexpected compression")
		}
		if !bytes.Equal(data, actual) {
			t.Fatal("history data changed")
		}
	}
}
