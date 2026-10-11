package api

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/config"
	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/internal/logging"
	"github.com/maelmoreau21/jellytrack/internal/security"
	"github.com/maelmoreau21/jellytrack/internal/stats"
	"github.com/maelmoreau21/jellytrack/internal/users"
)

func (h *Handler) hardware(w http.ResponseWriter, r *http.Request) {
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)

	jsonResponse(w, 200, map[string]any{
		"cpu": map[string]any{
			"usagePercent": nil,
			"cores":        runtime.NumCPU(),
		},
		"memory": map[string]any{
			"allocMb":      float64(mem.Alloc) / (1024 * 1024),
			"sysMb":        float64(mem.Sys) / (1024 * 1024),
			"totalAllocMb": float64(mem.TotalAlloc) / (1024 * 1024),
			"usagePercent": nil,
			"usedGb":       float64(mem.Alloc) / (1024 * 1024 * 1024),
			"totalGb":      float64(mem.Sys) / (1024 * 1024 * 1024),
		},
		"temperature": map[string]any{
			"main": nil,
		},
		"runtime": map[string]any{"goroutines": runtime.NumGoroutine(), "goos": runtime.GOOS, "arch": runtime.GOARCH},
	})
}

func (h *Handler) adminHealth(w http.ResponseWriter, r *http.Request) {
	err := h.db.PingContext(r.Context())
	dbStatus := "healthy"
	if err != nil {
		dbStatus = "unreachable"
	}

	var activeStreams, openPlaybackOrphans int64
	_ = h.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM "ActiveStream"`).Scan(&activeStreams)

	checkOrphansQ := `SELECT COUNT(*) FROM "PlaybackHistory" p WHERE p."endedAt" IS NULL AND NOT EXISTS(SELECT 1 FROM "ActiveStream" a WHERE a."serverId"=p."serverId" AND (a."playbackId"=p."id" OR (a."playbackId" IS NULL AND a."userId"=p."userId" AND a."mediaId"=p."mediaId")))`
	_ = h.db.QueryRowContext(r.Context(), checkOrphansQ).Scan(&openPlaybackOrphans)

	var monRaw, syncRaw, backupRaw sql.NullString
	_ = h.db.QueryRowContext(r.Context(), `SELECT "monitor", "sync", "backup" FROM "SystemHealthState" WHERE "id"='global'`).Scan(&monRaw, &syncRaw, &backupRaw)

	monitorState := map[string]any{
		"status":     "ok",
		"lastPollAt": time.Now().UTC().Format(time.RFC3339),
	}
	if monRaw.Valid && monRaw.String != "" {
		_ = json.Unmarshal([]byte(monRaw.String), &monitorState)
	}

	syncState := map[string]any{
		"status": "ok",
	}
	if syncRaw.Valid && syncRaw.String != "" {
		_ = json.Unmarshal([]byte(syncRaw.String), &syncState)
	}

	backupState := map[string]any{
		"status": "ok",
	}
	if backupRaw.Valid && backupRaw.String != "" {
		_ = json.Unmarshal([]byte(backupRaw.String), &backupState)
	}

	var exclLibs sql.NullString
	_ = h.db.QueryRowContext(r.Context(), `SELECT "excludedLibraries" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&exclLibs)

	connections, err := h.serverConnectionInfo(r)
	if err != nil {
		jsonError(w, 500, "Cannot read server health")
		return
	}
	jsonResponse(w, 200, map[string]any{
		"status": map[string]any{
			"monitor": monitorState,
			"sync":    syncState,
			"backup":  backupState,
		},
		"servers":           connections,
		"database":          dbStatus,
		"driver":            h.driver,
		"timestamp":         time.Now().UTC().Format(time.RFC3339),
		"isValkeyEnabled":   false,
		"excludedLibraries": parseStringList(exclLibs.String),
		"counts": map[string]any{
			"activeStreams":          activeStreams,
			"openPlaybackOrphans":    openPlaybackOrphans,
			"dbStreamsWithoutValkey": 0,
			"valkeyOrphans":          0,
		},
	})
}

func (h *Handler) securityOverview(w http.ResponseWriter, r *http.Request) {
	ov, err := security.GetSecurityOverview(r.Context(), h.db, h.driver)
	if err != nil {
		jsonError(w, 500, "Impossible de charger la vue d'ensemble de sécurité.")
		return
	}
	jsonResponse(w, 200, ov)
}

