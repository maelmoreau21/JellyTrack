// Package api contains the authenticated application endpoints.
package api

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/maelmoreau21/jellytrack/v3/internal/backup"
	"github.com/maelmoreau21/jellytrack/v3/internal/cleanup"
	"github.com/maelmoreau21/jellytrack/v3/internal/database"
	"github.com/maelmoreau21/jellytrack/v3/internal/jellyfin"
	"github.com/maelmoreau21/jellytrack/v3/internal/requestip"
)

type Handler struct {
	db     *sql.DB
	driver string
}

func New(db *sql.DB, driver string) *Handler { return &Handler{db: db, driver: driver} }

func (h *Handler) Register(mux *http.ServeMux, protect, adminProtect func(http.Handler) http.Handler) {
	// Standard user session protected routes
	userRoutes := map[string]http.HandlerFunc{
		"GET /api/dashboard":               h.dashboard,
		"GET /api/users":                   h.users,
		"GET /api/users/{id}":              h.userDetail,
		"GET /api/users/{id}/active-stream": h.userActiveStream,
		"GET /api/media":                   h.mediaList,
		"GET /api/media/{id}":              h.mediaDetail,
		"GET /api/history":                 h.history,
		"GET /api/search":                  h.search,
		"GET /api/jellyfin/sessions":       h.sessions,
	}
	for path, fn := range userRoutes {
		mux.Handle(path, protect(fn))
	}

	// Admin protected routes
	adminRoutes := map[string]http.HandlerFunc{
		"POST /api/sync":                           h.sync,
		"GET /api/stats/deep":                      h.deepStats,
		"GET /api/geo-stats":                       h.geoStats,
		"GET /api/heatmap-detail":                  h.heatmapDetail,
		"GET /api/streams":                         h.streams,
		"GET /api/streams/telemetry":               h.streamsTelemetry,
		"POST /api/jellyfin/kill-stream":           h.killStream,
		"POST /api/jellyfin/send-message":          h.sendMessage,
		"GET /api/settings":                        h.getSettings,
		"POST /api/settings":                       h.updateSettings,
		"GET /api/settings/jellyfin-servers":       h.listServers,
		"POST /api/settings/jellyfin-servers":      h.saveServer,
		"DELETE /api/settings/jellyfin-servers/{id}": h.deleteServer,
		"POST /api/settings/jellyfin-servers/plugin-key": h.rotateServerPluginKey,
		"GET /api/backup/export":                   h.backupExport,
		"POST /api/backup/import":                  h.backupImport,
		"GET /api/backup/auto":                     h.backupAutoList,
		"POST /api/backup/auto/trigger":            h.backupAutoTrigger,
		"GET /api/backup/auto/download":            h.backupAutoDownload,
		"POST /api/backup/auto/restore":            h.backupAutoRestore,
		"POST /api/backup/auto/delete":             h.backupAutoDelete,
		"POST /api/admin/consolidate-history":      h.adminConsolidateHistory,
		"POST /api/admin/integrity-cleanup":        h.adminIntegrityCleanup,
	}
	for path, fn := range adminRoutes {
		mux.Handle(path, adminProtect(fn))
	}

	// Webhook endpoint (protected by allowed hosts check, no cookie session)
	mux.HandleFunc("POST /api/webhook/jellyfin", h.jellyfinWebhook)
}

// ---------------------- Dashboard & Analytics ----------------------

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

func (h *Handler) deepStats(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.QueryContext(r.Context(), `SELECT "directors","actors","studios" FROM "Media" WHERE "type" IN ('Movie','Series')`)
	if err != nil {
		jsonError(w, 500, "Erreur de lecture.")
		return
	}
	defer rows.Close()

	dirMap := make(map[string]int)
	actMap := make(map[string]int)
	stuMap := make(map[string]int)

	for rows.Next() {
		var dStr, aStr, sStr string
		if rows.Scan(&dStr, &aStr, &sStr) == nil {
			for _, d := range parseStringList(dStr) {
				dirMap[d]++
			}
			for _, a := range parseStringList(aStr) {
				actMap[a]++
			}
			for _, s := range parseStringList(sStr) {
				stuMap[s]++
			}
		}
	}

	sortLimit := func(m map[string]int) []map[string]any {
		type pair struct {
			k string
			v int
		}
		var list []pair
		for k, v := range m {
			list = append(list, pair{k, v})
		}
		sort.Slice(list, func(i, j int) bool { return list[i].v > list[j].v })
		if len(list) > 10 {
			list = list[:10]
		}
		res := []map[string]any{}
		for _, p := range list {
			res = append(res, map[string]any{"name": p.k, "count": p.v})
		}
		return res
	}

	jsonResponse(w, 200, map[string]any{
		"topDirectors": sortLimit(dirMap),
		"topActors":    sortLimit(actMap),
		"topStudios":   sortLimit(stuMap),
	})
}

