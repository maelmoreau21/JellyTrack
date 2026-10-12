package auth

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
)

func (m *Manager) ssoButtonLabel(ctx context.Context) string {
	var raw sql.NullString
	if m.db.QueryRowContext(ctx, `SELECT "resolutionThresholds" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&raw) != nil {
		return ""
	}
	var values map[string]any
	if json.Unmarshal([]byte(raw.String), &values) != nil {
		return ""
	}
	label, _ := values["ssoButtonLabel"].(string)
	label = strings.TrimSpace(label)
	if len([]rune(label)) > 80 {
		return ""
	}
	return label
}
