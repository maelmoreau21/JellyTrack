package backup

import (
	"context"
	"encoding/json"
	"path/filepath"
	"testing"

	"github.com/maelmoreau21/jellytrack/internal/config"
	"github.com/maelmoreau21/jellytrack/internal/database"
)

func TestSettingsBackupKeepsAllRestoredSectionsAndSecrets(t *testing.T) {
	ctx := context.Background()
	db, err := database.Open(ctx, config.Config{DatabaseDriver: "sqlite", DatabasePath: filepath.Join(t.TempDir(), "settings.db")})
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`INSERT INTO "GlobalSettings"("id","discordAlertsEnabled","discordWebhookUrl","ssoSettings","pluginApiKey","pluginPreviousApiKey","resolutionThresholds","pluginTelemetrySettings","wrappedVisible") VALUES('global',1,'https://discord.com/api/webhooks/1/test-secret','{"clientSecret":"test-sso-secret","clientId":"test-client"}','test-plugin-secret','test-previous-secret','{"completionRules":{"default":{"completedThreshold":75}},"schedulerIntervals":{"backupEveryHours":48}}','{"precisionProfile":"balanced"}',0)`)
	if err != nil {
		t.Fatal(err)
	}
	exported, err := exportGlobalSettings(ctx, db)
	if err != nil {
		t.Fatal(err)
	}
	serialized, err := json.Marshal(exported)
	if err != nil {
		t.Fatal(err)
	}
	var payload map[string]any
	json.Unmarshal(serialized, &payload)
	if payload["pluginApiKey"] != "test-plugin-secret" || payload["ssoSettings"].(map[string]any)["clientSecret"] != "test-sso-secret" || payload["wrappedVisible"] != false || payload["pluginTelemetrySettings"] == nil {
		t.Fatal("export omitted a restored configuration section")
	}
	// Restore into a separate disposable database, without clearing any user data.
	target, err := database.Open(ctx, config.Config{DatabaseDriver: "sqlite", DatabasePath: filepath.Join(t.TempDir(), "target.db")})
	if err != nil {
		t.Fatal(err)
	}
	defer target.Close()
	tx, err := target.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err = restoreGlobalSettings(ctx, tx, "sqlite", payload); err != nil {
		tx.Rollback()
		t.Fatal(err)
	}
	if err = tx.Commit(); err != nil {
		t.Fatal(err)
	}
	restored, err := exportGlobalSettings(ctx, target)
	if err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"discordWebhookUrl", "discordAlertsEnabled", "ssoSettings", "pluginApiKey", "pluginPreviousApiKey", "resolutionThresholds", "pluginTelemetrySettings", "wrappedVisible"} {
		before, _ := json.Marshal(exported[key])
		after, _ := json.Marshal(restored[key])
		if string(before) != string(after) {
			t.Errorf("%s changed during backup roundtrip", key)
		}
	}
	legacy := map[string]any{"defaultLocale": "fr"}
	tx, err = target.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err = restoreGlobalSettings(ctx, tx, "sqlite", legacy); err != nil {
		tx.Rollback()
		t.Fatal(err)
	}
	if err = tx.Commit(); err != nil {
		t.Fatal(err)
	}
	after, err := exportGlobalSettings(ctx, target)
	if err != nil {
		t.Fatal(err)
	}
	if after["pluginApiKey"] != "test-plugin-secret" || after["ssoSettings"].(map[string]any)["clientSecret"] != "test-sso-secret" {
		t.Fatal("legacy backup erased omitted secrets")
	}
}