func (h *Handler) geoStats(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.QueryContext(r.Context(), `SELECT "country","city",COUNT("id"),MAX("startedAt") FROM "PlaybackHistory" WHERE "country" IS NOT NULL AND "country" != '' GROUP BY "country","city" ORDER BY COUNT("id") DESC LIMIT 200`)
	if err != nil {
		jsonError(w, 500, "Erreur de lecture.")
		return
	}
	defer rows.Close()

	type locItem struct {
		Country  string `json:"country"`
		City     string `json:"city"`
		Sessions int64  `json:"sessions"`
		LastSeen string `json:"lastSeen"`
	}
	var locations []locItem
	countryMap := make(map[string]*struct {
		sessions int64
		cities   []string
	})

	for rows.Next() {
		var country, city string
		var count int64
		var lastSeen sql.NullString
		if rows.Scan(&country, &city, &count, &lastSeen) == nil {
			if city == "" {
				city = "Unknown"
			}
			locations = append(locations, locItem{
				Country:  country,
				City:     city,
				Sessions: count,
				LastSeen: lastSeen.String,
			})
			cm, ok := countryMap[country]
			if !ok {
				cm = &struct {
					sessions int64
					cities   []string
				}{}
				countryMap[country] = cm
			}
			cm.sessions += count
			if city != "Unknown" && len(cm.cities) < 5 {
				cm.cities = append(cm.cities, city)
			}
		}
	}

	type countryItem struct {
		Name     string   `json:"name"`
		Sessions int64    `json:"sessions"`
		Cities   []string `json:"cities"`
	}
	var countries []countryItem
	for c, data := range countryMap {
		countries = append(countries, countryItem{
			Name:     c,
			Sessions: data.sessions,
			Cities:   data.cities,
		})
	}
	sort.Slice(countries, func(i, j int) bool { return countries[i].Sessions > countries[j].Sessions })

	// Live streams geo data
	sRows, err := h.db.QueryContext(r.Context(), `SELECT s."country",s."city",u."username",m."title" FROM "ActiveStream" s LEFT JOIN "User" u ON u."id"=s."userId" LEFT JOIN "Media" m ON m."id"=s."mediaId" WHERE s."country" IS NOT NULL AND s."country" != ''`)
	liveLocations := []map[string]string{}
	if err == nil {
		for sRows.Next() {
			var country, city, user, title sql.NullString
			if sRows.Scan(&country, &city, &user, &title) == nil {
				liveLocations = append(liveLocations, map[string]string{
					"country":    country.String,
					"city":       city.String,
					"username":   user.String,
					"mediaTitle": title.String,
				})
			}
		}
		sRows.Close()
	}

	jsonResponse(w, 200, map[string]any{
		"countries":     countries,
		"locations":     locations,
		"liveLocations": liveLocations,
	})
}

func (h *Handler) heatmapDetail(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.QueryContext(r.Context(), `SELECT strftime('%w', "startedAt") AS "dayOfWeek", strftime('%H', "startedAt") AS "hour", COUNT(*) FROM "PlaybackHistory" GROUP BY "dayOfWeek", "hour"`)
	if err != nil {
		// Postgres fallback
		rows, err = h.db.QueryContext(r.Context(), `SELECT EXTRACT(DOW FROM "startedAt")::TEXT AS "dayOfWeek", EXTRACT(HOUR FROM "startedAt")::TEXT AS "hour", COUNT(*) FROM "PlaybackHistory" GROUP BY "dayOfWeek", "hour"`)
	}
	if err != nil {
		jsonError(w, 500, "Impossible de charger la carte thermique.")
		return
	}
	defer rows.Close()

	heatmap := []map[string]any{}
	for rows.Next() {
		var dow, hour string
		var count int64
		if rows.Scan(&dow, &hour, &count) == nil {
			d, _ := strconv.Atoi(dow)
			hr, _ := strconv.Atoi(hour)
			heatmap = append(heatmap, map[string]any{
				"dayOfWeek": d,
				"hour":      hr,
				"count":     count,
			})
		}
	}
	jsonResponse(w, 200, map[string]any{"heatmap": heatmap})
}

// ---------------------- Users & Media ----------------------

func (h *Handler) users(w http.ResponseWriter, r *http.Request) {
	limit, offset := page(r)
	rows, err := h.db.QueryContext(r.Context(), database.Bind(`SELECT u."id",u."username",u."jellyfinUserId",u."lastActive",s."name" FROM "User" u LEFT JOIN "Server" s ON s."id"=u."serverId" WHERE u."isActive"=1 ORDER BY LOWER(u."username") LIMIT ? OFFSET ?`, h.driver), limit, offset)
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
	jsonResponse(w, 200, map[string]any{"items": out, "limit": limit, "offset": offset})
}

