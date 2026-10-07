package api

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"net/http"
	"runtime"
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
	jsonResponse(w, 200, map[string]any{
		"status":    "ok",
		"database":  dbStatus,
		"driver":    h.driver,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
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
	p := boundedInt(r.URL.Query().Get("page"), 1, 1, 10000)
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
	var s any = map[string]any{
		"ipAttemptThreshold":     10,
		"ipWindowMinutes":        60,
		"newCountryGraceMinutes": 120,
	}
	if raw.Valid {
		_ = json.Unmarshal([]byte(raw.String), &s)
	}
	jsonResponse(w, 200, s)
}

func (h *Handler) updateSmartSettings(w http.ResponseWriter, r *http.Request) {
	var body any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, 400, "Payload JSON invalide.")
		return
	}
	b, _ := json.Marshal(body)
	_, err := h.db.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "resolutionThresholds"=? WHERE "id"='global'`, h.driver), string(b))
	if err != nil {
		jsonError(w, 500, "Impossible d'enregistrer les réglages.")
		return
	}
	jsonResponse(w, 200, map[string]any{"success": true})
}

func (h *Handler) adminUserDuplicates(w http.ResponseWriter, r *http.Request) {
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
	jsonResponse(w, 200, map[string]any{"success": true, "synced": 0})
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
	jsonResponse(w, 200, map[string]any{"success": true, "deletedCount": rowsAff})
}

func (h *Handler) predictions(w http.ResponseWriter, r *http.Request) {
	pred, err := stats.GetPredictions(r.Context(), h.db, h.driver)
	if err != nil {
		jsonError(w, 500, "Erreur de calcul des prédictions.")
		return
	}
	jsonResponse(w, 200, pred)
}

func (h *Handler) metadataAudit(w http.ResponseWriter, r *http.Request) {
	audit, err := stats.GetMetadataAudit(r.Context(), h.db)
	if err != nil {
		jsonError(w, 500, "Erreur lors de l'audit de métadonnées.")
		return
	}
	jsonResponse(w, 200, audit)
}

func (h *Handler) getSSO(w http.ResponseWriter, r *http.Request) {
	var raw sql.NullString
	_ = h.db.QueryRowContext(r.Context(), database.Bind(`SELECT "ssoSettings" FROM "GlobalSettings" WHERE "id"='global'`, h.driver)).Scan(&raw)
	var s any = map[string]any{"enabled": false}
	if raw.Valid {
		_ = json.Unmarshal([]byte(raw.String), &s)
	}
	jsonResponse(w, 200, s)
}

func (h *Handler) updateSSO(w http.ResponseWriter, r *http.Request) {
	var body any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, 400, "Payload JSON invalide.")
		return
	}
	b, _ := json.Marshal(body)
	_, err := h.db.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "ssoSettings"=? WHERE "id"='global'`, h.driver), string(b))
	if err != nil {
		jsonError(w, 500, "Impossible d'enregistrer les réglages SSO.")
		return
	}
	jsonResponse(w, 200, map[string]any{"success": true})
}

func (h *Handler) getSessionPolicy(w http.ResponseWriter, r *http.Request) {
	var rem bool
	var rev sql.NullString
	_ = h.db.QueryRowContext(r.Context(), database.Bind(`SELECT "authRememberThirtyDaysEnabled", "authSessionsRevokedAt" FROM "GlobalSettings" WHERE "id"='global'`, h.driver)).Scan(&rem, &rev)
	jsonResponse(w, 200, map[string]any{
		"rememberThirtyDays": rem,
		"revokedAt":          nullable(rev),
	})
}