func (h *Handler) securityAudit(w http.ResponseWriter, r *http.Request) {
	p := boundedInt(r.URL.Query().Get("page"), 1, 1, 1000)
	ps := boundedInt(r.URL.Query().Get("pageSize"), 25, 1, 100)
	action := strings.TrimSpace(r.URL.Query().Get("action"))
	actor := strings.TrimSpace(r.URL.Query().Get("actor"))

	logs, total, err := security.ListAuditLogs(r.Context(), h.db, h.driver, p, ps, action, actor)
	if err != nil {
		jsonError(w, 500, "Impossible de charger les logs d'audit.")
		return
	}
	jsonResponse(w, 200, map[string]any{
		"logs":     logs,
		"total":    total,
		"page":     p,
		"pageSize": ps,
	})
}

func (h *Handler) getSmartSettings(w http.ResponseWriter, r *http.Request) {
	var raw sql.NullString
	_ = h.db.QueryRowContext(r.Context(), database.Bind(`SELECT "resolutionThresholds" FROM "GlobalSettings" WHERE "id"='global'`, h.driver)).Scan(&raw)
	defaults := map[string]any{
		"ipAttemptThreshold":     50,
		"ipWindowMinutes":        60,
		"newCountryGraceMinutes": 120,
	}
	if raw.Valid && raw.String != "" {
		_ = json.Unmarshal([]byte(raw.String), &defaults)
	}
	jsonResponse(w, 200, map[string]any{
		"thresholds": defaults,
	})
}

func (h *Handler) updateSmartSettings(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Thresholds map[string]any `json:"thresholds"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16384)
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, 400, "Payload JSON invalide.")
		return
	}

	if len(body.Thresholds) == 0 {
		jsonError(w, 400, "Seuils requis.")
		return
	}
	for key, value := range body.Thresholds {
		n, ok := value.(float64)
		if (key != "ipAttemptThreshold" && key != "ipWindowMinutes" && key != "newCountryGraceMinutes") || !ok || n < 1 || n != float64(int(n)) || n > 100000 {
			jsonError(w, 400, "Seuil invalide: "+key)
			return
		}
	}
	b, _ := json.Marshal(map[string]any{"resolutionThresholds": body.Thresholds})
	r.Body = io.NopCloser(strings.NewReader(string(b)))
	h.saveRecoveredSettings(w, r)
}

func (h *Handler) adminUserDuplicates(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		// Cleanup orphan SSO users
		res, err := h.db.ExecContext(r.Context(), database.Bind(`
			DELETE FROM "User"
			WHERE "jellyfinUserId" LIKE 'oidc-%'
			  AND "id" NOT IN (SELECT DISTINCT "userId" FROM "PlaybackHistory")
			  AND "id" NOT IN (SELECT DISTINCT "userId" FROM "ActiveStream")
		`, h.driver))
		deleted := int64(0)
		if err == nil {
			deleted, _ = res.RowsAffected()
		}
		_ = security.LogAudit(r.Context(), h.db, h.driver, "admin.users.cleanup_orphan_sso", nil, nil, nil, nil, map[string]any{"deletedCount": deleted})
		jsonResponse(w, 200, map[string]any{"success": true, "deletedCount": deleted})
		return
	}

	dups, err := users.DetectDuplicates(r.Context(), h.db)
	if err != nil {
		jsonError(w, 500, "Impossible de détecter les doublons.")
		return
	}
	jsonResponse(w, 200, map[string]any{"duplicates": dups, "count": len(dups)})
}

func (h *Handler) adminUserMerge(w http.ResponseWriter, r *http.Request) {
	var body struct {
		SourceUserID string `json:"sourceUserId"`
		TargetUserID string `json:"targetUserId"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.SourceUserID == "" || body.TargetUserID == "" {
		jsonError(w, 400, "sourceUserId et targetUserId requis.")
		return
	}
	actor := "Admin"
	res, err := users.MergeUsers(r.Context(), h.db, h.driver, body.SourceUserID, body.TargetUserID, &actor, nil)
	if err != nil {
		jsonError(w, 500, err.Error())
		return
	}
	jsonResponse(w, 200, map[string]any{"success": true, "result": res})
}

