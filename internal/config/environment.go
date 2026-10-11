package config

import (
	"os"
	"strings"
)

// EnvironmentOverride distinguishes an explicitly empty value from absence.
// Aliases are evaluated in the same order for settings and authentication.
func EnvironmentOverride(fallback string, keys ...string) (string, bool) {
	for _, key := range keys {
		if value, exists := os.LookupEnv(key); exists {
			return strings.TrimSpace(value), true
		}
	}
	return fallback, false
}

func EnvironmentBool(value string) bool {
	return value == "1" || strings.EqualFold(value, "true") || strings.EqualFold(value, "yes") || strings.EqualFold(value, "on")
}