func (h *Handler) userDetail(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		jsonError(w, 400, "Identifiant requis.")
		return
	}
	var username, jid string
	var lastActive, server sql.NullString
	err := h.db.QueryRowContext(r.Context(), database.Bind(`SELECT u."username",u."jellyfinUserId",u."lastActive",s."name" FROM "User" u LEFT JOIN "Server" s ON s."id"=u."serverId" WHERE u."id"=?`, h.driver), id).Scan(&username, &jid, &lastActive, &server)
	if err != nil {
		jsonError(w, 404, "Utilisateur introuvable.")
		return
	}

	var totalPlays, totalDuration int64
	_ = h.db.QueryRowContext(r.Context(), database.Bind(`SELECT COUNT(*),COALESCE(SUM("durationWatched"),0) FROM "PlaybackHistory" WHERE "userId"=?`, h.driver), id).Scan(&totalPlays, &totalDuration)

	// Recent activity
	rows, err := h.db.QueryContext(r.Context(), database.Bind(`SELECT p."id",p."startedAt",p."durationWatched",p."playMethod",m."title",m."type",m."libraryName" FROM "PlaybackHistory" p JOIN "Media" m ON m."id"=p."mediaId" WHERE p."userId"=? ORDER BY p."startedAt" DESC LIMIT 20`, h.driver), id)
	recent := []map[string]any{}
	if err == nil {
		for rows.Next() {
			var pid, started, method, title, kind string
			var lib sql.NullString
			var dur int64
			if rows.Scan(&pid, &started, &dur, &method, &title, &kind, &lib) == nil {
				recent = append(recent, map[string]any{
					"id": pid, "startedAt": started, "durationMs": dur * 1000,
					"playMethod": method, "title": title, "type": kind, "library": nullable(lib),
				})
			}
		}
		rows.Close()
	}

	jsonResponse(w, 200, map[string]any{
		"id": id, "username": username, "jellyfinUserId": jid,
		"lastActive": nullable(lastActive), "server": nullable(server),
		"totalPlays": totalPlays, "totalDurationMs": totalDuration * 1000,
		"recentActivity": recent,
	})
}

func (h *Handler) userActiveStream(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var stream map[string]any
	var sid, playMethod, started string
	var title, kind sql.NullString
	var posTicks sql.NullInt64
	err := h.db.QueryRowContext(r.Context(), database.Bind(`SELECT s."sessionId",s."playMethod",s."startedAt",s."positionTicks",m."title",m."type" FROM "ActiveStream" s LEFT JOIN "Media" m ON m."id"=s."mediaId" WHERE s."userId"=? LIMIT 1`, h.driver), id).Scan(&sid, &playMethod, &started, &posTicks, &title, &kind)
	if err == nil {
		stream = map[string]any{
			"sessionId": sid, "playMethod": playMethod, "startedAt": started,
			"mediaTitle": title.String, "mediaType": kind.String, "positionTicks": posTicks.Int64,
		}
	}
	jsonResponse(w, 200, map[string]any{"stream": stream})
}

func (h *Handler) mediaList(w http.ResponseWriter, r *http.Request) {
	limit, offset := page(r)
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	mType := strings.TrimSpace(r.URL.Query().Get("type"))
	library := strings.TrimSpace(r.URL.Query().Get("library"))

	whereClauses := []string{excludedLibrariesClause(h.driver, "m")}
	var args []any

	if q != "" {
		whereClauses = append(whereClauses, `m."title" LIKE ?`)
		args = append(args, "%"+q+"%")
	}
	if mType != "" {
		whereClauses = append(whereClauses, `m."type" = ?`)
		args = append(args, mType)
	}
	if library != "" {
		whereClauses = append(whereClauses, `m."libraryName" = ?`)
		args = append(args, library)
	}

	query := fmt.Sprintf(`SELECT m."id",m."jellyfinMediaId",m."title",m."type",m."libraryName",m."resolution",m."durationMs",s."name" FROM "Media" m LEFT JOIN "Server" s ON s."id"=m."serverId" WHERE %s ORDER BY m."title" ASC LIMIT ? OFFSET ?`, strings.Join(whereClauses, " AND "))
	args = append(args, limit, offset)

	rows, err := h.db.QueryContext(r.Context(), database.Bind(query, h.driver), args...)
	if err != nil {
		jsonError(w, 500, "Impossible de charger les médias.")
		return
	}
	defer rows.Close()

	out := []map[string]any{}
	for rows.Next() {
		var id, jid, title, kind string
		var lib, res, server sql.NullString
		var dur sql.NullInt64
		if rows.Scan(&id, &jid, &title, &kind, &lib, &res, &dur, &server) == nil {
			out = append(out, map[string]any{
				"id": id, "jellyfinMediaId": jid, "title": title, "type": kind,
				"library": nullable(lib), "resolution": nullable(res), "durationMs": dur.Int64,
				"server": nullable(server),
			})
		}
	}
	jsonResponse(w, 200, map[string]any{"items": out, "limit": limit, "offset": offset})
}

