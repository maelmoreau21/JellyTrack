package jellyfin

import (
	"encoding/json"
	"fmt"
)

// Jellyfin returns Name/Id objects for Studios; older exports used strings.
func (item *Item) UnmarshalJSON(data []byte) error {
	type plain Item
	var wire struct {
		*plain
		Studios json.RawMessage `json:"Studios"`
	}
	wire.plain = (*plain)(item)
	if err := json.Unmarshal(data, &wire); err != nil {
		return err
	}
	item.Studios = nil
	if len(wire.Studios) == 0 || string(wire.Studios) == "null" {
		return nil
	}
	var entries []json.RawMessage
	if err := json.Unmarshal(wire.Studios, &entries); err != nil {
		return err
	}
	for _, entry := range entries {
		var name string
		if err := json.Unmarshal(entry, &name); err != nil {
			var object struct {
				Name string `json:"Name"`
			}
			if err = json.Unmarshal(entry, &object); err != nil {
				return fmt.Errorf("invalid Jellyfin studio: %w", err)
			}
			name = object.Name
		}
		if name != "" {
			item.Studios = append(item.Studios, name)
		}
	}
	return nil
}
