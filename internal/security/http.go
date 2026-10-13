package security

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"time"
)

// ServerHTTPClient allows LAN servers, but never follows redirects carrying
// credentials. Resolve and validate at dial time, then dial the checked IP
// directly so a second DNS lookup cannot change the destination.
func ServerHTTPClient(timeout time.Duration) *http.Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil
	transport.DialContext = safeServerDial
	return &http.Client{Timeout: timeout, Transport: transport, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
}

func safeServerDial(ctx context.Context, network, address string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil || IsCloudMetadataHost(host) {
		return nil, fmt.Errorf("unsafe server address")
	}
	addresses, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil {
		return nil, err
	}
	if len(addresses) == 0 {
		return nil, fmt.Errorf("server has no addresses")
	}
	for _, a := range addresses {
		if unsafeServerIP(a.IP) {
			return nil, fmt.Errorf("server resolves to a prohibited address")
		}
	}
	dialer := net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}
	for _, a := range addresses {
		ip := a.IP.String()
		if a.Zone != "" {
			ip += "%" + a.Zone
		}
		conn, dialErr := dialer.DialContext(ctx, network, net.JoinHostPort(ip, port))
		if dialErr == nil {
			return conn, nil
		}
		err = dialErr
	}
	return nil, err
}

func unsafeServerIP(ip net.IP) bool {
	return ip == nil || ip.IsUnspecified() || ip.IsMulticast() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || IsCloudMetadataHost(ip.String())
}
