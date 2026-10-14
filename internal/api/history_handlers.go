package api

import (
	"database/sql"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/auth"
	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/internal/history"
	"github.com/maelmoreau21/jellytrack/internal/media"
	"github.com/maelmoreau21/jellytrack/internal/stats"
)

func (h *Handler) history(w http.ResponseWriter, r *http.Request) {
	r = h.withHistoryLibraryAccess(r)
	limit, offset := page(r)
	q := r.URL.Query()
	export := r.URL.Path == "/api/logs/export"
	days := boundedInt(q.Get("days"), 30, 1, 3650)
	exclusion, args, err := h.historyExcludedLibraries(r)
	if err != nil {
		jsonError(w, 500, "Impossible de charger l’historique.")
		return
	}
	clauses := []string{exclusion}
	access, accessArgs := h.historyLibraryClause(r)
	clauses = append(clauses, access)
	args = append(args, accessArgs...)
	if q.Get("hideZapped") != "false" {
		clauses = append(clauses, history.ZappingClause("p"))
	}
	if q.Get("days") != "all" && (!export || q.Has("days")) {
		clauses = append(clauses, `p."startedAt" >= ?`)
		args = append(args, time.Now().UTC().AddDate(0, 0, -days).Format(time.RFC3339Nano))
	}
	for _, bound := range []struct {
		key, op string
		end     bool
	}{{"dateFrom", ">=", false}, {"dateTo", "<", true}} {
		if raw := q.Get(bound.key); raw != "" {
			date, err := time.Parse("2006-01-02", raw)
			if err != nil {
				jsonError(w, 400, "Date invalide.")
				return
			}
			if bound.end {
				date = date.AddDate(0, 0, 1)
			}
			clauses = append(clauses, `p."startedAt" `+bound.op+` ?`)
			args = append(args, date.Format(time.RFC3339Nano))
		}
	}
	if p, ok := auth.PrincipalFromContext(r.Context()); ok && !p.IsAdmin() {
		userID, serverID, err := h.historyIdentity(r, p)
		if err != nil {
			jsonError(w, 403, "Identité utilisateur ambiguë ou introuvable. Reconnectez-vous.")
			return
		}
		clauses = append(clauses, `p."userId" = ? AND p."serverId" = ?`)
		args = append(args, userID, serverID)
	}
	if raw := first(q.Get("userId"), q.Get("user")); raw != "" {
		matches := []string{}
		for _, id := range strings.Split(raw, ",") {
			if id = strings.TrimSpace(id); id != "" {
				matches = append(matches, `(u."id"=? OR u."jellyfinUserId"=?)`)
				args = append(args, id, id)
			}
		}
		if len(matches) > 0 {
			clauses = append(clauses, "("+strings.Join(matches, " OR ")+")")
		}
	}
	if text := strings.TrimSpace(first(q.Get("q"), q.Get("query"))); text != "" {
		clauses = append(clauses, `(LOWER(m."title") LIKE LOWER(?) OR LOWER(u."username") LIKE LOWER(?) OR LOWER(p."ipAddress") LIKE LOWER(?) OR LOWER(p."clientName") LIKE LOWER(?))`)
		for i := 0; i < 4; i++ {
			args = append(args, "%"+text+"%")
		}
	}
	if kind := q.Get("type"); kind != "" {
		if strings.Contains(kind, ",") {
			marks := []string{}
			for _, part := range strings.Split(kind, ",") {
				if part = strings.TrimSpace(part); part != "" {
					marks = append(marks, "?")
					args = append(args, part)
				}
			}
			if len(marks) > 0 {
				clauses = append(clauses, `m."type" IN (`+strings.Join(marks, ",")+`)`)
			}
		} else {
			switch strings.ToLower(kind) {
			case "series", "tvshows":
				clauses = append(clauses, `m."type" IN ('Series','Season','Episode')`)
			case "audio", "music":
				clauses = append(clauses, `m."type" IN ('Audio','Track','MusicAlbum')`)
			case "book", "books":
				clauses = append(clauses, `m."type" IN ('Book','AudioBook')`)
			case "movies":
				clauses = append(clauses, `m."type"='Movie'`)
			default:
				clauses = append(clauses, `m."type"=?`)
				args = append(args, kind)
			}
		}
	}
	if method := q.Get("playMethod"); method != "" {
		clauses = append(clauses, `p."playMethod"=?`)
		args = append(args, method)
	}
	if client := q.Get("client"); client != "" {
		clauses = append(clauses, `LOWER(p."clientName") LIKE LOWER(?)`)
		args = append(args, "%"+client+"%")
	}
	if device := q.Get("device"); device != "" {
		clauses = append(clauses, `p."deviceName"=?`)
		args = append(args, device)
	}
	if library := q.Get("library"); library != "" {
		clauses = append(clauses, media.LibraryNameSQL("m", h.driver)+`=?`)
		args = append(args, library)
	}
	if category := q.Get("libraryCategory"); category != "" {
		clauses = append(clauses, `LOWER(REPLACE(REPLACE(REPLACE(COALESCE(NULLIF(m."collectionType",''),NULLIF(m."libraryName",''),m."type"),' ',''),'_',''),'-','')) IN (`+historyLibraryCategory(category, &args)+`)`)
	}
	for _, exclusion := range []struct{ key, column string }{{"excludeTypes", "type"}, {"excludeLibs", "libraryName"}} {
		if value := q.Get(exclusion.key); value != "" {
			marks := []string{}
			for _, part := range strings.Split(value, ",") {
				if part = strings.TrimSpace(part); part != "" {
					marks = append(marks, "?")
					args = append(args, part)
				}
			}
			if len(marks) > 0 {
				clauses = append(clauses, `(m."`+exclusion.column+`" IS NULL OR m."`+exclusion.column+`" NOT IN (`+strings.Join(marks, ",")+`))`)
			}
		}
	}
	if completion := q.Get("completion"); completion != "" {
		clause, err := stats.CompletionFilterClause("p", "m", completion, "", q.Get("hideZapped") != "false")
		if err != nil {
			jsonError(w, 400, "Complétion invalide.")
			return
		}
		clauses = append(clauses, clause)
	}
	if resolution := q.Get("resolution"); resolution != "" {
		clauses = append(clauses, `LOWER(m."resolution") LIKE LOWER(?)`)
		args = append(args, "%"+resolution+"%")
	}
	for _, filter := range []struct{ key, a, b string }{{"audio", "audioCodec", "audioLanguage"}, {"subtitle", "subtitleCodec", "subtitleLanguage"}} {
		if value := strings.TrimSpace(q.Get(filter.key)); value != "" {
			clause, values := historyTrackFilter(filter.key, filter.a, filter.b, value)
			clauses = append(clauses, clause)
			args = append(args, values...)
		}
	}
	if raw := q.Get("hour"); raw != "" {
		hour, err := strconv.Atoi(raw)
		if err != nil || hour < 0 || hour > 23 {
			jsonError(w, 400, "Heure invalide.")
			return
		}
		if h.driver == "postgres" {
			clauses = append(clauses, `EXTRACT(HOUR FROM p."startedAt") = ?`)
		} else {
			clauses = append(clauses, `CAST(strftime('%H',p."startedAt") AS INTEGER) = ?`)
		}
		args = append(args, hour)
	}
	if servers := getServerScope(r); len(servers) > 0 {
		marks := make([]string, len(servers))
		for i, id := range servers {
			marks[i] = "?"
			args = append(args, id)
		}
		clauses = append(clauses, `p."serverId" IN (`+strings.Join(marks, ",")+`)`)
	}
	base := ` FROM "PlaybackHistory" p LEFT JOIN "User" u ON u."id"=p."userId" JOIN "Media" m ON m."id"=p."mediaId" AND m."serverId"=p."serverId" WHERE ` + strings.Join(clauses, " AND ")
	countBase := base
	if first(q.Get("userId"), q.Get("user")) == "" && strings.TrimSpace(first(q.Get("q"), q.Get("query"))) == "" {
		countBase = ` FROM "PlaybackHistory" p JOIN "Media" m ON m."id"=p."mediaId" AND m."serverId"=p."serverId" WHERE ` + strings.Join(clauses, " AND ")
	}
	var total int64
	if err := h.db.QueryRowContext(r.Context(), database.Bind(`SELECT COUNT(*)`+countBase, h.driver), args...).Scan(&total); err != nil {
		jsonError(w, 500, "Impossible de charger l’historique.")
		return
	}
	pageArgs := append(append([]any{}, args...), limit, offset)
	pageClause := ` LIMIT ? OFFSET ?`
	if export {
		pageArgs, pageClause = args, ""
	}
	order := `p."startedAt" DESC,p."id" DESC`
	switch q.Get("sort") {
	case "date_asc":
		order = `p."startedAt" ASC,p."id" ASC`
	case "duration_desc":
		order = `p."durationWatched" DESC,p."id" DESC`
	case "duration_asc":
		order = `p."durationWatched" ASC,p."id" ASC`
	}
	if h.driver != "postgres" && (q.Get("sort") == "duration_desc" || q.Get("sort") == "duration_asc") {
		// An expression index supports duration sorting without tempting SQLite
		// to union three broad indexes for the unrelated zapping/count filter.
		order = strings.ReplaceAll(order, `p."durationWatched"`, `(p."durationWatched"+0)`)
	}
	rows, err := h.db.QueryContext(r.Context(), database.Bind(`SELECT p."id",p."startedAt",p."endedAt",p."durationWatched",COALESCE(p."playMethod",''),u."username",m."title",m."type",m."libraryName",m."id",COALESCE(u."id",''),m."jellyfinMediaId",p."serverId",p."clientName",p."deviceName",p."ipAddress",p."country",p."city",p."audioCodec",p."audioLanguage",p."subtitleCodec",p."subtitleLanguage",p."bitrate",p."pauseCount",p."audioChanges",p."subtitleChanges",p."seekCount",p."rewatchCount",p."speedChangeCount",p."eventSource",m."resolution",COALESCE(m."durationMs",0),m."parentId",m."artist",EXISTS(SELECT 1 FROM "ActiveStream" a WHERE a."serverId"=p."serverId" AND a."userId"=p."userId" AND a."mediaId"=p."mediaId" AND (a."playbackId"=p."id" OR (a."playbackId" IS NULL AND p."endedAt" IS NULL)))`+base+` ORDER BY `+order+pageClause, h.driver), pageArgs...)
	if err != nil {
		jsonError(w, 500, "Impossible de charger l’historique.")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, started, method, title, kind, mid, uid, sid string
		var ended, user, library, jid, client, device sql.NullString
		var ip, country, city, acodec, alang, scodec, slang, resolution, parent, artist sql.NullString
		var bitrate sql.NullInt64
		var duration, mediaDuration int64
		var pauses, audioChanges, subtitleChanges, seeks, rewatches, speedChanges int
		var source string
		var active bool
		if err := rows.Scan(&id, &started, &ended, &duration, &method, &user, &title, &kind, &library, &mid, &uid, &jid, &sid, &client, &device, &ip, &country, &city, &acodec, &alang, &scodec, &slang, &bitrate, &pauses, &audioChanges, &subtitleChanges, &seeks, &rewatches, &speedChanges, &source, &resolution, &mediaDuration, &parent, &artist, &active); err != nil {
			jsonError(w, 500, "Historique illisible.")
			return
		}
		var rate any
		if bitrate.Valid && bitrate.Int64 > 0 {
			value := float64(bitrate.Int64)
			if value >= 10000 {
				value /= 1000
			}
			rate = value
		}
		out = append(out, map[string]any{"id": id, "mediaId": mid, "userId": uid, "serverId": sid, "jellyfinMediaId": nullable(jid), "startedAt": started, "endedAt": nullable(ended), "durationMs": duration * 1000, "durationWatched": duration, "mediaDurationMs": mediaDuration, "playMethod": method, "username": nullable(user), "title": title, "type": kind, "library": nullable(library), "clientName": nullable(client), "deviceName": nullable(device), "ipAddress": nullable(ip), "country": nullable(country), "city": nullable(city), "audioCodec": nullable(acodec), "audioLanguage": nullable(alang), "subtitleCodec": nullable(scodec), "subtitleLanguage": nullable(slang), "bitrate": rate, "pauseCount": pauses, "audioChanges": audioChanges, "subtitleChanges": subtitleChanges, "seekCount": seeks, "rewatchCount": rewatches, "speedChangeCount": speedChanges, "eventSource": source, "resolution": nullable(resolution), "parentId": nullable(parent), "artist": nullable(artist), "isActuallyActive": active})
	}
	if rows.Err() != nil {
		jsonError(w, 500, "Historique illisible.")
		return
	}
	// Release rows before enrichment: SQLite uses a single connection.
	rows.Close()
	names, nameErr := h.serverNames(r)
	if nameErr != nil {
		jsonError(w, 500, "Cannot read servers")
		return
	}
	for _, row := range out {
		row["serverName"] = names[firstStringValue(row["serverId"])]
	}
	markProfileReconnections(out)
	if err := h.enrichHistory(r, out); err != nil {
		jsonError(w, 500, "Impossible de charger la chronologie.")
		return
	}
	if export {
		h.writeHistoryExport(w, r, out)
		return
	}
	response := map[string]any{"items": out, "total": total, "limit": limit, "offset": offset, "periodDays": days}
	if principal, ok := auth.PrincipalFromContext(r.Context()); ok && principal.IsAdmin() {
		alerts, ips, err := h.historyAlerts(r, out)
		if err != nil {
			jsonError(w, 500, "Impossible de charger les alertes.")
			return
		}
		response["newCountryAlerts"], response["topHotIps"] = alerts, ips
	}
	jsonResponse(w, 200, response)
}

