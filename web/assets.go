package web

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"fmt"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"
)

type staticAsset struct {
	plain, compressed []byte
	etag, contentType string
}

// Prepare public text assets once, so serving them does not spend CPU on
// compression per request. HTML and private API responses stay outside this cache.
func textAssets(files fs.FS, fallback http.Handler) http.Handler {
	assets := map[string]staticAsset{}
	_ = fs.WalkDir(files, "assets", func(name string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return nil
		}
		switch path.Ext(name) {
		case ".js", ".css", ".json", ".svg":
		default:
			return nil
		}
		data, err := fs.ReadFile(files, name)
		if err != nil {
			return nil
		}
		var compressed bytes.Buffer
		writer := gzip.NewWriter(&compressed)
		_, _ = writer.Write(data)
		_ = writer.Close()
		asset := staticAsset{plain: data, etag: fmt.Sprintf(`"%x"`, sha256.Sum256(data)), contentType: mime.TypeByExtension(path.Ext(name))}
		if compressed.Len() < len(data) {
			asset.compressed = compressed.Bytes()
		}
		assets["/"+name] = asset
		return nil
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		asset, found := assets[r.URL.Path]
		if !found || (r.Method != http.MethodGet && r.Method != http.MethodHead) {
			fallback.ServeHTTP(w, r)
			return
		}
		data := asset.plain
		etag := asset.etag
		w.Header().Set("Vary", "Accept-Encoding")
		// Filenames are not fingerprinted: always validate before reuse so an
		// upgrade cannot leave an old script paired with new HTML or API contracts.
		w.Header().Set("Cache-Control", "public, no-cache")
		w.Header().Set("Content-Type", asset.contentType)
		if len(asset.compressed) > 0 && r.Header.Get("Range") == "" && acceptsGzip(r.Header.Get("Accept-Encoding")) {
			data = asset.compressed
			etag = strings.TrimSuffix(etag, `"`) + `-gzip"`
			w.Header().Set("Content-Encoding", "gzip")
		}
		w.Header().Set("ETag", etag)
		http.ServeContent(w, r, path.Base(r.URL.Path), time.Time{}, bytes.NewReader(data))
	})
}

func acceptsGzip(header string) bool {
	wildcard := false
	for _, value := range strings.Split(header, ",") {
		parts := strings.Split(value, ";")
		encoding := strings.TrimSpace(parts[0])
		quality := 1.0
		for _, parameter := range parts[1:] {
			key, value, ok := strings.Cut(strings.TrimSpace(parameter), "=")
			if ok && key == "q" {
				parsed, err := strconv.ParseFloat(value, 64)
				if err != nil || parsed < 0 || parsed > 1 {
					quality = 0
				} else {
					quality = parsed
				}
			}
		}
		if encoding == "gzip" {
			return quality > 0
		}
		if encoding == "*" {
			wildcard = quality > 0
		}
	}
	return wildcard
}
