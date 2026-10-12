package stats

import "testing"

func TestApplicationEcosystemUsesRecordedBrowserButNeverInfersOSFromHostname(t *testing.T) {
	point := applicationPoint("Jellyfin Web", "Firefox on Linux")
	if point.Name != "Jellyfin Web · Firefox on Linux" || point.Device != "Firefox on Linux" {
		t.Fatalf("%+v", point)
	}
	for _, device := range []string{"DESKTOP-MAEL", "Windows-PC", "Linux Server"} {
		point = applicationPoint("Jellyfin Media Player", device)
		if point.Name != "Jellyfin Media Player" || point.Device != "" {
			t.Fatalf("hostname inferred as platform: %+v", point)
		}
	}
}