// Resolve SQLite's JSON array once per request, rather than invoking the
// correlated json_each virtual table for every historical playback counted.
func (h *Handler) historyExcludedLibraries(r *http.Request) (string, []any, error) {
	if h.driver == "postgres" {
		return excludedLibrariesClause(h.driver, "m"), nil, nil
	}
	rows, err := h.db.QueryContext(r.Context(), `SELECT value FROM json_each(COALESCE((SELECT "excludedLibraries" FROM "GlobalSettings" WHERE "id"='global'),'[]')) WHERE value IS NOT NULL`)
	if err != nil {
		return "", nil, err
	}
	defer rows.Close()
	args := []any{}
	marks := []string{}
	for rows.Next() {
		var value any
		if err := rows.Scan(&value); err != nil {
			return "", nil, err
		}
		args = append(args, value)
		marks = append(marks, "?")
	}
	if err := rows.Err(); err != nil {
		return "", nil, err
	}
	if len(args) == 0 {
		return "1=1", args, nil
	}
	return `(m."libraryName" IS NULL OR m."libraryName" NOT IN (` + strings.Join(marks, ",") + `))`, args, nil
}

func firstStringValue(value any) string { text, _ := value.(string); return text }

// Old sessions did not store a server identity. Resolve them only when exactly
// one compatible account exists; neither UI filters nor a shared display name
// may widen this scope to another server's account.
func (h *Handler) historyIdentity(r *http.Request, principal auth.Principal) (string, string, error) {
	identity, err := auth.ResolveAccount(r.Context(), h.db, h.driver, principal)
	return identity.ID, identity.ServerID, err
}
