package api

import (
	"database/sql"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/internal/history"
	"github.com/maelmoreau21/jellytrack/internal/stats"
)

func (h *Handler) heatmapDetail(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	filter, err := dashboardFilter(r, 30)
	if err != nil {
		jsonError(w, 400, err.Error())
		return
	}
	date := q.Get("date")
	if date != "" {
		if _, err := time.Parse("2006-01-02", date); err != nil {
			jsonError(w, 400, "Date invalide.")
			return
		}
		filter.TimeRange, filter.From, filter.To = "custom", date, date
	}
	clauses, args, err := stats.PlaybackConditions(filter)
	if err != nil {
		jsonError(w, 400, "Période invalide.")
		return
	}
	clauses = append(clauses, history.ZappingClause("p"), excludedLibrariesClause(h.driver, "m"))
	day, hour := -1, -1
	if q.Get("day") != "" || q.Get("hour") != "" {
		var e1, e2 error
		day, e1 = strconv.Atoi(q.Get("day"))
		hour, e2 = strconv.Atoi(q.Get("hour"))
		if e1 != nil || e2 != nil || day < 0 || day > 6 || hour < 0 || hour > 23 {
			jsonError(w, 400, "Invalid day/hour")
			return
		}
	}
	rows, err := h.db.QueryContext(r.Context(), database.Bind(`SELECT p."startedAt",p."durationWatched",p."playMethod",p."clientName",u."username",m."title",m."type" FROM "PlaybackHistory" p LEFT JOIN "User" u ON u."id"=p."userId" LEFT JOIN "Media" m ON m."id"=p."mediaId" WHERE `+strings.Join(clauses, " AND ")+` ORDER BY p."startedAt" DESC`, h.driver), args...)
	if err != nil {
		jsonError(w, 500, "Impossible de charger la carte thermique.")
		return
	}
	defer rows.Close()
	sessions := []map[string]any{}
	counts := [7][24]int64{}
	for rows.Next() {
		var started string
		var duration int64
		var method, client, user, title, kind sql.NullString
		if err := rows.Scan(&started, &duration, &method, &client, &user, &title, &kind); err != nil {
			jsonError(w, 500, "Historique illisible.")
			return
		}
		parsed, e := time.Parse(time.RFC3339Nano, started)
		if e != nil {
			parsed, e = time.Parse("2006-01-02 15:04:05", started)
		}
		if e != nil {
			continue
		}
		parsed = parsed.UTC()
		counts[int(parsed.Weekday())][parsed.Hour()]++
		if date != "" || (day == int(parsed.Weekday()) && hour == parsed.Hour()) {
			sessions = append(sessions, map[string]any{"username": user.String, "mediaTitle": title.String, "mediaType": kind.String, "durationMin": duration / 60, "playMethod": method.String, "clientName": client.String, "startedAt": parsed.Format(time.RFC3339)})
			if len(sessions) >= 100 {
				break
			}
		}
	}
	if rows.Err() != nil {
		jsonError(w, 500, "Historique illisible.")
		return
	}
	if date != "" || day >= 0 {
		jsonResponse(w, 200, map[string]any{"sessions": sessions, "date": date})
		return
	}
	heatmap := []map[string]any{}
	for d := 0; d < 7; d++ {
		for hr := 0; hr < 24; hr++ {
			if counts[d][hr] > 0 {
				heatmap = append(heatmap, map[string]any{"dayOfWeek": d, "hour": hr, "count": counts[d][hr]})
			}
		}
	}
	jsonResponse(w, 200, map[string]any{"heatmap": heatmap})
}