func (h *Handler) mediaDetail(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var jid, title, mType, genres, directors, actors string
	var lib, res, server sql.NullString
	var dur, size sql.NullInt64

	err := h.db.QueryRowContext(r.Context(), database.Bind(`SELECT m."jellyfinMediaId",m."title",m."type",m."libraryName",m."genres",m."resolution",m."durationMs",m."size",m."directors",m."actors",s."name" FROM "Media" m LEFT JOIN "Server" s ON s."id"=m."serverId" WHERE m."id"=? OR m."jellyfinMediaId"=?`, h.driver), id, id).Scan(&jid, &title, &mType, &lib, &genres, &res, &dur, &size, &directors, &actors, &server)
	if err != nil {
		jsonError(w, 404, "Média introuvable.")
		return
	}

	var watchCount, totalDuration int64
	_ = h.db.QueryRowContext(r.Context(), database.Bind(`SELECT COUNT(*),COALESCE(SUM("durationWatched"),0) FROM "PlaybackHistory" WHERE "mediaId"=(SELECT "id" FROM "Media" WHERE "id"=? OR "jellyfinMediaId"=? LIMIT 1)`, h.driver), id, id).Scan(&watchCount, &totalDuration)

	jsonResponse(w, 200, map[string]any{
		"id": id, "jellyfinMediaId": jid, "title": title, "type": mType,
		"library": nullable(lib), "genres": parseStringList(genres), "resolution": nullable(res),
		"durationMs": dur.Int64, "sizeBytes": size.Int64, "directors": parseStringList(directors),
		"actors": parseStringList(actors), "server": nullable(server),
		"totalPlays": watchCount, "totalDurationMs": totalDuration * 1000,
	})
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
		if rows.Scan(&id, &started, &ended, &duration, &method, &user, &title, &kind, &library) == nil {
			out = append(out, map[string]any{"id": id, "startedAt": started, "endedAt": nullable(ended), "durationMs": duration * 1000, "playMethod": method, "username": nullable(user), "title": title, "type": kind, "library": nullable(library)})
		}
	}
	jsonResponse(w, 200, map[string]any{"items": out, "limit": limit, "offset": offset, "periodDays": days})
}

func (h *Handler) search(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(q) < 2 {
		jsonResponse(w, 200, map[string]any{"media": []any{}, "users": []any{}})
		return
	}

	searchPattern := "%" + q + "%"
	excluded := excludedLibrariesClause(h.driver, "m")
	rows, err := h.db.QueryContext(r.Context(), database.Bind(`SELECT m."id",m."jellyfinMediaId",m."title",m."type",m."libraryName" FROM "Media" m WHERE (m."title" LIKE ? OR m."directors" LIKE ? OR m."actors" LIKE ?) AND `+excluded+` ORDER BY m."title" ASC LIMIT 10`, h.driver), searchPattern, searchPattern, searchPattern)
	mediaList := []map[string]any{}
	if err == nil {
		for rows.Next() {
			var id, jid, title, kind string
			var lib sql.NullString
			if rows.Scan(&id, &jid, &title, &kind, &lib) == nil {
				mediaList = append(mediaList, map[string]any{
					"id": id, "jellyfinMediaId": jid, "title": title, "type": kind, "library": nullable(lib),
				})
			}
		}
		rows.Close()
	}

	userList := []map[string]any{}
	uRows, err := h.db.QueryContext(r.Context(), database.Bind(`SELECT "id","jellyfinUserId","username" FROM "User" WHERE "username" LIKE ? ORDER BY "username" ASC LIMIT 5`, h.driver), searchPattern)
	if err == nil {
		for uRows.Next() {
			var uid, juid, uname string
			if uRows.Scan(&uid, &juid, &uname) == nil {
				userList = append(userList, map[string]any{
					"id": uid, "jellyfinUserId": juid, "username": uname,
				})
			}
		}
		uRows.Close()
	}

	jsonResponse(w, 200, map[string]any{"media": mediaList, "users": userList})
}

// ---------------------- Streams & Telemetry ----------------------

