package stats

import "testing"

func TestResolutionTelemetryExcludesEveryNonVideoMusicType(t *testing.T) {
	for _, kind := range []string{"Audio", "Track", "MusicTrack", "MusicAlbum", "Music", "Song", "AudioBook", "Book", "Unknown", ""} {
		if visualTelemetry(kind) {
			t.Fatalf("non-video counted: %q", kind)
		}
	}
	for _, kind := range []string{"Movie", "Episode", "Video", "MusicVideo"} {
		if !visualTelemetry(kind) {
			t.Fatalf("video excluded: %q", kind)
		}
	}
}
