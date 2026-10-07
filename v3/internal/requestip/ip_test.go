package requestip

import (
	"net/http/httptest"
	"testing"
)

func TestForwardedIPRequiresTrustedPeer(t *testing.T) {
	t.Setenv("TRUST_PROXY_HEADERS", "true")
	t.Setenv("TRUSTED_PROXY_CIDRS", "10.0.0.0/8")
	t.Setenv("TRUSTED_PROXY_HOPS", "1")
	headers := map[string]string{"X-Forwarded-For": "198.51.100.9, 10.1.2.3"}
	if got := ClientIP("192.0.2.5:4000", headers); got != "192.0.2.5" {
		t.Fatalf("untrusted forwarded IP=%s", got)
	}
	if got := ClientIP("10.1.2.4:4000", headers); got != "198.51.100.9" {
		t.Fatalf("trusted forwarded IP=%s", got)
	}
}
func TestRemoteAddrDefault(t *testing.T) {
	t.Setenv("TRUST_PROXY_HEADERS", "false")
	r := httptest.NewRequest("GET", "/", nil)
	if got := ClientIP(r.RemoteAddr, nil); got == "" {
		t.Fatal("missing remote IP")
	}
}