func (h *Handler) streams(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.QueryContext(r.Context(), `SELECT s."id",s."serverId",s."sessionId",s."playMethod",s."clientName",s."deviceName",s."ipAddress",s."country",s."city",s."bitrate",s."positionTicks",s."startedAt",u."username",m."title",m."type",m."durationMs",m."jellyfinMediaId" FROM "ActiveStream" s LEFT JOIN "User" u ON u."id"=s."userId" LEFT JOIN "Media" m ON m."id"=s."mediaId"`)
	if err != nil {
		jsonError(w, 500, "Impossible de charger les flux en direct.")
		return
	}
	defer rows.Close()

	var streams []map[string]any
	var totalBandwidthMbps float64

	for rows.Next() {
		var id, srvId, sessId, playMethod, started string
		var client, device, ip, country, city, user, title, mType, jmid sql.NullString
		var bitrate, posTicks, durMs sql.NullInt64

		if rows.Scan(&id, &srvId, &sessId, &playMethod, &client, &device, &ip, &country, &city, &bitrate, &posTicks, &started, &user, &title, &mType, &durMs, &jmid) == nil {
			var progressPercent int
			if posTicks.Int64 > 0 && durMs.Int64 > 0 {
				runTicks := durMs.Int64 * 10000
				progressPercent = int((posTicks.Int64 * 100) / runTicks)
				if progressPercent > 100 {
					progressPercent = 100
				}
			}

			streamBitrate := bitrate.Int64
			if streamBitrate > 0 {
				totalBandwidthMbps += float64(streamBitrate) / 1000000.0
			} else if playMethod == "Transcode" {
				totalBandwidthMbps += 12.0
			} else {
				totalBandwidthMbps += 6.0
			}

			streams = append(streams, map[string]any{
				"id":              id,
				"serverId":        srvId,
				"sessionId":       sessId,
				"playMethod":      playMethod,
				"clientName":      client.String,
				"deviceName":      device.String,
				"ipAddress":       ip.String,
				"country":         country.String,
				"city":            city.String,
				"user":            user.String,
				"mediaTitle":      title.String,
				"mediaType":       mType.String,
				"jellyfinMediaId": jmid.String,
				"progressPercent": progressPercent,
				"startedAt":       started,
			})
		}
	}

	jsonResponse(w, 200, map[string]any{
		"streams":            streams,
		"count":              len(streams),
		"totalBandwidthMbps": totalBandwidthMbps,
	})
}

func (h *Handler) streamsTelemetry(w http.ResponseWriter, r *http.Request) {
	playbackId := strings.TrimSpace(r.URL.Query().Get("playbackId"))
	if playbackId == "" {
		jsonError(w, 400, "playbackId requis.")
		return
	}
	rows, err := h.db.QueryContext(r.Context(), database.Bind(`SELECT "id","eventType","positionMs","metadata","createdAt" FROM "TelemetryEvent" WHERE "playbackId"=? ORDER BY "positionMs" ASC LIMIT 500`, h.driver), playbackId)
	if err != nil {
		jsonError(w, 500, "Erreur de lecture.")
		return
	}
	defer rows.Close()

	events := []map[string]any{}
	for rows.Next() {
		var id, kind, created string
		var pos int64
		var meta sql.NullString
		if rows.Scan(&id, &kind, &pos, &meta, &created) == nil {
			events = append(events, map[string]any{
				"id": id, "eventType": kind, "positionMs": pos, "metadata": nullable(meta), "createdAt": created,
			})
		}
	}
	jsonResponse(w, 200, map[string]any{"events": events})
}