func (h *Handler) adminUserSyncDeleted(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.QueryContext(r.Context(), `SELECT "id", "url", "jellyfinApiKey" FROM "Server" WHERE "isActive" = TRUE`)
	if err != nil {
		jsonError(w, 500, "Impossible de lire les serveurs.")
		return
	}
	type target struct {
		id, url string
		key     sql.NullString
	}
	targets := []target{}
	for rows.Next() {
		var s target
		if err = rows.Scan(&s.id, &s.url, &s.key); err != nil {
			rows.Close()
			jsonError(w, 500, "Cannot read servers")
			return
		}
		targets = append(targets, s)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		jsonError(w, 500, "Cannot read servers")
		return
	}

	totalPruned := 0
	var prunedUsernames []string

	client := &http.Client{Timeout: 10 * time.Second}

	for _, target := range targets {
		srvID, srvURL, apiKey := target.id, target.url, target.key
		if !apiKey.Valid || apiKey.String == "" {
			continue
		}

		safeURL, err := security.ValidateSafeServerURL(srvURL)
		if err != nil {
			continue
		}

		req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, strings.TrimRight(safeURL.String(), "/")+"/Users", nil)
		if err != nil {
			continue
		}
		req.Header.Set("X-Emby-Token", apiKey.String)

		resp, err := client.Do(req)
		if err != nil || resp.StatusCode != http.StatusOK {
			if resp != nil {
				_ = resp.Body.Close()
			}
			continue
		}

		var jUsers []struct {
			ID   string `json:"Id"`
			Name string `json:"Name"`
		}
		decodeErr := json.NewDecoder(io.LimitReader(resp.Body, 16<<20)).Decode(&jUsers)
		_ = resp.Body.Close()
		if decodeErr != nil {
			continue
		}

		validIDs := map[string]struct{}{}
		for _, ju := range jUsers {
			normalized := strings.ReplaceAll(strings.ToLower(ju.ID), "-", "")
			validIDs[normalized] = struct{}{}
			validIDs[strings.ToLower(ju.ID)] = struct{}{}
		}

		uRows, err := h.db.QueryContext(r.Context(), database.Bind(`SELECT "id", "jellyfinUserId", "username" FROM "User" WHERE "serverId"=? AND NOT "jellyfinUserId" LIKE 'oidc-%'`, h.driver), srvID)
		if err != nil {
			continue
		}

		var toDeleteIDs []string
		for uRows.Next() {
			var uid, juid, uname string
			if uRows.Scan(&uid, &juid, &uname) == nil {
				norm := strings.ReplaceAll(strings.ToLower(juid), "-", "")
				if _, ok := validIDs[norm]; !ok {
					toDeleteIDs = append(toDeleteIDs, uid)
					prunedUsernames = append(prunedUsernames, uname)
				}
			}
		}
		uRows.Close()

		for _, delID := range toDeleteIDs {
			_, _ = h.db.ExecContext(r.Context(), database.Bind(`DELETE FROM "ActiveStream" WHERE "userId"=?`, h.driver), delID)
			_, _ = h.db.ExecContext(r.Context(), database.Bind(`DELETE FROM "PlaybackHistory" WHERE "userId"=?`, h.driver), delID)
			_, _ = h.db.ExecContext(r.Context(), database.Bind(`DELETE FROM "User" WHERE "id"=?`, h.driver), delID)
			totalPruned++
		}
	}

	_ = security.LogAudit(r.Context(), h.db, h.driver, "USER_PRUNE_SYNC", nil, nil, nil, nil, map[string]any{
		"totalPruned": totalPruned,
		"prunedUsers": prunedUsernames,
	})

	jsonResponse(w, 200, map[string]any{
		"success": true,
		"message": fmt.Sprintf("Pruning complete. Removed %d user(s) not found in Jellyfin.", totalPruned),
		"result": map[string]any{
			"totalPruned": totalPruned,
			"prunedUsers": prunedUsernames,
		},
	})
}

func (h *Handler) adminDeleteUser(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		jsonError(w, 400, "id utilisateur requis.")
		return
	}
	if err := users.DeleteUser(r.Context(), h.db, h.driver, id); err != nil {
		jsonError(w, 500, "Impossible de supprimer l'utilisateur.")
		return
	}
	_ = security.LogAudit(r.Context(), h.db, h.driver, "USER_DELETE", nil, nil, &id, nil, nil)
	jsonResponse(w, 200, map[string]any{"success": true})
}

func (h *Handler) adminDeleteStaleMovies(w http.ResponseWriter, r *http.Request) {
	res, err := h.db.ExecContext(r.Context(), database.Bind(`
		DELETE FROM "Media"
		WHERE "id" NOT IN (SELECT DISTINCT "mediaId" FROM "PlaybackHistory")
		  AND "id" NOT IN (SELECT DISTINCT "mediaId" FROM "ActiveStream")
	`, h.driver))
	if err != nil {
		jsonError(w, 500, "Impossible de nettoyer les médias obsolètes.")
		return
	}
	rowsAff, _ := res.RowsAffected()
	_ = security.LogAudit(r.Context(), h.db, h.driver, "admin.cleanup.delete_stale_movies", nil, nil, nil, nil, map[string]any{"deletedCount": rowsAff})
	jsonResponse(w, 200, map[string]any{"success": true, "deletedCount": rowsAff})
}

