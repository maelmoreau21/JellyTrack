package security

import (
	"testing"
)

func TestIsCloudMetadataHost(t *testing.T) {
	metadataHosts := []string{
		"169.254.169.254",
		"metadata.google.internal",
		"metadata.internal",
		"100.100.100.200",
		"fd00:ec2::254",
		"[fd00:ec2::254]",
		"169.254.1.1",
		"169.254.254.254",
	}
	for _, h := range metadataHosts {
		if !IsCloudMetadataHost(h) {
			t.Errorf("expected IsCloudMetadataHost(%q) to be true", h)
		}
	}

	safeHosts := []string{
		"jellyfin.local",
		"192.168.1.100",
		"10.0.0.1",
		"example.com",
		"google.com",
		"localhost",
		"127.0.0.1",
	}
	for _, h := range safeHosts {
		if IsCloudMetadataHost(h) {
			t.Errorf("expected IsCloudMetadataHost(%q) to be false", h)
		}
	}
}

func TestIsValidDiscordWebhook(t *testing.T) {
	valid := []string{
		"https://discord.com/api/webhooks/123456789/abcdef",
		"https://discordapp.com/api/webhooks/123456789/abcdef",
		"https://canary.discord.com/api/webhooks/123/token",
	}
	for _, u := range valid {
		if !IsValidDiscordWebhook(u) {
			t.Errorf("expected IsValidDiscordWebhook(%q) to be true", u)
		}
	}

	invalid := []string{
		"http://discord.com/api/webhooks/123456789/abcdef", // http not allowed
		"https://evil.com/api/webhooks/123",
		"https://discord.com/something/else",
		"https://169.254.169.254/api/webhooks/123",
		"",
	}
	for _, u := range invalid {
		if IsValidDiscordWebhook(u) {
			t.Errorf("expected IsValidDiscordWebhook(%q) to be false", u)
		}
	}
}

func TestValidateSafeServerURL(t *testing.T) {
	_, err := ValidateSafeServerURL("http://192.168.1.50:8096")
	if err != nil {
		t.Fatalf("expected valid URL, got error: %v", err)
	}

	_, err = ValidateSafeServerURL("https://jellyfin.example.com")
	if err != nil {
		t.Fatalf("expected valid URL, got error: %v", err)
	}

	_, err = ValidateSafeServerURL("http://169.254.169.254:8096")
	if err == nil {
		t.Fatal("expected error for cloud metadata URL, got nil")
	}

	_, err = ValidateSafeServerURL("ftp://server.example.com")
	if err == nil {
		t.Fatal("expected error for non-http scheme, got nil")
	}
}
