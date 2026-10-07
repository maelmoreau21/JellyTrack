// Package settings manages global settings, multi-server configurations, plugin keys, and SSO.
package settings

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/internal/models"
	"golang.org/x/crypto/scrypt"
)

// GetGlobalSettings retrieves the singleton GlobalSettings record.
func GetGlobalSettings(ctx context.Context, db *sql.DB) (models.GlobalSettings, error) {
	var s models.GlobalSettings
	var discordURL, pluginKey, prevKey, pluginVer, pluginSrvName, pluginTelem, thresholds, sso sql.NullString
	var prevKeyExpires, keyCreated, keyExpires, lastSeen, authRevoked sql.NullString
	var exLibsRaw any

	query := `
		SELECT "id", "discordWebhookUrl", "discordAlertCondition", "discordAlertsEnabled",
		       "maxConcurrentTranscodes", "excludedLibraries", "syncCronHour", "syncCronMinute",
		       "backupCronHour", "backupCronMinute", "defaultLocale", "timeFormat",
		       "wrappedVisible", "wrappedPeriodEnabled", "wrappedStartMonth", "wrappedStartDay",
		       "wrappedEndMonth", "wrappedEndDay", "pluginApiKey", "pluginPreviousApiKey",
		       "pluginPreviousApiKeyExpiresAt", "pluginKeyCreatedAt", "pluginKeyExpiresAt",
		       "pluginKeyRotationDays", "pluginAutoRotateEnabled", "pluginKeyRotationGraceHours",
		       "pluginLastSeen", "pluginVersion", "pluginServerName", "pluginTelemetrySettings",
		       "authRememberThirtyDaysEnabled", "authSessionsRevokedAt", "resolutionThresholds",
		       "ssoSettings", "updatedAt"
		FROM "GlobalSettings"
		WHERE "id" = 'global'
	`

	var updatedAtStr string
	err := db.QueryRowContext(ctx, query).Scan(
		&s.ID, &discordURL, &s.DiscordAlertCondition, &s.DiscordAlertsEnabled,
		&s.MaxConcurrentTranscodes, &exLibsRaw, &s.SyncCronHour, &s.SyncCronMinute,
		&s.BackupCronHour, &s.BackupCronMinute, &s.DefaultLocale, &s.TimeFormat,
		&s.WrappedVisible, &s.WrappedPeriodEnabled, &s.WrappedStartMonth, &s.WrappedStartDay,
		&s.WrappedEndMonth, &s.WrappedEndDay, &pluginKey, &prevKey,
		&prevKeyExpires, &keyCreated, &keyExpires,
		&s.PluginKeyRotationDays, &s.PluginAutoRotateEnabled, &s.PluginKeyRotationGraceHours,
		&lastSeen, &pluginVer, &pluginSrvName, &pluginTelem,
		&s.AuthRememberThirtyDaysEnabled, &authRevoked, &thresholds,
		&sso, &updatedAtStr,
	)

	if errors.Is(err, sql.ErrNoRows) {
		// Insert default row if not exists
		_, _ = db.ExecContext(ctx, `INSERT INTO "GlobalSettings" ("id") VALUES ('global') ON CONFLICT DO NOTHING`)
		return models.GlobalSettings{
			ID:                            "global",
			DiscordAlertCondition:         "ALL",
			DefaultLocale:                 "en",
			TimeFormat:                    "24h",
			WrappedVisible:                true,
			WrappedPeriodEnabled:          true,
			WrappedStartMonth:             12,
			WrappedStartDay:               1,
			WrappedEndMonth:               1,
			WrappedEndDay:                 31,
			PluginKeyRotationDays:         90,
			PluginKeyRotationGraceHours:   24,
			AuthRememberThirtyDaysEnabled: true,
			ExcludedLibraries:             []string{},
		}, nil
	} else if err != nil {
		return s, err
	}

	if discordURL.Valid {
		s.DiscordWebhookURL = &discordURL.String
	}
	if pluginKey.Valid {
		s.PluginAPIKey = &pluginKey.String
	}
	if prevKey.Valid {
		s.PluginPreviousAPIKey = &prevKey.String
	}
	if pluginVer.Valid {
		s.PluginVersion = &pluginVer.String
	}
	if pluginSrvName.Valid {
		s.PluginServerName = &pluginSrvName.String
	}
	if pluginTelem.Valid {
		s.PluginTelemetrySettings = &pluginTelem.String
	}
	if thresholds.Valid {
		s.ResolutionThresholds = &thresholds.String
	}
	if sso.Valid {
		s.SSOSettings = &sso.String
	}

	s.ExcludedLibraries = parseStringList(exLibsRaw)

	return s, nil
}

