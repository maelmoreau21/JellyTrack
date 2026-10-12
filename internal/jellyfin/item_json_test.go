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

func TestItemDecodesJellyfinCredits(t *testing.T) {
	var item Item
	err := json.Unmarshal([]byte(`{"Id":"film","Name":"Film","People":[{"Name":"Director","Type":"Director"},{"Name":"Actor","Type":"Actor"},{"Name":"Actor","Type":"GuestStar"},{"Name":"Writer","Type":"Writer"}],"Studios":[{"Id":"studio","Name":"Studio"}],"MediaSources":[{"Size":42}]}`), &item)
	if err != nil {
		t.Fatal(err)
	}
	if item.ID != "film" || len(item.Directors) != 1 || item.Directors[0] != "Director" || len(item.Actors) != 1 || item.Actors[0] != "Actor" || len(item.Studios) != 1 || item.Studios[0] != "Studio" || item.MediaSources[0].Size != 42 {
		t.Fatalf("lost metadata: %+v", item)
	}
	if err := json.Unmarshal([]byte(`{"Directors":["Legacy"],"Actors":["Actor"],"Studios":["Studio"]}`), &item); err != nil || item.Directors[0] != "Legacy" || item.Studios[0] != "Studio" {
		t.Fatalf("legacy metadata: %+v %v", item, err)
	}
}