func (h *Handler) killStream(w http.ResponseWriter, r *http.Request) {
	var body struct {
		SessionID string `json:"sessionId"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.SessionID == "" {
		jsonError(w, 400, "sessionId requis.")
		return
	}
	// Delete from local ActiveStream table
	_, _ = h.db.ExecContext(r.Context(), database.Bind(`DELETE FROM "ActiveStream" WHERE "sessionId"=?`, h.driver), body.SessionID)

	// Instruct Jellyfin to terminate the session if credentials exist
	baseURL := os.Getenv("JELLYFIN_URL")
	apiKey := first(os.Getenv("JELLYFIN_API_KEY"), os.Getenv("JELLYTRACK_JELLYFIN_API_KEY"))
	if baseURL != "" && apiKey != "" {
		reqURL := fmt.Sprintf("%s/Sessions/%s/Playing/Stop", strings.TrimRight(baseURL, "/"), body.SessionID)
		req, _ := http.NewRequestWithContext(r.Context(), http.MethodPost, reqURL, nil)
		req.Header.Set("Authorization", fmt.Sprintf(`MediaBrowser Token="%s"`, apiKey))
		resp, err := (&http.Client{Timeout: 5 * time.Second}).Do(req)
		if err == nil {
			_ = resp.Body.Close()
		}
	}
	jsonResponse(w, 200, map[string]bool{"ok": true})
}

func (h *Handler) sendMessage(w http.ResponseWriter, r *http.Request) {
	var body struct {
		SessionID string `json:"sessionId"`
		Text      string `json:"text"`
		Header    string `json:"header"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 8192)
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.SessionID == "" || body.Text == "" {
		jsonError(w, 400, "sessionId et text requis.")
		return
	}
	baseURL := os.Getenv("JELLYFIN_URL")
	apiKey := first(os.Getenv("JELLYFIN_API_KEY"), os.Getenv("JELLYTRACK_JELLYFIN_API_KEY"))
	if baseURL == "" || apiKey == "" {
		jsonError(w, 503, "Jellyfin non configuré.")
		return
	}
	payload, _ := json.Marshal(map[string]any{"Text": body.Text, "Header": body.Header, "TimeoutMs": 10000})
	reqURL := fmt.Sprintf("%s/Sessions/%s/Message", strings.TrimRight(baseURL, "/"), body.SessionID)
	req, _ := http.NewRequestWithContext(r.Context(), http.MethodPost, reqURL, strings.NewReader(string(payload)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf(`MediaBrowser Token="%s"`, apiKey))
	resp, err := (&http.Client{Timeout: 5 * time.Second}).Do(req)
	if err != nil {
		jsonError(w, 502, "Jellyfin n'a pas répondu.")
		return
	}
	defer resp.Body.Close()
	jsonResponse(w, 200, map[string]bool{"ok": true})
}

// ---------------------- Settings & Servers ----------------------

func (h *Handler) getSettings(w http.ResponseWriter, r *http.Request) {
	var discordUrl, discordCond, defLocale, timeFmt, exclLibs sql.NullString
	var alertsEnabled, maxTranscodes, syncH, syncM, bH, bM, wrapVis, wrapPer, wrapSM, wrapSD, wrapEM, wrapED int
	err := h.db.QueryRowContext(r.Context(), `SELECT "discordWebhookUrl","discordAlertCondition","discordAlertsEnabled","maxConcurrentTranscodes","excludedLibraries","syncCronHour","syncCronMinute","backupCronHour","backupCronMinute","defaultLocale","timeFormat","wrappedVisible","wrappedPeriodEnabled","wrappedStartMonth","wrappedStartDay","wrappedEndMonth","wrappedEndDay" FROM "GlobalSettings" WHERE "id"='global'`).Scan(
		&discordUrl, &discordCond, &alertsEnabled, &maxTranscodes, &exclLibs, &syncH, &syncM, &bH, &bM, &defLocale, &timeFmt, &wrapVis, &wrapPer, &wrapSM, &wrapSD, &wrapEM, &wrapED)
	if err != nil && err != sql.ErrNoRows {
		jsonError(w, 500, "Impossible de lire les réglages.")
		return
	}

	jsonResponse(w, 200, map[string]any{
		"discordWebhookUrl":       discordUrl.String,
		"discordAlertCondition":   discordCond.String,
		"discordAlertsEnabled":    alertsEnabled == 1,
		"maxConcurrentTranscodes": maxTranscodes,
		"excludedLibraries":       parseStringList(exclLibs.String),
		"syncCronHour":            syncH,
		"syncCronMinute":          syncM,
		"backupCronHour":          bH,
		"backupCronMinute":        bM,
		"defaultLocale":           defLocale.String,
		"timeFormat":              timeFmt.String,
		"wrappedVisible":          wrapVis == 1,
		"wrappedPeriodEnabled":    wrapPer == 1,
		"wrappedStartMonth":       wrapSM,
		"wrappedStartDay":         wrapSD,
		"wrappedEndMonth":         wrapEM,
		"wrappedEndDay":           wrapED,
	})
}

func (h *Handler) updateSettings(w http.ResponseWriter, r *http.Request) {
	var input struct {
		DiscordWebhookUrl       *string   `json:"discordWebhookUrl"`
		DiscordAlertCondition   *string   `json:"discordAlertCondition"`
		DiscordAlertsEnabled    *bool     `json:"discordAlertsEnabled"`
		MaxConcurrentTranscodes *int      `json:"maxConcurrentTranscodes"`
		ExcludedLibraries       *[]string `json:"excludedLibraries"`
		SyncCronHour            *int      `json:"syncCronHour"`
		SyncCronMinute          *int      `json:"syncCronMinute"`
		BackupCronHour          *int      `json:"backupCronHour"`
		BackupCronMinute        *int      `json:"backupCronMinute"`
		DefaultLocale           *string   `json:"defaultLocale"`
		TimeFormat              *string   `json:"timeFormat"`
		WrappedVisible          *bool     `json:"wrappedVisible"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 65536)
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		jsonError(w, 400, "Payload JSON invalide.")
		return
	}

	if input.ExcludedLibraries != nil {
		b, _ := json.Marshal(*input.ExcludedLibraries)
		_, _ = h.db.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "excludedLibraries"=? WHERE "id"='global'`, h.driver), string(b))
	}
	if input.DiscordWebhookUrl != nil {
		_, _ = h.db.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "discordWebhookUrl"=? WHERE "id"='global'`, h.driver), *input.DiscordWebhookUrl)
	}
	if input.DefaultLocale != nil {
		_, _ = h.db.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "defaultLocale"=? WHERE "id"='global'`, h.driver), *input.DefaultLocale)
	}

	jsonResponse(w, 200, map[string]bool{"ok": true})
}

func (h *Handler) listServers(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.QueryContext(r.Context(), `SELECT "id","jellyfinServerId","name","url","allowAuthFallback","isActive" FROM "Server" ORDER BY "name" ASC`)
	if err != nil {
		jsonError(w, 500, "Erreur de lecture.")
		return
	}
	defer rows.Close()

	servers := []map[string]any{}
	for rows.Next() {
		var id, jid, name, url string
		var fallback, active int
		if rows.Scan(&id, &jid, &name, &url, &fallback, &active) == nil {
			servers = append(servers, map[string]any{
				"id": id, "jellyfinServerId": jid, "name": name, "url": url,
				"allowAuthFallback": fallback == 1, "isActive": active == 1,
			})
		}
	}
	jsonResponse(w, 200, map[string]any{"servers": servers})
}