// UpdateGlobalSettings modifies the global settings record.
func UpdateGlobalSettings(ctx context.Context, db *sql.DB, driver string, s models.GlobalSettings) error {
	var exLibs any
	if driver == "postgres" {
		exLibs = s.ExcludedLibraries
	} else {
		b, _ := json.Marshal(s.ExcludedLibraries)
		exLibs = string(b)
	}

	query := database.Bind(`
		INSERT INTO "GlobalSettings" (
			"id", "discordWebhookUrl", "discordAlertCondition", "discordAlertsEnabled",
			"maxConcurrentTranscodes", "excludedLibraries", "syncCronHour", "syncCronMinute",
			"backupCronHour", "backupCronMinute", "defaultLocale", "timeFormat",
			"wrappedVisible", "wrappedPeriodEnabled", "wrappedStartMonth", "wrappedStartDay",
			"wrappedEndMonth", "wrappedEndDay", "updatedAt"
		) VALUES (
			'global', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
		)
		ON CONFLICT("id") DO UPDATE SET
			"discordWebhookUrl" = excluded."discordWebhookUrl",
			"discordAlertCondition" = excluded."discordAlertCondition",
			"discordAlertsEnabled" = excluded."discordAlertsEnabled",
			"maxConcurrentTranscodes" = excluded."maxConcurrentTranscodes",
			"excludedLibraries" = excluded."excludedLibraries",
			"syncCronHour" = excluded."syncCronHour",
			"syncCronMinute" = excluded."syncCronMinute",
			"backupCronHour" = excluded."backupCronHour",
			"backupCronMinute" = excluded."backupCronMinute",
			"defaultLocale" = excluded."defaultLocale",
			"timeFormat" = excluded."timeFormat",
			"wrappedVisible" = excluded."wrappedVisible",
			"wrappedPeriodEnabled" = excluded."wrappedPeriodEnabled",
			"wrappedStartMonth" = excluded."wrappedStartMonth",
			"wrappedStartDay" = excluded."wrappedStartDay",
			"wrappedEndMonth" = excluded."wrappedEndMonth",
			"wrappedEndDay" = excluded."wrappedEndDay",
			"updatedAt" = excluded."updatedAt"
	`, driver)

	_, err := db.ExecContext(ctx, query,
		s.DiscordWebhookURL, s.DiscordAlertCondition, s.DiscordAlertsEnabled,
		s.MaxConcurrentTranscodes, exLibs, s.SyncCronHour, s.SyncCronMinute,
		s.BackupCronHour, s.BackupCronMinute, s.DefaultLocale, s.TimeFormat,
		s.WrappedVisible, s.WrappedPeriodEnabled, s.WrappedStartMonth, s.WrappedStartDay,
		s.WrappedEndMonth, s.WrappedEndDay, time.Now().UTC().Format(time.RFC3339Nano),
	)
	return err
}

// ListServers returns all configured Jellyfin servers.
func ListServers(ctx context.Context, db *sql.DB, driver string) ([]models.Server, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT "id", "jellyfinServerId", "name", "url", "jellyfinApiKey", "allowAuthFallback", "isActive", "createdAt", "updatedAt"
		FROM "Server"
		ORDER BY "createdAt" ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var servers []models.Server
	for rows.Next() {
		var s models.Server
		var apiKey sql.NullString
		var created, updated string
		if err := rows.Scan(&s.ID, &s.JellyfinServerID, &s.Name, &s.URL, &apiKey, &s.AllowAuthFallback, &s.IsActive, &created, &updated); err == nil {
			if apiKey.Valid {
				s.JellyfinAPIKey = &apiKey.String
			}
			servers = append(servers, s)
		}
	}
	return servers, nil
}

