package jellyfin

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestClientUsesMediaBrowserTokenAndPaginates(t *testing.T) {
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		if r.Header.Get("X-MediaBrowser-Token") != "secret" || r.Header.Get("Authorization") != `MediaBrowser Token="secret"` {
			t.Errorf("missing Jellyfin token headers: %#v", r.Header)
		}
		if r.URL.Path != "/Items" {
			t.Errorf("path = %q", r.URL.Path)
		}
		start := r.URL.Query().Get("StartIndex")
		if requests == 1 && start != "0" {
			t.Errorf("first offset = %q", start)
		}
		if requests == 2 && start != "200" {
			t.Errorf("second offset = %q", start)
		}
		if requests == 1 {
			fmt.Fprint(w, `{"Items":[`)
			for i := 0; i < pageSize; i++ {
				if i > 0 {
					fmt.Fprint(w, ",")
				}
				fmt.Fprintf(w, `{"Id":"%d"}`, i)
			}
			fmt.Fprint(w, "]}")
			return
		}
		fmt.Fprint(w, `{"Items":[{"Id":"last"}]}`)
	}))
	defer server.Close()
	client, err := New(server.URL, "secret")
	if err != nil {
		t.Fatal(err)
	}
	count := 0
	if err := client.Items(context.Background(), func(Item) error { count++; return nil }); err != nil {
		t.Fatal(err)
	}
	if requests != 2 || count != pageSize+1 {
		t.Fatalf("requests=%d count=%d", requests, count)
	}
}

func TestNewRejectsCredentialsInURL(t *testing.T) {
	if _, err := New("https://user:password@example.test", "key"); err == nil {
		t.Fatal("expected URL credentials to be rejected")
	}
}
