// Package config loads and validates runtime environment settings.
package config

import (
	"fmt"
	"log/slog"
	"net"
	"net/url"
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
	EnablePprof        bool
}

// LoadDotEnv loads .env and .env.local files into the process environment if present.
func LoadDotEnv() {
	for _, name := range []string{".env", ".env.local"} {
		data, err := os.ReadFile(name)
		if err != nil {
			continue
		}
		for _, line := range strings.Split(string(data), "\n") {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			if strings.HasPrefix(line, "export ") {
				line = strings.TrimSpace(strings.TrimPrefix(line, "export "))
			}
			idx := strings.Index(line, "=")
			if idx <= 0 {
				continue
			}
			key := strings.TrimSpace(line[:idx])
			val := strings.TrimSpace(line[idx+1:])
			if len(val) >= 2 && ((val[0] == '"' && val[len(val)-1] == '"') || (val[0] == '\'' && val[len(val)-1] == '\'')) {
				val = val[1 : len(val)-1]
			}
			if os.Getenv(key) == "" {
				_ = os.Setenv(key, val)
			}
		}
	}
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

	driver, dbURL, dbPath, err := resolveDatabase()
	if err != nil {
		return Config{}, err
	}

	return Config{
		Port:               strconv.Itoa(portNumber),
		Timezone:           firstNonEmpty(os.Getenv("TZ"), "UTC"),
		LogLevel:           level,
		DatabaseDriver:     driver,
		DatabaseURL:        dbURL,
		DatabasePath:       dbPath,
		JellyfinURL:        firstNonEmpty(os.Getenv("JELLYFIN_URL")),
		JellyfinAPIKey:     firstNonEmpty(os.Getenv("JELLYFIN_API_KEY"), os.Getenv("JELLYTRACK_JELLYFIN_API_KEY")),
		JellyfinServerID:   firstNonEmpty(os.Getenv("JELLYFIN_SERVER_ID"), "master"),
		JellyfinServerName: firstNonEmpty(os.Getenv("JELLYFIN_SERVER_NAME"), "Master Jellyfin"),
		GeoIPDatabasePath:  firstNonEmpty(os.Getenv("GEOIP_DATABASE_PATH"), "/data/GeoLite2-Country.mmdb"),
		EnablePprof:        strings.EqualFold(os.Getenv("ENABLE_PPROF"), "true") || strings.EqualFold(os.Getenv("JELLYTRACK_PPROF"), "true"),
	}, nil
}

func resolveDatabase() (driver, dbURL, dbPath string, err error) {
	explicitDriver := strings.ToLower(strings.TrimSpace(os.Getenv("DATABASE_DRIVER")))
	rawURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	dbPath = firstNonEmpty(os.Getenv("DATABASE_PATH"), "/data/jellytrack.db")

	pgURL := ResolvePostgresURL()
	urlIsPG := strings.HasPrefix(rawURL, "postgres://") || strings.HasPrefix(rawURL, "postgresql://")

	switch explicitDriver {
	case "sqlite":
		driver = "sqlite"
		dbURL = rawURL
	case "postgres":
		driver = "postgres"
		if rawURL != "" {
			dbURL = rawURL
		} else if pgURL != "" {
			dbURL = pgURL
		} else {
			return "", "", "", fmt.Errorf("DATABASE_URL is required when DATABASE_DRIVER=postgres")
		}
	case "":
		if urlIsPG {
			driver = "postgres"
			dbURL = rawURL
		} else if pgURL != "" && hasPostgresConfig() {
			driver = "postgres"
			dbURL = pgURL
		} else {
			driver = "sqlite"
			dbURL = rawURL
		}
	default:
		return "", "", "", fmt.Errorf("DATABASE_DRIVER must be sqlite or postgres")
	}

	return driver, dbURL, dbPath, nil
}

func hasPostgresConfig() bool {
	return firstNonEmpty(
		os.Getenv("JELLYTRACK_DB_HOST"),
		os.Getenv("DB_HOST"),
		os.Getenv("POSTGRES_IP"),
		os.Getenv("JELLYTRACK_DB_PASSWORD"),
		os.Getenv("DB_PASSWORD"),
		os.Getenv("POSTGRES_PASSWORD"),
		os.Getenv("JELLYTRACK_DB_USER"),
		os.Getenv("DB_USER"),
		os.Getenv("POSTGRES_USER"),
	) != ""
}

// ResolvePostgresURL extracts or constructs a PostgreSQL DSN from legacy and standard environment variables.
func ResolvePostgresURL() string {
	raw := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if strings.HasPrefix(raw, "postgres://") || strings.HasPrefix(raw, "postgresql://") {
		return raw
	}
	user := firstNonEmpty(os.Getenv("JELLYTRACK_DB_USER"), os.Getenv("DB_USER"), os.Getenv("POSTGRES_USER"))
	pass := firstNonEmpty(os.Getenv("JELLYTRACK_DB_PASSWORD"), os.Getenv("DB_PASSWORD"), os.Getenv("POSTGRES_PASSWORD"))
	host := firstNonEmpty(os.Getenv("JELLYTRACK_DB_HOST"), os.Getenv("DB_HOST"), os.Getenv("POSTGRES_IP"))
	port := firstNonEmpty(os.Getenv("JELLYTRACK_DB_PORT"), os.Getenv("DB_PORT"), os.Getenv("POSTGRES_PORT"), "5432")
	dbName := firstNonEmpty(os.Getenv("JELLYTRACK_DB_NAME"), os.Getenv("DB_NAME"), os.Getenv("POSTGRES_DB"))

	if user == "" && pass == "" && host == "" && (dbName == "" || dbName == "JellyTrack") {
		return ""
	}
	if user == "" {
		user = "JellyTrack"
	}
	if host == "" {
		host = "postgres"
	}
	if dbName == "" {
		dbName = "JellyTrack"
	}

	if h, p, err := net.SplitHostPort(host); err == nil && h != "" {
		host = h
		if port == "5432" || port == "" {
			port = p
		}
	}

	var userInfo *url.Userinfo
	if pass != "" {
		userInfo = url.UserPassword(user, pass)
	} else {
		userInfo = url.User(user)
	}
	sslMode := firstNonEmpty(os.Getenv("DB_SSLMODE"), os.Getenv("POSTGRES_SSLMODE"), "disable")
	u := url.URL{
		Scheme:   "postgres",
		User:     userInfo,
		Host:     net.JoinHostPort(host, port),
		Path:     "/" + strings.TrimPrefix(dbName, "/"),
		RawQuery: "sslmode=" + sslMode,
	}
	return u.String()
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
