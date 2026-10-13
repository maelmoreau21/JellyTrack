package auth

import (
	"context"
	"os"
	"strings"
)

type loginServerOption struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

func (m *Manager) loginServers(ctx context.Context) []loginServerOption {
	result := []loginServerOption{}
	if m.db == nil {
		return result
	}
	rows, err := m.db.QueryContext(ctx, `SELECT "id","name","url","allowAuthFallback" FROM "Server" WHERE "isActive"=TRUE ORDER BY "createdAt","id"`)
	if err != nil {
		return result
	}
	defer rows.Close()
	primary := strings.TrimRight(strings.TrimSpace(os.Getenv("JELLYFIN_URL")), "/")
	index := 0
	for rows.Next() {
		var id, name, address string
		var fallback bool
		if rows.Scan(&id, &name, &address, &fallback) != nil {
			return []loginServerOption{}
		}
		first := primary == "" && index == 0
		if fallback || first || strings.EqualFold(primary, strings.TrimRight(address, "/")) {
			result = append(result, loginServerOption{id, name})
		}
		index++
	}
	return result
}

func (m *Manager) selectableServer(ctx context.Context, id string) bool {
	for _, server := range m.loginServers(ctx) {
		if server.ID == id {
			return true
		}
	}
	return false
}
