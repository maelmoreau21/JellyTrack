package api

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/internal/security"
	"github.com/maelmoreau21/jellytrack/internal/settings"
)

// The historic admin endpoints remain protected by Register's admin middleware.
// This module expands their contracts without changing the Go maintenance APIs.
func adminRecoveryBind(query, driver string) string {
	// PostgreSQL compares typed timestamps directly; SQLite stores both ISO and
	// CURRENT_TIMESTAMP strings and needs the separator normalized before compare.
	if driver == "postgres" {
		for _, column := range []string{`"createdAt"`, `"startedAt"`, `p."startedAt"`, `"lastPingAt"`} {
			query = strings.ReplaceAll(query, `REPLACE(`+column+`,'T',' ')`, column)
		}
	}
	return database.Bind(query, driver)
}

func adminRecoveryTime(value string) time.Time {
	for _, layout := range []string{time.RFC3339Nano, "2006-01-02 15:04:05.999999999Z07:00", "2006-01-02 15:04:05.999999999Z07", "2006-01-02 15:04:05"} {
		if parsed, err := time.Parse(layout, value); err == nil {
			return parsed
		}
	}
	return time.Time{}
}

func captureAdmin(fn http.HandlerFunc, r *http.Request) (map[string]any, int) {
	w := httptest.NewRecorder()
	fn(w, r)
	result := map[string]any{}
	_ = json.Unmarshal(w.Body.Bytes(), &result)
	return result, w.Code
}

type recoveredMedia struct {
	cleanupNavigationMedia
	DateAdded      string `json:"dateAdded"`
	DuplicateGroup string `json:"duplicateGroup,omitempty"`
}

func (h *Handler) recoveredCleanup(w http.ResponseWriter, r *http.Request) {
	old, code := captureAdmin(h.navigationCleanup, r)
	if code != 200 {
		jsonResponse(w, code, old)
		return
	}
	rows, err := h.db.QueryContext(r.Context(), `SELECT "id","serverId","jellyfinMediaId","title","type",COALESCE("libraryName",''),COALESCE("resolution",''),"createdAt",COALESCE("durationMs",0),COALESCE("size",0),COALESCE(CAST("dateAdded" AS TEXT),'') FROM "Media"`)
	if err != nil {
		jsonError(w, 500, "Impossible de lire les médias.")
		return
	}
	items := map[string]recoveredMedia{}
	for rows.Next() {
		var m recoveredMedia
		if err = rows.Scan(&m.ID, &m.ServerID, &m.JellyfinMediaID, &m.Title, &m.Type, &m.Library, &m.Resolution, &m.CreatedAt, &m.Duration, &m.Size, &m.DateAdded); err != nil {
			break
		}
		if added := adminRecoveryTime(m.DateAdded); !added.IsZero() {
			m.DateAdded = added.UTC().Format(time.RFC3339Nano)
		}
		items[m.ID] = m
	}
	rowErr := rows.Err()
	rows.Close()
	if err != nil || rowErr != nil {
		jsonError(w, 500, "Impossible de lire les médias.")
		return
	}
	eligible, err := h.db.QueryContext(r.Context(), `SELECT m."id" FROM "Media" m WHERE m."type" IN ('Movie','Series','MusicAlbum') AND NOT EXISTS (SELECT 1 FROM "PlaybackHistory" p JOIN "Media" child ON child."id"=p."mediaId" LEFT JOIN "Media" parent ON parent."serverId"=child."serverId" AND parent."jellyfinMediaId"=child."parentId" WHERE child."serverId"=m."serverId" AND (child."id"=m."id" OR child."parentId"=m."jellyfinMediaId" OR parent."parentId"=m."jellyfinMediaId"))`)
	if err != nil {
		jsonError(w, 500, "Impossible de lire les lectures.")
		return
	}
	ghosts := []recoveredMedia{}
	now := time.Now()
	var total int64
	for eligible.Next() {
		var id string
		if err = eligible.Scan(&id); err != nil {
			break
		}
		m := items[id]
		added := m.DateAdded
		if added == "" {
			added = m.CreatedAt
		}
		t := adminRecoveryTime(added)
		if !t.IsZero() && t.Before(now.AddDate(0, 0, -30)) {
			ghosts = append(ghosts, m)
			total += m.Size
		}
	}
	rowErr = eligible.Err()
	eligible.Close()
	if err != nil || rowErr != nil {
		jsonError(w, 500, "Impossible de lire les lectures.")
		return
	}
	sort.Slice(ghosts, func(i, j int) bool {
		a, b := ghosts[i].DateAdded, ghosts[j].DateAdded
		if a == "" {
			a = ghosts[i].CreatedAt
		}
		if b == "" {
			b = ghosts[j].CreatedAt
		}
		return a < b
	})
	enrich := func(key string) []recoveredMedia {
		b, _ := json.Marshal(old[key])
		var source []cleanupNavigationMedia
		_ = json.Unmarshal(b, &source)
		out := []recoveredMedia{}
		for _, m := range source {
			copy := items[m.ID]
			copy.cleanupNavigationMedia = m
			if key == "duplicateMedia" {
				copy.DuplicateGroup = strings.ToLower(m.Type + ":" + strings.TrimSpace(m.Title))
			}
			out = append(out, copy)
		}
		return out
	}
	recommended := []recoveredMedia{}
	var recommendSize int64
	for _, m := range ghosts {
		added := m.DateAdded
		if added == "" {
			added = m.CreatedAt
		}
		if m.Type == "Movie" && adminRecoveryTime(added).Before(now.AddDate(0, 0, -730)) && len(recommended) < 10 {
			recommended = append(recommended, m)
			recommendSize += m.Size
		}
	}
	w.Header().Set("Cache-Control", "no-store")
	jsonResponse(w, 200, map[string]any{"ghostMedia": ghosts, "abandonedMedia": enrich("abandonedMedia"), "duplicateMedia": enrich("duplicateMedia"), "totalRecoverableSizeBytes": total, "staleMoviesRecommendation": map[string]any{"media": recommended, "count": len(recommended), "totalSizeBytes": recommendSize}})
}

