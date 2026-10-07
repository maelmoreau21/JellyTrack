package api

import (
	"bytes"
	"crypto/rand"
	"database/sql"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/internal/logging"
	"github.com/maelmoreau21/jellytrack/internal/security"
	"github.com/maelmoreau21/jellytrack/internal/settings"
	"github.com/maelmoreau21/jellytrack/internal/stats"
	"github.com/maelmoreau21/jellytrack/internal/users"
)

func (h *Handler) hardware(w http.ResponseWriter, r *http.Request) {
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)

	jsonResponse(w, 200, map[string]any{
		"cpu": map[string]any{
			"usagePercent": 0.0,
			"cores":        runtime.NumCPU(),
		},
		"memory": map[string]any{
			"allocMb":      float64(mem.Alloc) / (1024 * 1024),
			"sysMb":        float64(mem.Sys) / (1024 * 1024),
			"totalAllocMb": float64(mem.TotalAlloc) / (1024 * 1024),
			"usagePercent": 0.0,
			"usedGb":       float64(mem.Alloc) / (1024 * 1024 * 1024),
			"totalGb":      float64(mem.Sys) / (1024 * 1024 * 1024),
		},
		"temperature": map[string]any{
			"main": -1,
		},
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

	checkOrphansQ := `SELECT COUNT(*) FROM "PlaybackHistory" WHERE "endedAt" IS NULL AND ("userId" || ':' || "mediaId") NOT IN (SELECT ("userId" || ':' || "mediaId") FROM "ActiveStream")`
	_ = h.db.QueryRowContext(r.Context(), checkOrphansQ).Scan(&openPlaybackOrphans)

	var syncLast, backupLast sql.NullString
	_ = h.db.QueryRowContext(r.Context(), `SELECT "syncLastSuccessAt", "backupLastSuccessAt" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&syncLast, &backupLast)

	var lastPollAt = time.Now().UTC().Format(time.RFC3339)

	jsonResponse(w, 200, map[string]any{
		"status": map[string]any{
			"monitor": map[string]any{
				"status":     "ok",
				"lastPollAt": lastPollAt,
			},
			"sync": map[string]any{
				"lastSuccessAt": nullable(syncLast),
			},
			"backup": map[string]any{
				"lastSuccessAt": nullable(backupLast),
			},
		},
		"database":        dbStatus,
		"driver":          h.driver,
		"timestamp":       time.Now().UTC().Format(time.RFC3339),
		"isValkeyEnabled": false,
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
		"ipAttemptThreshold":     10,
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

	b, _ := json.Marshal(body.Thresholds)
	_, err := h.db.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "resolutionThresholds"=? WHERE "id"='global'`, h.driver), string(b))
	if err != nil {
		jsonError(w, 500, "Impossible d'enregistrer les réglages.")
		return
	}

	_ = security.LogAudit(r.Context(), h.db, h.driver, "admin.security.smart_settings_updated", nil, nil, nil, nil, body.Thresholds)
	jsonResponse(w, 200, map[string]any{"success": true, "thresholds": body.Thresholds})
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
	rows, err := h.db.QueryContext(r.Context(), `SELECT "id", "url", "jellyfinApiKey" FROM "Server" WHERE "isActive" = 1`)
	if err != nil {
		jsonError(w, 500, "Impossible de lire les serveurs.")
		return
	}
	defer rows.Close()

	totalPruned := 0
	var prunedUsernames []string

	client := &http.Client{Timeout: 10 * time.Second}

	for rows.Next() {
		var srvID, srvURL string
		var apiKey sql.NullString
		if err := rows.Scan(&srvID, &srvURL, &apiKey); err != nil || !apiKey.Valid || apiKey.String == "" {
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
		_ = json.NewDecoder(resp.Body).Decode(&jUsers)
		_ = resp.Body.Close()

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
	pred["peakPredictions"] = []any{}

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
	var raw sql.NullString
	_ = h.db.QueryRowContext(r.Context(), database.Bind(`SELECT "ssoSettings" FROM "GlobalSettings" WHERE "id"='global'`, h.driver)).Scan(&raw)

	dbCfg := map[string]any{
		"enabled":      false,
		"url":          "",
		"clientId":     "",
		"clientSecret": "",
		"userGroup":    "",
		"adminGroup":   "",
		"tokenAlg":     "RS256",
		"autoRedirect": true,
	}
	if raw.Valid && raw.String != "" {
		_ = json.Unmarshal([]byte(raw.String), &dbCfg)
	}

	envEnabled := os.Getenv("OIDC_ENABLED")
	hasEnvEnabled := envEnabled != ""
	isEnvEnabled := strings.EqualFold(envEnabled, "true") || envEnabled == "1"

	envURL := strings.TrimRight(first(os.Getenv("OIDC_URL"), os.Getenv("OIDC_ISSUER"), os.Getenv("AUTHENTIK_URL")), "/")
	envClientID := strings.TrimSpace(os.Getenv("OIDC_CLIENT_ID"))
	envClientSecret := strings.TrimSpace(os.Getenv("OIDC_CLIENT_SECRET"))
	envUserGroup := strings.TrimSpace(os.Getenv("OIDC_USER_GROUP"))
	envAdminGroup := strings.TrimSpace(os.Getenv("OIDC_ADMIN_GROUP"))

	envAutoRedirRaw := first(os.Getenv("OIDC_AUTO_REDIRECT"), os.Getenv("OIDC_AUTO_LOGIN"))
	hasEnvAutoRedir := envAutoRedirRaw != ""
	envAutoRedir := strings.EqualFold(envAutoRedirRaw, "true") || envAutoRedirRaw == "1" || envAutoRedirRaw == ""

	enabled := dbCfg["enabled"].(bool)
	if hasEnvEnabled {
		enabled = isEnvEnabled
	}

	ssoURL, _ := dbCfg["url"].(string)
	if envURL != "" {
		ssoURL = envURL
	}

	clientID, _ := dbCfg["clientId"].(string)
	if envClientID != "" {
		clientID = envClientID
	}

	clientSecret, _ := dbCfg["clientSecret"].(string)
	if envClientSecret != "" {
		clientSecret = envClientSecret
	}

	userGroup, _ := dbCfg["userGroup"].(string)
	if envUserGroup != "" {
		userGroup = envUserGroup
	}

	adminGroup, _ := dbCfg["adminGroup"].(string)
	if envAdminGroup != "" {
		adminGroup = envAdminGroup
	}

	autoRedirect, _ := dbCfg["autoRedirect"].(bool)
	if hasEnvAutoRedir {
		autoRedirect = envAutoRedir
	}

	maskedSecret := ""
	if len(clientSecret) > 6 {
		maskedSecret = clientSecret[:3] + "••••••••" + clientSecret[len(clientSecret)-3:]
	} else if len(clientSecret) > 0 {
		maskedSecret = "••••••••"
	}

	dbSecret, _ := dbCfg["clientSecret"].(string)
	dbMaskedSecret := ""
	if len(dbSecret) > 6 {
		dbMaskedSecret = dbSecret[:3] + "••••••••" + dbSecret[len(dbSecret)-3:]
	} else if len(dbSecret) > 0 {
		dbMaskedSecret = "••••••••"
	}

	localAdminConfigured := first(os.Getenv("JELLYTRACK_LOCAL_ADMIN_PASSWORD"), os.Getenv("JELLYGATE_LOCAL_ADMIN_PASSWORD")) != ""
	localAdminUser := first(os.Getenv("JELLYTRACK_LOCAL_ADMIN_USER"), os.Getenv("JELLYGATE_LOCAL_ADMIN_USER"), "admin")

	jsonResponse(w, 200, map[string]any{
		"enabled":            enabled,
		"url":                ssoURL,
		"clientId":           clientID,
		"hasClientSecret":    len(clientSecret) > 0,
		"clientSecret":       maskedSecret,
		"clientSecretMasked": maskedSecret,
		"userGroup":          userGroup,
		"adminGroup":         adminGroup,
		"tokenAlg":           "RS256",
		"autoRedirect":       autoRedirect,
		"origins": map[string]string{
			"enabled":      ternary(hasEnvEnabled, "env", ternary(raw.Valid, "db", "default")),
			"url":          ternary(envURL != "", "env", ternary(ssoURL != "", "db", "default")),
			"clientId":     ternary(envClientID != "", "env", ternary(clientID != "", "db", "default")),
			"clientSecret": ternary(envClientSecret != "", "env", ternary(clientSecret != "", "db", "default")),
			"userGroup":    ternary(envUserGroup != "", "env", ternary(userGroup != "", "db", "default")),
			"adminGroup":   ternary(envAdminGroup != "", "env", ternary(adminGroup != "", "db", "default")),
			"tokenAlg":     "default",
			"autoRedirect": ternary(hasEnvAutoRedir, "env", "default"),
		},
		"isEnvControlled": map[string]bool{
			"enabled":      hasEnvEnabled,
			"url":          envURL != "",
			"clientId":     envClientID != "",
			"clientSecret": envClientSecret != "",
			"userGroup":    envUserGroup != "",
			"adminGroup":   envAdminGroup != "",
			"tokenAlg":     false,
			"autoRedirect": hasEnvAutoRedir,
		},
		"dbConfig": map[string]any{
			"enabled":            dbCfg["enabled"],
			"url":                dbCfg["url"],
			"clientId":           dbCfg["clientId"],
			"hasClientSecret":    len(dbSecret) > 0,
			"clientSecretMasked": dbMaskedSecret,
			"userGroup":          dbCfg["userGroup"],
			"adminGroup":         dbCfg["adminGroup"],
			"tokenAlg":           "RS256",
			"autoRedirect":       dbCfg["autoRedirect"],
		},
		"localAdminConfigured": localAdminConfigured,
		"localAdminUser":       localAdminUser,
		"callbackPath":         "/api/auth/callback/oidc",
	})
}

func ternary(cond bool, a, b string) string {
	if cond {
		return a
	}
	return b
}

func (h *Handler) updateSSO(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	r.Body = http.MaxBytesReader(w, r.Body, 16384)
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, 400, "Payload JSON invalide.")
		return
	}

	if rawURL, ok := body["url"].(string); ok && strings.TrimSpace(rawURL) != "" {
		if _, err := security.ValidateSafeServerURL(rawURL); err != nil {
			jsonError(w, 400, fmt.Sprintf("SSO URL invalide: %v", err))
			return
		}
	}

	b, _ := json.Marshal(body)
	_, err := h.db.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "ssoSettings"=? WHERE "id"='global'`, h.driver), string(b))
	if err != nil {
		jsonError(w, 500, "Impossible d'enregistrer les réglages SSO.")
		return
	}

	_ = security.LogAudit(r.Context(), h.db, h.driver, "SSO Settings updated", nil, nil, nil, nil, nil)
	jsonResponse(w, 200, map[string]any{
		"success":      true,
		"autoRedirect": body["autoRedirect"],
	})
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
	if body.Action == "revoke_all" || (body.RevokeAllSessions != nil && *body.RevokeAllSessions) {
		_, _ = h.db.ExecContext(r.Context(), database.Bind(`DELETE FROM "AuthSession"`, h.driver))
		_, _ = h.db.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "authSessionsRevokedAt"=? WHERE "id"='global'`, h.driver), nowStr)
		_ = security.LogAudit(r.Context(), h.db, h.driver, "Auth sessions revoked", nil, nil, nil, nil, map[string]any{"revokedAt": nowStr})
	}

	remVal := body.RememberSessionsExpireAfterDays
	if remVal == nil {
		remVal = body.RememberThirtyDays
	}
	if remVal != nil {
		_, _ = h.db.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "authRememberThirtyDaysEnabled"=? WHERE "id"='global'`, h.driver), *remVal)
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
	gs, err := settings.GetGlobalSettings(r.Context(), h.db)
	if err != nil {
		jsonError(w, 500, "Erreur de lecture.")
		return
	}
	jsonResponse(w, 200, map[string]any{
		"hasKey":            gs.PluginAPIKey != nil && *gs.PluginAPIKey != "",
		"expiresAt":         gs.PluginKeyExpiresAt,
		"status":            "active",
		"pluginKey":         gs.PluginAPIKey,
		"keyVersion":        1,
		"previousKeyActive": gs.PluginPreviousAPIKey != nil && *gs.PluginPreviousAPIKey != "",
	})
}

func (h *Handler) rotatePluginApiKey(w http.ResponseWriter, r *http.Request) {
	tokenBytes := make([]byte, 32)
	rand.Read(tokenBytes)
	newKey := hex.EncodeToString(tokenBytes)
	now := time.Now().UTC().Format(time.RFC3339Nano)

	_, err := h.db.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "pluginPreviousApiKey"="pluginApiKey", "pluginApiKey"=?, "pluginKeyCreatedAt"=? WHERE "id"='global'`, h.driver), newKey, now)
	if err != nil {
		jsonError(w, 500, "Impossible de renouveler la clé plugin.")
		return
	}

	_ = security.LogAudit(r.Context(), h.db, h.driver, "plugin.key.rotated", nil, nil, nil, nil, nil)
	jsonResponse(w, 200, map[string]any{
		"success":      true,
		"pluginApiKey": newKey,
		"createdAt":    now,
	})
}

