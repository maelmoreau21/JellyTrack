package jellyfin

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"regexp"
	"strings"

	"github.com/maelmoreau21/jellytrack/internal/database"
)

var jellyfinUUID = regexp.MustCompile(`^[a-fA-F0-9]{32}$`)

// syncIdentity preserves existing keys written by either sync or the plugin.
// Compact and dashed UUIDs describe the same remote object, within one server.
func syncIdentity(ctx context.Context, db *sql.DB, driver, table, column, serverID, raw string) (string, error) {
	key := strings.TrimSpace(raw)
	compact := strings.ReplaceAll(key, "-", "")
	if !jellyfinUUID.MatchString(compact) || (len(key) != 32 && !(len(key) == 36 && key[8] == '-' && key[13] == '-' && key[18] == '-' && key[23] == '-')) {
		return key, nil
	}
	compact = strings.ToLower(compact)
	var existing string
	err := db.QueryRowContext(ctx, database.Bind(`SELECT "`+column+`" FROM "`+table+`" WHERE "serverId"=? AND LOWER(REPLACE("`+column+`",'-',''))=? ORDER BY "createdAt","id" LIMIT 1`, driver), serverID, compact).Scan(&existing)
	if err == nil {
		return existing, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", err
	}
	return compact[:8] + "-" + compact[8:12] + "-" + compact[12:16] + "-" + compact[16:20] + "-" + compact[20:], nil
}

func syncArrayValue(driver string, values []string, encoded []byte) any {
	if driver == "postgres" {
		if values == nil {
			values = []string{}
		}
		return values
	}
	return string(encoded)
}

func providerJSON(ids map[string]string) string {
	if ids == nil {
		return "{}"
	}
	raw, _ := json.Marshal(ids)
	return string(raw)
}
