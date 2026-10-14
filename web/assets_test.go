package web

import (
	"bytes"
	"compress/gzip"
	"io"
	"io/fs"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestTextAssetsTransferAndRevalidation(t *testing.T) {
	h := NewHandler(slog.New(slog.NewTextHandler(io.Discard, nil)), nil, "sqlite")
	for _, name := range []string{"app.js", "app.css", "chart.min.js"} {
		t.Run(name, func(t *testing.T) {
			original, err := fs.ReadFile(frontend, "dist/assets/"+name)
			if err != nil {
				t.Fatal(err)
			}
			request := func(encoding, etag, method, span string) *httptest.ResponseRecorder {
				r := httptest.NewRequest(method, "/assets/"+name, nil)
				r.Header.Set("Accept-Encoding", encoding)
				r.Header.Set("If-None-Match", etag)
				r.Header.Set("Range", span)
				w := httptest.NewRecorder()
				h.ServeHTTP(w, r)
				return w
			}
			compressed := request("gzip", "", "GET", "")
			if compressed.Code != 200 || compressed.Header().Get("Content-Encoding") != "gzip" {
				t.Fatalf("gzip response: %d %v", compressed.Code, compressed.Header())
			}
			reader, err := gzip.NewReader(bytes.NewReader(compressed.Body.Bytes()))
			if err != nil {
				t.Fatal(err)
			}
			decoded, err := io.ReadAll(reader)
			reader.Close()
			if err != nil || !bytes.Equal(decoded, original) {
				t.Fatal("compressed asset differs from source")
			}
			t.Logf("transfer bytes: %d -> %d (%.1f%% less)", len(original), compressed.Body.Len(), 100*(1-float64(compressed.Body.Len())/float64(len(original))))
			etag := compressed.Header().Get("ETag")
			cached := request("gzip", etag, "GET", "")
			if cached.Code != 304 || cached.Body.Len() != 0 {
				t.Fatalf("revalidation: %d, %d bytes", cached.Code, cached.Body.Len())
			}
			plain := request("gzip;q=0, *;q=1", etag, "GET", "")
			if plain.Code != 200 || plain.Header().Get("Content-Encoding") != "" || !bytes.Equal(plain.Body.Bytes(), original) {
				t.Fatal("identity negotiation or variant ETag broken")
			}
			partial := request("gzip", "", "GET", "bytes=0-9")
			if partial.Code != 206 || !bytes.Equal(partial.Body.Bytes(), original[:10]) {
				t.Fatal("range broken")
			}
			head := request("gzip", "", "HEAD", "")
			if head.Code != 200 || head.Body.Len() != 0 {
				t.Fatal("HEAD broken")
			}
		})
	}
	for _, endpoint := range []string{"/", "/users/example", "/api/health"} {
		r := httptest.NewRequest(http.MethodGet, endpoint, nil)
		r.Header.Set("Accept-Encoding", "gzip")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Header().Get("Content-Encoding") != "" || w.Header().Get("ETag") != "" {
			t.Fatalf("asset handling leaked to %s", endpoint)
		}
	}
}