func (h *Handler) saveServer(w http.ResponseWriter, r *http.Request) {
	var input struct {
		ID             string `json:"id"`
		Name           string `json:"name"`
		URL            string `json:"url"`
		JellyfinApiKey string `json:"jellyfinApiKey"`
		IsActive       bool   `json:"isActive"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16384)
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil || input.Name == "" || input.URL == "" {
		jsonError(w, 400, "Nom et URL requis.")
		return
	}

	activeInt := 0
	if input.IsActive {
		activeInt = 1
	}

	if input.ID == "" {
		idBytes := make([]byte, 16)
		rand.Read(idBytes)
		input.ID = hex.EncodeToString(idBytes)
		_, err := h.db.ExecContext(r.Context(), database.Bind(`INSERT INTO "Server" ("id","jellyfinServerId","name","url","jellyfinApiKey","isActive") VALUES (?,?,?,?,?,?)`, h.driver), input.ID, input.ID, input.Name, input.URL, input.JellyfinApiKey, activeInt)
		if err != nil {
			jsonError(w, 500, "Échec de création du serveur.")
			return
		}
	} else {
		_, err := h.db.ExecContext(r.Context(), database.Bind(`UPDATE "Server" SET "name"=?, "url"=?, "jellyfinApiKey"=?, "isActive"=? WHERE "id"=?`, h.driver), input.Name, input.URL, input.JellyfinApiKey, activeInt, input.ID)
		if err != nil {
			jsonError(w, 500, "Échec de mise à jour du serveur.")
			return
		}
	}
	jsonResponse(w, 200, map[string]any{"id": input.ID, "ok": true})
}

func (h *Handler) deleteServer(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		jsonError(w, 400, "Identifiant requis.")
		return
	}
	_, err := h.db.ExecContext(r.Context(), database.Bind(`DELETE FROM "Server" WHERE "id"=?`, h.driver), id)
	if err != nil {
		jsonError(w, 500, "Impossible de supprimer le serveur.")
		return
	}
	jsonResponse(w, 200, map[string]bool{"ok": true})
}

func (h *Handler) rotateServerPluginKey(w http.ResponseWriter, r *http.Request) {
	tokenBytes := make([]byte, 32)
	rand.Read(tokenBytes)
	newKey := hex.EncodeToString(tokenBytes)
	now := time.Now().UTC().Format(time.RFC3339Nano)

	_, err := h.db.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "pluginPreviousApiKey"="pluginApiKey", "pluginApiKey"=?, "pluginKeyCreatedAt"=? WHERE "id"='global'`, h.driver), newKey, now)
	if err != nil {
		jsonError(w, 500, "Impossible de renouveler la clé plugin.")
		return
	}
	jsonResponse(w, 200, map[string]string{"pluginApiKey": newKey})
}

func (h *Handler) jellyfinWebhook(w http.ResponseWriter, r *http.Request) {
	allowedHosts := os.Getenv("ALLOWED_JELLYFIN_HOSTS")
	if allowedHosts != "" {
		clientHost := requestip.ClientIP(r.RemoteAddr, map[string]string{
			"X-Forwarded-For": r.Header.Get("X-Forwarded-For"),
			"X-Real-IP":       r.Header.Get("X-Real-IP"),
		})
		matched := false
		for _, hStr := range strings.Split(allowedHosts, ",") {
			if strings.EqualFold(strings.TrimSpace(hStr), clientHost) {
				matched = true
				break
			}
		}
		if !matched {
			jsonError(w, 403, "Hôte Jellyfin non autorisé.")
			return
		}
	}
	// Acknowledge webhook
	jsonResponse(w, 200, map[string]string{"status": "received"})
}

// ---------------------- Backups & Maintenance ----------------------

func (h *Handler) backupExport(w http.ResponseWriter, r *http.Request) {
	zipData, err := backup.CreateZipBackup(r.Context(), h.db, h.driver)
	if err != nil {
		jsonError(w, 500, "Échec de génération de la sauvegarde.")
		return
	}
	fileName := fmt.Sprintf("JellyTrack-backup-%s.zip", time.Now().UTC().Format("2006-01-02"))
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, fileName))
	w.WriteHeader(200)
	_, _ = w.Write(zipData)
}

func (h *Handler) backupImport(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, backup.DefaultMaxBackupImportBytes)
	buf, err := io.ReadAll(r.Body)
	if err != nil {
		jsonError(w, 413, "Fichier trop volumineux.")
		return
	}

	mode, err := backup.RestoreBackupBuffer(r.Context(), h.db, h.driver, buf, backup.DefaultMaxBackupImportBytes)
	if err != nil {
		jsonError(w, 400, fmt.Sprintf("Restauration échouée: %v", err))
		return
	}
	jsonResponse(w, 200, map[string]any{"success": true, "mode": mode})
}

