// Package requestip resolves client addresses without trusting arbitrary forwarding headers.
package requestip

import (
	"net"
	"net/netip"
	"os"
	"strconv"
	"strings"
)

// ClientIP only honors forwarding headers when the immediate peer is inside a configured trusted CIDR.
func ClientIP(remote string, headers map[string]string) string {
	peer := remote
	if host, _, err := net.SplitHostPort(remote); err == nil {
		peer = host
	}
	peerAddr, err := netip.ParseAddr(strings.Trim(peer, "[]"))
	if err != nil {
		return remote
	}
	if !enabled(os.Getenv("TRUST_PROXY_HEADERS")) && !enabled(os.Getenv("TRUST_PROXY")) {
		return peerAddr.String()
	}
	trusted := false
	for _, raw := range strings.Split(os.Getenv("TRUSTED_PROXY_CIDRS"), ",") {
		if cidr, e := netip.ParsePrefix(strings.TrimSpace(raw)); e == nil && cidr.Contains(peerAddr) {
			trusted = true
			break
		}
	}
	if !trusted {
		return peerAddr.String()
	}
	hops := 1
	if n, e := strconv.Atoi(os.Getenv("TRUSTED_PROXY_HOPS")); e == nil && n >= 0 && n <= 10 {
		hops = n
	}
	chain := splitIPs(headers["X-Forwarded-For"])
	if len(chain) > 0 {
		index := len(chain) - 1 - hops
		if index < 0 {
			index = 0
		}
		return chain[index]
	}
	if addr, e := netip.ParseAddr(strings.TrimSpace(headers["X-Real-IP"])); e == nil {
		return addr.String()
	}
	return peerAddr.String()
}
func splitIPs(raw string) []string {
	out := []string{}
	for _, part := range strings.Split(raw, ",") {
		if a, e := netip.ParseAddr(strings.TrimSpace(part)); e == nil {
			out = append(out, a.String())
		}
	}
	return out
}
func enabled(v string) bool {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}
