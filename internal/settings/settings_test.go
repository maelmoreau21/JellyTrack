package settings

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/maelmoreau21/jellytrack/internal/config"
	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/internal/models"
)

func TestSettingsAndServers(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "settings_test.db")
	db, err := database.Open(context.Background(), config.Config{
		DatabaseDriver: "sqlite",
		DatabasePath:   dbPath,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	ctx := context.Background()

	// Initial settings
	s, err := GetGlobalSettings(ctx, db)
	if err != nil {
		t.Fatal(err)
	}
	if s.DefaultLocale != "en" {
		t.Errorf("expected default locale en, got %s", s.DefaultLocale)
	}

	// Update settings
	s.DefaultLocale = "fr"
	s.ExcludedLibraries = []string{"Home Videos"}
	if err := UpdateGlobalSettings(ctx, db, "sqlite", s); err != nil {
		t.Fatal(err)
	}

	sUpdated, err := GetGlobalSettings(ctx, db)
	if err != nil {
		t.Fatal(err)
	}
	if sUpdated.DefaultLocale != "fr" {
		t.Errorf("expected updated locale fr, got %s", sUpdated.DefaultLocale)
	}
	if len(sUpdated.ExcludedLibraries) != 1 || sUpdated.ExcludedLibraries[0] != "Home Videos" {
		t.Errorf("expected excluded libraries [Home Videos], got %+v", sUpdated.ExcludedLibraries)
	}

	// Save and list server
	srvID, err := SaveServer(ctx, db, "sqlite", models.Server{
		JellyfinServerID: "jf_primary",
		Name:             "Primary Jellyfin",
		URL:              "http://jf.local:8096",
		IsActive:         true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if srvID == "" {
		t.Error("expected non-empty server ID")
	}

	servers, err := ListServers(ctx, db, "sqlite")
	if err != nil {
		t.Fatal(err)
	}
	if len(servers) != 1 || servers[0].Name != "Primary Jellyfin" {
		t.Fatalf("unexpected servers: %+v", servers)
	}
}
