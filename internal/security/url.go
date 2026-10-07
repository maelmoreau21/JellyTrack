package security

import (
	"errors"
	"net"
	"net/url"
	"regexp"
	"strings"
)

var cloudMetadataHostnames = map[string]struct{}{
	"169.254.169.254":           {},
	"metadata.google.internal":  {},
	"metadata.internal":         {},
	"100.100.100.200":           {}, // Alibaba Cloud metadata
	"fd00:ec2::254":             {}, // AWS IPv6 metadata
}

var ipv4LinkLocalRegex = regexp.MustCompile(`^169\.254\.\d{1,3}\.\d{1,3}$`)

// IsCloudMetadataHost returns true if the hostname points to a cloud metadata service.
func IsCloudMetadataHost(hostname string) bool {
	h := strings.ToLower(strings.TrimSpace(hostname))
	h = strings.TrimPrefix(h, "[")
	h = strings.TrimSuffix(h, "]")
	if h == "" {
		return false
	}
	if _, ok := cloudMetadataHostnames[h]; ok {
		return true
	}
	if ipv4LinkLocalRegex.MatchString(h) {
		return true
	}
	if strings.HasPrefix(h, "fd00:ec2:") {
		return true
	}
	// Check if IP is in link-local subnet 169.254.0.0/16
	ip := net.ParseIP(h)
	if ip != nil && ip.IsLinkLocalUnicast() {
		return true
	}
	return false
}

// IsValidDiscordWebhook validates that a URL is a legitimate Discord webhook endpoint.
func IsValidDiscordWebhook(rawURL string) bool {
	raw := strings.TrimSpace(rawURL)
	if raw == "" {
		return false
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return false
	}
	if !strings.EqualFold(parsed.Scheme, "https") {
		return false
	}
	host := strings.ToLower(parsed.Hostname())
	if host != "discord.com" && host != "discordapp.com" && host != "canary.discord.com" && host != "ptb.discord.com" {
		return false
	}
	if IsCloudMetadataHost(host) {
		return false
	}
	return strings.HasPrefix(parsed.Path, "/api/webhooks/")
}

// ValidateSafeServerURL ensures a URL is a valid http(s) URL and does not target cloud metadata.
func ValidateSafeServerURL(rawURL string) (*url.URL, error) {
	raw := strings.TrimSpace(rawURL)
	if raw == "" {
		return nil, errors.New("empty URL")
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return nil, errors.New("invalid URL format")
	}
	scheme := strings.ToLower(parsed.Scheme)
	if scheme != "http" && scheme != "https" {
		return nil, errors.New("URL scheme must be http or https")
	}
	host := strings.ToLower(parsed.Hostname())
	if host == "" {
		return nil, errors.New("URL missing hostname")
	}
	if IsCloudMetadataHost(host) {
		return nil, errors.New("URL cannot target cloud metadata services")
	}
	return parsed, nil
}
