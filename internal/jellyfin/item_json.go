package jellyfin

import (
	"encoding/json"
	"strings"
)

// Jellyfin sends credits in People and studios as NameGuidPair objects.
// Accept the older string lists as well, for imported catalogues.
func (item *Item) UnmarshalJSON(data []byte) error {
	type plain Item
	var decoded plain
	wire := struct {
		*plain
		Studios []json.RawMessage `json:"Studios"`
		People  []struct {
			Name string
			Type string
		} `json:"People"`
	}{plain: &decoded}
	if err := json.Unmarshal(data, &wire); err != nil {
		return err
	}
	appendName := func(list []string, name string) []string {
		name = strings.TrimSpace(name)
		if name == "" {
			return list
		}
		for _, existing := range list {
			if existing == name {
				return list
			}
		}
		return append(list, name)
	}
	for _, person := range wire.People {
		switch strings.ToLower(person.Type) {
		case "director":
			decoded.Directors = appendName(decoded.Directors, person.Name)
		case "actor", "gueststar":
			decoded.Actors = appendName(decoded.Actors, person.Name)
		}
	}
	for _, raw := range wire.Studios {
		var name string
		if err := json.Unmarshal(raw, &name); err != nil {
			var studio struct{ Name string }
			if err := json.Unmarshal(raw, &studio); err != nil {
				return err
			}
			name = studio.Name
		}
		decoded.Studios = appendName(decoded.Studios, name)
	}
	*item = Item(decoded)
	return nil
}