func (h *Handler) updateSessionPolicy(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RememberThirtyDays *bool `json:"rememberThirtyDays"`
		RevokeAllSessions  *bool `json:"revokeAllSessions"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, 400, "Payload JSON invalide.")
		return
	}
	if body.RevokeAllSessions != nil && *body.RevokeAllSessions {
		_, _ = h.db.ExecContext(r.Context(), database.Bind(`DELETE FROM "AuthSession"`, h.driver))
		_, _ = h.db.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "authSessionsRevokedAt"=? WHERE "id"='global'`, h.driver), time.Now().UTC().Format(time.RFC3339Nano))
	}
	if body.RememberThirtyDays != nil {
		_, _ = h.db.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "authRememberThirtyDaysEnabled"=? WHERE "id"='global'`, h.driver), *body.RememberThirtyDays)
	}
	jsonResponse(w, 200, map[string]any{"success": true})
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
		"previousExpiresAt": gs.PluginPreviousAPIKeyExpiresAt,
	})
}

func (h *Handler) rotatePluginApiKey(w http.ResponseWriter, r *http.Request) {
	rawKey, err := settings.RotateGlobalPluginKey(r.Context(), h.db, h.driver)
	if err != nil {
		jsonError(w, 500, "Impossible de renouveler la clé plugin.")
		return
	}
	jsonResponse(w, 200, map[string]any{"success": true, "key": rawKey})
}

func (h *Handler) revokePluginApiKey(w http.ResponseWriter, r *http.Request) {
	if err := settings.RevokeGlobalPluginKey(r.Context(), h.db, h.driver); err != nil {
		jsonError(w, 500, "Impossible de révoquer la clé plugin.")
		return
	}
	jsonResponse(w, 200, map[string]any{"success": true})
}

func (h *Handler) discordPost(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Content == "" {
		jsonError(w, 400, "Contenu requis.")
		return
	}
	var webhookURL sql.NullString
	_ = h.db.QueryRowContext(r.Context(), database.Bind(`SELECT "discordWebhookUrl" FROM "GlobalSettings" WHERE "id"='global'`, h.driver)).Scan(&webhookURL)
	if !webhookURL.Valid || webhookURL.String == "" {
		jsonError(w, 400, "Webhook Discord non configuré.")
		return
	}
	jsonBody, _ := json.Marshal(map[string]string{"content": body.Content})
	resp, err := http.Post(webhookURL.String, "application/json", bytes.NewReader(jsonBody))
	if err != nil || resp.StatusCode >= 400 {
		jsonError(w, 502, "Échec de l'envoi du webhook Discord.")
		return
	}
	defer resp.Body.Close()
	jsonResponse(w, 200, map[string]any{"success": true})
}

func (h *Handler) getSystemLogs(w http.ResponseWriter, r *http.Request) {
	p := boundedInt(r.URL.Query().Get("page"), 1, 1, 1000)
	ps := boundedInt(r.URL.Query().Get("pageSize"), 50, 1, 200)
	action := strings.TrimSpace(r.URL.Query().Get("action"))
	logs, total, err := logging.GetSystemLogs(r.Context(), h.db, h.driver, p, ps, action)
	if err != nil {
		jsonError(w, 500, "Erreur de lecture des logs.")
		return
	}
	jsonResponse(w, 200, map[string]any{"logs": logs, "total": total, "page": p, "pageSize": ps})
}

func (h *Handler) clearSystemLogs(w http.ResponseWriter, r *http.Request) {
	if err := logging.ClearSystemLogs(r.Context(), h.db, h.driver); err != nil {
		jsonError(w, 500, "Erreur lors de la suppression des logs.")
		return
	}
	jsonResponse(w, 200, map[string]any{"success": true})
}

func (h *Handler) downloadSystemLogs(w http.ResponseWriter, r *http.Request) {
	h.exportLogsCSV(w, r)
}

func (h *Handler) exportLogsCSV(w http.ResponseWriter, r *http.Request) {
	csvBytes, err := logging.ExportLogsCSV(r.Context(), h.db, h.driver)
	if err != nil {
		jsonError(w, 500, "Erreur d'export CSV.")
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="jellytrack-logs.csv"`)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(csvBytes)
}

func (h *Handler) posterRotatorRotate(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	jsonResponse(w, 200, map[string]any{"success": true, "mediaId": id})
}

func (h *Handler) adminPluginHealth(w http.ResponseWriter, r *http.Request) {
	var lastSeen, pluginVer sql.NullString
	_ = h.db.QueryRowContext(r.Context(), database.Bind(`SELECT "pluginLastSeen", "pluginVersion" FROM "GlobalSettings" WHERE "id"='global'`, h.driver)).Scan(&lastSeen, &pluginVer)
	healthy := false
	if lastSeen.Valid {
		if t, err := time.Parse(time.RFC3339Nano, lastSeen.String); err == nil {
			healthy = time.Since(t) < 5*time.Minute
		}
	}
	jsonResponse(w, 200, map[string]any{
		"healthy":  healthy,
		"lastSeen": nullable(lastSeen),
		"version":  nullable(pluginVer),
	})
}