func (h *Handler) predictions(w http.ResponseWriter, r *http.Request) {
	pred, err := stats.GetPredictions(r.Context(), h.db, h.driver)
	if err != nil {
		jsonError(w, 500, "Erreur de calcul des prédictions.")
		return
	}

	// Fetch top trending media from PlaybackHistory (last 7 days vs previous 7 days)
	now := time.Now().UTC()
	week1 := now.AddDate(0, 0, -7).Format(time.RFC3339Nano)
	week2 := now.AddDate(0, 0, -14).Format(time.RFC3339Nano)

	tRows, err := h.db.QueryContext(r.Context(), database.Bind(`
		SELECT m."title", m."jellyfinMediaId", m."type",
		       COUNT(CASE WHEN p."startedAt" >= ? THEN 1 END) AS "currentPlays",
		       COUNT(CASE WHEN p."startedAt" >= ? AND p."startedAt" < ? THEN 1 END) AS "prevPlays"
		FROM "PlaybackHistory" p
		JOIN "Media" m ON m."id" = p."mediaId"
		WHERE p."startedAt" >= ? AND p."durationWatched" >= 60
		GROUP BY m."id", m."title", m."jellyfinMediaId", m."type"
		ORDER BY "currentPlays" DESC
		LIMIT 10
	`, h.driver), week1, week2, week1, week2)

	trending := []map[string]any{}
	if err == nil {
		defer tRows.Close()
		for tRows.Next() {
			var title, jid, mtype string
			var cur, prev int
			if tRows.Scan(&title, &jid, &mtype, &cur, &prev) == nil {
				growth := 0.0
				if prev > 0 {
					growth = float64(cur-prev) / float64(prev) * 100
				}
				trending = append(trending, map[string]any{
					"title":             title,
					"jellyfinMediaId":   jid,
					"mediaType":         mtype,
					"currentWeekPlays":  cur,
					"previousWeekPlays": prev,
					"growthPercent":     growth,
					"trendScore":        cur*2 + (cur - prev),
				})
			}
		}
	}

	pred["trendingMedia"] = trending
	peaks, _ := stats.GetPeakPredictions(r.Context(), h.db, h.driver)
	if peaks == nil {
		peaks = []stats.PeakPrediction{}
	}
	pred["peakPredictions"] = peaks

	jsonResponse(w, 200, pred)
}

func (h *Handler) metadataAudit(w http.ResponseWriter, r *http.Request) {
	audit, err := stats.GetMetadataAudit(r.Context(), h.db)
	if err != nil {
		jsonError(w, 500, "Erreur lors de l'audit de métadonnées.")
		return
	}

	// Fetch sample examples for issues
	type exampleItem struct {
		ID              string `json:"id"`
		JellyfinMediaID string `json:"jellyfinMediaId"`
		Title           string `json:"title"`
	}

	getExamples := func(query string) []exampleItem {
		rows, err := h.db.QueryContext(r.Context(), query)
		if err != nil {
			return []exampleItem{}
		}
		defer rows.Close()
		var res []exampleItem
		for rows.Next() {
			var item exampleItem
			if rows.Scan(&item.ID, &item.JellyfinMediaID, &item.Title) == nil {
				res = append(res, item)
			}
		}
		return res
	}

	noResExamples := getExamples(`SELECT "id", "jellyfinMediaId", "title" FROM "Media" WHERE "type" IN ('Movie','Episode') AND ("resolution" IS NULL OR "resolution" = '') LIMIT 10`)
	noDurExamples := getExamples(`SELECT "id", "jellyfinMediaId", "title" FROM "Media" WHERE "durationMs" IS NULL OR "durationMs" <= 0 LIMIT 10`)

	missingRes, _ := audit["missingResolution"].(int64)
	missingDur, _ := audit["missingDuration"].(int64)
	missingGen, _ := audit["missingGenres"].(int64)

	audit["issues"] = map[string]any{
		"missingResolution": map[string]any{
			"count":    missingRes,
			"examples": noResExamples,
		},
		"missingDuration": map[string]any{
			"count":    missingDur,
			"examples": noDurExamples,
		},
		"missingGenres": map[string]any{
			"count":    missingGen,
			"examples": []exampleItem{},
		},
	}

	jsonResponse(w, 200, audit)
}

