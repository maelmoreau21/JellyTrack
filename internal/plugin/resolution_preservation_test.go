package plugin

import (
	"context"
	"testing"
)

func TestIncompleteMediaEventsPreserveKnownResolution(t *testing.T) {
	db, h := testServer(t)
	if _, err := db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','js','S','http://s')`); err != nil {
		t.Fatal(err)
	}
	for _, value := range []string{"2160p", "", "Unknown", "1080p"} {
		id, _, _, err := h.upsertMedia(context.Background(), "s", map[string]any{"resolution": value}, "jm", "M", "Movie", "")
		if err != nil {
			t.Fatal(err)
		}
		var actual string
		if err := db.QueryRow(`SELECT "resolution" FROM "Media" WHERE "id"=?`, id).Scan(&actual); err != nil {
			t.Fatal(err)
		}
		expected := "4K"
		if value == "1080p" {
			expected = "1080p"
		}
		if actual != expected {
			t.Fatalf("event %q erased resolution: %q", value, actual)
		}
	}
}
