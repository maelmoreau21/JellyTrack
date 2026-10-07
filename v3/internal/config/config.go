// Package config loads and validates runtime environment settings.
package config

import (
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port               string
	Timezone           string
	LogLevel           slog.Level
	DatabaseDriver     string
	DatabaseURL        string
	DatabasePath       string
	JellyfinURL        string
	JellyfinAPIKey     string
	JellyfinServerID   string
	JellyfinServerName string
	GeoIPDatabasePath  string
}

func Load() (Config, error) {
	port := firstNonEmpty(os.Getenv("JELLYTRACK_PORT"), os.Getenv("PORT"), "3000")
	portNumber, err := strconv.Atoi(port)
	if err != nil || portNumber < 1 || portNumber > 65535 {
		return Config{}, fmt.Errorf("PORT must be a number between 1 and 65535")
	}

	level := slog.LevelInfo
	switch strings.ToLower(strings.TrimSpace(os.Getenv("LOG_LEVEL"))) {
	case "", "info":
	case "debug":
		level = slog.LevelDebug
	case "warn", "warning":
		level = slog.LevelWarn
	case "error":
		level = slog.LevelError
	default:
		return Config{}, fmt.Errorf("LOG_LEVEL must be debug, info, warn, or error")
	}

	driver := strings.ToLower(strings.TrimSpace(os.Getenv("DATABASE_DRIVER")))
	if driver == "" {
		driver = "sqlite"
	}
	if driver != "sqlite" && driver != "postgres" {
		return Config{}, fmt.Errorf("DATABASE_DRIVER must be sqlite or postgres")
	}
	dbURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if driver == "postgres" && dbURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required when DATABASE_DRIVER=postgres")
	}

	return Config{
		Port:               strconv.Itoa(portNumber),
		Timezone:           firstNonEmpty(os.Getenv("TZ"), "UTC"),
		LogLevel:           level,
		DatabaseDriver:     driver,
		DatabaseURL:        dbURL,
		DatabasePath:       firstNonEmpty(os.Getenv("DATABASE_PATH"), "/data/jellytrack.db"),
		JellyfinURL:        firstNonEmpty(os.Getenv("JELLYFIN_URL")),
		JellyfinAPIKey:     firstNonEmpty(os.Getenv("JELLYFIN_API_KEY"), os.Getenv("JELLYTRACK_JELLYFIN_API_KEY")),
		JellyfinServerID:   firstNonEmpty(os.Getenv("JELLYFIN_SERVER_ID"), "master"),
		JellyfinServerName: firstNonEmpty(os.Getenv("JELLYFIN_SERVER_NAME"), "Master Jellyfin"),
		GeoIPDatabasePath:  firstNonEmpty(os.Getenv("GEOIP_DATABASE_PATH"), "/data/GeoLite2-Country.mmdb"),
	}, nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