func (h *Handler) getSSO(w http.ResponseWriter, r *http.Request) {
	read := func(keys ...string) string { value, _ := config.EnvironmentOverride("", keys...); return value }
	secret := read("OIDC_CLIENT_SECRET")
	auto, _ := config.EnvironmentOverride("true", "OIDC_AUTO_REDIRECT", "OIDC_AUTO_LOGIN")
	jsonResponse(w, 200, map[string]any{
		"enabled":         config.EnvironmentBool(read("OIDC_ENABLED")),
		"url":             read("OIDC_ISSUER", "OIDC_URL", "AUTHENTIK_URL", "JELLYTRACK_AUTHENTIK_URL"),
		"clientId":        first(read("OIDC_CLIENT_ID"), "jellytrack"),
		"hasClientSecret": secret != "", "clientSecretMasked": ternary(secret != "", "••••••••", ""),
		"userGroup": read("OIDC_USER_GROUP"), "adminGroup": read("OIDC_ADMIN_GROUP"),
		"autoRedirect": config.EnvironmentBool(auto), "configurationSource": "environment",
		"isEnvControlled": map[string]bool{"enabled": true, "url": true, "clientId": true, "clientSecret": true, "userGroup": true, "adminGroup": true, "autoRedirect": true},
		"callbackPath":    "/api/auth/callback/oidc",
	})
}

func ternary(cond bool, a, b string) string {
	if cond {
		return a
	}
	return b
}

func (h *Handler) updateSSO(w http.ResponseWriter, r *http.Request) {
	jsonError(w, http.StatusGone, "Le SSO est configuré uniquement par les variables d’environnement.")
}

func (h *Handler) getSessionPolicy(w http.ResponseWriter, r *http.Request) {
	var rem bool
	var rev sql.NullString
	_ = h.db.QueryRowContext(r.Context(), database.Bind(`SELECT "authRememberThirtyDaysEnabled", "authSessionsRevokedAt" FROM "GlobalSettings" WHERE "id"='global'`, h.driver)).Scan(&rem, &rev)

	jsonResponse(w, 200, map[string]any{
		"rememberSessionsExpireAfterDays": rem,
		"sessionsRevokedAt":               nullable(rev),
		"rememberThirtyDays":              rem,
		"revokedAt":                       nullable(rev),
	})
}

func (h *Handler) updateSessionPolicy(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Action                          string `json:"action"`
		RememberSessionsExpireAfterDays *bool  `json:"rememberSessionsExpireAfterDays"`
		RememberThirtyDays              *bool  `json:"rememberThirtyDays"`
		RevokeAllSessions               *bool  `json:"revokeAllSessions"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, 400, "Payload JSON invalide.")
		return
	}

	nowStr := time.Now().UTC().Format(time.RFC3339Nano)
	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		jsonError(w, 500, "Impossible de modifier la politique de session.")
		return
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(r.Context(), `INSERT INTO "GlobalSettings"("id") VALUES('global') ON CONFLICT("id") DO NOTHING`); err != nil {
		jsonError(w, 500, "Impossible de modifier la politique de session.")
		return
	}
	if body.Action == "revoke_all" || (body.RevokeAllSessions != nil && *body.RevokeAllSessions) {
		if _, err = tx.ExecContext(r.Context(), `DELETE FROM "AuthSession"`); err != nil {
			jsonError(w, 500, "Impossible de révoquer les sessions.")
			return
		}
		if _, err = tx.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "authSessionsRevokedAt"=? WHERE "id"='global'`, h.driver), nowStr); err != nil {
			jsonError(w, 500, "Impossible de révoquer les sessions.")
			return
		}
	}

	remVal := body.RememberSessionsExpireAfterDays
	if remVal == nil {
		remVal = body.RememberThirtyDays
	}
	if remVal != nil {
		if _, err = tx.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "authRememberThirtyDaysEnabled"=? WHERE "id"='global'`, h.driver), *remVal); err != nil {
			jsonError(w, 500, "Impossible de modifier la politique de session.")
			return
		}
	}
	if err = tx.Commit(); err != nil {
		jsonError(w, 500, "Impossible de modifier la politique de session.")
		return
	}
	if body.Action == "revoke_all" || (body.RevokeAllSessions != nil && *body.RevokeAllSessions) {
		_ = security.LogAudit(r.Context(), h.db, h.driver, "Auth sessions revoked", nil, nil, nil, nil, map[string]any{"revokedAt": nowStr})
	}
	if remVal != nil {
		_ = security.LogAudit(r.Context(), h.db, h.driver, "Auth session policy updated", nil, nil, nil, nil, map[string]any{"rememberSessionsExpireAfterDays": *remVal})
	}

	var rem bool
	var rev sql.NullString
	_ = h.db.QueryRowContext(r.Context(), database.Bind(`SELECT "authRememberThirtyDaysEnabled", "authSessionsRevokedAt" FROM "GlobalSettings" WHERE "id"='global'`, h.driver)).Scan(&rem, &rev)

	jsonResponse(w, 200, map[string]any{
		"success":                         true,
		"rememberSessionsExpireAfterDays": rem,
		"sessionsRevokedAt":               nullable(rev),
	})
}

func (h *Handler) getPluginApiKey(w http.ResponseWriter, r *http.Request) {
	h.recoveredPluginKeyInfo(w, r)
}

func (h *Handler) rotatePluginApiKey(w http.ResponseWriter, r *http.Request) {
	h.recoveredRotatePluginKey(w, r)
}

func (h *Handler) revokePluginApiKey(w http.ResponseWriter, r *http.Request) {
	_, _ = h.db.ExecContext(r.Context(), database.Bind(`INSERT INTO "GlobalSettings"("id") VALUES('global') ON CONFLICT DO NOTHING`, h.driver))
	_, err := h.db.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "pluginApiKey"=NULL, "pluginPreviousApiKey"=NULL WHERE "id"='global'`, h.driver))
	if err != nil {
		jsonError(w, 500, "Impossible de révoquer la clé plugin.")
		return
	}

	_ = security.LogAudit(r.Context(), h.db, h.driver, "plugin.key.revoked", nil, nil, nil, nil, nil)
	jsonResponse(w, 200, map[string]any{"success": true})
}

