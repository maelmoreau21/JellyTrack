package security

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestServerClientNeverRedirectsCredentialsAndAllowsLAN(t *testing.T) {
	received := false
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { received = true }))
	defer target.Close()
	source := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, target.URL, 302) }))
	defer source.Close()
	req, _ := http.NewRequest("GET", source.URL, nil)
	req.Header.Set("X-Emby-Token", "private-key")
	resp, err := ServerHTTPClient(time.Second).Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != 302 || received {
		t.Fatal("redirect reached other host")
	}
	for _, ip := range []string{"169.254.169.254", "::ffff:169.254.169.254", "100.100.100.200", "fd00:ec2::254", "fe80::1", "0.0.0.0", "224.0.0.1"} {
		if !unsafeServerIP(net.ParseIP(ip)) {
			t.Errorf("prohibited IP accepted: %s", ip)
		}
	}
	for _, ip := range []string{"192.168.1.20", "10.0.0.1", "127.0.0.1", "::1", "fd12::1"} {
		if unsafeServerIP(net.ParseIP(ip)) {
			t.Errorf("legitimate private server blocked: %s", ip)
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if conn, err := safeServerDial(ctx, "tcp", "169.254.169.254:80"); err == nil {
		conn.Close()
		t.Fatal("metadata connection permitted")
	}
}
