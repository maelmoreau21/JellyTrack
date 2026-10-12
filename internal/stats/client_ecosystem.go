package stats

import (
	"regexp"
	"strings"
)

var recordedBrowser = regexp.MustCompile(`(?i)^(chrome|chromium|firefox|edge|safari|opera)(?: [0-9.]+)?(?: (?:on|sur) (?:windows|linux|macos|android|ios))?$`)

type ApplicationPoint struct {
	Name   string `json:"name"`
	Value  int64  `json:"value"`
	Client string `json:"client"`
	Device string `json:"device,omitempty"`
}

func applicationPoint(client, device string) ApplicationPoint {
	point := ApplicationPoint{Name: client, Client: client}
	// Browser identity explicitly recorded by Jellyfin is useful. Machine names
	// do not identify an operating system and must never become platform labels.
	if strings.Contains(strings.ToLower(client), "web") && recordedBrowser.MatchString(strings.TrimSpace(device)) {
		point.Name = client + " · " + device
		point.Device = device
	}
	return point
}
