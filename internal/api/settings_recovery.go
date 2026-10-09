package api

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/internal/security"
	"github.com/maelmoreau21/jellytrack/internal/settings"
)

// A settings form is a partial update: never reset unrelated fields or report
// success before the whole update has committed.
func (h *Handler) saveRecoveredSettings(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 65536)
	var input map[string]json.RawMessage
	d := json.NewDecoder(r.Body)
	if d.Decode(&input) != nil || input == nil || d.Decode(new(any)) != io.EOF {
		jsonError(w, 400, "Payload JSON invalide.")
		return
	}
	values := map[string]any{}
	boolFields := strings.Fields("discordAlertsEnabled wrappedVisible wrappedPeriodEnabled authRememberThirtyDaysEnabled")
	for _, key := range boolFields {
		if raw, ok := input[key]; ok {
			var value bool
			if string(raw) == "null" || json.Unmarshal(raw, &value) != nil {
				jsonError(w, 400, key+": booléen requis.")
				return
			}
			values[key] = value
		}
	}
	ranges := map[string][2]int{"maxConcurrentTranscodes": {0, 1000000}, "syncCronHour": {0, 23}, "syncCronMinute": {0, 59}, "backupCronHour": {0, 23}, "backupCronMinute": {0, 59}, "wrappedStartMonth": {1, 12}, "wrappedEndMonth": {1, 12}, "wrappedStartDay": {1, 31}, "wrappedEndDay": {1, 31}}
	for key, bounds := range ranges {
		if raw, ok := input[key]; ok {
			var value int
			if string(raw) == "null" || json.Unmarshal(raw, &value) != nil || value < bounds[0] || value > bounds[1] {
				jsonError(w, 400, fmt.Sprintf("%s: valeur entre %d et %d requise.", key, bounds[0], bounds[1]))
				return
			}
			values[key] = value
		}
	}
	for _, key := range []string{"discordWebhookUrl", "discordAlertCondition", "defaultLocale", "timeFormat"} {
		if raw, ok := input[key]; ok {
			var value string
			if json.Unmarshal(raw, &value) != nil || (string(raw) == "null" && key != "discordWebhookUrl") {
				jsonError(w, 400, key+": texte requis.")
				return
			}
			value = strings.TrimSpace(value)
			valid := true
			switch key {
			case "discordWebhookUrl":
				if value != "" {
					u, err := url.Parse(value)
					valid = err == nil && u.Scheme == "https" && u.User == nil && u.Port() == "" && (u.Hostname() == "discord.com" || u.Hostname() == "discordapp.com" || u.Hostname() == "canary.discord.com" || u.Hostname() == "ptb.discord.com") && strings.HasPrefix(u.Path, "/api/webhooks/") && len(strings.Split(strings.Trim(u.Path, "/"), "/")) >= 4
				}
			case "discordAlertCondition":
				valid = value == "ALL" || value == "TRANSCODE_ONLY" || value == "NEW_IP_ONLY"
			case "defaultLocale":
				valid = strings.Contains("|fr|en|de|es|it|nl|pl|pt-BR|ru|zh|", "|"+value+"|") && value != ""
			case "timeFormat":
				valid = value == "12h" || value == "24h"
			}
			if !valid {
				jsonError(w, 400, key+": valeur invalide.")
				return
			}
			values[key] = value
		}
	}
	if raw, ok := input["excludedLibraries"]; ok {
		var libs []string
		if string(raw) == "null" || json.Unmarshal(raw, &libs) != nil {
			jsonError(w, 400, "excludedLibraries: liste requise.")
			return
		}
		clean := []string{}
		seen := map[string]bool{}
		for _, lib := range libs {
			lib = strings.TrimSpace(lib)
			if lib != "" && !seen[lib] {
				clean = append(clean, lib)
				seen[lib] = true
			}
		}
		b, _ := json.Marshal(clean)
		values["excludedLibraries"] = string(b)
	}
	for _, key := range []string{"resolutionThresholds", "schedulerIntervals", "pluginTelemetrySettings"} {
		if raw, ok := input[key]; ok {
			var object map[string]any
			if json.Unmarshal(raw, &object) != nil || object == nil {
				jsonError(w, 400, key+": objet requis.")
				return
			}
			if key == "schedulerIntervals" {
				if err := validateSchedulerIntervals(object); err != nil {
					jsonError(w, 400, err.Error())
					return
				}
			}
			values[key] = object
		}
	}
	for key := range input {
		if _, ok := values[key]; !ok {
			jsonError(w, 400, "Réglage non supporté: "+key)
			return
		}
	}
	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		jsonError(w, 500, "Impossible d'enregistrer les réglages.")
		return
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(r.Context(), `INSERT INTO "GlobalSettings"("id") VALUES('global') ON CONFLICT DO NOTHING`); err != nil {
		jsonError(w, 500, "Impossible d'enregistrer les réglages.")
		return
	}
	// Resolve both halves before validating the Wrapped calendar date.
	var sm, sd, em, ed int
	if err = tx.QueryRowContext(r.Context(), `SELECT "wrappedStartMonth","wrappedStartDay","wrappedEndMonth","wrappedEndDay" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&sm, &sd, &em, &ed); err != nil {
		jsonError(w, 500, "Impossible de lire les réglages.")
		return
	}
	for key, dest := range map[string]*int{"wrappedStartMonth": &sm, "wrappedStartDay": &sd, "wrappedEndMonth": &em, "wrappedEndDay": &ed} {
		if v, ok := values[key].(int); ok {
			*dest = v
		}
	}
	dateChanged := input["wrappedStartMonth"] != nil || input["wrappedStartDay"] != nil || input["wrappedEndMonth"] != nil || input["wrappedEndDay"] != nil
	if dateChanged && (time.Date(2024, time.Month(sm), sd, 0, 0, 0, 0, time.UTC).Month() != time.Month(sm) || time.Date(2024, time.Month(em), ed, 0, 0, 0, 0, time.UTC).Month() != time.Month(em)) {
		jsonError(w, 400, "Date Wrapped invalide.")
		return
	}
	if values["resolutionThresholds"] != nil || values["schedulerIntervals"] != nil {
		var raw sql.NullString
		if err = tx.QueryRowContext(r.Context(), `SELECT "resolutionThresholds" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&raw); err != nil {
			jsonError(w, 500, "Impossible de lire les réglages.")
			return
		}
		merged := map[string]any{}
		if raw.Valid && raw.String != "" && json.Unmarshal([]byte(raw.String), &merged) != nil {
			jsonError(w, 500, "Configuration existante invalide.")
			return
		}
		if merged == nil {
			merged = map[string]any{}
		}
		if object, ok := values["resolutionThresholds"].(map[string]any); ok {
			for key, value := range object {
				merged[key] = value
			}
		}
		if object, ok := values["schedulerIntervals"].(map[string]any); ok {
			current, _ := merged["schedulerIntervals"].(map[string]any)
			if current == nil {
				current = map[string]any{}
			}
			for key, value := range object {
				current[key] = value
			}
			merged["schedulerIntervals"] = current
		}
		b, _ := json.Marshal(merged)
		values["resolutionThresholds"] = string(b)
		delete(values, "schedulerIntervals")
	}
	if object, ok := values["pluginTelemetrySettings"].(map[string]any); ok {
		b, _ := json.Marshal(settings.NormalizeTelemetry(object))
		values["pluginTelemetrySettings"] = string(b)
	}
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		if _, err = tx.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "`+key+`"=? WHERE "id"='global'`, h.driver), values[key]); err != nil {
			jsonError(w, 500, "Impossible d'enregistrer les réglages.")
			return
		}
	}
	if _, err = tx.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "updatedAt"=? WHERE "id"='global'`, h.driver), time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		jsonError(w, 500, "Impossible d'enregistrer les réglages.")
		return
	}
	if err = tx.Commit(); err != nil {
		jsonError(w, 500, "Impossible d'enregistrer les réglages.")
		return
	}
	jsonResponse(w, 200, map[string]bool{"ok": true})
}