// SaveServer inserts or updates a Jellyfin server.
func SaveServer(ctx context.Context, db *sql.DB, driver string, s models.Server) (string, error) {
	if s.ID == "" {
		idBytes := make([]byte, 16)
		_, _ = rand.Read(idBytes)
		s.ID = hex.EncodeToString(idBytes)
	}

	query := database.Bind(`
		INSERT INTO "Server" ("id", "jellyfinServerId", "name", "url", "jellyfinApiKey", "allowAuthFallback", "isActive", "updatedAt")
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT("id") DO UPDATE SET
			"jellyfinServerId" = excluded."jellyfinServerId",
			"name" = excluded."name",
			"url" = excluded."url",
			"jellyfinApiKey" = COALESCE(excluded."jellyfinApiKey", "Server"."jellyfinApiKey"),
			"allowAuthFallback" = excluded."allowAuthFallback",
			"isActive" = excluded."isActive",
			"updatedAt" = excluded."updatedAt"
	`, driver)

	_, err := db.ExecContext(ctx, query,
		s.ID, s.JellyfinServerID, s.Name, s.URL, s.JellyfinAPIKey,
		s.AllowAuthFallback, s.IsActive, time.Now().UTC().Format(time.RFC3339Nano),
	)
	return s.ID, err
}

// DeleteServer removes a server and cascades to its users, media, and history.
func DeleteServer(ctx context.Context, db *sql.DB, driver, serverID string) error {
	_, err := db.ExecContext(ctx, database.Bind(`DELETE FROM "Server" WHERE "id"=?`, driver), serverID)
	return err
}

// GeneratePluginKey creates a secure random plugin API key and returns the raw key along with its scrypt hash.
func GeneratePluginKey(pepper string) (rawKey, hashedKey string, err error) {
	keyBytes := make([]byte, 32)
	if _, err := rand.Read(keyBytes); err != nil {
		return "", "", err
	}
	rawKey = "jt_" + hex.EncodeToString(keyBytes)

	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", "", err
	}

	digest, err := scrypt.Key([]byte(pepper+":"+rawKey), salt, 1<<14, 8, 1, 32)
	if err != nil {
		return "", "", err
	}

	hashedKey = "s1$" + base64.RawURLEncoding.EncodeToString(salt) + "$" + base64.RawURLEncoding.EncodeToString(digest)
	return rawKey, hashedKey, nil
}

// RotateGlobalPluginKey rotates the global plugin API key and archives the old one for the grace period.
func RotateGlobalPluginKey(ctx context.Context, db *sql.DB, driver string) (string, error) {
	pepper := os.Getenv("PLUGIN_KEY_PEPPER")
	rawKey, hashedKey, err := GeneratePluginKey(pepper)
	if err != nil {
		return "", err
	}

	// Archive current key as previous
	current, _ := GetGlobalSettings(ctx, db)
	now := time.Now().UTC()
	graceHours := current.PluginKeyRotationGraceHours
	if graceHours <= 0 {
		graceHours = 24
	}
	graceExpiry := now.Add(time.Duration(graceHours) * time.Hour).Format(time.RFC3339Nano)
	keyExpiry := now.AddDate(0, 0, current.PluginKeyRotationDays).Format(time.RFC3339Nano)

	query := database.Bind(`
		UPDATE "GlobalSettings"
		SET "pluginPreviousApiKey" = "pluginApiKey",
		    "pluginPreviousApiKeyExpiresAt" = ?,
		    "pluginApiKey" = ?,
		    "pluginKeyCreatedAt" = ?,
		    "pluginKeyExpiresAt" = ?,
		    "updatedAt" = ?
		WHERE "id" = 'global'
	`, driver)

	_, err = db.ExecContext(ctx, query,
		graceExpiry, hashedKey, now.Format(time.RFC3339Nano), keyExpiry, now.Format(time.RFC3339Nano),
	)
	if err != nil {
		return "", err
	}

	return rawKey, nil
}

// RevokeGlobalPluginKey clears the plugin key.
func RevokeGlobalPluginKey(ctx context.Context, db *sql.DB, driver string) error {
	query := database.Bind(`
		UPDATE "GlobalSettings"
		SET "pluginApiKey" = NULL,
		    "pluginPreviousApiKey" = NULL,
		    "pluginKeyExpiresAt" = NULL,
		    "updatedAt" = ?
		WHERE "id" = 'global'
	`, driver)
	_, err := db.ExecContext(ctx, query, time.Now().UTC().Format(time.RFC3339Nano))
	return err
}

func parseStringList(val any) []string {
	if val == nil {
		return []string{}
	}
	switch v := val.(type) {
	case []string:
		return v
	case string:
		var list []string
		if json.Unmarshal([]byte(v), &list) == nil {
			return list
		}
	case []byte:
		var list []string
		if json.Unmarshal(v, &list) == nil {
			return list
		}
	}
	return []string{}
}
