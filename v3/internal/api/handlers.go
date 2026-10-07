package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/maelmoreau21/jellytrack/v3/internal/database"
	"github.com/maelmoreau21/jellytrack/v3/internal/jellyfin"
)

type Handler struct {
	db     *sql.DB
	driver string
}

func New(db *sql.DB, driver string) *Handler { return &Handler{db: db, driver: driver} }
func (h *Handler) Register(mux *http.ServeMux, protect func(http.Handler) http.Handler) {
	for path, fn := range map[string]http.HandlerFunc{"GET /api/dashboard": h.dashboard, "GET /api/users": h.users, "GET /api/history": h.history, "POST /api/sync": h.sync, "GET /api/jellyfin/sessions": h.sessions} {
		mux.Handle(path, protect(fn))
	}
}
func (h *Handler) dashboard(w http.ResponseWriter, r *http.Request) {
	days := boundedInt(r.URL.Query().Get("days"), 30, 1, 365)
	since := time.Now().UTC().AddDate(0, 0, -days).Format(time.RFC3339Nano)
	excluded := excludedLibrariesClause(h.driver, "m")
	var views, duration, users, media int64
	if err := h.db.QueryRowContext(r.Context(), database.Bind(`SELECT COUNT(*),COALESCE(SUM(p."durationWatched"),0) FROM "PlaybackHistory" p JOIN "Media" m ON m."id"=p."mediaId" WHERE p."startedAt">=? AND `+excluded, h.driver), since).Scan(&views, &duration); err != nil {
		jsonError(w, 500, "Impossible de charger les statistiques.")
		return
	}
	if err := h.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM "User" WHERE "isActive"=1`).Scan(&users); err != nil {
		jsonError(w, 500, "Impossible de charger les statistiques.")
		return
	}
	if err := h.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM "Media"`).Scan(&media); err != nil {
		jsonError(w, 500, "Impossible de charger les statistiques.")
		return
	}
	rows, err := h.db.QueryContext(r.Context(), database.Bind(`SELECT substr(CAST(p."startedAt" AS TEXT),1,10) AS "day",COUNT(*) FROM "PlaybackHistory" p JOIN "Media" m ON m."id"=p."mediaId" WHERE p."startedAt">=? AND `+excluded+` GROUP BY "day" ORDER BY "day"`, h.driver), since)
	if err != nil {
		jsonError(w, 500, "Impossible de charger les statistiques.")
		return
	}
	defer rows.Close()
	activity := []map[string]any{}
	for rows.Next() {
		var day string
		var count int64
		if rows.Scan(&day, &count) != nil {
			jsonError(w, 500, "Erreur de lecture.")
			return
		}
		activity = append(activity, map[string]any{"day": day, "views": count})
	}
	jsonResponse(w, 200, map[string]any{"periodDays": days, "views": views, "durationMs": duration, "users": users, "media": media, "activity": activity})
}
func (h *Handler) users(w http.ResponseWriter, r *http.Request) {
	limit, offset := page(r)
	rows, err := h.db.QueryContext(r.Context(), database.Bind(`SELECT u."id",u."username",u."jellyfinUserId",u."lastActive",s."name" FROM "User" u LEFT JOIN "Server" s ON s."id"=u."serverId" WHERE u."isActive"=TRUE ORDER BY LOWER(u."username") LIMIT ? OFFSET ?`, h.driver), limit, offset)
	if err != nil {
		jsonError(w, 500, "Impossible de charger les utilisateurs.")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, jid string
		var active, server sql.NullString
		if rows.Scan(&id, &name, &jid, &active, &server) != nil {
			jsonError(w, 500, "Erreur de lecture.")
			return
		}
		out = append(out, map[string]any{"id": id, "username": name, "jellyfinUserId": jid, "lastActive": nullable(active), "server": nullable(server)})
	}
	if rows.Err() != nil {
		jsonError(w, 500, "Erreur de lecture.")
		return
	}
	jsonResponse(w, 200, map[string]any{"items": out, "limit": limit, "offset": offset})
}
func (h *Handler) history(w http.ResponseWriter, r *http.Request) {
	limit, offset := page(r)
	days := boundedInt(r.URL.Query().Get("days"), 30, 1, 3650)
	since := time.Now().UTC().AddDate(0, 0, -days).Format(time.RFC3339Nano)
	rows, err := h.db.QueryContext(r.Context(), database.Bind(`SELECT p."id",p."startedAt",p."endedAt",p."durationWatched",p."playMethod",u."username",m."title",m."type",m."libraryName" FROM "PlaybackHistory" p LEFT JOIN "User" u ON u."id"=p."userId" JOIN "Media" m ON m."id"=p."mediaId" WHERE p."startedAt">=? AND `+excludedLibrariesClause(h.driver, "m")+` ORDER BY p."startedAt" DESC LIMIT ? OFFSET ?`, h.driver), since, limit, offset)
	if err != nil {
		jsonError(w, 500, "Impossible de charger l’historique.")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, started, method, title, kind string
		var ended, user, library sql.NullString
		var duration int64
		if rows.Scan(&id, &started, &ended, &duration, &method, &user, &title, &kind, &library) != nil {
			jsonError(w, 500, "Erreur de lecture.")
			return
		}
		out = append(out, map[string]any{"id": id, "startedAt": started, "endedAt": nullable(ended), "durationMs": duration, "playMethod": method, "username": nullable(user), "title": title, "type": kind, "library": nullable(library)})
	}
	jsonResponse(w, 200, map[string]any{"items": out, "limit": limit, "offset": offset, "periodDays": days})
}
func (h *Handler) sync(w http.ResponseWriter, r *http.Request) {
	var input struct {
		RecentOnly bool `json:"recentOnly"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1024)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		jsonError(w, 400, "Corps JSON invalide.")
		return
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		jsonError(w, 400, "Corps JSON invalide.")
		return
	}
	if !sameOrigin(r) {
		jsonError(w, 403, "Origine refusée.")
		return
	}
	base := strings.TrimRight(strings.TrimSpace(os.Getenv("JELLYFIN_URL")), "/")
	key := first(os.Getenv("JELLYFIN_API_KEY"), os.Getenv("JELLYTRACK_JELLYFIN_API_KEY"))
	if base == "" || key == "" {
		jsonError(w, 503, "Configurez JELLYFIN_URL et JELLYFIN_API_KEY.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Minute)
	defer cancel()
	result, err := jellyfin.SyncOne(ctx, h.db, h.driver, "", os.Getenv("JELLYFIN_SERVER_ID"), first(os.Getenv("JELLYFIN_SERVER_NAME"), "Jellyfin"), base, key, input.RecentOnly)
	if err != nil {
		jsonError(w, 502, "La synchronisation Jellyfin a échoué.")
		return
	}
	jsonResponse(w, 200, result)
}
func (h *Handler) sessions(w http.ResponseWriter, r *http.Request) {
	base := strings.TrimRight(strings.TrimSpace(os.Getenv("JELLYFIN_URL")), "/")
	key := first(os.Getenv("JELLYFIN_API_KEY"), os.Getenv("JELLYTRACK_JELLYFIN_API_KEY"))
	c, err := jellyfin.New(base, key)
	if err != nil {
		jsonError(w, 503, "Configurez Jellyfin avant de consulter les sessions.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	items, err := c.Sessions(ctx)
	if err != nil {
		jsonError(w, 502, "Jellyfin ne répond pas.")
		return
	}
	jsonResponse(w, 200, map[string]any{"items": items})
}
func page(r *http.Request) (int, int) {
	return boundedInt(r.URL.Query().Get("limit"), 50, 1, 200), boundedInt(r.URL.Query().Get("offset"), 0, 0, 10000000)
}
func boundedInt(raw string, def, min, max int) int {
	if strings.TrimSpace(raw) == "" {
		return def
	}
	n, e := strconv.Atoi(raw)
	if e != nil || n < min {
		return min
	}
	if n > max {
		return max
	}
	return n
}
func nullable(v sql.NullString) any {
	if v.Valid {
		return v.String
	}
	return nil
}
func jsonResponse(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func jsonError(w http.ResponseWriter, status int, msg string) {
	jsonResponse(w, status, map[string]string{"error": msg})
}
func sameOrigin(r *http.Request) bool {
	o := r.Header.Get("Origin")
	if o == "" {
		return false
	}
	return strings.EqualFold(o, "https://"+r.Host) || strings.EqualFold(o, "http://"+r.Host)
}
func first(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}
func excludedLibrariesClause(driver, mediaAlias string) string {
	if driver == "postgres" {
		return `NOT (` + mediaAlias + `."libraryName" = ANY(COALESCE((SELECT "excludedLibraries" FROM "GlobalSettings" WHERE "id"='global'),ARRAY[]::TEXT[])))`
	}
	return `NOT EXISTS (SELECT 1 FROM json_each(COALESCE((SELECT "excludedLibraries" FROM "GlobalSettings" WHERE "id"='global'),'[]')) ex WHERE ex.value=` + mediaAlias + `."libraryName")`
}
