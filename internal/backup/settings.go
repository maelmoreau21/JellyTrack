package backup

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/database"
)

func exportGlobalSettings(ctx context.Context, db *sql.DB) (map[string]any, error) {
	rows, err := db.QueryContext(ctx, `SELECT * FROM "GlobalSettings" WHERE "id"='global'`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	columns, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	if !rows.Next() {
		return map[string]any{}, rows.Err()
	}
	values := make([]any, len(columns))
	pointers := make([]any, len(columns))
	for i := range values {
		pointers[i] = &values[i]
	}
	if err = rows.Scan(pointers...); err != nil {
		return nil, err
	}
	result := map[string]any{}
	jsonFields := map[string]bool{"excludedLibraries": true, "resolutionThresholds": true, "ssoSettings": true, "pluginTelemetrySettings": true}
	boolFields := map[string]bool{"discordAlertsEnabled": true, "wrappedVisible": true, "wrappedPeriodEnabled": true, "pluginAutoRotateEnabled": true, "authRememberThirtyDaysEnabled": true}
	for i, column := range columns {
		value := values[i]
		if b, ok := value.([]byte); ok {
			value = string(b)
		}
		if t, ok := value.(time.Time); ok {
			value = t.UTC().Format(time.RFC3339Nano)
		}
		if n, ok := value.(int64); ok && boolFields[column] {
			value = n != 0
		}
		if text, ok := value.(string); ok && jsonFields[column] && text != "" {
			var parsed any
			if json.Unmarshal([]byte(text), &parsed) == nil {
				value = parsed
			}
		}
		result[column] = value
	}
	return result, rows.Err()
}

// Legacy backups can omit newer sections. Restore only the fields actually
// present, retaining current secrets/policies when a legacy export lacked them.
func restoreGlobalSettings(ctx context.Context, tx *sql.Tx, driver string, source map[string]any) error {
	if _, err := tx.ExecContext(ctx, `INSERT INTO "GlobalSettings"("id") VALUES('global') ON CONFLICT DO NOTHING`); err != nil {
		return err
	}
	columns := strings.Fields("discordWebhookUrl discordAlertCondition discordAlertsEnabled maxConcurrentTranscodes excludedLibraries syncCronHour syncCronMinute backupCronHour backupCronMinute defaultLocale timeFormat wrappedVisible wrappedPeriodEnabled wrappedStartMonth wrappedStartDay wrappedEndMonth wrappedEndDay pluginApiKey pluginPreviousApiKey pluginPreviousApiKeyExpiresAt pluginKeyCreatedAt pluginKeyExpiresAt pluginKeyRotationDays pluginAutoRotateEnabled pluginKeyRotationGraceHours pluginLastSeen pluginVersion pluginServerName pluginTelemetrySettings authRememberThirtyDaysEnabled resolutionThresholds ssoSettings")
	jsonFields := map[string]bool{"excludedLibraries": true, "resolutionThresholds": true, "ssoSettings": true, "pluginTelemetrySettings": true}
	boolFields := map[string]bool{"discordAlertsEnabled": true, "wrappedVisible": true, "wrappedPeriodEnabled": true, "pluginAutoRotateEnabled": true, "authRememberThirtyDaysEnabled": true}
	for _, column := range columns {
		value, exists := source[column]
		if !exists {
			continue
		}
		if jsonFields[column] && value != nil {
			if column == "excludedLibraries" && driver == "postgres" {
				switch v := value.(type) {
				case []any:
					libs := []string{}
					for _, item := range v {
						text, ok := item.(string)
						if !ok {
							return fmt.Errorf("invalid backup library")
						}
						libs = append(libs, text)
					}
					value = libs
				case string:
					var libs []string
					if err := json.Unmarshal([]byte(v), &libs); err != nil {
						return err
					}
					value = libs
				}
			} else if _, ok := value.(string); !ok {
				b, err := json.Marshal(value)
				if err != nil {
					return err
				}
				value = string(b)
			}
		}
		if boolFields[column] {
			switch v := value.(type) {
			case float64:
				value = v != 0
			case int64:
				value = v != 0
			}
		}
		if _, err := tx.ExecContext(ctx, database.Bind(`UPDATE "GlobalSettings" SET "`+column+`"=? WHERE "id"='global'`, driver), value); err != nil {
			return fmt.Errorf("restore setting %s: %w", column, err)
		}
	}
	return nil
}