func (h *Handler) backupAutoList(w http.ResponseWriter, r *http.Request) {
	bDir, err := backup.GetBackupDirectory()
	if err != nil {
		jsonResponse(w, 200, map[string]any{"backups": []any{}})
		return
	}
	items, err := backup.ListAutoBackups(bDir)
	if err != nil {
		jsonError(w, 500, "Impossible de lister les sauvegardes.")
		return
	}
	jsonResponse(w, 200, map[string]any{"backups": items})
}

func (h *Handler) backupAutoTrigger(w http.ResponseWriter, r *http.Request) {
	bDir, err := backup.GetBackupDirectory()
	if err != nil {
		jsonError(w, 500, "Dossier de sauvegarde inaccessible.")
		return
	}
	fileName, err := backup.TriggerAutoBackup(r.Context(), h.db, h.driver, bDir, "manuelle")
	if err != nil {
		jsonError(w, 500, "Échec de la sauvegarde.")
		return
	}
	jsonResponse(w, 200, map[string]any{"success": true, "fileName": fileName})
}

func (h *Handler) backupAutoDownload(w http.ResponseWriter, r *http.Request) {
	fileName := r.URL.Query().Get("fileName")
	bDir, err := backup.GetBackupDirectory()
	if err != nil {
		jsonError(w, 500, "Dossier de sauvegarde inaccessible.")
		return
	}
	safePath, err := backup.ResolveAutoBackupFile(bDir, fileName)
	if err != nil {
		jsonError(w, 400, "Nom de fichier invalide.")
		return
	}
	fileBytes, err := os.ReadFile(safePath)
	if err != nil {
		jsonError(w, 404, "Fichier introuvable.")
		return
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, fileName))
	w.WriteHeader(200)
	_, _ = w.Write(fileBytes)
}

func (h *Handler) backupAutoRestore(w http.ResponseWriter, r *http.Request) {
	var body struct {
		FileName string `json:"fileName"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.FileName == "" {
		jsonError(w, 400, "fileName requis.")
		return
	}
	bDir, err := backup.GetBackupDirectory()
	if err != nil {
		jsonError(w, 500, "Dossier de sauvegarde inaccessible.")
		return
	}
	safePath, err := backup.ResolveAutoBackupFile(bDir, body.FileName)
	if err != nil {
		jsonError(w, 400, "Nom de fichier invalide.")
		return
	}
	fileBytes, err := os.ReadFile(safePath)
	if err != nil {
		jsonError(w, 404, "Fichier introuvable.")
		return
	}
	mode, err := backup.RestoreBackupBuffer(r.Context(), h.db, h.driver, fileBytes, backup.DefaultMaxBackupImportBytes)
	if err != nil {
		jsonError(w, 500, fmt.Sprintf("Restauration échouée: %v", err))
		return
	}
	jsonResponse(w, 200, map[string]any{"success": true, "mode": mode})
}

func (h *Handler) backupAutoDelete(w http.ResponseWriter, r *http.Request) {
	var body struct {
		FileName string `json:"fileName"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.FileName == "" {
		jsonError(w, 400, "fileName requis.")
		return
	}
	bDir, err := backup.GetBackupDirectory()
	if err != nil {
		jsonError(w, 500, "Dossier de sauvegarde inaccessible.")
		return
	}
	safePath, err := backup.ResolveAutoBackupFile(bDir, body.FileName)
	if err != nil {
		jsonError(w, 400, "Nom de fichier invalide.")
		return
	}
	_ = os.Remove(safePath)
	jsonResponse(w, 200, map[string]bool{"ok": true})
}

func (h *Handler) adminConsolidateHistory(w http.ResponseWriter, r *http.Request) {
	merged, pruned, err := cleanup.ConsolidatePlaybackHistory(r.Context(), h.db, h.driver, 60)
	if err != nil {
		jsonError(w, 500, "Échec de consolidation.")
		return
	}
	jsonResponse(w, 200, map[string]any{"clustersMerged": merged, "sessionsPruned": pruned})
}

func (h *Handler) adminIntegrityCleanup(w http.ResponseWriter, r *http.Request) {
	delStreams, closedSessions, err := cleanup.CleanupOrphanedSessions(r.Context(), h.db, h.driver, 600)
	if err != nil {
		jsonError(w, 500, "Échec du nettoyage.")
		return
	}
	jsonResponse(w, 200, map[string]any{"staleStreamsDeleted": delStreams, "sessionsClosed": closedSessions})
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

// ---------------------- Utilities ----------------------

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

func parseStringList(s string) []string {
	var list []string
	if strings.TrimSpace(s) != "" {
		_ = json.Unmarshal([]byte(s), &list)
	}
	if list == nil {
		list = []string{}
	}
	return list
}