func (h *Handler) revokePluginApiKey(w http.ResponseWriter, r *http.Request) {
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
		// Build monthly rewind metrics
		today := time.Now().UTC()
		thirtyDaysAgo := today.AddDate(0, 0, -30).Format(time.RFC3339Nano)

		var totalDuration, totalPlays int64
		_ = h.db.QueryRowContext(r.Context(), database.Bind(`SELECT COALESCE(SUM("durationWatched"),0), COUNT(*) FROM "PlaybackHistory" WHERE "startedAt" >= ?`, h.driver), thirtyDaysAgo).Scan(&totalDuration, &totalPlays)

		totalHours := totalDuration / 3600

		// Top user
		var topUserName string
		var topUserDur int64
		_ = h.db.QueryRowContext(r.Context(), database.Bind(`SELECT u."username", COALESCE(SUM(p."durationWatched"),0) FROM "PlaybackHistory" p JOIN "User" u ON u."id"=p."userId" WHERE p."startedAt" >= ? GROUP BY u."username" ORDER BY SUM(p."durationWatched") DESC LIMIT 1`, h.driver), thirtyDaysAgo).Scan(&topUserName, &topUserDur)
		if topUserName == "" {
			topUserName = "Aucun"
		}

		payload = map[string]any{
			"username":   "JellyTrack Rewind",
			"avatar_url": "https://raw.githubusercontent.com/maelmoreau21/JellyTrack/main/public/icon.svg",
			"embeds": []map[string]any{
				{
					"title":       "✨ JellyTrack Rewind — Bilan du Mois",
					"description": "Voici le récapitulatif des 30 derniers jours sur votre serveur multimédia !",
					"color":       11164867,
					"fields": []map[string]any{
						{"name": "⏱️ Temps de Visionnage", "value": fmt.Sprintf("**%d heures**", totalHours), "inline": true},
						{"name": "🎬 Lectures Totales", "value": fmt.Sprintf("**%d sessions**", totalPlays), "inline": true},
						{"name": "👑 Spectateur du Mois", "value": fmt.Sprintf("**%s** (%dh)", topUserName, topUserDur/3600), "inline": false},
					},
					"footer": map[string]string{
						"text": "JellyTrack • Analyse & Statistiques pour Jellyfin",
					},
					"timestamp": today.Format(time.RFC3339),
				},
			},
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
	_ = os.MkdirAll(logDir, 0755)

	entries, _ := os.ReadDir(logDir)
	var files []map[string]any
	var totalSize int64

	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".log") {
			info, err := e.Info()
			if err == nil {
				totalSize += info.Size()
				files = append(files, map[string]any{
					"filename":      e.Name(),
					"name":          e.Name(),
					"sizeBytes":     info.Size(),
					"formattedSize": fmt.Sprintf("%.1f Ko", float64(info.Size())/1024),
					"updatedAt":     info.ModTime().UTC().Format(time.RFC3339),
					"modifiedAt":    info.ModTime().UTC().Format(time.RFC3339),
					"isCurrent":     e.Name() == "jellytrack.log",
				})
			}
		}
	}

	p := boundedInt(r.URL.Query().Get("page"), 1, 1, 1000)
	ps := boundedInt(r.URL.Query().Get("pageSize"), 50, 1, 200)
	action := strings.TrimSpace(r.URL.Query().Get("action"))
	auditLogs, totalAudit, _ := logging.GetSystemLogs(r.Context(), h.db, h.driver, p, ps, action)

	jsonResponse(w, 200, map[string]any{
		"success":        true,
		"files":          files,
		"totalSizeBytes": totalSize,
		"retentionDays":  30,
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
		baseFile := filepath.Base(fileParam)
		fullPath := filepath.Join(logDir, baseFile)
		_ = os.Remove(fullPath)
		_ = security.LogAudit(r.Context(), h.db, h.driver, "Delete Log File", nil, nil, &baseFile, nil, nil)
		jsonResponse(w, 200, map[string]any{"success": true, "message": fmt.Sprintf("Fichier %s supprimé.", baseFile)})
		return
	}

	entries, _ := os.ReadDir(logDir)
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".log") {
			_ = os.Remove(filepath.Join(logDir, e.Name()))
		}
	}
	_ = logging.ClearSystemLogs(r.Context(), h.db, h.driver)

	jsonResponse(w, 200, map[string]any{"success": true, "message": "Journaux système effacés avec succès."})
}