// All selected records are validated before any network request or deletion.
func (h *Handler) recoveredDeleteStaleMovies(w http.ResponseWriter, r *http.Request) {
	var body struct {
		MediaIDs     []string `json:"mediaIds"`
		Confirmation string   `json:"confirmation"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16384)
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(&body); err != nil {
		jsonError(w, 400, "Payload JSON invalide.")
		return
	}
	var extra any
	if dec.Decode(&extra) != io.EOF {
		jsonError(w, 400, "Un objet JSON unique est requis.")
		return
	}
	if body.Confirmation != "DELETE" || len(body.MediaIDs) < 1 || len(body.MediaIDs) > 25 {
		jsonError(w, 400, "Confirmation DELETE et sélection de 1 à 25 films requises.")
		return
	}
	type selected struct{ id, title, jmid, serverURL, key string }
	selection := []selected{}
	seen := map[string]bool{}
	cutoff := time.Now().AddDate(0, 0, -730)
	for _, id := range body.MediaIDs {
		if strings.TrimSpace(id) == "" || seen[id] {
			jsonError(w, 400, "Sélection invalide ou dupliquée.")
			return
		}
		seen[id] = true
		var m selected
		var kind, date, jfServer string
		var plays, active int
		var enabled bool
		err := h.db.QueryRowContext(r.Context(), adminRecoveryBind(`SELECT m."id",m."title",m."jellyfinMediaId",m."type",COALESCE(NULLIF(CAST(m."dateAdded" AS TEXT),''),CAST(m."createdAt" AS TEXT)),s."url",COALESCE(s."jellyfinApiKey",''),s."isActive",s."jellyfinServerId",(SELECT COUNT(*) FROM "PlaybackHistory" p WHERE p."mediaId"=m."id"),(SELECT COUNT(*) FROM "ActiveStream" a WHERE a."mediaId"=m."id") FROM "Media" m JOIN "Server" s ON s."id"=m."serverId" WHERE m."id"=?`, h.driver), id).Scan(&m.id, &m.title, &m.jmid, &kind, &date, &m.serverURL, &m.key, &enabled, &jfServer, &plays, &active)
		added := adminRecoveryTime(date)
		if err != nil || kind != "Movie" || added.IsZero() || !added.Before(cutoff) || plays > 0 || active > 0 || !enabled || m.jmid == "" {
			jsonError(w, 400, "La sélection contient un média non éligible.")
			return
		}
		if m.key == "" && jfServer == "master" {
			m.key = os.Getenv("JELLYFIN_API_KEY")
		}
		if m.key == "" {
			jsonError(w, 400, "Clé Jellyfin du serveur cible manquante.")
			return
		}
		if _, err := security.ValidateSafeServerURL(m.serverURL); err != nil {
			jsonError(w, 400, "URL Jellyfin invalide.")
			return
		}
		selection = append(selection, m)
	}
	_ = security.LogAudit(r.Context(), h.db, h.driver, "cleanup.stale_movies.delete_requested", nil, nil, nil, nil, map[string]any{"mediaIds": body.MediaIDs})
	deletedIDs, deletedTitles := []string{}, []string{}
	failed := []map[string]string{}
	client := &http.Client{Timeout: 20 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	for _, m := range selection {
		// Recheck immediately before the destructive remote operation.
		var plays int
		err := h.db.QueryRowContext(r.Context(), adminRecoveryBind(`SELECT (SELECT COUNT(*) FROM "PlaybackHistory" WHERE "mediaId"=?)+(SELECT COUNT(*) FROM "ActiveStream" WHERE "mediaId"=?)`, h.driver), m.id, m.id).Scan(&plays)
		if err != nil || plays > 0 {
			failed = append(failed, map[string]string{"id": m.id, "title": m.title, "reason": "Le média a été lu depuis la validation."})
			continue
		}
		req, err := http.NewRequestWithContext(r.Context(), http.MethodDelete, strings.TrimRight(m.serverURL, "/")+"/Items/"+url.PathEscape(m.jmid), nil)
		if err != nil {
			failed = append(failed, map[string]string{"id": m.id, "title": m.title, "reason": "Requête Jellyfin invalide."})
			continue
		}
		req.Header.Set("X-Emby-Token", m.key)
		resp, err := client.Do(req)
		if err != nil {
			failed = append(failed, map[string]string{"id": m.id, "title": m.title, "reason": "Jellyfin inaccessible."})
			continue
		}
		_ = resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			failed = append(failed, map[string]string{"id": m.id, "title": m.title, "reason": fmt.Sprintf("Jellyfin HTTP %d", resp.StatusCode)})
			continue
		}
		if _, err = h.db.ExecContext(r.Context(), adminRecoveryBind(`DELETE FROM "Media" WHERE "id"=?`, h.driver), m.id); err != nil {
			failed = append(failed, map[string]string{"id": m.id, "title": m.title, "reason": "Suppression Jellyfin réussie ; réconciliation locale nécessaire."})
			continue
		}
		deletedIDs = append(deletedIDs, m.id)
		deletedTitles = append(deletedTitles, m.title)
	}
	jsonResponse(w, 200, map[string]any{"deletedCount": len(deletedIDs), "deletedIds": deletedIDs, "deletedTitles": deletedTitles, "failed": failed})
}

func (h *Handler) recoveredAdminHealth(w http.ResponseWriter, r *http.Request) {
	result, code := captureAdmin(h.adminHealth, r)
	if code != 200 {
		jsonResponse(w, code, result)
		return
	}
	var raw string
	_ = h.db.QueryRowContext(r.Context(), `SELECT "monitor" FROM "SystemHealthState" WHERE "id"='global'`).Scan(&raw)
	monitor := map[string]any{"status": "idle", "lastPollAt": nil}
	_ = json.Unmarshal([]byte(raw), &monitor)
	result["status"].(map[string]any)["monitor"] = monitor
	orphans := []map[string]any{}
	rows, err := h.db.QueryContext(r.Context(), `SELECT p."id",p."startedAt",COALESCE(p."durationWatched",0),COALESCE(u."username",'Utilisateur Supprimé'),COALESCE(m."title",'Média inconnu'),COALESCE(m."collectionType",m."type",'?') FROM "PlaybackHistory" p LEFT JOIN "User" u ON u."id"=p."userId" LEFT JOIN "Media" m ON m."id"=p."mediaId" WHERE p."endedAt" IS NULL AND NOT EXISTS(SELECT 1 FROM "ActiveStream" a WHERE a."userId"=p."userId" AND a."mediaId"=p."mediaId") ORDER BY p."startedAt" DESC LIMIT 20`)
	if err != nil {
		jsonError(w, 500, "Impossible de lire les lectures orphelines.")
		return
	}
	for rows.Next() {
		var id, started, user, title, library string
		var duration int64
		if err = rows.Scan(&id, &started, &duration, &user, &title, &library); err != nil {
			break
		}
		orphans = append(orphans, map[string]any{"id": id, "startedAt": started, "durationWatched": duration, "username": user, "mediaTitle": title, "library": library})
	}
	rowErr := rows.Err()
	rows.Close()
	if err != nil || rowErr != nil {
		jsonError(w, 500, "Impossible de lire les lectures orphelines.")
		return
	}
	start := time.Now().UTC().Truncate(24*time.Hour).AddDate(0, 0, -13)
	timeline := []map[string]any{}
	days := map[string]map[string]any{}
	for i := 0; i < 14; i++ {
		day := start.AddDate(0, 0, i)
		v := map[string]any{"day": day.Format("02/01"), "monitorErrors": 0, "syncErrors": 0, "backupErrors": 0, "cleanupOps": 0}
		days[day.Format("2006-01-02")] = v
		timeline = append(timeline, v)
	}
	rows, err = h.db.QueryContext(r.Context(), adminRecoveryBind(`SELECT "id","source","kind","message",COALESCE("details",'{}'),"createdAt" FROM "SystemHealthEvent" WHERE REPLACE("createdAt",'T',' ')>=? ORDER BY "createdAt" DESC`, h.driver), start.Format("2006-01-02 15:04:05"))
	if err != nil {
		jsonError(w, 500, "Impossible de lire les événements système.")
		return
	}
	events := []map[string]any{}
	for rows.Next() {
		var id, source, kind, message, detail, created string
		if err = rows.Scan(&id, &source, &kind, &message, &detail, &created); err != nil {
			break
		}
		details := map[string]any{}
		_ = json.Unmarshal([]byte(detail), &details)
		if len(events) < 20 {
			events = append(events, map[string]any{"id": id, "source": source, "kind": kind, "message": message, "details": details, "createdAt": created})
		}
		date := adminRecoveryTime(created)
		entry := days[date.Format("2006-01-02")]
		if entry == nil {
			continue
		}
		count := 1
		if n, ok := details["count"].(float64); ok && n > 0 {
			count = int(n)
		}
		kind = strings.ToLower(kind)
		key := ""
		for _, s := range []string{"ghost", "orphan", "open-playback", "cleanup", "clean", "prune", "purge"} {
			if strings.Contains(kind, s) {
				key = "cleanupOps"
				break
			}
		}
		if key == "" && strings.Contains(kind, "error") {
			switch source {
			case "monitor":
				key = "monitorErrors"
			case "sync":
				key = "syncErrors"
			case "backup":
				key = "backupErrors"
			}
		}
		if key != "" {
			entry[key] = entry[key].(int) + count
		}
	}
	rowErr = rows.Err()
	rows.Close()
	if err != nil || rowErr != nil {
		jsonError(w, 500, "Impossible de lire les événements système.")
		return
	}
	// Recent closures are useful even when older than the chart's 14-day window.
	rows, err = h.db.QueryContext(r.Context(), `SELECT "id","source","kind","message",COALESCE("details",'{}'),"createdAt" FROM "SystemHealthEvent" ORDER BY "createdAt" DESC LIMIT 20`)
	if err != nil {
		jsonError(w, 500, "Impossible de lire les événements récents.")
		return
	}
	events = []map[string]any{}
	for rows.Next() {
		var id, source, kind, message, details, created string
		if err = rows.Scan(&id, &source, &kind, &message, &details, &created); err != nil {
			break
		}
		var d any
		_ = json.Unmarshal([]byte(details), &d)
		events = append(events, map[string]any{"id": id, "source": source, "kind": kind, "message": message, "details": d, "createdAt": created})
	}
	rowErr = rows.Err()
	rows.Close()
	if err != nil || rowErr != nil {
		jsonError(w, 500, "Impossible de lire les événements récents.")
		return
	}
	alerts, err := h.recoveredSecurityAlerts(r)
	if err != nil {
		jsonError(w, 500, "Impossible de lire les anomalies de sécurité.")
		return
	}
	result["orphanPlaybacks"] = orphans
	result["recentEvents"] = events
	result["anomalyTimeline"] = timeline
	result["securityAlerts"] = alerts
	w.Header().Set("Cache-Control", "no-store")
	jsonResponse(w, 200, result)
}

func (h *Handler) recoveredSecurityAlerts(r *http.Request) ([]map[string]any, error) {
	alerts := []map[string]any{}
	day := time.Now().AddDate(0, 0, -1).UTC().Format("2006-01-02 15:04:05")
	rows, err := h.db.QueryContext(r.Context(), adminRecoveryBind(`SELECT p."userId",COALESCE(u."username",'Utilisateur'),p."ipAddress",p."startedAt" FROM "PlaybackHistory" p LEFT JOIN "User" u ON u."id"=p."userId" WHERE REPLACE(p."startedAt",'T',' ')>=? AND p."userId" IS NOT NULL AND p."ipAddress" IS NOT NULL AND p."ipAddress"<>'' ORDER BY p."startedAt" DESC`, h.driver), day)
	if err != nil {
		return nil, err
	}
	type shared struct {
		name, date string
		ips        []string
	}
	users := map[string]*shared{}
	order := []string{}
	for rows.Next() {
		var id, name, ip, date string
		if err = rows.Scan(&id, &name, &ip, &date); err != nil {
			break
		}
		v := users[id]
		if v == nil {
			v = &shared{name: name, date: date}
			users[id] = v
			order = append(order, id)
		}
		found := false
		for _, other := range v.ips {
			if other == ip {
				found = true
			}
		}
		if !found {
			v.ips = append(v.ips, ip)
		}
	}
	rowErr := rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	if rowErr != nil {
		return nil, rowErr
	}
	for _, id := range order {
		v := users[id]
		if len(v.ips) > 1 {
			ips := v.ips
			if len(ips) > 3 {
				ips = ips[:3]
			}
			alerts = append(alerts, map[string]any{"id": "sharing_" + id, "type": "account_sharing", "severity": "warning", "title": "Double localisation : " + v.name, "description": fmt.Sprintf("Utilisé depuis %d adresses IP distinctes (%s) au cours des 24 dernières heures.", len(v.ips), strings.Join(ips, ", ")), "timestamp": v.date, "metadata": map[string]any{"username": v.name, "ipCount": len(v.ips)}})
		}
	}
	rows, err = h.db.QueryContext(r.Context(), adminRecoveryBind(`SELECT p."mediaId",COALESCE(m."title",'Média inconnu'),COUNT(DISTINCT p."userId"),MAX(p."startedAt") FROM "PlaybackHistory" p LEFT JOIN "Media" m ON m."id"=p."mediaId" WHERE REPLACE(p."startedAt",'T',' ')>=? AND p."durationWatched"<=15 AND p."userId" IS NOT NULL AND p."mediaId"<>'' GROUP BY p."mediaId",m."title" HAVING COUNT(DISTINCT p."userId")>=3`, h.driver), time.Now().AddDate(0, 0, -7).UTC().Format("2006-01-02 15:04:05"))
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var id, title, date string
		var count int
		if err = rows.Scan(&id, &title, &count, &date); err != nil {
			break
		}
		alerts = append(alerts, map[string]any{"id": "corrupt_" + id, "type": "corrupted_media", "severity": "critical", "title": "Fichier potentiellement corrompu : " + title, "description": fmt.Sprintf("Fermé après moins de 15s par %d spectateurs différents. Vérifiez l'encodage du fichier.", count), "timestamp": date, "metadata": map[string]any{"title": title, "userCount": count}})
	}
	rowErr = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	if rowErr != nil {
		return nil, rowErr
	}
	if len(alerts) > 10 {
		alerts = alerts[:10]
	}
	return alerts, nil
}

func (h *Handler) recoveredPluginHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		var body struct{ Action, APIKey string }
		r.Body = http.MaxBytesReader(w, r.Body, 4096)
		dec := json.NewDecoder(r.Body)
		if dec.Decode(&body) != nil {
			jsonError(w, 400, "Payload JSON invalide.")
			return
		}
		var extra any
		if dec.Decode(&extra) != io.EOF {
			jsonError(w, 400, "Payload JSON invalide.")
			return
		}
		if body.Action != "test_connection" && body.Action != "force_heartbeat" {
			jsonError(w, 400, "Action non supportée.")
			return
		}
		if h.pluginHandler == nil {
			jsonError(w, 503, "Handler plugin indisponible.")
			return
		}
		method := http.MethodGet
		var payload []byte
		if body.Action == "force_heartbeat" {
			if strings.TrimSpace(body.APIKey) == "" {
				jsonError(w, 400, "Clé API requise.")
				return
			}
			var jfID, name, serverURL string
			err := h.db.QueryRowContext(r.Context(), `SELECT "jellyfinServerId","name","url" FROM "Server" WHERE "isActive"=TRUE ORDER BY "createdAt" LIMIT 1`).Scan(&jfID, &name, &serverURL)
			if err != nil {
				jsonError(w, 400, "Serveur Jellyfin actif requis.")
				return
			}
			payload, _ = json.Marshal(map[string]any{"event": "Heartbeat", "eventSchemaVersion": 3, "pluginVersion": "manual-probe", "serverId": jfID, "serverName": name, "serverUrl": serverURL, "users": []any{}})
			method = http.MethodPost
		}
		probe := httptest.NewRequest(method, "/api/plugin/events", bytes.NewReader(payload)).WithContext(r.Context())
		probe.RemoteAddr = r.RemoteAddr
		if method == http.MethodPost {
			probe.Header.Set("Content-Type", "application/json")
			probe.Header.Set("Authorization", "Bearer "+strings.TrimSpace(body.APIKey))
		}
		rec := httptest.NewRecorder()
		started := time.Now()
		h.pluginHandler.ServeHTTP(rec, probe)
		var response map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &response)
		ok := rec.Code >= 200 && rec.Code < 300
		if response["ok"] == false || response["success"] == false {
			ok = false
		}
		_ = security.LogAudit(r.Context(), h.db, h.driver, "admin.plugin.health."+body.Action, nil, nil, nil, nil, map[string]any{"ok": ok, "status": rec.Code})
		jsonResponse(w, 200, map[string]any{"ok": ok, "status": rec.Code, "latencyMs": time.Since(started).Milliseconds(), "response": response})
		return
	}
	result, code := captureAdmin(h.adminPluginHealth, r)
	if code != 200 {
		jsonResponse(w, code, result)
		return
	}
	heartbeat := result["heartbeat"].(map[string]any)
	if result["lastSeen"] == nil {
		heartbeat["gapSec"] = nil
	}
	rows, err := h.db.QueryContext(r.Context(), adminRecoveryBind(`SELECT "createdAt",COALESCE("details",'{}') FROM "SystemHealthEvent" WHERE "kind"='monitor_ping' AND REPLACE("createdAt",'T',' ')>=? ORDER BY "createdAt"`, h.driver), time.Now().AddDate(0, 0, -1).UTC().Format("2006-01-02 15:04:05"))
	if err != nil {
		jsonError(w, 500, "Impossible de lire les heartbeats.")
		return
	}
	series := []map[string]any{}
	intervals, jitters := []float64{}, []float64{}
	var previous time.Time
	var lastDetails map[string]any
	count := 0
	for rows.Next() {
		var created, raw string
		if err = rows.Scan(&created, &raw); err != nil {
			break
		}
		now := adminRecoveryTime(created)
		_ = json.Unmarshal([]byte(raw), &lastDetails)
		count++
		if !previous.IsZero() && !now.IsZero() {
			sec := now.Sub(previous).Seconds()
			intervals = append(intervals, sec)
			series = append(series, map[string]any{"timestamp": created, "intervalSec": sec})
		}
		previous = now
	}
	rowErr := rows.Err()
	rows.Close()
	if err != nil || rowErr != nil {
		jsonError(w, 500, "Impossible de lire les heartbeats.")
		return
	}
	percentile := func(values []float64, p float64) any {
		if len(values) == 0 {
			return nil
		}
		copy := append([]float64{}, values...)
		sort.Float64s(copy)
		index := max(0, min(len(copy)-1, int(math.Ceil(float64(len(copy))*p))-1))
		return math.Round(copy[index]*100) / 100
	}
	p50 := percentile(intervals, .5)
	if p50 != nil {
		median := p50.(float64)
		for i, sec := range intervals {
			jitter := math.Abs(sec - median)
			jitters = append(jitters, jitter)
			series[i]["jitterSec"] = jitter
		}
	}
	heartbeat["count24h"] = count
	heartbeat["intervalP50Sec"] = p50
	heartbeat["intervalP95Sec"] = percentile(intervals, .95)
	heartbeat["jitterP95Sec"] = percentile(jitters, .95)
	// Match the historical 240-sample graph budget without losing the last point.
	if len(series) > 240 {
		step := int(math.Ceil(float64(len(series)) / 240))
		sampled := []map[string]any{}
		for i, row := range series {
			if i%step == 0 || i == len(series)-1 {
				sampled = append(sampled, row)
			}
		}
		series = sampled
	}
	heartbeat["intervalSeries24h"] = series
	positiveEnv := func(key string, fallback float64) float64 {
		n, err := strconv.ParseFloat(os.Getenv(key), 64)
		if err != nil || math.IsNaN(n) || math.IsInf(n, 0) || n <= 0 {
			return fallback
		}
		return n
	}
	timeout := positiveEnv("PLUGIN_HEARTBEAT_TIMEOUT_SEC", 600)
	gapWarning := positiveEnv("PLUGIN_HEALTH_GAP_WARNING_SEC", math.Max(60, math.Round(timeout)))
	gapCritical := math.Max(gapWarning+1, positiveEnv("PLUGIN_HEALTH_GAP_CRITICAL_SEC", math.Max(gapWarning+1, math.Round(timeout*1.5))))
	jitterWarning := positiveEnv("PLUGIN_HEALTH_JITTER_WARNING_SEC", math.Max(30, math.Round(timeout*.3)))
	jitterCritical := math.Max(jitterWarning+.1, positiveEnv("PLUGIN_HEALTH_JITTER_CRITICAL_SEC", math.Max(jitterWarning+1, math.Round(timeout*.5))))
	result["thresholdDefaults"] = map[string]any{"gapWarningSec": gapWarning, "gapCriticalSec": gapCritical, "jitterWarningSec": jitterWarning, "jitterCriticalSec": jitterCritical}
	plugin := result["plugin"].(map[string]any)
	if gap, ok := heartbeat["gapSec"].(float64); ok {
		plugin["connected"] = gap <= timeout
		result["healthy"] = gap <= timeout
	}
	plugin["jellyfinVersion"] = nil
	plugin["schemaVersion"] = nil
	reported := map[string]any{"queueDepth": nil, "retries": nil, "lastHttpCode": nil, "coalescedProgressEvents": nil, "note": "Metrics are reported by the plugin when available."}
	if lastDetails != nil {
		plugin["jellyfinVersion"] = lastDetails["jellyfinVersion"]
		plugin["schemaVersion"] = lastDetails["eventSchemaVersion"]
		for _, key := range []string{"queueDepth", "retries", "lastHttpCode", "coalescedProgressEvents"} {
			reported[key] = lastDetails[key]
		}
	}
	result["pluginReportedMetrics"] = reported
	failures := []map[string]any{}
	failureCounts := map[string]int{}
	rows, err = h.db.QueryContext(r.Context(), adminRecoveryBind(`SELECT "action",COALESCE("ipAddress",''),"createdAt" FROM "AdminAuditLog" WHERE REPLACE("createdAt",'T',' ')>=? AND "action" IN ('plugin.events.unauthorized','plugin.events.rate_limited','plugin.events.payload_too_large','plugin.events.invalid_payload','plugin.events.invalid_content_type') ORDER BY "createdAt" DESC`, h.driver), time.Now().AddDate(0, 0, -1).UTC().Format("2006-01-02 15:04:05"))
	if err != nil {
		jsonError(w, 500, "Impossible de lire les erreurs plugin.")
		return
	}
	for rows.Next() {
		var action, ip, created string
		if err = rows.Scan(&action, &ip, &created); err != nil {
			break
		}
		failureCounts[action]++
		if len(failures) < 20 {
			failures = append(failures, map[string]any{"action": action, "ipAddress": ip, "createdAt": created})
		}
	}
	rowErr = rows.Err()
	rows.Close()
	if err != nil || rowErr != nil {
		jsonError(w, 500, "Impossible de lire les erreurs plugin.")
		return
	}
	total := 0
	for _, n := range failureCounts {
		total += n
	}
	var monitorErrors int
	_ = h.db.QueryRowContext(r.Context(), adminRecoveryBind(`SELECT COUNT(*) FROM "SystemHealthEvent" WHERE "source"='monitor' AND "kind" LIKE '%error%' AND REPLACE("createdAt",'T',' ')>=?`, h.driver), time.Now().AddDate(0, 0, -1).UTC().Format("2006-01-02 15:04:05")).Scan(&monitorErrors)
	// Heartbeats are observable successes. Other event successes are not recorded
	// consistently by the receiver, so their success rate must remain unknown.
	result["ingestion"] = map[string]any{"successEstimate24h": count, "failureCount24h": total, "unauthorized24h": failureCounts["plugin.events.unauthorized"], "rateLimited24h": failureCounts["plugin.events.rate_limited"], "invalidPayload24h": failureCounts["plugin.events.invalid_payload"], "monitorErrors24h": monitorErrors, "successRate24h": nil, "observabilityNote": "Not all plugin requests have persisted ingestion counters; success rate unavailable."}
	result["recentFailures"] = failures
	var avg sql.NullFloat64
	var active, transcodes, staleStreams int
	threshold := time.Now().Add(-time.Duration(timeout * float64(time.Second))).UTC().Format("2006-01-02 15:04:05")
	if err := h.db.QueryRowContext(r.Context(), adminRecoveryBind(`SELECT COALESCE(SUM(CASE WHEN REPLACE("lastPingAt",'T',' ')>=? THEN 1 ELSE 0 END),0),COALESCE(SUM(CASE WHEN REPLACE("lastPingAt",'T',' ')>=? AND "playMethod"='Transcode' THEN 1 ELSE 0 END),0),COALESCE(SUM(CASE WHEN REPLACE("lastPingAt",'T',' ')<? THEN 1 ELSE 0 END),0),AVG(CASE WHEN REPLACE("lastPingAt",'T',' ')>=? AND "bitrate">0 THEN "bitrate" END) FROM "ActiveStream"`, h.driver), threshold, threshold, threshold, threshold).Scan(&active, &transcodes, &staleStreams, &avg); err != nil {
		jsonError(w, 500, "Impossible de lire les flux plugin.")
		return
	}
	bitrate := any(nil)
	if avg.Valid {
		value := avg.Float64
		if value >= 10000 {
			value /= 1000
		}
		bitrate = math.Round(value)
	}
	result["streams"] = map[string]any{"active": active, "transcodes": transcodes, "stale": staleStreams, "avgBitrateKbps": bitrate}
	result["generatedAt"] = time.Now().UTC().Format(time.RFC3339Nano)
	var telemetryRaw sql.NullString
	if err := h.db.QueryRowContext(r.Context(), `SELECT "pluginTelemetrySettings" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&telemetryRaw); err != nil && err != sql.ErrNoRows {
		jsonError(w, 500, "Impossible de lire la télémétrie plugin.")
		return
	}
	var telemetry map[string]any
	_ = json.Unmarshal([]byte(telemetryRaw.String), &telemetry)
	result["telemetrySettings"] = settings.NormalizeTelemetry(telemetry)
	w.Header().Set("Cache-Control", "no-store")
	jsonResponse(w, 200, result)
}

