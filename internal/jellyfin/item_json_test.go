package jellyfin

import (
	"encoding/json"
	"testing"
)

func TestJellyfinStudiosAcceptObjectsAndLegacyStrings(t *testing.T) {
	for _, data := range []string{`{"Items":[{"Id":"m","Studios":[{"Name":"Studio","Id":"123"},"Legacy"]}]}`, `{"Items":[{"Id":"m","Studios":["Studio","Legacy"]}]}`} {
		var page itemPage
		if err := json.Unmarshal([]byte(data), &page); err != nil {
			t.Fatal(err)
		}
		if len(page.Items) != 1 || len(page.Items[0].Studios) != 2 || page.Items[0].Studios[0] != "Studio" {
			t.Fatalf("%+v", page)
		}
	}
	var page itemPage
	if json.Unmarshal([]byte(`{"Items":[{"Studios":[123]}]}`), &page) == nil {
		t.Fatal("malformed studio accepted")
	}
}