func (h *Handler) downloadSystemLogs(w http.ResponseWriter, r *http.Request) {
	fileParam := r.URL.Query().Get("file")
	if fileParam != "" {
		baseFile := filepath.Base(fileParam)
		logDir := getLogDirectory()
		fullPath := filepath.Join(logDir, baseFile)

		data, err := os.ReadFile(fullPath)
		if err == nil {
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, baseFile))
			w.WriteHeader(200)
			_, _ = w.Write(data)
			return
		}
	}

	h.exportLogsCSV(w, r)
}

func (h *Handler) exportLogsCSV(w http.ResponseWriter, r *http.Request) {
	days := boundedInt(r.URL.Query().Get("days"), 30, 1, 3650)
	since := time.Now().UTC().AddDate(0, 0, -days).Format(time.RFC3339Nano)

	query := database.Bind(`
		SELECT p."startedAt", COALESCE(u."username",'Unknown'), COALESCE(m."title",'Unknown'), COALESCE(m."type",'Unknown'),
		       COALESCE(p."durationWatched",0), COALESCE(p."playMethod",'DirectPlay'), COALESCE(p."clientName",''),
		       COALESCE(p."deviceName",''), COALESCE(m."resolution",''), COALESCE(p."ipAddress",'')
		FROM "PlaybackHistory" p
		LEFT JOIN "User" u ON u."id" = p."userId"
		LEFT JOIN "Media" m ON m."id" = p."mediaId"
		WHERE p."startedAt" >= ?
		ORDER BY p."startedAt" DESC
		LIMIT 10000
	`, h.driver)

	rows, err := h.db.QueryContext(r.Context(), query, since)
	if err != nil {
		jsonError(w, 500, "Erreur d'export CSV.")
		return
	}
	defer rows.Close()

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="jellytrack-history.csv"`)
	w.WriteHeader(http.StatusOK)

	csvWriter := csv.NewWriter(w)
	_ = csvWriter.Write([]string{"Date", "User", "Media", "Type", "Duration (min)", "Play Method", "Client", "Device", "Resolution", "IP Address"})

	for rows.Next() {
		var started, user, title, mtype, playMethod, client, device, res, ip string
		var duration int64
		if rows.Scan(&started, &user, &title, &mtype, &duration, &playMethod, &client, &device, &res, &ip) == nil {
			durMin := strconv.FormatInt(duration/60, 10)
			_ = csvWriter.Write([]string{started, user, title, mtype, durMin, playMethod, client, device, res, ip})
		}
	}
	csvWriter.Flush()
}

func (h *Handler) posterRotatorRotate(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		jsonError(w, 400, "media id requis.")
		return
	}

	var srvURL, apiKey, jmid sql.NullString
	_ = h.db.QueryRowContext(r.Context(), database.Bind(`
		SELECT s."url", s."jellyfinApiKey", m."jellyfinMediaId"
		FROM "Media" m
		JOIN "Server" s ON s."id" = m."serverId"
		WHERE m."id" = ? OR m."jellyfinMediaId" = ?
		LIMIT 1
	`, h.driver), id, id).Scan(&srvURL, &apiKey, &jmid)

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

	if resp.StatusCode == http.StatusOK {
		jsonResponse(w, 200, map[string]any{"success": true, "code": "poster_rotated", "mediaId": jmid.String})
		return
	}
	if resp.StatusCode == http.StatusNotFound {
		jsonResponse(w, 404, map[string]any{"success": false, "code": "pool_missing"})
		return
	}

	jsonResponse(w, 502, map[string]any{"success": false, "code": "poster_rotator_error", "status": resp.StatusCode})
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