type recoveredServer struct {
	ID                 string `json:"id"`
	Name               string `json:"name"`
	JFID, URL, Updated string
	Active             bool
	ActiveStreams      int     `json:"activeStreams"`
	Transcodes         int     `json:"transcodes"`
	StaleStreams       int     `json:"staleStreams"`
	AvgBitrate         any     `json:"avgBitrateKbps"`
	Plays              int     `json:"plays24h"`
	Hours              float64 `json:"watchHours24h"`
	Gap                any     `json:"heartbeatGapSec"`
	Score              int     `json:"healthScore"`
}

func (h *Handler) recoveredServerCompare(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.QueryContext(r.Context(), `SELECT "id","name","jellyfinServerId","url","updatedAt","isActive" FROM "Server" ORDER BY "name"`)
	if err != nil {
		jsonError(w, 500, "Impossible de lire les serveurs.")
		return
	}
	servers := []recoveredServer{}
	hasActive := false
	for rows.Next() {
		var s recoveredServer
		if err = rows.Scan(&s.ID, &s.Name, &s.JFID, &s.URL, &s.Updated, &s.Active); err != nil {
			break
		}
		servers = append(servers, s)
		hasActive = hasActive || s.Active
	}
	rowErr := rows.Err()
	rows.Close()
	if err != nil || rowErr != nil {
		jsonError(w, 500, "Impossible de lire les serveurs.")
		return
	}
	inventory := []map[string]any{}
	for _, s := range servers {
		var media, users, plays, streams, watchMS int64
		if err := h.db.QueryRowContext(r.Context(), adminRecoveryBind(`SELECT (SELECT COUNT(*) FROM "Media" WHERE "serverId"=?),(SELECT COUNT(*) FROM "User" WHERE "serverId"=?),(SELECT COUNT(*) FROM "PlaybackHistory" WHERE "serverId"=?),(SELECT COUNT(*) FROM "ActiveStream" WHERE "serverId"=?),(SELECT COALESCE(SUM("durationWatched"),0)*1000 FROM "PlaybackHistory" WHERE "serverId"=?)`, h.driver), s.ID, s.ID, s.ID, s.ID, s.ID).Scan(&media, &users, &plays, &streams, &watchMS); err != nil {
			jsonError(w, 500, "Impossible de lire l’inventaire Go.")
			return
		}
		inventory = append(inventory, map[string]any{"id": s.ID, "name": s.Name, "url": s.URL, "isActive": s.Active, "mediaCount": media, "userCount": users, "playsCount": plays, "activeStreams": streams, "totalWatchMs": watchMS})
	}
	preferred := map[string]recoveredServer{}
	empty := []recoveredServer{}
	priority := func(s recoveredServer) int {
		if strings.ToLower(strings.TrimSpace(s.JFID)) == "master" {
			return -10
		}
		if strings.TrimSpace(s.JFID) == "" {
			return 5
		}
		return 0
	}
	for _, s := range servers {
		if hasActive && !s.Active {
			continue
		}
		key := strings.ToLower(strings.TrimRight(strings.TrimSpace(s.URL), "/"))
		if key == "" {
			empty = append(empty, s)
			continue
		}
		old, ok := preferred[key]
		if !ok || priority(s) < priority(old) || (priority(s) == priority(old) && strings.ToLower(s.Name) < strings.ToLower(old.Name)) {
			preferred[key] = s
		}
	}
	options := empty
	for _, s := range preferred {
		options = append(options, s)
	}
	sort.Slice(options, func(i, j int) bool { return strings.ToLower(options[i].Name) < strings.ToLower(options[j].Name) })
	multi := strings.EqualFold(os.Getenv("JELLYTRACK_MODE"), "multi") && len(options) > 1
	requested, present := r.URL.Query()["servers"]
	rawScope := ""
	source := "none"
	if present {
		rawScope = strings.Join(requested, ",")
		source = "query"
	} else if cookie, err := r.Cookie("jellytrack_server_scope"); err == nil {
		rawScope, _ = url.QueryUnescape(cookie.Value)
		source = "cookie"
	}
	valid := map[string]bool{}
	for _, s := range options {
		valid[s.ID] = true
	}
	selected := []string{}
	seen := map[string]bool{}
	if multi {
		for _, id := range strings.Split(rawScope, ",") {
			id = strings.TrimSpace(id)
			if valid[id] && !seen[id] {
				selected = append(selected, id)
				seen[id] = true
			}
		}
	}
	publicOptions := []map[string]string{}
	for _, s := range options {
		publicOptions = append(publicOptions, map[string]string{"id": s.ID, "name": s.Name})
	}
	if !multi {
		jsonResponse(w, 200, map[string]any{"multiServerEnabled": false, "selectableServers": publicOptions, "servers": []any{}, "inventory": inventory})
		return
	}
	ranking := []recoveredServer{}
	var totalActive, totalPlays, totalErrors int
	var totalHours float64
	now := time.Now()
	stale := now.Add(-5 * time.Minute).UTC().Format("2006-01-02 15:04:05")
	day := now.AddDate(0, 0, -1).UTC().Format("2006-01-02 15:04:05")
	for _, s := range options {
		if len(selected) > 0 && !seen[s.ID] {
			continue
		}
		var avg sql.NullFloat64
		err = h.db.QueryRowContext(r.Context(), adminRecoveryBind(`SELECT COALESCE(SUM(CASE WHEN REPLACE("lastPingAt",'T',' ')>=? THEN 1 ELSE 0 END),0),COALESCE(SUM(CASE WHEN REPLACE("lastPingAt",'T',' ')>=? AND "playMethod"='Transcode' THEN 1 ELSE 0 END),0),COALESCE(SUM(CASE WHEN REPLACE("lastPingAt",'T',' ')<? THEN 1 ELSE 0 END),0),AVG(CASE WHEN REPLACE("lastPingAt",'T',' ')>=? AND "bitrate">0 THEN "bitrate" END) FROM "ActiveStream" WHERE "serverId"=?`, h.driver), stale, stale, stale, stale, s.ID).Scan(&s.ActiveStreams, &s.Transcodes, &s.StaleStreams, &avg)
		if err != nil {
			jsonError(w, 500, "Impossible de lire les flux.")
			return
		}
		if avg.Valid {
			value := avg.Float64
			if value >= 10000 {
				value /= 1000
			}
			s.AvgBitrate = math.Round(value)
		}
		var seconds int64
		err = h.db.QueryRowContext(r.Context(), adminRecoveryBind(`SELECT COUNT(*),COALESCE(SUM("durationWatched"),0) FROM "PlaybackHistory" WHERE "serverId"=? AND REPLACE("startedAt",'T',' ')>=?`, h.driver), s.ID, day).Scan(&s.Plays, &seconds)
		if err != nil {
			jsonError(w, 500, "Impossible de lire les lectures.")
			return
		}
		s.Hours = float64(seconds) / 3600
		gap := 0.0
		if t := adminRecoveryTime(s.Updated); !t.IsZero() {
			gap = math.Max(0, now.Sub(t).Seconds())
			s.Gap = int(gap)
		}
		score := float64(s.Plays)*.15 + float64(s.ActiveStreams)*2 - float64(s.Transcodes)*1.5 - float64(s.StaleStreams)*3
		if gap > 600 {
			score -= 5
		}
		s.Score = int(math.Round(score))
		ranking = append(ranking, s)
		totalActive += s.ActiveStreams
		totalPlays += s.Plays
		totalHours += s.Hours
	}
	err = h.db.QueryRowContext(r.Context(), adminRecoveryBind(`SELECT COUNT(*) FROM "AdminAuditLog" WHERE REPLACE("createdAt",'T',' ')>=? AND "action" IN ('plugin.events.unauthorized','plugin.events.rate_limited','plugin.events.payload_too_large','plugin.events.invalid_payload','plugin.events.invalid_content_type')`, h.driver), day).Scan(&totalErrors)
	if err != nil {
		jsonError(w, 500, "Impossible de lire les erreurs plugin.")
		return
	}
	sort.SliceStable(ranking, func(i, j int) bool { return ranking[i].Score > ranking[j].Score })
	publicRanking := []map[string]any{}
	for _, s := range ranking {
		publicRanking = append(publicRanking, map[string]any{"id": s.ID, "name": s.Name, "activeStreams": s.ActiveStreams, "transcodes": s.Transcodes, "staleStreams": s.StaleStreams, "avgBitrateKbps": s.AvgBitrate, "plays24h": s.Plays, "watchHours24h": s.Hours, "heartbeatGapSec": s.Gap, "healthScore": s.Score})
	}
	jsonResponse(w, 200, map[string]any{"multiServerEnabled": true, "selectableServers": publicOptions, "selectedServerIds": selected, "scopeSource": source, "servers": publicRanking, "inventory": inventory, "totals": map[string]any{"activeStreams": totalActive, "plays24h": totalPlays, "watchHours24h": totalHours, "pluginErrors24h": totalErrors}})
}