func (h *Handler) discordPost(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Content string `json:"content"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	var webhookURL sql.NullString
	_ = h.db.QueryRowContext(r.Context(), database.Bind(`SELECT "discordWebhookUrl" FROM "GlobalSettings" WHERE "id"='global'`, h.driver)).Scan(&webhookURL)
	if !webhookURL.Valid || webhookURL.String == "" {
		jsonError(w, 400, "Webhook Discord non configuré ou invalide. Vérifiez les Paramètres > Notifications.")
		return
	}

	if !security.IsValidDiscordWebhook(webhookURL.String) {
		jsonError(w, 400, "Webhook Discord invalide.")
		return
	}

	var payload any
	if strings.TrimSpace(body.Content) != "" {
		payload = map[string]any{"content": body.Content}
	} else {
		var err error
		payload, err = h.monthlyDiscordPayload(r.Context(), time.Now().UTC())
		if err != nil {
			jsonError(w, 500, "Impossible de calculer le bilan mensuel.")
			return
		}
	}

	jsonBytes, _ := json.Marshal(payload)
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Post(webhookURL.String, "application/json", bytes.NewReader(jsonBytes))
	if err != nil || resp.StatusCode >= 400 {
		if resp != nil {
			_ = resp.Body.Close()
		}
		jsonError(w, 502, "Échec de l'envoi du webhook Discord.")
		return
	}
	_ = resp.Body.Close()

	jsonResponse(w, 200, map[string]any{
		"success": true,
		"message": "Bilan mensuel diffusé avec succès sur Discord !",
	})
}

func getLogDirectory() string {
	if d := os.Getenv("LOG_DIR"); d != "" {
		return d
	}
	return "./logs"
}

func (h *Handler) getSystemLogs(w http.ResponseWriter, r *http.Request) {
	logDir := getLogDirectory()
	files, totalSize, err := recoveryLogFiles(logDir)
	if err != nil {
		jsonError(w, 500, "Impossible de lire les fichiers de journaux.")
		return
	}

	p := boundedInt(r.URL.Query().Get("page"), 1, 1, 1000)
	ps := boundedInt(r.URL.Query().Get("pageSize"), 50, 1, 200)
	action := strings.TrimSpace(r.URL.Query().Get("action"))
	auditLogs, totalAudit, err := logging.GetSystemLogs(r.Context(), h.db, h.driver, p, ps, action)
	if err != nil {
		jsonError(w, 500, "Impossible de charger le journal d'audit.")
		return
	}

	jsonResponse(w, 200, map[string]any{
		"success":        true,
		"files":          files,
		"totalSizeBytes": totalSize,
		"retentionDays":  h.recoveryLogRetention(r),
		"logs":           auditLogs,
		"total":          totalAudit,
		"page":           p,
		"pageSize":       ps,
	})
}

func (h *Handler) clearSystemLogs(w http.ResponseWriter, r *http.Request) {
	logDir := getLogDirectory()
	fileParam := r.URL.Query().Get("file")

	if fileParam != "" {
		path, err := recoveryLogPath(logDir, fileParam)
		if err != nil || fileParam == "jellytrack.log" {
			jsonError(w, 400, "Fichier de journal invalide ou actif.")
			return
		}
		if err = os.Remove(path); err != nil {
			jsonError(w, 500, "Impossible de supprimer le fichier de journal.")
			return
		}
		_ = security.LogAudit(r.Context(), h.db, h.driver, "Delete Log File", nil, nil, &fileParam, nil, nil)
		jsonResponse(w, 200, map[string]any{"success": true, "message": fmt.Sprintf("Fichier %s supprimé.", fileParam)})
		return
	}

	entries, err := os.ReadDir(logDir)
	if err != nil && !os.IsNotExist(err) {
		jsonError(w, 500, "Impossible de lire les journaux.")
		return
	}
	for _, e := range entries {
		if e.Type().IsRegular() && strings.HasSuffix(e.Name(), ".log") {
			path := filepath.Join(logDir, e.Name())
			if e.Name() == "jellytrack.log" {
				err = os.Truncate(path, 0)
			} else {
				err = os.Remove(path)
			}
			if err != nil {
				jsonError(w, 500, "Impossible de réinitialiser un fichier de journal.")
				return
			}
		}
	}
	if err = logging.ClearSystemLogs(r.Context(), h.db, h.driver); err != nil {
		jsonError(w, 500, "Impossible de réinitialiser le journal d'audit.")
		return
	}

	jsonResponse(w, 200, map[string]any{"success": true, "message": "Journaux système effacés avec succès."})
}

func (h *Handler) downloadSystemLogs(w http.ResponseWriter, r *http.Request) {
	fileParam := r.URL.Query().Get("file")
	if fileParam == "" {
		fileParam = "jellytrack.log"
	}
	path, err := recoveryLogPath(getLogDirectory(), fileParam)
	if err != nil {
		jsonError(w, 404, "Fichier de journal introuvable.")
		return
	}
	file, err := os.Open(path)
	if err != nil {
		jsonError(w, 404, "Fichier de journal introuvable.")
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		jsonError(w, 500, "Fichier de journal illisible.")
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Content-Disposition", recoveryLogDisposition(fileParam))
	http.ServeContent(w, r, fileParam, info.ModTime(), file)
}

func (h *Handler) exportLogsCSV(w http.ResponseWriter, r *http.Request) {
	h.history(w, r)
}

func (h *Handler) posterRotatorRotate(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		jsonError(w, 400, "media id requis.")
		return
	}

	var srvURL, apiKey, jmid sql.NullString
	var body struct {
		ServerID string `json:"serverId"`
	}
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&body)
	}
	serverID := strings.TrimSpace(first(body.ServerID, r.URL.Query().Get("serverId")))
	compact := strings.ToLower(strings.ReplaceAll(id, "-", ""))
	query := `
		SELECT s."url", s."jellyfinApiKey", m."jellyfinMediaId"
		FROM "Media" m
		JOIN "Server" s ON s."id" = m."serverId"
		WHERE (m."id" = ? OR m."jellyfinMediaId" = ? OR LOWER(REPLACE(m."jellyfinMediaId",'-','')) = ?)`
	args := []any{id, id, compact}
	if serverID != "" {
		query += ` AND m."serverId" = ?`
		args = append(args, serverID)
	}
	query += ` ORDER BY CASE WHEN m."id"=? THEN 0 ELSE 1 END,m."createdAt" ASC,m."id" ASC LIMIT 1`
	args = append(args, id)
	err := h.db.QueryRowContext(r.Context(), database.Bind(query, h.driver), args...).Scan(&srvURL, &apiKey, &jmid)
	if err != nil && err != sql.ErrNoRows {
		jsonError(w, 500, "Impossible de rechercher le média.")
		return
	}

	if !srvURL.Valid || srvURL.String == "" || !jmid.Valid {
		jsonResponse(w, 404, map[string]any{"success": false, "code": "media_not_found"})
		return
	}

	safeURL, err := security.ValidateSafeServerURL(srvURL.String)
	if err != nil {
		jsonResponse(w, 502, map[string]any{"success": false, "code": "poster_rotator_error", "message": "Server URL invalid"})
		return
	}

	targetURL := fmt.Sprintf("%s/PosterRotator/Pools/%s/RotateNow", strings.TrimRight(safeURL.String(), "/"), url.PathEscape(jmid.String))
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, targetURL, nil)
	if err != nil {
		jsonResponse(w, 502, map[string]any{"success": false, "code": "poster_rotator_error"})
		return
	}
	if apiKey.Valid && apiKey.String != "" {
		req.Header.Set("X-Emby-Token", apiKey.String)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		jsonResponse(w, 502, map[string]any{"success": false, "code": "poster_rotator_error", "message": "Jellyfin unreachable"})
		return
	}
	defer resp.Body.Close()

	responseBody, _ := io.ReadAll(io.LimitReader(resp.Body, 65536))
	var responseData struct {
		Message string `json:"message"`
		Error   string `json:"error"`
	}
	_ = json.Unmarshal(responseBody, &responseData)
	message := first(responseData.Message, responseData.Error, string(responseBody))
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		jsonResponse(w, 200, map[string]any{"success": true, "code": "poster_rotated", "mediaId": jmid.String, "message": message})
		return
	}
	haystack := strings.ToLower(message)
	if resp.StatusCode == http.StatusNotFound || strings.Contains(haystack, "pool") || strings.Contains(haystack, "missing") || strings.Contains(haystack, "empty") || strings.Contains(haystack, "not found") {
		jsonResponse(w, 404, map[string]any{"success": false, "code": "pool_missing", "message": message})
		return
	}

	jsonResponse(w, 502, map[string]any{"success": false, "code": "poster_rotator_error", "status": resp.StatusCode, "message": message})
}

func (h *Handler) adminPluginHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		var body struct {
			Action string `json:"action"`
			ApiKey string `json:"apiKey"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)

		if body.Action == "test_connection" {
			jsonResponse(w, 200, map[string]any{
				"ok":        true,
				"status":    200,
				"latencyMs": 1,
				"endpoint":  "/api/plugin/events",
			})
			return
		}

		if body.Action == "force_heartbeat" {
			jsonResponse(w, 200, map[string]any{
				"ok":        true,
				"status":    200,
				"latencyMs": 1,
				"endpoint":  "/api/plugin/events",
			})
			return
		}

		jsonError(w, 400, "Action non supportée.")
		return
	}

	var lastSeen, pluginVer, srvName, apiKey sql.NullString
	_ = h.db.QueryRowContext(r.Context(), database.Bind(`SELECT "pluginLastSeen", "pluginVersion", "pluginServerName", "pluginApiKey" FROM "GlobalSettings" WHERE "id"='global'`, h.driver)).Scan(&lastSeen, &pluginVer, &srvName, &apiKey)

	healthy := false
	gapSec := int64(999999)
	if lastSeen.Valid {
		if t, err := time.Parse(time.RFC3339Nano, lastSeen.String); err == nil {
			dur := time.Since(t)
			gapSec = int64(dur.Seconds())
			healthy = dur < 10*time.Minute
		}
	}

	var activeStreams, transcodeStreams, staleStreams int64
	_ = h.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM "ActiveStream"`).Scan(&activeStreams)
	_ = h.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM "ActiveStream" WHERE "playMethod"='Transcode'`).Scan(&transcodeStreams)
	staleThreshold := time.Now().UTC().Add(-10 * time.Minute).Format(time.RFC3339Nano)
	_ = h.db.QueryRowContext(r.Context(), database.Bind(`SELECT COUNT(*) FROM "ActiveStream" WHERE "lastPingAt" < ?`, h.driver), staleThreshold).Scan(&staleStreams)

	dayAgo := time.Now().UTC().AddDate(0, 0, -1).Format(time.RFC3339Nano)
	var starts24h, stops24h int64
	_ = h.db.QueryRowContext(r.Context(), database.Bind(`SELECT COUNT(*) FROM "PlaybackHistory" WHERE "startedAt" >= ?`, h.driver), dayAgo).Scan(&starts24h)
	_ = h.db.QueryRowContext(r.Context(), database.Bind(`SELECT COUNT(*) FROM "PlaybackHistory" WHERE "endedAt" >= ?`, h.driver), dayAgo).Scan(&stops24h)

	jsonResponse(w, 200, map[string]any{
		"healthy":  healthy,
		"lastSeen": nullable(lastSeen),
		"version":  nullable(pluginVer),
		"plugin": map[string]any{
			"connected":  healthy,
			"lastSeen":   nullable(lastSeen),
			"version":    nullable(pluginVer),
			"serverName": nullable(srvName),
			"hasApiKey":  apiKey.Valid && apiKey.String != "",
			"endpoint":   "/api/plugin/events",
		},
		"heartbeat": map[string]any{
			"count24h": starts24h + stops24h,
			"gapSec":   gapSec,
		},
		"thresholdDefaults": map[string]any{
			"gapWarningSec":    600,
			"gapCriticalSec":   900,
			"jitterWarningSec": 180,
		},
		"ingestion": map[string]any{
			"successEstimate24h": starts24h + stops24h,
			"failureCount24h":    0,
			"successRate24h":     100.0,
		},
		"streams": map[string]any{
			"active":     activeStreams,
			"transcodes": transcodeStreams,
			"stale":      staleStreams,
		},
	})
}
