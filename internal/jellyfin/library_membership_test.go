package jellyfin

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRepairLibraryEnumerationHandlesShortPagesAndRejectsIncompleteResponse(t *testing.T) {
	for _, incomplete := range []bool{false, true} {
		remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Query().Get("ParentId") != "lib" || r.URL.Query().Get("Recursive") != "true" {
				t.Error("incorrect library scope")
			}
			if r.URL.Query().Get("StartIndex") == "0" {
				w.Write([]byte(`{"Items":[{"Id":"one"}],"TotalRecordCount":2}`))
				return
			}
			if incomplete {
				w.Write([]byte(`{"Items":[],"TotalRecordCount":2}`))
				return
			}
			w.Write([]byte(`{"Items":[{"Id":"two"}],"TotalRecordCount":2}`))
		}))
		client, err := New(remote.URL, "key")
		if err != nil {
			t.Fatal(err)
		}
		var ids []string
		err = client.LibraryItemIDs(context.Background(), "lib", func(id string) error { ids = append(ids, id); return nil })
		remote.Close()
		if incomplete {
			if err == nil {
				t.Fatal("incomplete catalogue accepted")
			}
		} else if err != nil || len(ids) != 2 || ids[1] != "two" {
			t.Fatalf("short page truncated: %v %v", ids, err)
		}
	}
}
