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
)

func (h *Handler) history(w http.ResponseWriter, r *http.Request) {
	limit, offset := page(r)
	q := r.URL.Query()
	days := boundedInt(q.Get("days"), 30, 1, 3650)
	clauses := []string{excludedLibrariesClause(h.driver, "m")}
	if q.Get("hideZapped") != "false" {
		clauses = append(clauses, history.ZappingClause("p"))
	}
	args := []any{}
	if q.Get("days") != "all" {
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
	if id := q.Get("userId"); id != "" {
		clauses = append(clauses, `(u."id"=? OR u."jellyfinUserId"=?)`)
		args = append(args, id, id)
	}
	if text := strings.TrimSpace(q.Get("q")); text != "" {
		clauses = append(clauses, `(LOWER(m."title") LIKE LOWER(?) OR LOWER(u."username") LIKE LOWER(?))`)
		args = append(args, "%"+text+"%", "%"+text+"%")
	}
	if kind := q.Get("type"); kind != "" {
		switch strings.ToLower(kind) {
		case "series":
			clauses = append(clauses, `m."type" IN ('Series','Season','Episode')`)
		case "audio", "music":
			clauses = append(clauses, `m."type" IN ('Audio','Track','MusicAlbum')`)
		case "book":
			clauses = append(clauses, `m."type" IN ('Book','AudioBook')`)
		default:
			clauses = append(clauses, `m."type"=?`)
			args = append(args, kind)
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
	base := ` FROM "PlaybackHistory" p LEFT JOIN "User" u ON u."id"=p."userId" JOIN "Media" m ON m."id"=p."mediaId" WHERE ` + strings.Join(clauses, " AND ")
	var total int64
	if err := h.db.QueryRowContext(r.Context(), database.Bind(`SELECT COUNT(*)`+base, h.driver), args...).Scan(&total); err != nil {
		jsonError(w, 500, "Impossible de charger l’historique.")
		return
	}
	pageArgs := append(append([]any{}, args...), limit, offset)
	order := `p."startedAt" DESC,p."id" DESC`
	switch q.Get("sort") {
	case "date_asc":
		order = `p."startedAt" ASC,p."id" ASC`
	case "duration_desc":
		order = `p."durationWatched" DESC,p."id" DESC`
	case "duration_asc":
		order = `p."durationWatched" ASC,p."id" ASC`
	}
	rows, err := h.db.QueryContext(r.Context(), database.Bind(`SELECT p."id",p."startedAt",p."endedAt",p."durationWatched",COALESCE(p."playMethod",''),u."username",m."title",m."type",m."libraryName",m."id",COALESCE(u."id",''),m."jellyfinMediaId",p."serverId",p."clientName",p."deviceName"`+base+` ORDER BY `+order+` LIMIT ? OFFSET ?`, h.driver), pageArgs...)
	if err != nil {
		jsonError(w, 500, "Impossible de charger l’historique.")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, started, method, title, kind, mid, uid, sid string
		var ended, user, library, jid, client, device sql.NullString
		var duration int64
		if err := rows.Scan(&id, &started, &ended, &duration, &method, &user, &title, &kind, &library, &mid, &uid, &jid, &sid, &client, &device); err != nil {
			jsonError(w, 500, "Historique illisible.")
			return
		}
		out = append(out, map[string]any{"id": id, "mediaId": mid, "userId": uid, "serverId": sid, "jellyfinMediaId": nullable(jid), "startedAt": started, "endedAt": nullable(ended), "durationMs": duration * 1000, "playMethod": method, "username": nullable(user), "title": title, "type": kind, "library": nullable(library), "clientName": nullable(client), "deviceName": nullable(device)})
	}
	if rows.Err() != nil {
		jsonError(w, 500, "Historique illisible.")
		return
	}
	jsonResponse(w, 200, map[string]any{"items": out, "total": total, "limit": limit, "offset": offset, "periodDays": days})
}

// Old sessions did not store a server identity. Resolve them only when exactly
// one compatible account exists; neither UI filters nor a shared display name
// may widen this scope to another server's account.
func (h *Handler) historyIdentity(r *http.Request, principal auth.Principal) (string, string, error) {
	identity, err := auth.ResolveAccount(r.Context(), h.db, h.driver, principal)
	return identity.ID, identity.ServerID, err
}
