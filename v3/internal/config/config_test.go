package config

import (
	"log/slog"
	"testing"
)

func TestLoadDefaultsToEmbeddedSQLite(t *testing.T) {
	t.Setenv("PORT", "")
	t.Setenv("JELLYTRACK_PORT", "")
	t.Setenv("DATABASE_DRIVER", "")
	t.Setenv("DATABASE_URL", "")
	t.Setenv("DATABASE_PATH", "")
	t.Setenv("LOG_LEVEL", "")
	t.Setenv("TZ", "")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Port != "3000" || cfg.DatabaseDriver != "sqlite" || cfg.DatabasePath != "/data/jellytrack.db" || cfg.LogLevel != slog.LevelInfo {
		t.Fatalf("unexpected defaults: %+v", cfg)
	}
}

func TestLoadSupportsPortAndDatabaseOverrides(t *testing.T) {
	t.Setenv("PORT", "8080")
	t.Setenv("DATABASE_DRIVER", "postgres")
	t.Setenv("DATABASE_URL", "postgresql://db.example/jellytrack")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Port != "8080" || cfg.DatabaseDriver != "postgres" || cfg.DatabaseURL != "postgresql://db.example/jellytrack" {
		t.Fatalf("unexpected overrides: %+v", cfg)
	}

	t.Setenv("ENABLE_PPROF", "true")
	cfgPprof, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if !cfgPprof.EnablePprof {
		t.Fatal("expected EnablePprof to be true")
	}
}

func TestLoadRejectsInvalidConfiguration(t *testing.T) {
	tests := []struct {
		name   string
		port   string
		driver string
		dbURL  string
	}{
		{name: "invalid port", port: "70000", driver: "sqlite"},
		{name: "unknown database", port: "3000", driver: "mysql"},
		{name: "missing external database URL", port: "3000", driver: "postgres"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("PORT", tt.port)
			t.Setenv("JELLYTRACK_PORT", "")
			t.Setenv("DATABASE_DRIVER", tt.driver)
			t.Setenv("DATABASE_URL", tt.dbURL)
			t.Setenv("POSTGRES_PASSWORD", "")
			t.Setenv("POSTGRES_USER", "")
			t.Setenv("POSTGRES_IP", "")
			t.Setenv("DB_PASSWORD", "")
			if _, err := Load(); err == nil {
				t.Fatal("expected configuration error")
			}
		})
	}
}

func TestLoadAutoDetectsPostgresFromURLOrLegacyEnv(t *testing.T) {
	t.Run("auto-detect from DATABASE_URL", func(t *testing.T) {
		t.Setenv("DATABASE_DRIVER", "")
		t.Setenv("DATABASE_URL", "postgres://user:pass@localhost:5432/jellytrack")
		cfg, err := Load()
		if err != nil {
			t.Fatal(err)
		}
		if cfg.DatabaseDriver != "postgres" || cfg.DatabaseURL != "postgres://user:pass@localhost:5432/jellytrack" {
			t.Fatalf("expected auto-detected postgres, got %+v", cfg)
		}
	})

	t.Run("auto-detect from POSTGRES_* environment variables", func(t *testing.T) {
		t.Setenv("DATABASE_DRIVER", "")
		t.Setenv("DATABASE_URL", "")
		t.Setenv("POSTGRES_USER", "custom_user")
		t.Setenv("POSTGRES_PASSWORD", "secret123")
		t.Setenv("POSTGRES_IP", "10.0.0.5")
		t.Setenv("POSTGRES_PORT", "5433")
		t.Setenv("POSTGRES_DB", "custom_db")
		cfg, err := Load()
		if err != nil {
			t.Fatal(err)
		}
		if cfg.DatabaseDriver != "postgres" {
			t.Fatalf("expected postgres driver, got %s", cfg.DatabaseDriver)
		}
		if cfg.DatabaseURL != "postgres://custom_user:secret123@10.0.0.5:5433/custom_db?sslmode=disable" {
			t.Fatalf("unexpected constructed postgres URL: %s", cfg.DatabaseURL)
		}
	})
}