func validateSchedulerIntervals(v map[string]any) error {
	limits := map[string][2]int{"recentSyncEveryHours": {1, 168}, "fullSyncEveryHours": {24, 168}, "backupEveryHours": {1, 168}, "integrityCheckEveryHours": {1, 168}, "logRetentionDays": {0, 365}}
	for key, value := range v {
		bounds, ok := limits[key]
		n, numeric := value.(float64)
		if !ok || !numeric || n != float64(int(n)) || n < float64(bounds[0]) || n > float64(bounds[1]) || (key == "fullSyncEveryHours" && int(n)%24 != 0) {
			return fmt.Errorf("Intervalle invalide: %s", key)
		}
	}
	return nil
}

func (h *Handler) saveRecoveredSSO(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 16384)
	var input map[string]any
	if json.NewDecoder(r.Body).Decode(&input) != nil || input == nil {
		jsonError(w, 400, "Payload JSON invalide.")
		return
	}
	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		jsonError(w, 500, "Impossible d'enregistrer SSO.")
		return
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(r.Context(), `INSERT INTO "GlobalSettings"("id") VALUES('global') ON CONFLICT DO NOTHING`); err != nil {
		jsonError(w, 500, "Impossible d'enregistrer SSO.")
		return
	}
	var raw sql.NullString
	if err = tx.QueryRowContext(r.Context(), `SELECT "ssoSettings" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&raw); err != nil {
		jsonError(w, 500, "Impossible de lire SSO.")
		return
	}
	config := map[string]any{"enabled": false, "url": "", "clientId": "", "clientSecret": "", "userGroup": "", "adminGroup": "", "tokenAlg": "RS256", "autoRedirect": true}
	if raw.Valid && raw.String != "" && json.Unmarshal([]byte(raw.String), &config) != nil {
		jsonError(w, 500, "Configuration SSO existante invalide.")
		return
	}
	if config == nil {
		config = map[string]any{"enabled": false, "url": "", "clientId": "", "clientSecret": "", "userGroup": "", "adminGroup": "", "tokenAlg": "RS256", "autoRedirect": true}
	}
	keep, _ := input["keepExistingSecret"].(bool)
	for key, value := range input {
		switch key {
		case "keepExistingSecret":
			if _, ok := value.(bool); !ok {
				jsonError(w, 400, "keepExistingSecret: booléen requis.")
				return
			}
		case "enabled", "autoRedirect":
			if _, ok := value.(bool); !ok {
				jsonError(w, 400, key+": booléen requis.")
				return
			}
			config[key] = value
		case "url", "clientId", "clientSecret", "userGroup", "adminGroup", "tokenAlg":
			v, ok := value.(string)
			if !ok {
				jsonError(w, 400, key+": texte requis.")
				return
			}
			v = strings.TrimSpace(v)
			if key == "clientSecret" && (strings.Contains(v, "••••") || (keep && v == "")) {
				continue
			}
			if key == "url" {
				v = strings.TrimRight(v, "/")
				if v != "" {
					if _, err = security.ValidateSafeServerURL(v); err != nil {
						jsonError(w, 400, "URL SSO invalide.")
						return
					}
				}
			}
			if key == "tokenAlg" && v != "RS256" {
				jsonError(w, 400, "SSO requiert RS256.")
				return
			}
			config[key] = v
		default:
			jsonError(w, 400, "Réglage SSO non supporté: "+key)
			return
		}
	}
	b, _ := json.Marshal(config)
	if _, err = tx.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "ssoSettings"=?,"updatedAt"=? WHERE "id"='global'`, h.driver), string(b), time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		jsonError(w, 500, "Impossible d'enregistrer SSO.")
		return
	}
	if err = tx.Commit(); err != nil {
		jsonError(w, 500, "Impossible d'enregistrer SSO.")
		return
	}
	h.getSSO(w, r)
}
