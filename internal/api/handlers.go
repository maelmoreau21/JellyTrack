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
	"math"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/auth"
	"github.com/maelmoreau21/jellytrack/internal/backup"
	"github.com/maelmoreau21/jellytrack/internal/cleanup"
	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/internal/jellyfin"
	"github.com/maelmoreau21/jellytrack/internal/security"
	"github.com/maelmoreau21/jellytrack/internal/stats"
)

type Handler struct {
	db            *sql.DB
	driver        string
	pluginHandler http.Handler
}

func New(db *sql.DB, driver string, pluginHandler ...http.Handler) *Handler {
	var ph http.Handler
	if len(pluginHandler) > 0 {
		ph = pluginHandler[0]
	}
	return &Handler{db: db, driver: driver, pluginHandler: ph}
}

func (h *Handler) Register(mux *http.ServeMux, protect, adminProtect func(http.Handler) http.Handler) {
	// Standard user session protected routes
	userRoutes := map[string]http.HandlerFunc{
		"GET /api/dashboard":                h.dashboard,
		"GET /api/users/{id}":               h.userDetail,
		"GET /api/users/{id}/active-stream": h.userActiveStream,
		"GET /api/wrapped/{id}":             h.userWrapped,
		"GET /api/media":                    h.mediaList,
		"GET /api/media/collections":        h.mediaCollections,
		"GET /api/media/{id}":               h.mediaDetail,
		"GET /api/history":                  h.history,
		"GET /api/search":                   h.search,
		"GET /api/jellyfin/sessions":        h.sessions,
		"GET /api/jellyfin/image":           h.jellyfinImageProxy,
		"GET /api/jellyfin/user-image":      h.jellyfinUserImageProxy,
	}
	for path, fn := range userRoutes {
		mux.Handle(path, protect(fn))
	}

	// Admin protected routes
	adminRoutes := map[string]http.HandlerFunc{
		"GET /api/users":                                 h.users,
		"GET /api/hardware":                              h.hardware,
		"GET /api/admin/health":                          h.adminHealth,
		"GET /api/admin/security/overview":               h.securityOverview,
		"GET /api/admin/security/audit":                  h.securityAudit,
		"GET /api/admin/security/smart-settings":         h.getSmartSettings,
		"PATCH /api/admin/security/smart-settings":       h.updateSmartSettings,
		"GET /api/admin/users/duplicates":                h.adminUserDuplicates,
		"POST /api/admin/users/duplicates":               h.adminUserDuplicates,
		"POST /api/admin/users/merge":                    h.adminUserMerge,
		"POST /api/admin/users/sync-deleted":             h.adminUserSyncDeleted,
		"DELETE /api/admin/users/{id}":                   h.adminDeleteUser,
		"POST /api/admin/cleanup/delete-stale-movies":    h.adminDeleteStaleMovies,
		"GET /api/predictions":                           h.predictions,
		"GET /api/metadata-audit":                        h.metadataAudit,
		"GET /api/settings/sso":                          h.getSSO,
		"PUT /api/settings/sso":                          h.updateSSO,
		"GET /api/admin/auth/session-policy":             h.getSessionPolicy,
		"PATCH /api/admin/auth/session-policy":           h.updateSessionPolicy,
		"POST /api/admin/auth/session-policy":            h.updateSessionPolicy,
		"GET /api/plugin/api-key":                        h.getPluginApiKey,
		"POST /api/plugin/api-key":                       h.rotatePluginApiKey,
		"DELETE /api/plugin/api-key":                     h.revokePluginApiKey,
		"POST /api/newsletter/discord-post":              h.discordPost,
		"GET /api/logs/system":                           h.getSystemLogs,
		"DELETE /api/logs/system":                        h.clearSystemLogs,
		"GET /api/logs/system/download":                  h.downloadSystemLogs,
		"GET /api/logs/export":                           h.exportLogsCSV,
		"POST /api/media/{id}/poster-rotator/rotate":     h.posterRotatorRotate,
		"GET /api/admin/plugin/health":                   h.adminPluginHealth,
		"POST /api/admin/plugin/health":                  h.adminPluginHealth,
		"POST /api/sync":                                 h.sync,
		"GET /api/stats/deep":                            h.deepStats,
		"GET /api/stats/granular":                        h.granularStats,
		"GET /api/stats/analysis":                        h.analysisStats,
		"GET /api/stats/network":                         h.networkStats,
		"GET /api/geo-stats":                             h.geoStats,
		"GET /api/heatmap-detail":                        h.heatmapDetail,
		"GET /api/streams":                               h.streams,
		"GET /api/streams/telemetry":                     h.streamsTelemetry,
		"POST /api/jellyfin/kill-stream":                 h.killStream,
		"POST /api/jellyfin/send-message":                h.sendMessage,
		"GET /api/settings":                              h.getSettings,
		"POST /api/settings":                             h.updateSettings,
		"GET /api/settings/jellyfin-servers":             h.listServers,
		"POST /api/settings/jellyfin-servers":            h.saveServer,
		"PATCH /api/settings/jellyfin-servers":           h.updateServer,
		"DELETE /api/settings/jellyfin-servers":          h.deleteServer,
		"DELETE /api/settings/jellyfin-servers/{id}":     h.deleteServer,
		"POST /api/settings/jellyfin-servers/plugin-key": h.rotateServerPluginKey,
		"GET /api/backup/export":                         h.backupExport,
		"POST /api/backup/import":                        h.backupImport,
		"GET /api/backup/auto":                           h.backupAutoList,
		"POST /api/backup/auto/trigger":                  h.backupAutoTrigger,
		"GET /api/backup/auto/download":                  h.backupAutoDownload,
		"POST /api/backup/auto/restore":                  h.backupAutoRestore,
		"POST /api/backup/auto/delete":                   h.backupAutoDelete,
		"GET /api/newsletter":                            h.newsletterData,
		"GET /api/admin/server-compare":                  h.serverCompare,
		"POST /api/admin/consolidate-history":            h.adminConsolidateHistory,
		"POST /api/admin/integrity-cleanup":              h.adminIntegrityCleanup,
	}
	for path, fn := range adminRoutes {
		mux.Handle(path, adminProtect(fn))
	}

	// Webhook endpoint (protected by allowed hosts check, no cookie session)
	mux.HandleFunc("POST /api/webhook/jellyfin", h.jellyfinWebhook)
	mux.HandleFunc("GET /api/webhook/jellyfin", func(w http.ResponseWriter, r *http.Request) {
		if h.pluginHandler != nil {
			h.pluginHandler.ServeHTTP(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_, _ = w.Write([]byte(`{"status":"ready"}`))
	})
	mux.HandleFunc("OPTIONS /api/webhook/jellyfin", func(w http.ResponseWriter, r *http.Request) {
		if h.pluginHandler != nil {
			h.pluginHandler.ServeHTTP(w, r)
			return
		}
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Api-Key, Authorization")
		w.WriteHeader(http.StatusNoContent)
	})
}

// ---------------------- Dashboard & Analytics ----------------------

func getServerScope(r *http.Request) []string {
	serversParam := strings.TrimSpace(r.URL.Query().Get("servers"))
	if serversParam == "" {
		serversParam = strings.TrimSpace(r.URL.Query().Get("serverId"))
	}
	if serversParam == "" {
		if c, err := r.Cookie("jellytrack_server_scope"); err == nil {
			serversParam = strings.TrimSpace(c.Value)
		}
	}
	if serversParam == "" || strings.EqualFold(serversParam, "all") {
		return nil
	}
	var serverIDs []string
	for _, s := range strings.Split(serversParam, ",") {
		if trimmed := strings.TrimSpace(s); trimmed != "" {
			serverIDs = append(serverIDs, trimmed)
		}
	}
	return serverIDs
}

func (h *Handler) dashboard(w http.ResponseWriter, r *http.Request) {
	filter, err := dashboardFilter(r, 7)
	if err != nil {
		jsonError(w, 400, err.Error())
		return
	}

	res, err := stats.GetFullDashboard(r.Context(), h.db, h.driver, filter)
	if err != nil {
		jsonError(w, 500, "Impossible de charger les statistiques.")
		return
	}

	jsonResponse(w, 200, res)
}

func (h *Handler) deepStats(w http.ResponseWriter, r *http.Request) {
	filter, err := dashboardFilter(r, 30)
	if err != nil {
		jsonError(w, 400, err.Error())
		return
	}

	res, err := stats.GetDetailedDeepInsights(r.Context(), h.db, h.driver, filter)
	if err != nil {
		jsonError(w, 500, "Erreur de lecture.")
		return
	}

	jsonResponse(w, 200, res)
}

func (h *Handler) granularStats(w http.ResponseWriter, r *http.Request) {
	filter, err := dashboardFilter(r, 30)
	if err != nil {
		jsonError(w, 400, err.Error())
		return
	}

	res, err := stats.GetGranularAnalysis(r.Context(), h.db, h.driver, filter)
	if err != nil {
		jsonError(w, 500, "Erreur de lecture.")
		return
	}

	jsonResponse(w, 200, res)
}

func (h *Handler) analysisStats(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	excluded := excludedLibrariesClause(h.driver, "m")

	mediaRows, err := h.db.QueryContext(ctx, database.Bind(`
		SELECT m."id", COALESCE(m."type",''), COALESCE(m."resolution",''), COALESCE(m."durationMs",0), COALESCE(m."libraryName",'Uncategorized'), COALESCE(m."genres",'[]')
		FROM "Media" m
		WHERE `+excluded, h.driver))
	if err != nil {
		jsonError(w, 500, "Erreur lors de l'analyse des médias.")
		return
	}
	defer mediaRows.Close()

	totalMedia := 0
	uniqueGenresSet := make(map[string]struct{})
	var durationSum int64
	var durationCount int64

	res4K := 0
	res1440p := 0
	res1080p := 0
	res720p := 0
	resSD := 0

	libraryCounts := make(map[string]int)

	for mediaRows.Next() {
		var id, mType, res, lib, genresRaw string
		var dur int64
		if err := mediaRows.Scan(&id, &mType, &res, &dur, &lib, &genresRaw); err == nil {
			if mType == "Movie" || mType == "Series" || mType == "MusicAlbum" {
				totalMedia++
			}
			for _, g := range parseStringList(genresRaw) {
				if g != "" {
					uniqueGenresSet[g] = struct{}{}
				}
			}
			if dur > 0 {
				durationSum += dur
				durationCount++
			}
			if lib != "" {
				libraryCounts[lib]++
			}

			if mType == "Movie" || mType == "Series" || mType == "Episode" {
				rLow := strings.ToLower(res)
				if strings.Contains(rLow, "4k") || strings.Contains(rLow, "2160") || strings.Contains(rLow, "uhd") {
					res4K++
				} else if strings.Contains(rLow, "1440") || strings.Contains(rLow, "2k") || strings.Contains(rLow, "qhd") {
					res1440p++
				} else if strings.Contains(rLow, "1080") || strings.Contains(rLow, "fhd") {
					res1080p++
				} else if strings.Contains(rLow, "720") || strings.Contains(rLow, "hd") {
					res720p++
				} else if len(rLow) > 0 && rLow != "unknown" {
					resSD++
				}
			}
		}
	}

	avgMinutes := 0
	if durationCount > 0 {
		avgMinutes = int((durationSum / durationCount) / 60000)
	}

	type LibItem struct {
		Name  string `json:"name"`
		Count int    `json:"count"`
	}
	var topLibraries []LibItem
	for name, count := range libraryCounts {
		topLibraries = append(topLibraries, LibItem{Name: name, Count: count})
	}
	sort.Slice(topLibraries, func(i, j int) bool {
		return topLibraries[i].Count > topLibraries[j].Count
	})
	if len(topLibraries) > 8 {
		topLibraries = topLibraries[:8]
	}

	// Binge watching analysis (30 days)
	since30 := time.Now().UTC().AddDate(0, 0, -30).Format(time.RFC3339Nano)
	epRows, err := h.db.QueryContext(ctx, database.Bind(`
		SELECT p."userId", p."startedAt", p."durationWatched", m."title", COALESCE(m."parentId",'')
		FROM "PlaybackHistory" p
		JOIN "Media" m ON m."id" = p."mediaId"
		WHERE p."startedAt" >= ? AND m."type" = 'Episode' AND p."durationWatched" >= 60
		ORDER BY p."userId", p."startedAt" ASC
	`, h.driver), since30)

	type bingeRun struct {
		seriesTitle string
		episodes    int
		durationSec int64
	}
	var runs []bingeRun

	if err == nil {
		defer epRows.Close()

		var currentUserId string
		var currentParentId string
		var currentTitle string
		var runCount int
		var runDur int64
		var lastEnd int64

		flushRun := func() {
			if runCount >= 3 {
				runs = append(runs, bingeRun{
					seriesTitle: currentTitle,
					episodes:    runCount,
					durationSec: runDur,
				})
			}
		}

		for epRows.Next() {
			var uId, started, title, parentId string
			var dur int64
			if err := epRows.Scan(&uId, &started, &dur, &title, &parentId); err == nil {
				startTime := parseTimeMs(started)
				endTime := startTime + dur*1000

				seriesKey := parentId
				if seriesKey == "" {
					seriesKey = title
				}

				if uId == currentUserId && seriesKey == currentParentId && (startTime-lastEnd) <= 45*60*1000 {
					runCount++
					runDur += dur
					lastEnd = endTime
				} else {
					flushRun()
					currentUserId = uId
					currentParentId = seriesKey
					currentTitle = title
					runCount = 1
					runDur = dur
					lastEnd = endTime
				}
			}
		}
		flushRun()
	}

	totalBingeSessions := len(runs)
	totalBingeEp := 0
	maxEp := 0
	type seriesAgg struct {
		title       string
		sessions    int
		totalHours  float64
		maxEpisodes int
		totalEp     int
	}
	seriesMap := make(map[string]*seriesAgg)

	for _, r := range runs {
		totalBingeEp += r.episodes
		if r.episodes > maxEp {
			maxEp = r.episodes
		}
		entry, ok := seriesMap[r.seriesTitle]
		if !ok {
			entry = &seriesAgg{title: r.seriesTitle}
			seriesMap[r.seriesTitle] = entry
		}
		entry.sessions++
		entry.totalHours += float64(r.durationSec) / 3600.0
		entry.totalEp += r.episodes
		if r.episodes > entry.maxEpisodes {
			entry.maxEpisodes = r.episodes
		}
	}

	avgEpPerSession := 0.0
	if totalBingeSessions > 0 {
		avgEpPerSession = math.Round((float64(totalBingeEp)/float64(totalBingeSessions))*10) / 10
	}

	type SeriesItem struct {
		SeriesTitle            string  `json:"seriesTitle"`
		TotalBingeSessions     int     `json:"totalBingeSessions"`
		AvgEpisodesPerSession  float64 `json:"avgEpisodesPerSession"`
		MaxEpisodesInSingleRun int     `json:"maxEpisodesInSingleRun"`
		TotalHoursBunged       float64 `json:"totalHoursBunged"`
	}
	var allBingedSeries []SeriesItem
	for _, s := range seriesMap {
		avgEp := 0.0
		if s.sessions > 0 {
			avgEp = math.Round((float64(s.totalEp)/float64(s.sessions))*10) / 10
		}
		allBingedSeries = append(allBingedSeries, SeriesItem{
			SeriesTitle:            s.title,
			TotalBingeSessions:     s.sessions,
			AvgEpisodesPerSession:  avgEp,
			MaxEpisodesInSingleRun: s.maxEpisodes,
			TotalHoursBunged:       math.Round(s.totalHours*10) / 10,
		})
	}
	sort.Slice(allBingedSeries, func(i, j int) bool {
		return allBingedSeries[i].TotalBingeSessions > allBingedSeries[j].TotalBingeSessions
	})
	if len(allBingedSeries) > 6 {
		allBingedSeries = allBingedSeries[:6]
	}

	// Taste insights (30 days)
	tasteRows, err := h.db.QueryContext(ctx, database.Bind(`
		SELECT COALESCE(m."genres",'[]'), COALESCE(p."durationWatched",0)
		FROM "PlaybackHistory" p
		JOIN "Media" m ON m."id" = p."mediaId"
		WHERE p."startedAt" >= ? AND p."durationWatched" >= 60
	`, h.driver), since30)

	genreHours := make(map[string]float64)
	var totalTasteHours float64
	if err == nil {
		defer tasteRows.Close()
		for tasteRows.Next() {
			var genresRaw string
			var dur int64
			if err := tasteRows.Scan(&genresRaw, &dur); err == nil {
				h := float64(dur) / 3600.0
				totalTasteHours += h
				for _, g := range parseStringList(genresRaw) {
					if g != "" {
						genreHours[g] += h
					}
				}
			}
		}
	}

	type GenreBreakdown struct {
		Name       string  `json:"name"`
		TotalHours float64 `json:"totalHours"`
		Percentage int     `json:"percentage"`
	}
	var topGenresBreakdown []GenreBreakdown
	for g, h := range genreHours {
		pct := 0
		if totalTasteHours > 0 {
			pct = int(math.Round((h / totalTasteHours) * 100))
		}
		topGenresBreakdown = append(topGenresBreakdown, GenreBreakdown{
			Name:       g,
			TotalHours: math.Round(h*10) / 10,
			Percentage: pct,
		})
	}
	sort.Slice(topGenresBreakdown, func(i, j int) bool {
		return topGenresBreakdown[i].TotalHours > topGenresBreakdown[j].TotalHours
	})
	if len(topGenresBreakdown) > 6 {
		topGenresBreakdown = topGenresBreakdown[:6]
	}

	type AcquisitionSuggestion struct {
		Category     string `json:"category"`
		Title        string `json:"title"`
		Reason       string `json:"reason"`
		ScorePercent int    `json:"scorePercent"`
		Badge        string `json:"badge"`
	}
	var suggestions []AcquisitionSuggestion
	if len(topGenresBreakdown) > 0 {
		g1 := topGenresBreakdown[0]
		suggestions = append(suggestions, AcquisitionSuggestion{
			Category:     "Genre Dominant",
			Title:        "Enrichir la collection " + g1.Name,
			Reason:       fmt.Sprintf("Représente %d%% du temps total de visionnage (%.1fh). Vos utilisateurs adorent !", g1.Percentage, g1.TotalHours),
			ScorePercent: int(math.Min(98, float64(g1.Percentage+25))),
			Badge:        "Très Forte Demande",
		})
		if len(topGenresBreakdown) > 1 {
			g2 := topGenresBreakdown[1]
			suggestions = append(suggestions, AcquisitionSuggestion{
				Category:     "Genre Tendance",
				Title:        "Films & Séries " + g2.Name,
				Reason:       fmt.Sprintf("Deuxième genre le plus plébiscité avec %.1fh visionnées sur les 30 derniers jours.", g2.TotalHours),
				ScorePercent: int(math.Min(88, float64(g2.Percentage+20))),
				Badge:        "Tendance Forte",
			})
		}
	}
	suggestions = append(suggestions, AcquisitionSuggestion{
		Category:     "Qualité & Format",
		Title:        "Ajouts 4K UHD & HDR",
		Reason:       "Optimisation de la vidéothèque haute fidélité pour vos écrans compatibles et Home Cinéma.",
		ScorePercent: 92,
		Badge:        "Recommandation IA",
	})

	deep, _ := stats.GetDetailedDeepInsights(ctx, h.db, h.driver, stats.DashboardFilter{Days: 30})

	jsonResponse(w, 200, map[string]any{
		"content": map[string]any{
			"totalMedia":         totalMedia,
			"uniqueGenres":       len(uniqueGenresSet),
			"avgDurationMinutes": avgMinutes,
		},
		"resolutions": map[string]int{
			"res4K":    res4K,
			"res1440p": res1440p,
			"res1080p": res1080p,
			"res720p":  res720p,
			"resSD":    resSD,
		},
		"topLibraries": topLibraries,
		"binge": map[string]any{
			"totalBingeSessionsMonth": totalBingeSessions,
			"avgEpisodesPerSession":   avgEpPerSession,
			"maxEpisodesInSingleRun":  maxEp,
			"allBingedSeries":         allBingedSeries,
		},
		"smartInsights": map[string]any{
			"acquisitionSuggestions": suggestions,
			"topGenres":              topGenresBreakdown,
		},
		"deep": map[string]any{
			"topDirectors": deep.TopDirectors,
			"topActors":    deep.TopActors,
			"topStudios":   deep.TopStudios,
		},
	})
}

func parseTimeMs(s string) int64 {
	t, err := time.Parse(time.RFC3339Nano, s)
	if err == nil {
		return t.UnixMilli()
	}
	t, err = time.Parse(time.RFC3339, s)
	if err == nil {
		return t.UnixMilli()
	}
	t, err = time.Parse("2006-01-02 15:04:05", s)
	if err == nil {
		return t.UnixMilli()
	}
	return 0
}

func (h *Handler) networkStats(w http.ResponseWriter, r *http.Request) {
	filter, err := dashboardFilter(r, 30)
	if err != nil {
		jsonError(w, 400, err.Error())
		return
	}

	res, err := stats.GetNetworkAnalysis(r.Context(), h.db, h.driver, filter)
	if err != nil {
		jsonError(w, 500, "Erreur de lecture.")
		return
	}

	jsonResponse(w, 200, res)
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

// ---------------------- Users & Media ----------------------

func (h *Handler) users(w http.ResponseWriter, r *http.Request) {
	limit, offset := page(r)
	if limit > 200 {
		limit = 200
	}
	query := database.Bind(`
		SELECT u."id", u."username", u."jellyfinUserId", u."lastActive", s."name",
		       COALESCE(SUM(p."durationWatched"), 0) AS "totalSeconds",
		       COUNT(p."id") AS "sessionsCount",
		       COALESCE(SUM(CASE WHEN LOWER(COALESCE(p."playMethod",'')) LIKE '%transcode%' THEN 1 ELSE 0 END), 0) AS "transcodes",
		       COALESCE(SUM(CASE WHEN LOWER(COALESCE(p."playMethod",'')) NOT LIKE '%transcode%' AND p."id" IS NOT NULL THEN 1 ELSE 0 END), 0) AS "directPlays",
		       (SELECT p2."clientName" FROM "PlaybackHistory" p2 WHERE p2."userId"=u."id" AND p2."clientName" IS NOT NULL GROUP BY p2."clientName" ORDER BY COUNT(*) DESC LIMIT 1) AS "favoriteClient",
		       (SELECT MAX(COALESCE(p3."endedAt", p3."startedAt")) FROM "PlaybackHistory" p3 WHERE p3."userId"=u."id") AS "latestHistoryDate"
		FROM "User" u
		LEFT JOIN "Server" s ON s."id"=u."serverId"
		LEFT JOIN "PlaybackHistory" p ON p."userId"=u."id" AND p."durationWatched">=60
		WHERE u."isActive"=1
		GROUP BY u."id", u."username", u."jellyfinUserId", u."lastActive", s."name"
		ORDER BY "totalSeconds" DESC, LOWER(u."username") ASC
		LIMIT ? OFFSET ?
	`, h.driver)

	rows, err := h.db.QueryContext(r.Context(), query, limit, offset)
	if err != nil {
		basicRows, bErr := h.db.QueryContext(r.Context(), database.Bind(`SELECT u."id",u."username",u."jellyfinUserId",u."lastActive",s."name" FROM "User" u LEFT JOIN "Server" s ON s."id"=u."serverId" WHERE u."isActive"=1 ORDER BY LOWER(u."username") LIMIT ? OFFSET ?`, h.driver), limit, offset)
		if bErr != nil {
			jsonError(w, 500, "Impossible de charger les utilisateurs.")
			return
		}
		defer basicRows.Close()
		out := []map[string]any{}
		for basicRows.Next() {
			var id, name, jid string
			var active, server sql.NullString
			if basicRows.Scan(&id, &name, &jid, &active, &server) == nil {
				out = append(out, map[string]any{
					"id": id, "username": name, "jellyfinUserId": jid, "lastActive": nullable(active), "server": nullable(server),
					"totalHours": 0.0, "sessionsCount": 0, "favoriteClient": "Inconnu", "transcodeCount": 0, "directPlayCount": 0, "transcodeRatio": 0,
				})
			}
		}
		jsonResponse(w, 200, map[string]any{"items": out, "users": out, "limit": limit, "offset": offset})
		return
	}
	defer rows.Close()

	out := []map[string]any{}
	for rows.Next() {
		var id, name, jid string
		var active, server, favClient, latestHistory sql.NullString
		var totalSec, sessCount, tcCount, dpCount int64
		if err := rows.Scan(&id, &name, &jid, &active, &server, &totalSec, &sessCount, &tcCount, &dpCount, &favClient, &latestHistory); err != nil {
			jsonError(w, 500, "Erreur de lecture.")
			return
		}

		totalStreams := tcCount + dpCount
		ratio := 0
		if totalStreams > 0 {
			ratio = int((tcCount * 100) / totalStreams)
		}

		effLastActive := ""
		if active.Valid {
			effLastActive = active.String
		}
		if sessCount > 0 && latestHistory.Valid && latestHistory.String != "" {
			effLastActive = latestHistory.String
		}

		clientName := "Inconnu"
		if favClient.Valid && favClient.String != "" {
			clientName = favClient.String
		}

		var lastActiveAny any
		if effLastActive != "" {
			lastActiveAny = effLastActive
		}

		out = append(out, map[string]any{
			"id":              id,
			"username":        name,
			"jellyfinUserId":  jid,
			"totalHours":      math.Round((float64(totalSec)/3600.0)*10) / 10,
			"sessionsCount":   sessCount,
			"lastActive":      lastActiveAny,
			"favoriteClient":  clientName,
			"transcodeCount":  tcCount,
			"directPlayCount": dpCount,
			"transcodeRatio":  ratio,
			"server":          nullable(server),
		})
	}
	jsonResponse(w, 200, map[string]any{"items": out, "users": out, "limit": limit, "offset": offset})
}

func (h *Handler) userDetail(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		jsonError(w, 400, "Identifiant requis.")
		return
	}
	if id == "me" || id == "@me" {
		if p, ok := auth.PrincipalFromContext(r.Context()); ok {
			if p.JellyfinUserID != "" {
				id = p.JellyfinUserID
			} else {
				id = p.Username
			}
		}
	}
	principal, authenticated := auth.PrincipalFromContext(r.Context())
	if !authenticated {
		jsonError(w, 401, "Authentification requise.")
		return
	}
	isSelf := !principal.IsAdmin()
	var authorizedServerID string
	if isSelf {
		identity, err := auth.ResolveAccount(r.Context(), h.db, h.driver, principal)
		if err != nil || !identity.Matches(strings.TrimSpace(r.PathValue("id"))) {
			jsonError(w, 403, "Accès refusé.")
			return
		}
		id = identity.ID
		authorizedServerID = identity.ServerID
	}
	var dbUID, username, jid, accountServerID string
	var lastActive, server sql.NullString
	userQuery := `SELECT u."id",u."username",u."jellyfinUserId",u."lastActive",s."name",u."serverId" FROM "User" u LEFT JOIN "Server" s ON s."id"=u."serverId" WHERE `
	userArgs := []any{id, id, id}
	if isSelf {
		userQuery += `u."id"=? AND u."serverId"=?`
		userArgs = []any{id, authorizedServerID}
	} else {
		userQuery += `u."id"=? OR u."jellyfinUserId"=? OR LOWER(u."username")=LOWER(?) LIMIT 1`
	}
	err := h.db.QueryRowContext(r.Context(), database.Bind(userQuery, h.driver), userArgs...).Scan(&dbUID, &username, &jid, &lastActive, &server, &accountServerID)
	if err != nil {
		jsonError(w, 404, "Utilisateur introuvable.")
		return
	}

	var totalPlays, totalDuration int64
	_ = h.db.QueryRowContext(r.Context(), database.Bind(`SELECT COUNT(*),COALESCE(SUM("durationWatched"),0) FROM "PlaybackHistory" WHERE "userId"=? AND "serverId"=?`, h.driver), dbUID, accountServerID).Scan(&totalPlays, &totalDuration)

	// Recent activity
	rows, err := h.db.QueryContext(r.Context(), database.Bind(`SELECT p."id",p."startedAt",p."durationWatched",p."playMethod",m."title",m."type",m."libraryName" FROM "PlaybackHistory" p JOIN "Media" m ON m."id"=p."mediaId" WHERE p."userId"=? AND p."serverId"=? ORDER BY p."startedAt" DESC LIMIT 20`, h.driver), dbUID, accountServerID)
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
		"id": dbUID, "username": username, "jellyfinUserId": jid,
		"lastActive": nullable(lastActive), "server": nullable(server),
		"totalPlays": totalPlays, "totalDurationMs": totalDuration * 1000,
		"recentActivity": recent,
	})
}

func (h *Handler) userActiveStream(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		jsonError(w, 400, "Identifiant requis.")
		return
	}
	if id == "me" || id == "@me" {
		if p, ok := auth.PrincipalFromContext(r.Context()); ok {
			if p.JellyfinUserID != "" {
				id = p.JellyfinUserID
			} else {
				id = p.Username
			}
		}
	}

	principal, ok := auth.PrincipalFromContext(r.Context())
	var authorizedAccount auth.AccountIdentity
	if ok && !principal.IsAdmin() {
		var err error
		authorizedAccount, err = auth.ResolveAccount(r.Context(), h.db, h.driver, principal)
		if err != nil || !authorizedAccount.Matches(strings.TrimSpace(r.PathValue("id"))) {
			jsonError(w, 403, "Forbidden")
			return
		}
		id = authorizedAccount.ID
	}
	var stream map[string]any
	var sid, playMethod, started string
	var title, kind sql.NullString
	var posTicks sql.NullInt64
	query := `SELECT s."sessionId",s."playMethod",s."startedAt",s."positionTicks",m."title",m."type" FROM "ActiveStream" s LEFT JOIN "Media" m ON m."id"=s."mediaId" WHERE s."userId"=? OR s."userId" IN (SELECT "id" FROM "User" WHERE "jellyfinUserId"=? OR "id"=?) LIMIT 1`
	queryArgs := []any{id, id, id}
	if ok && !principal.IsAdmin() {
		query = `SELECT s."sessionId",s."playMethod",s."startedAt",s."positionTicks",m."title",m."type" FROM "ActiveStream" s LEFT JOIN "Media" m ON m."id"=s."mediaId" WHERE s."userId"=? AND s."serverId"=? LIMIT 1`
		queryArgs = []any{authorizedAccount.ID, authorizedAccount.ServerID}
	}
	err := h.db.QueryRowContext(r.Context(), database.Bind(query, h.driver), queryArgs...).Scan(&sid, &playMethod, &started, &posTicks, &title, &kind)
	if err == nil {
		stream = map[string]any{
			"sessionId": sid, "playMethod": playMethod, "startedAt": started,
			"mediaTitle": title.String, "mediaType": kind.String, "positionTicks": posTicks.Int64,
		}
	}
	jsonResponse(w, 200, map[string]any{"stream": stream, "activeStream": stream})
}

func (h *Handler) mediaList(w http.ResponseWriter, r *http.Request) {
	limit, offset := page(r)
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	mType := strings.TrimSpace(r.URL.Query().Get("type"))
	library := strings.TrimSpace(r.URL.Query().Get("library"))
	artist := strings.TrimSpace(r.URL.Query().Get("artist"))
	sortParam := strings.TrimSpace(r.URL.Query().Get("sort"))

	whereClauses := []string{excludedLibrariesClause(h.driver, "m")}
	var args []any

	if q != "" {
		whereClauses = append(whereClauses, `(m."title" LIKE ? OR m."directors" LIKE ? OR m."actors" LIKE ?)`)
		args = append(args, "%"+q+"%", "%"+q+"%", "%"+q+"%")
	}
	if mType != "" {
		switch strings.ToLower(mType) {
		case "series":
			whereClauses = append(whereClauses, `m."type" IN ('Series','Season','Episode')`)
		case "audio", "music":
			whereClauses = append(whereClauses, `m."type" IN ('Audio','Track','MusicAlbum')`)
		case "book":
			whereClauses = append(whereClauses, `m."type" IN ('Book','AudioBook')`)
		default:
			whereClauses = append(whereClauses, `m."type" = ?`)
			args = append(args, mType)
		}
	}
	if library != "" {
		whereClauses = append(whereClauses, `m."libraryName" = ?`)
		args = append(args, library)
	}
	if artist != "" {
		whereClauses = append(whereClauses, `(m."artist" LIKE ? OR m."directors" LIKE ? OR m."title" LIKE ?)`)
		args = append(args, "%"+artist+"%", "%"+artist+"%", "%"+artist+"%")
	}
	if servers := getServerScope(r); len(servers) > 0 {
		marks := make([]string, len(servers))
		for i, id := range servers {
			marks[i] = "?"
			args = append(args, id)
		}
		whereClauses = append(whereClauses, `m."serverId" IN (`+strings.Join(marks, ",")+`)`)
	}

	var total int64
	countQ := fmt.Sprintf(`SELECT COUNT(*) FROM "Media" m WHERE %s`, strings.Join(whereClauses, " AND "))
	_ = h.db.QueryRowContext(r.Context(), database.Bind(countQ, h.driver), args...).Scan(&total)

	orderBy := `m."title" ASC`
	switch sortParam {
	case "popular":
		orderBy = `(SELECT COUNT(*) FROM "PlaybackHistory" WHERE "mediaId"=m."id") DESC, m."title" ASC`
	case "duration":
		orderBy = `m."durationMs" DESC`
	case "recent":
		orderBy = `(SELECT MAX("startedAt") FROM "PlaybackHistory" WHERE "mediaId"=m."id") DESC, m."title" ASC`
	case "added", "new", "recentlyAdded":
		orderBy = `COALESCE(m."dateAdded", m."createdAt") DESC, m."id" DESC`
	}

	query := fmt.Sprintf(`SELECT m."id",m."jellyfinMediaId",m."title",m."type",m."libraryName",m."resolution",m."durationMs",s."name",COALESCE(m."dateAdded", m."createdAt"),COALESCE(m."genres",'[]'),(SELECT COUNT(*) FROM "PlaybackHistory" WHERE "mediaId"=m."id") FROM "Media" m LEFT JOIN "Server" s ON s."id"=m."serverId" WHERE %s ORDER BY %s LIMIT ? OFFSET ?`, strings.Join(whereClauses, " AND "), orderBy)
	queryArgs := append(append([]any{}, args...), limit, offset)

	rows, err := h.db.QueryContext(r.Context(), database.Bind(query, h.driver), queryArgs...)
	if err != nil {
		jsonError(w, 500, "Impossible de charger les médias.")
		return
	}
	defer rows.Close()

	out := []map[string]any{}
	for rows.Next() {
		var id, jid, title, kind string
		var lib, res, server, dateAdded, genresRaw sql.NullString
		var dur sql.NullInt64
		var plays int64
		if rows.Scan(&id, &jid, &title, &kind, &lib, &res, &dur, &server, &dateAdded, &genresRaw, &plays) == nil {
			out = append(out, map[string]any{
				"id": id, "jellyfinMediaId": jid, "title": title, "type": kind,
				"library": nullable(lib), "resolution": nullable(res), "durationMs": dur.Int64,
				"server":    nullable(server),
				"dateAdded": nullable(dateAdded),
				"genres":    parseStringList(genresRaw.String),
				"plays":     plays,
			})
		}
	}
	jsonResponse(w, 200, map[string]any{"items": out, "total": total, "limit": limit, "offset": offset})
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
	var pauseCount, seekCount, rewatchCount, speedChangeCount int64
	var maxRate sql.NullFloat64
	_ = h.db.QueryRowContext(r.Context(), database.Bind(`SELECT COUNT(*),COALESCE(SUM("durationWatched"),0),COALESCE(SUM("pauseCount"),0),COALESCE(SUM("seekCount"),0),COALESCE(SUM("rewatchCount"),0),COALESCE(SUM("speedChangeCount"),0),MAX("maxPlaybackRate") FROM "PlaybackHistory" WHERE "mediaId"=(SELECT "id" FROM "Media" WHERE "id"=? OR "jellyfinMediaId"=? LIMIT 1)`, h.driver), id, id).Scan(&watchCount, &totalDuration, &pauseCount, &seekCount, &rewatchCount, &speedChangeCount, &maxRate)

	recentRows, errRecent := h.db.QueryContext(r.Context(), database.Bind(`SELECT p."id",p."startedAt",p."durationWatched",p."playMethod",u."username",u."id" FROM "PlaybackHistory" p LEFT JOIN "User" u ON u."id"=p."userId" WHERE p."mediaId"=(SELECT "id" FROM "Media" WHERE "id"=? OR "jellyfinMediaId"=? LIMIT 1) ORDER BY p."startedAt" DESC LIMIT 10`, h.driver), id, id)
	recentActivity := []map[string]any{}
	if errRecent == nil {
		for recentRows.Next() {
			var pid, started, method string
			var dur int64
			var uname, uid sql.NullString
			if recentRows.Scan(&pid, &started, &dur, &method, &uname, &uid) == nil {
				recentActivity = append(recentActivity, map[string]any{
					"id": pid, "startedAt": started, "durationMs": dur * 1000,
					"playMethod": method, "username": nullable(uname), "userId": nullable(uid),
				})
			}
		}
		recentRows.Close()
	}

	var maxRateVal any
	if maxRate.Valid {
		maxRateVal = maxRate.Float64
	}

	jsonResponse(w, 200, map[string]any{
		"id": id, "jellyfinMediaId": jid, "title": title, "type": mType,
		"library": nullable(lib), "genres": parseStringList(genres), "resolution": nullable(res),
		"durationMs": dur.Int64, "sizeBytes": size.Int64, "directors": parseStringList(directors),
		"actors": parseStringList(actors), "server": nullable(server),
		"totalPlays": watchCount, "totalDurationMs": totalDuration * 1000,
		"pauseCount": pauseCount, "seekCount": seekCount, "rewatchCount": rewatchCount,
		"speedChangeCount": speedChangeCount, "maxPlaybackRate": maxRateVal,
		"recentActivity": recentActivity,
	})
}

func (h *Handler) search(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(q) < 2 {
		jsonResponse(w, 200, map[string]any{"media": []any{}, "users": []any{}})
		return
	}

	searchPattern := "%" + q + "%"
	excluded := excludedLibrariesClause(h.driver, "m")
	rows, err := h.db.QueryContext(r.Context(), database.Bind(`SELECT m."id",m."jellyfinMediaId",m."title",m."type",m."libraryName",m."parentId",m."artist" FROM "Media" m WHERE (m."title" LIKE ? OR m."directors" LIKE ? OR m."actors" LIKE ?) AND `+excluded+` ORDER BY m."title" ASC LIMIT 10`, h.driver), searchPattern, searchPattern, searchPattern)
	mediaList := []map[string]any{}
	if err == nil {
		for rows.Next() {
			var id, jid, title, kind string
			var lib, pid, artist sql.NullString
			if rows.Scan(&id, &jid, &title, &kind, &lib, &pid, &artist) == nil {
				subtitle := ""
				if artist.Valid && artist.String != "" {
					subtitle = artist.String
				}
				mediaList = append(mediaList, map[string]any{
					"id":              id,
					"jellyfinMediaId": jid,
					"title":           title,
					"type":            kind,
					"library":         nullable(lib),
					"parentId":        nullable(pid),
					"subtitle":        subtitle,
				})
			}
		}
		rows.Close()
	}

	userList := []map[string]any{}
	principal, ok := auth.PrincipalFromContext(r.Context())
	if ok && principal.IsAdmin() {
		uRows, err := h.db.QueryContext(r.Context(), database.Bind(`SELECT "id","jellyfinUserId","username" FROM "User" WHERE "username" LIKE ? ORDER BY "username" ASC LIMIT 5`, h.driver), searchPattern)
		if err == nil {
			for uRows.Next() {
				var uid, juid, uname string
				if uRows.Scan(&uid, &juid, &uname) == nil {
					userList = append(userList, map[string]any{
						"id":             uid,
						"jellyfinUserId": juid,
						"username":       uname,
					})
				}
			}
			uRows.Close()
		}
	}

	jsonResponse(w, 200, map[string]any{"media": mediaList, "users": userList})
}

// ---------------------- Streams & Telemetry ----------------------

func (h *Handler) streams(w http.ResponseWriter, r *http.Request) {
	selectedServers := getServerScope(r)

	baseQuery := `SELECT s."id",s."serverId",s."sessionId",s."playMethod",s."clientName",s."deviceName",s."ipAddress",s."country",s."city",s."bitrate",s."positionTicks",s."startedAt",u."username",m."title",m."type",m."durationMs",m."jellyfinMediaId",m."parentId",m."artist" FROM "ActiveStream" s LEFT JOIN "User" u ON u."id"=s."userId" LEFT JOIN "Media" m ON m."id"=s."mediaId"`
	var rows *sql.Rows
	var err error

	if len(selectedServers) > 0 {
		placeholders := make([]string, len(selectedServers))
		args := make([]any, len(selectedServers))
		for i, s := range selectedServers {
			placeholders[i] = "?"
			args[i] = s
		}
		q := baseQuery + ` WHERE s."serverId" IN (` + strings.Join(placeholders, ",") + `)`
		rows, err = h.db.QueryContext(r.Context(), database.Bind(q, h.driver), args...)
	} else {
		rows, err = h.db.QueryContext(r.Context(), baseQuery)
	}

	if err != nil {
		jsonError(w, 500, "Impossible de charger les flux en direct.")
		return
	}
	defer rows.Close()

	var streams []map[string]any
	var totalBandwidthMbps float64

	for rows.Next() {
		var id, srvId, sessId, playMethod, started string
		var client, device, ip, country, city, user, title, mType, jmid, parentId, artist sql.NullString
		var bitrate, posTicks, durMs sql.NullInt64

		if rows.Scan(&id, &srvId, &sessId, &playMethod, &client, &device, &ip, &country, &city, &bitrate, &posTicks, &started, &user, &title, &mType, &durMs, &jmid, &parentId, &artist) == nil {
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

			posterItemId := jmid.String
			if (mType.String == "Audio" || mType.String == "Track") && parentId.String != "" {
				posterItemId = parentId.String
			}

			mediaSubtitle := ""
			if (mType.String == "Audio" || mType.String == "Track") && artist.String != "" {
				mediaSubtitle = artist.String
			}

			streams = append(streams, map[string]any{
				"id":              id,
				"serverId":        srvId,
				"sessionId":       sessId,
				"itemId":          jmid.String,
				"jellyfinMediaId": jmid.String,
				"parentItemId":    parentId.String,
				"playMethod":      playMethod,
				"clientName":      client.String,
				"deviceName":      device.String,
				"device":          device.String,
				"ipAddress":       ip.String,
				"country":         country.String,
				"city":            city.String,
				"user":            user.String,
				"mediaTitle":      title.String,
				"mediaSubtitle":   mediaSubtitle,
				"mediaType":       mType.String,
				"progressPercent": progressPercent,
				"isPaused":        false,
				"posterItemId":    posterItemId,
				"startedAt":       started,
			})
		}
	}

	if streams == nil {
		streams = []map[string]any{}
	}

	jsonResponse(w, 200, map[string]any{
		"streams":            streams,
		"count":              len(streams),
		"totalBandwidthMbps": totalBandwidthMbps,
	})
}

func (h *Handler) streamsTelemetry(w http.ResponseWriter, r *http.Request) {
	mediaId := strings.TrimSpace(r.URL.Query().Get("mediaId"))
	serverId := strings.TrimSpace(r.URL.Query().Get("serverId"))
	playbackId := strings.TrimSpace(r.URL.Query().Get("playbackId"))

	if mediaId != "" {
		var internalMediaId, srvId string
		var durationMs sql.NullInt64
		var err error
		if serverId != "" {
			err = h.db.QueryRowContext(r.Context(), database.Bind(`SELECT m."id",m."serverId",m."durationMs" FROM "Media" m LEFT JOIN "Server" s ON s."id"=m."serverId" WHERE m."jellyfinMediaId"=? AND (m."serverId"=? OR s."jellyfinServerId"=?) LIMIT 1`, h.driver), mediaId, serverId, serverId).Scan(&internalMediaId, &srvId, &durationMs)
		} else {
			err = h.db.QueryRowContext(r.Context(), database.Bind(`SELECT m."id",m."serverId",m."durationMs" FROM "Media" m WHERE m."jellyfinMediaId"=? LIMIT 1`, h.driver), mediaId).Scan(&internalMediaId, &srvId, &durationMs)
		}
		if err != nil {
			jsonError(w, 404, "Media not found")
			return
		}

		sRows, err := h.db.QueryContext(r.Context(), database.Bind(`SELECT p."id",p."userId",p."eventSource",p."sourceEventId",p."durationWatched",p."startedAt",p."endedAt",u."username",u."jellyfinUserId" FROM "PlaybackHistory" p LEFT JOIN "User" u ON u."id"=p."userId" WHERE p."mediaId"=? ORDER BY p."startedAt" DESC`, h.driver), internalMediaId)
		if err != nil {
			jsonError(w, 500, "Erreur de lecture.")
			return
		}
		defer sRows.Close()

		type sessionItem struct {
			ID              string           `json:"id"`
			UserID          string           `json:"userId"`
			EventSource     string           `json:"eventSource"`
			SourceEventID   sql.NullString   `json:"sourceEventId"`
			DurationWatched int64            `json:"durationWatched"`
			StartedAt       string           `json:"startedAt"`
			EndedAt         sql.NullString   `json:"endedAt"`
			User            map[string]any   `json:"user"`
			TelemetryEvents []map[string]any `json:"telemetryEvents"`
		}

		var sessions []sessionItem
		var pids []string
		for sRows.Next() {
			var id, es, started string
			var uid, seid, ended, uname, juid sql.NullString
			var dur int64
			if sRows.Scan(&id, &uid, &es, &seid, &dur, &started, &ended, &uname, &juid) == nil {
				pids = append(pids, id)
				sessions = append(sessions, sessionItem{
					ID:              id,
					UserID:          uid.String,
					EventSource:     es,
					SourceEventID:   seid,
					DurationWatched: dur,
					StartedAt:       started,
					EndedAt:         ended,
					User: map[string]any{
						"username":       uname.String,
						"jellyfinUserId": juid.String,
					},
					TelemetryEvents: []map[string]any{},
				})
			}
		}

		if len(pids) > 0 {
			placeholders := make([]string, len(pids))
			args := make([]any, len(pids))
			for i, pid := range pids {
				placeholders[i] = "?"
				args[i] = pid
			}
			tQuery := `SELECT "id","playbackId","eventType","positionMs","metadata","createdAt" FROM "TelemetryEvent" WHERE "playbackId" IN (` + strings.Join(placeholders, ",") + `) ORDER BY "positionMs" ASC`
			tRows, tErr := h.db.QueryContext(r.Context(), database.Bind(tQuery, h.driver), args...)
			if tErr == nil {
				defer tRows.Close()
				eventMap := make(map[string][]map[string]any)
				for tRows.Next() {
					var tid, pid, kind, created string
					var pos int64
					var meta sql.NullString
					if tRows.Scan(&tid, &pid, &kind, &pos, &meta, &created) == nil {
						eventMap[pid] = append(eventMap[pid], map[string]any{
							"id":         tid,
							"playbackId": pid,
							"eventType":  kind,
							"positionMs": pos,
							"metadata":   nullable(meta),
							"createdAt":  created,
						})
					}
				}
				for i := range sessions {
					if evts, ok := eventMap[sessions[i].ID]; ok {
						sessions[i].TelemetryEvents = evts
					}
				}
			}
		}

		var durVal any = nil
		if durationMs.Valid {
			durVal = durationMs.Int64
		}

		jsonResponse(w, 200, map[string]any{
			"mediaId":    mediaId,
			"serverId":   srvId,
			"durationMs": durVal,
			"sessions":   sessions,
		})
		return
	}

	if playbackId != "" {
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
		return
	}

	jsonError(w, 400, "mediaId ou playbackId requis.")
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

	var srvURL, srvKey sql.NullString
	_ = h.db.QueryRowContext(r.Context(), database.Bind(`
		SELECT s."url", s."jellyfinApiKey"
		FROM "ActiveStream" a
		JOIN "Server" s ON s."id" = a."serverId"
		WHERE a."sessionId" = ?
		LIMIT 1
	`, h.driver), body.SessionID).Scan(&srvURL, &srvKey)

	// Delete from local ActiveStream table
	_, _ = h.db.ExecContext(r.Context(), database.Bind(`DELETE FROM "ActiveStream" WHERE "sessionId"=?`, h.driver), body.SessionID)

	baseURL := srvURL.String
	apiKey := srvKey.String
	if baseURL == "" {
		baseURL = os.Getenv("JELLYFIN_URL")
		apiKey = first(os.Getenv("JELLYFIN_API_KEY"), os.Getenv("JELLYTRACK_JELLYFIN_API_KEY"))
	}

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
		Message   string `json:"message"`
		Header    string `json:"header"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 8192)
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, 400, "Corps de requête invalide.")
		return
	}
	if body.Text == "" && body.Message != "" {
		body.Text = body.Message
	}
	if body.SessionID == "" || body.Text == "" {
		jsonError(w, 400, "sessionId et text (ou message) requis.")
		return
	}

	var srvURL, srvKey sql.NullString
	_ = h.db.QueryRowContext(r.Context(), database.Bind(`
		SELECT s."url", s."jellyfinApiKey"
		FROM "ActiveStream" a
		JOIN "Server" s ON s."id" = a."serverId"
		WHERE a."sessionId" = ?
		LIMIT 1
	`, h.driver), body.SessionID).Scan(&srvURL, &srvKey)

	baseURL := srvURL.String
	apiKey := srvKey.String
	if baseURL == "" {
		baseURL = os.Getenv("JELLYFIN_URL")
		apiKey = first(os.Getenv("JELLYFIN_API_KEY"), os.Getenv("JELLYTRACK_JELLYFIN_API_KEY"))
	}

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
	var resThresholds, plugTelemetry sql.NullString
	var alertsEnabled, maxTranscodes, syncH, syncM, bH, bM, wrapVis, wrapPer, wrapSM, wrapSD, wrapEM, wrapED int
	var rememberThirty int
	err := h.db.QueryRowContext(r.Context(), `SELECT "discordWebhookUrl","discordAlertCondition","discordAlertsEnabled","maxConcurrentTranscodes","excludedLibraries","syncCronHour","syncCronMinute","backupCronHour","backupCronMinute","defaultLocale","timeFormat","wrappedVisible","wrappedPeriodEnabled","wrappedStartMonth","wrappedStartDay","wrappedEndMonth","wrappedEndDay","authRememberThirtyDaysEnabled","resolutionThresholds","pluginTelemetrySettings" FROM "GlobalSettings" WHERE "id"='global'`).Scan(
		&discordUrl, &discordCond, &alertsEnabled, &maxTranscodes, &exclLibs, &syncH, &syncM, &bH, &bM, &defLocale, &timeFmt, &wrapVis, &wrapPer, &wrapSM, &wrapSD, &wrapEM, &wrapED, &rememberThirty, &resThresholds, &plugTelemetry)
	if err != nil && err != sql.ErrNoRows {
		jsonError(w, 500, "Impossible de lire les réglages.")
		return
	}

	availLibs := []string{}
	type libScope struct {
		ServerID    string `json:"serverId"`
		LibraryName string `json:"libraryName"`
	}
	availScopes := []libScope{}

	libRows, lErr := h.db.QueryContext(r.Context(), `SELECT DISTINCT "libraryName" FROM "Media" WHERE "libraryName" IS NOT NULL AND "libraryName" != '' ORDER BY "libraryName" ASC`)
	if lErr == nil {
		defer libRows.Close()
		for libRows.Next() {
			var ln string
			if libRows.Scan(&ln) == nil {
				availLibs = append(availLibs, ln)
			}
		}
	}

	scopeRows, sErr := h.db.QueryContext(r.Context(), `SELECT DISTINCT "serverId", "libraryName" FROM "Media" WHERE "libraryName" IS NOT NULL AND "libraryName" != '' ORDER BY "libraryName" ASC`)
	if sErr == nil {
		defer scopeRows.Close()
		for scopeRows.Next() {
			var sid, ln string
			if scopeRows.Scan(&sid, &ln) == nil {
				availScopes = append(availScopes, libScope{ServerID: sid, LibraryName: ln})
			}
		}
	}

	schedulerIntervals := map[string]any{
		"recentSyncEveryHours": 6,
		"fullSyncEveryHours":   48,
		"backupEveryHours":     24,
		"logRetentionDays":     30,
	}
	var resObj map[string]any
	if resThresholds.Valid && resThresholds.String != "" {
		if json.Unmarshal([]byte(resThresholds.String), &resObj) == nil {
			if si, ok := resObj["schedulerIntervals"].(map[string]any); ok {
				for k, v := range si {
					schedulerIntervals[k] = v
				}
			}
		}
	}

	var plugObj any
	if plugTelemetry.Valid && plugTelemetry.String != "" {
		_ = json.Unmarshal([]byte(plugTelemetry.String), &plugObj)
	}

	jsonResponse(w, 200, map[string]any{
		"discordWebhookUrl":             discordUrl.String,
		"discordAlertCondition":         discordCond.String,
		"discordAlertsEnabled":          alertsEnabled == 1,
		"maxConcurrentTranscodes":       maxTranscodes,
		"excludedLibraries":             parseStringList(exclLibs.String),
		"syncCronHour":                  syncH,
		"syncCronMinute":                syncM,
		"backupCronHour":                bH,
		"backupCronMinute":              bM,
		"defaultLocale":                 defLocale.String,
		"timeFormat":                    timeFmt.String,
		"wrappedVisible":                wrapVis == 1,
		"wrappedPeriodEnabled":          wrapPer == 1,
		"wrappedStartMonth":             wrapSM,
		"wrappedStartDay":               wrapSD,
		"wrappedEndMonth":               wrapEM,
		"wrappedEndDay":                 wrapED,
		"authRememberThirtyDaysEnabled": rememberThirty == 1,
		"resolutionThresholds":          resObj,
		"schedulerIntervals":            schedulerIntervals,
		"pluginTelemetrySettings":       plugObj,
		"availableLibraries":            availLibs,
		"availableLibraryScopes":        availScopes,
	})
}

func (h *Handler) updateSettings(w http.ResponseWriter, r *http.Request) {
	var input struct {
		DiscordWebhookUrl             *string   `json:"discordWebhookUrl"`
		DiscordAlertCondition         *string   `json:"discordAlertCondition"`
		DiscordAlertsEnabled          *bool     `json:"discordAlertsEnabled"`
		MaxConcurrentTranscodes       *int      `json:"maxConcurrentTranscodes"`
		ExcludedLibraries             *[]string `json:"excludedLibraries"`
		SyncCronHour                  *int      `json:"syncCronHour"`
		SyncCronMinute                *int      `json:"syncCronMinute"`
		BackupCronHour                *int      `json:"backupCronHour"`
		BackupCronMinute              *int      `json:"backupCronMinute"`
		DefaultLocale                 *string   `json:"defaultLocale"`
		TimeFormat                    *string   `json:"timeFormat"`
		WrappedVisible                *bool     `json:"wrappedVisible"`
		WrappedPeriodEnabled          *bool     `json:"wrappedPeriodEnabled"`
		WrappedStartMonth             *int      `json:"wrappedStartMonth"`
		WrappedStartDay               *int      `json:"wrappedStartDay"`
		WrappedEndMonth               *int      `json:"wrappedEndMonth"`
		WrappedEndDay                 *int      `json:"wrappedEndDay"`
		ResolutionThresholds          any       `json:"resolutionThresholds"`
		SchedulerIntervals            any       `json:"schedulerIntervals"`
		PluginTelemetrySettings       any       `json:"pluginTelemetrySettings"`
		AuthRememberThirtyDaysEnabled *bool     `json:"authRememberThirtyDaysEnabled"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 65536)
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		jsonError(w, 400, "Payload JSON invalide.")
		return
	}

	_, _ = h.db.ExecContext(r.Context(), database.Bind(`INSERT INTO "GlobalSettings"("id") VALUES('global') ON CONFLICT DO NOTHING`, h.driver))

	if input.ExcludedLibraries != nil {
		b, _ := json.Marshal(*input.ExcludedLibraries)
		_, _ = h.db.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "excludedLibraries"=? WHERE "id"='global'`, h.driver), string(b))
	}
	if input.DiscordWebhookUrl != nil {
		_, _ = h.db.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "discordWebhookUrl"=? WHERE "id"='global'`, h.driver), *input.DiscordWebhookUrl)
	}
	if input.DiscordAlertCondition != nil {
		_, _ = h.db.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "discordAlertCondition"=? WHERE "id"='global'`, h.driver), *input.DiscordAlertCondition)
	}
	if input.DiscordAlertsEnabled != nil {
		val := 0
		if *input.DiscordAlertsEnabled {
			val = 1
		}
		_, _ = h.db.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "discordAlertsEnabled"=? WHERE "id"='global'`, h.driver), val)
	}
	if input.MaxConcurrentTranscodes != nil {
		_, _ = h.db.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "maxConcurrentTranscodes"=? WHERE "id"='global'`, h.driver), *input.MaxConcurrentTranscodes)
	}
	if input.SyncCronHour != nil {
		_, _ = h.db.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "syncCronHour"=? WHERE "id"='global'`, h.driver), *input.SyncCronHour)
	}
	if input.SyncCronMinute != nil {
		_, _ = h.db.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "syncCronMinute"=? WHERE "id"='global'`, h.driver), *input.SyncCronMinute)
	}
	if input.BackupCronHour != nil {
		_, _ = h.db.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "backupCronHour"=? WHERE "id"='global'`, h.driver), *input.BackupCronHour)
	}
	if input.BackupCronMinute != nil {
		_, _ = h.db.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "backupCronMinute"=? WHERE "id"='global'`, h.driver), *input.BackupCronMinute)
	}
	if input.DefaultLocale != nil {
		_, _ = h.db.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "defaultLocale"=? WHERE "id"='global'`, h.driver), *input.DefaultLocale)
	}
	if input.TimeFormat != nil {
		_, _ = h.db.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "timeFormat"=? WHERE "id"='global'`, h.driver), *input.TimeFormat)
	}
	if input.WrappedVisible != nil {
		val := 0
		if *input.WrappedVisible {
			val = 1
		}
		_, _ = h.db.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "wrappedVisible"=? WHERE "id"='global'`, h.driver), val)
	}
	if input.WrappedPeriodEnabled != nil {
		val := 0
		if *input.WrappedPeriodEnabled {
			val = 1
		}
		_, _ = h.db.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "wrappedPeriodEnabled"=? WHERE "id"='global'`, h.driver), val)
	}
	if input.WrappedStartMonth != nil {
		_, _ = h.db.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "wrappedStartMonth"=? WHERE "id"='global'`, h.driver), *input.WrappedStartMonth)
	}
	if input.WrappedStartDay != nil {
		_, _ = h.db.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "wrappedStartDay"=? WHERE "id"='global'`, h.driver), *input.WrappedStartDay)
	}
	if input.WrappedEndMonth != nil {
		_, _ = h.db.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "wrappedEndMonth"=? WHERE "id"='global'`, h.driver), *input.WrappedEndMonth)
	}
	if input.WrappedEndDay != nil {
		_, _ = h.db.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "wrappedEndDay"=? WHERE "id"='global'`, h.driver), *input.WrappedEndDay)
	}
	if input.AuthRememberThirtyDaysEnabled != nil {
		val := 0
		if *input.AuthRememberThirtyDaysEnabled {
			val = 1
		}
		_, _ = h.db.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "authRememberThirtyDaysEnabled"=? WHERE "id"='global'`, h.driver), val)
	}
	if input.ResolutionThresholds != nil || input.SchedulerIntervals != nil {
		var curRes sql.NullString
		_ = h.db.QueryRowContext(r.Context(), `SELECT "resolutionThresholds" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&curRes)
		m := map[string]any{}
		if curRes.Valid && curRes.String != "" {
			_ = json.Unmarshal([]byte(curRes.String), &m)
		}
		if rtMap, ok := input.ResolutionThresholds.(map[string]any); ok {
			for k, v := range rtMap {
				m[k] = v
			}
		}
		if input.SchedulerIntervals != nil {
			m["schedulerIntervals"] = input.SchedulerIntervals
		}
		b, _ := json.Marshal(m)
		_, _ = h.db.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "resolutionThresholds"=? WHERE "id"='global'`, h.driver), string(b))
	}
	if input.PluginTelemetrySettings != nil {
		b, _ := json.Marshal(input.PluginTelemetrySettings)
		_, _ = h.db.ExecContext(r.Context(), database.Bind(`UPDATE "GlobalSettings" SET "pluginTelemetrySettings"=? WHERE "id"='global'`, h.driver), string(b))
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
		ID                string `json:"id"`
		Name              string `json:"name"`
		URL               string `json:"url"`
		ApiKey            string `json:"apiKey"`
		JellyfinApiKey    string `json:"jellyfinApiKey"`
		AllowAuthFallback *bool  `json:"allowAuthFallback"`
		IsActive          *bool  `json:"isActive"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16384)
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil || strings.TrimSpace(input.URL) == "" {
		jsonError(w, 400, "URL requise.")
		return
	}

	urlClean := strings.TrimRight(strings.TrimSpace(input.URL), "/")
	if _, err := security.ValidateSafeServerURL(urlClean); err != nil {
		jsonError(w, 400, "Jellyfin URL cannot target cloud metadata services.")
		return
	}

	rawApiKey := first(input.ApiKey, input.JellyfinApiKey)
	name := strings.TrimSpace(input.Name)
	if name == "" {
		name = "Jellyfin"
	}

	activeInt := 1
	if input.IsActive != nil && !*input.IsActive {
		activeInt = 0
	}

	allowFallbackInt := 1
	if input.AllowAuthFallback != nil && !*input.AllowAuthFallback {
		allowFallbackInt = 0
	}

	if input.ID == "" {
		idBytes := make([]byte, 16)
		rand.Read(idBytes)
		input.ID = hex.EncodeToString(idBytes)
		_, err := h.db.ExecContext(r.Context(), database.Bind(`INSERT INTO "Server" ("id","jellyfinServerId","name","url","jellyfinApiKey","allowAuthFallback","isActive") VALUES (?,?,?,?,?,?,?)`, h.driver), input.ID, input.ID, name, urlClean, rawApiKey, allowFallbackInt, activeInt)
		if err != nil {
			jsonError(w, 500, "Échec de création du serveur.")
			return
		}
	} else {
		_, err := h.db.ExecContext(r.Context(), database.Bind(`UPDATE "Server" SET "name"=?, "url"=?, "jellyfinApiKey"=?, "allowAuthFallback"=?, "isActive"=? WHERE "id"=?`, h.driver), name, urlClean, rawApiKey, allowFallbackInt, activeInt, input.ID)
		if err != nil {
			jsonError(w, 500, "Échec de mise à jour du serveur.")
			return
		}
	}

	jsonResponse(w, 200, map[string]any{
		"id": input.ID,
		"ok": true,
		"server": map[string]any{
			"id":                input.ID,
			"jellyfinServerId":  input.ID,
			"name":              name,
			"url":               urlClean,
			"allowAuthFallback": allowFallbackInt == 1,
			"isActive":          activeInt == 1,
		},
	})
}

func (h *Handler) updateServer(w http.ResponseWriter, r *http.Request) {
	var input struct {
		ID                string  `json:"id"`
		Name              *string `json:"name"`
		URL               *string `json:"url"`
		ApiKey            *string `json:"apiKey"`
		JellyfinApiKey    *string `json:"jellyfinApiKey"`
		AllowAuthFallback *bool   `json:"allowAuthFallback"`
		IsActive          *bool   `json:"isActive"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16384)
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil || strings.TrimSpace(input.ID) == "" {
		jsonError(w, 400, "Identifiant requis.")
		return
	}

	var curName, curURL, curKey string
	var curFallback, curActive int
	err := h.db.QueryRowContext(r.Context(), database.Bind(`SELECT "name","url",COALESCE("jellyfinApiKey",''),"allowAuthFallback","isActive" FROM "Server" WHERE "id"=?`, h.driver), input.ID).Scan(&curName, &curURL, &curKey, &curFallback, &curActive)
	if err != nil {
		jsonError(w, 404, "Serveur introuvable.")
		return
	}

	nextName := curName
	if input.Name != nil && strings.TrimSpace(*input.Name) != "" {
		nextName = strings.TrimSpace(*input.Name)
	}

	nextURL := curURL
	if input.URL != nil {
		cleaned := strings.TrimRight(strings.TrimSpace(*input.URL), "/")
		if cleaned == "" {
			jsonError(w, 400, "URL requise.")
			return
		}
		if _, err := security.ValidateSafeServerURL(cleaned); err != nil {
			jsonError(w, 400, "Jellyfin URL cannot target cloud metadata services.")
			return
		}
		nextURL = cleaned
	}

	nextKey := curKey
	effectiveApiKey := input.ApiKey
	if effectiveApiKey == nil {
		effectiveApiKey = input.JellyfinApiKey
	}
	if effectiveApiKey != nil && strings.TrimSpace(*effectiveApiKey) != "" {
		nextKey = strings.TrimSpace(*effectiveApiKey)
	}

	nextFallback := curFallback
	if input.AllowAuthFallback != nil {
		if *input.AllowAuthFallback {
			nextFallback = 1
		} else {
			nextFallback = 0
		}
	}

	nextActive := curActive
	if input.IsActive != nil {
		if *input.IsActive {
			nextActive = 1
		} else {
			nextActive = 0
		}
	}

	_, err = h.db.ExecContext(r.Context(), database.Bind(`UPDATE "Server" SET "name"=?, "url"=?, "jellyfinApiKey"=?, "allowAuthFallback"=?, "isActive"=? WHERE "id"=?`, h.driver), nextName, nextURL, nextKey, nextFallback, nextActive, input.ID)
	if err != nil {
		jsonError(w, 500, "Impossible de mettre à jour le serveur.")
		return
	}

	jsonResponse(w, 200, map[string]any{
		"ok": true,
		"server": map[string]any{
			"id":                input.ID,
			"name":              nextName,
			"url":               nextURL,
			"allowAuthFallback": nextFallback == 1,
			"isActive":          nextActive == 1,
		},
	})
}

func (h *Handler) deleteServer(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		var body struct {
			ID string `json:"id"`
		}
		_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body)
		id = strings.TrimSpace(body.ID)
	}
	if id == "" {
		jsonError(w, 400, "Identifiant requis.")
		return
	}
	_, err := h.db.ExecContext(r.Context(), database.Bind(`DELETE FROM "Server" WHERE "id"=?`, h.driver), id)
	if err != nil {
		jsonError(w, 500, "Impossible de supprimer le serveur.")
		return
	}
	jsonResponse(w, 200, map[string]any{"ok": true, "server": map[string]any{"id": id}})
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
	allowedHostsEnv := strings.TrimSpace(os.Getenv("ALLOWED_JELLYFIN_HOSTS"))
	if allowedHostsEnv == "" {
		if jfURL := strings.TrimSpace(os.Getenv("JELLYFIN_URL")); jfURL != "" {
			if u, err := url.Parse(jfURL); err == nil && u.Hostname() != "" {
				allowedHostsEnv = u.Hostname()
			}
		}
	}
	if allowedHostsEnv == "" {
		jsonError(w, 503, "Webhook disabled: ALLOWED_JELLYFIN_HOSTS is empty.")
		return
	}

	ct := strings.ToLower(r.Header.Get("Content-Type"))
	if !strings.Contains(ct, "application/json") {
		jsonError(w, 415, "Unsupported content type. Expected application/json.")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	rawBytes, err := io.ReadAll(r.Body)
	if err != nil {
		jsonError(w, 413, "Payload too large.")
		return
	}

	var payload map[string]any
	if err := json.Unmarshal(rawBytes, &payload); err != nil || payload == nil {
		jsonError(w, 400, "Invalid JSON payload.")
		return
	}

	serverUrlCandidate := resolveWebhookServerURL(payload)
	if serverUrlCandidate == "" {
		jsonError(w, 403, "Forbidden webhook source: missing or invalid payload server URL.")
		return
	}

	parsedU, err := url.Parse(serverUrlCandidate)
	if err != nil || parsedU.Hostname() == "" {
		jsonError(w, 403, "Forbidden webhook source: missing or invalid payload server URL.")
		return
	}

	host := strings.ToLower(parsedU.Hostname())
	allowed := false
	for _, entry := range strings.Split(allowedHostsEnv, ",") {
		if strings.ToLower(strings.TrimSpace(entry)) == host {
			allowed = true
			break
		}
	}
	if !allowed {
		jsonError(w, 403, "Forbidden webhook source host.")
		return
	}

	if h.pluginHandler != nil {
		req := r.Clone(r.Context())
		req.Body = io.NopCloser(strings.NewReader(string(rawBytes)))
		req.ContentLength = int64(len(rawBytes))
		h.pluginHandler.ServeHTTP(w, req)
		return
	}

	jsonResponse(w, 200, map[string]string{"status": "received"})
}

func resolveWebhookServerURL(p map[string]any) string {
	keys := []string{"serverUrl", "ServerUrl", "url", "Url"}
	for _, k := range keys {
		if val, ok := p[k].(string); ok && strings.TrimSpace(val) != "" {
			return strings.TrimSpace(val)
		}
	}
	for _, parentKey := range []string{"server", "Server"} {
		if obj, ok := p[parentKey].(map[string]any); ok {
			for _, k := range keys {
				if val, ok := obj[k].(string); ok && strings.TrimSpace(val) != "" {
					return strings.TrimSpace(val)
				}
			}
		}
	}
	return ""
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
	var body struct {
		MergeWindowMinutes int `json:"mergeWindowMinutes"`
	}
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body)
	mergeWindow := 60
	if body.MergeWindowMinutes > 0 {
		mergeWindow = body.MergeWindowMinutes
	}

	merged, pruned, err := cleanup.ConsolidatePlaybackHistory(r.Context(), h.db, h.driver, mergeWindow)
	if err != nil {
		jsonError(w, 500, "Échec de consolidation.")
		return
	}
	resMap := map[string]any{"clustersMerged": merged, "sessionsPruned": pruned}
	jsonResponse(w, 200, map[string]any{
		"success":        true,
		"message":        fmt.Sprintf("Consolidation terminée : %d groupe(s) fusionné(s), %d micro-coupure(s) supprimée(s).", merged, pruned),
		"result":         resMap,
		"clustersMerged": merged,
		"sessionsPruned": pruned,
	})
}

func (h *Handler) adminIntegrityCleanup(w http.ResponseWriter, r *http.Request) {
	delStreams, closedSessions, err := cleanup.CleanupOrphanedSessions(r.Context(), h.db, h.driver, 600)
	if err != nil {
		jsonError(w, 500, "Échec du nettoyage.")
		return
	}
	merged, pruned, _ := cleanup.ConsolidatePlaybackHistory(r.Context(), h.db, h.driver, 60)
	jsonResponse(w, 200, map[string]any{
		"success":             true,
		"message":             "Integrity check, stale sessions cleanup, and playback history consolidation completed successfully.",
		"staleStreamsDeleted": delStreams,
		"sessionsClosed":      closedSessions,
		"consolidation": map[string]any{
			"clustersMerged": merged,
			"sessionsPruned": pruned,
		},
		"clustersMerged": merged,
		"sessionsPruned": pruned,
	})
}

func (h *Handler) sync(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Mode       string `json:"mode"`
		RecentOnly bool   `json:"recentOnly"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	_ = json.NewDecoder(r.Body).Decode(&input)

	recentOnly := input.Mode == "recent" || input.RecentOnly

	if !sameOrigin(r) {
		jsonError(w, 403, "Origine refusée.")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Minute)
	defer cancel()
	result, err := jellyfin.SyncAllServers(ctx, h.db, h.driver, recentOnly)
	if err != nil {
		jsonError(w, 502, fmt.Sprintf("La synchronisation Jellyfin a échoué: %v", err))
		return
	}
	jsonResponse(w, 200, map[string]any{
		"status":  "success",
		"success": true,
		"message": fmt.Sprintf("Synchronisation terminée (%d utilisateurs, %d médias)", result.Users, result.Media),
		"users":   result.Users,
		"media":   result.Media,
	})
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
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		referer := strings.TrimSpace(r.Header.Get("Referer"))
		if referer != "" {
			if u, err := url.Parse(referer); err == nil {
				origin = fmt.Sprintf("%s://%s", u.Scheme, u.Host)
			}
		}
	}
	if origin == "" {
		if os.Getenv("ALLOW_MISSING_ORIGIN_FOR_MUTATIONS") == "1" || os.Getenv("ALLOW_MISSING_ORIGIN_FOR_MUTATIONS") == "true" {
			return true
		}
		return false
	}

	trusted := map[string]struct{}{}
	if host := r.Host; host != "" {
		trusted["http://"+strings.ToLower(host)] = struct{}{}
		trusted["https://"+strings.ToLower(host)] = struct{}{}
	}
	if xfh := strings.TrimSpace(r.Header.Get("X-Forwarded-Host")); xfh != "" {
		trusted["http://"+strings.ToLower(xfh)] = struct{}{}
		trusted["https://"+strings.ToLower(xfh)] = struct{}{}
	}
	for _, envKey := range []string{"JELLYTRACK_URL", "AUTH_URL", "AUTH_TRUSTED_ORIGIN", "AUTH_TRUSTED_ORIGINS"} {
		val := os.Getenv(envKey)
		if val == "" {
			continue
		}
		for _, part := range strings.Split(val, ",") {
			part = strings.TrimRight(strings.TrimSpace(part), "/")
			if part != "" {
				trusted[strings.ToLower(part)] = struct{}{}
			}
		}
	}

	_, ok := trusted[strings.ToLower(strings.TrimRight(origin, "/"))]
	return ok
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

func (h *Handler) mediaCollections(w http.ResponseWriter, r *http.Request) {
	excluded := excludedLibrariesClause(h.driver, "m")
	rows, err := h.db.QueryContext(r.Context(), `SELECT COALESCE(m."libraryName", 'Uncategorized') AS "lib", m."type", COUNT(*), COALESCE(SUM(m."durationMs"), 0) FROM "Media" m WHERE `+excluded+` GROUP BY "lib", m."type" ORDER BY "lib", m."type"`)
	if err != nil {
		jsonError(w, 500, "Impossible de charger les collections.")
		return
	}
	defer rows.Close()

	type libType struct {
		Type       string `json:"type"`
		Count      int64  `json:"count"`
		DurationMs int64  `json:"durationMs"`
	}
	libMap := make(map[string]*struct {
		name       string
		types      []libType
		totalItems int64
		totalMs    int64
	})
	var order []string

	for rows.Next() {
		var lib, kind string
		var count, dur int64
		if rows.Scan(&lib, &kind, &count, &dur) == nil {
			entry, ok := libMap[lib]
			if !ok {
				entry = &struct {
					name       string
					types      []libType
					totalItems int64
					totalMs    int64
				}{name: lib}
				libMap[lib] = entry
				order = append(order, lib)
			}
			entry.types = append(entry.types, libType{Type: kind, Count: count, DurationMs: dur})
			entry.totalItems += count
			entry.totalMs += dur
		}
	}

	result := []map[string]any{}
	for _, name := range order {
		item := libMap[name]
		result = append(result, map[string]any{
			"name":       item.name,
			"types":      item.types,
			"totalItems": item.totalItems,
			"totalHours": float64(item.totalMs) / 3600000.0,
		})
	}

	jsonResponse(w, 200, map[string]any{"collections": result})
}

func (h *Handler) newsletterData(w http.ResponseWriter, r *http.Request) {
	today := time.Now().UTC()
	thirtyDaysAgo := today.AddDate(0, 0, -30).Format(time.RFC3339Nano)

	var totalDuration, totalPlays int64
	_ = h.db.QueryRowContext(r.Context(), database.Bind(`SELECT COALESCE(SUM("durationWatched"),0), COUNT(*) FROM "PlaybackHistory" WHERE "startedAt" >= ?`, h.driver), thirtyDaysAgo).Scan(&totalDuration, &totalPlays)

	rowsM, errM := h.db.QueryContext(r.Context(), database.Bind(`SELECT m."title", m."type", m."jellyfinMediaId", COALESCE(SUM(p."durationWatched"),0), COUNT(p."id") FROM "PlaybackHistory" p JOIN "Media" m ON m."id"=p."mediaId" WHERE p."startedAt" >= ? GROUP BY m."id", m."title", m."type", m."jellyfinMediaId" ORDER BY SUM(p."durationWatched") DESC LIMIT 5`, h.driver), thirtyDaysAgo)
	topMedia := []map[string]any{}
	if errM == nil {
		for rowsM.Next() {
			var title, kind, jid string
			var dur, plays int64
			if rowsM.Scan(&title, &kind, &jid, &dur, &plays) == nil {
				topMedia = append(topMedia, map[string]any{
					"title": title, "type": kind, "jellyfinMediaId": jid,
					"hours": float64(dur) / 3600.0, "plays": plays,
				})
			}
		}
		rowsM.Close()
	}

	rowsU, errU := h.db.QueryContext(r.Context(), database.Bind(`SELECT u."username", COALESCE(SUM(p."durationWatched"),0), COUNT(p."id") FROM "PlaybackHistory" p JOIN "User" u ON u."id"=p."userId" WHERE p."startedAt" >= ? GROUP BY u."username" ORDER BY SUM(p."durationWatched") DESC LIMIT 5`, h.driver), thirtyDaysAgo)
	topUsers := []map[string]any{}
	if errU == nil {
		for rowsU.Next() {
			var uname string
			var dur, plays int64
			if rowsU.Scan(&uname, &dur, &plays) == nil {
				topUsers = append(topUsers, map[string]any{
					"username": uname, "hours": float64(dur) / 3600.0, "plays": plays,
				})
			}
		}
		rowsU.Close()
	}

	dateRange := fmt.Sprintf("%s - %s", today.AddDate(0, 0, -30).Format("02 Jan 2006"), today.Format("02 Jan 2006"))

	jsonResponse(w, 200, map[string]any{
		"totalPlays":    totalPlays,
		"totalDuration": totalDuration,
		"totalHours":    float64(totalDuration) / 3600.0,
		"topMedia":      topMedia,
		"topUsers":      topUsers,
		"dateRange":     dateRange,
	})
}

func (h *Handler) serverCompare(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.QueryContext(r.Context(), `SELECT "id", "name", "url", "isActive" FROM "Server" ORDER BY "name" ASC`)
	if err != nil {
		jsonError(w, 500, "Impossible de charger les serveurs.")
		return
	}
	defer rows.Close()

	servers := []map[string]any{}
	for rows.Next() {
		var id, name, url string
		var active int
		if rows.Scan(&id, &name, &url, &active) == nil {
			var mediaCount, userCount, playsCount, streamCount int64
			_ = h.db.QueryRowContext(r.Context(), database.Bind(`SELECT COUNT(*) FROM "Media" WHERE "serverId"=?`, h.driver), id).Scan(&mediaCount)
			_ = h.db.QueryRowContext(r.Context(), database.Bind(`SELECT COUNT(*) FROM "User" WHERE "serverId"=?`, h.driver), id).Scan(&userCount)
			_ = h.db.QueryRowContext(r.Context(), database.Bind(`SELECT COUNT(*) FROM "PlaybackHistory" WHERE "serverId"=?`, h.driver), id).Scan(&playsCount)
			_ = h.db.QueryRowContext(r.Context(), database.Bind(`SELECT COUNT(*) FROM "ActiveStream" WHERE "serverId"=?`, h.driver), id).Scan(&streamCount)

			servers = append(servers, map[string]any{
				"id":            id,
				"name":          name,
				"url":           url,
				"isActive":      active == 1,
				"mediaCount":    mediaCount,
				"userCount":     userCount,
				"playsCount":    playsCount,
				"activeStreams": streamCount,
			})
		}
	}

	jsonResponse(w, 200, map[string]any{"servers": servers})
}

func (h *Handler) userWrapped(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		jsonError(w, 400, "Identifiant requis.")
		return
	}

	principal, ok := auth.PrincipalFromContext(r.Context())
	if !ok {
		jsonError(w, 401, "Authentification requise.")
		return
	}

	if id == "me" || id == "@me" {
		if principal.JellyfinUserID != "" {
			id = principal.JellyfinUserID
		} else {
			id = principal.Username
		}
	}

	// Verify permissions
	isAdmin := principal.IsAdmin()
	if !isAdmin {
		identity, err := auth.ResolveAccount(r.Context(), h.db, h.driver, principal)
		if err != nil || !identity.Matches(strings.TrimSpace(r.PathValue("id"))) {
			jsonError(w, 403, "Accès refusé.")
			return
		}
		id = identity.ID
		var wrapVis, wrapPer int
		var wrapSM, wrapSD, wrapEM, wrapED int
		err = h.db.QueryRowContext(r.Context(), `SELECT "wrappedVisible","wrappedPeriodEnabled","wrappedStartMonth","wrappedStartDay","wrappedEndMonth","wrappedEndDay" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&wrapVis, &wrapPer, &wrapSM, &wrapSD, &wrapEM, &wrapED)
		if err == nil {
			if wrapVis == 0 {
				jsonError(w, 404, "Le Wrapped n'est pas activé.")
				return
			}
			if wrapPer == 1 {
				now := time.Now().UTC()
				start := time.Date(now.Year(), time.Month(wrapSM), wrapSD, 0, 0, 0, 0, time.UTC)
				endYear := now.Year()
				if wrapEM < wrapSM {
					endYear++
				}
				end := time.Date(endYear, time.Month(wrapEM), wrapED, 23, 59, 59, 0, time.UTC)
				if now.Before(start) || now.After(end) {
					jsonError(w, 404, "Le Wrapped n'est pas disponible actuellement.")
					return
				}
			}
		}
	}

	var uid, uname, jid string
	var accountServerID string
	userQuery := `SELECT "id","username","jellyfinUserId","serverId" FROM "User" WHERE `
	userArgs := []any{id, id, id}
	if !isAdmin {
		userQuery += `"id"=?`
		userArgs = []any{id}
	} else {
		userQuery += `"id"=? OR "jellyfinUserId"=? OR "username"=? LIMIT 1`
	}
	err := h.db.QueryRowContext(r.Context(), database.Bind(userQuery, h.driver), userArgs...).Scan(&uid, &uname, &jid, &accountServerID)
	if err != nil {
		jsonError(w, 404, "Utilisateur introuvable.")
		return
	}

	targetYear := time.Now().UTC().Year()
	if yStr := r.URL.Query().Get("year"); yStr != "" {
		if y, errY := strconv.Atoi(yStr); errY == nil && y >= 2000 && y <= 2100 {
			targetYear = y
		}
	}

	startDate := fmt.Sprintf("%04d-01-01T00:00:00Z", targetYear)
	endDate := fmt.Sprintf("%04d-01-01T00:00:00Z", targetYear+1)

	historyQ := `SELECT p."durationWatched", p."startedAt", p."clientName", m."id", m."jellyfinMediaId", m."title", m."type", m."genres", m."artist" FROM "PlaybackHistory" p JOIN "Media" m ON m."id"=p."mediaId" WHERE p."userId"=? AND p."serverId"=? AND p."startedAt" >= ? AND p."startedAt" < ? AND p."durationWatched" >= 10`
	rows, err := h.db.QueryContext(r.Context(), database.Bind(historyQ, h.driver), uid, accountServerID, startDate, endDate)
	if err != nil {
		jsonError(w, 500, "Impossible de charger les données.")
		return
	}
	defer rows.Close()

	var totalSeconds int64
	var totalPlays int64

	moviesMap := make(map[string]*struct {
		title   string
		jid     string
		seconds int64
		plays   int64
	})
	seriesMap := make(map[string]*struct {
		title   string
		seconds int64
		plays   int64
	})
	musicMap := make(map[string]*struct {
		title   string
		artist  string
		seconds int64
		plays   int64
	})
	genreMap := make(map[string]int64)
	clientMap := make(map[string]int64)
	dayCounts := make([]int64, 7)
	hourCounts := make([]int64, 24)
	monthCounts := make([]int64, 12)

	for rows.Next() {
		var dur int64
		var started string
		var client, mid, mJid, title, mType, genresStr, artistStr sql.NullString
		if rows.Scan(&dur, &started, &client, &mid, &mJid, &title, &mType, &genresStr, &artistStr) == nil {
			totalSeconds += dur
			totalPlays++

			t, errT := time.Parse(time.RFC3339Nano, started)
			if errT != nil {
				t, errT = time.Parse(time.RFC3339, started)
			}
			if errT == nil {
				dayCounts[int(t.Weekday())]++
				hourCounts[t.Hour()]++
				monthCounts[int(t.Month())-1]++
			}

			cName := client.String
			if cName == "" {
				cName = "Web"
			}
			clientMap[cName]++

			for _, g := range parseStringList(genresStr.String) {
				genreMap[g]++
			}

			tName := title.String
			kind := mType.String
			switch kind {
			case "Movie":
				item, ok := moviesMap[tName]
				if !ok {
					item = &struct {
						title   string
						jid     string
						seconds int64
						plays   int64
					}{title: tName, jid: mJid.String}
					moviesMap[tName] = item
				}
				item.seconds += dur
				item.plays++
			case "Episode", "Series":
				item, ok := seriesMap[tName]
				if !ok {
					item = &struct {
						title   string
						seconds int64
						plays   int64
					}{title: tName}
					seriesMap[tName] = item
				}
				item.seconds += dur
				item.plays++
			case "Audio", "Track":
				item, ok := musicMap[tName]
				if !ok {
					item = &struct {
						title   string
						artist  string
						seconds int64
						plays   int64
					}{title: tName, artist: artistStr.String}
					musicMap[tName] = item
				}
				item.seconds += dur
				item.plays++
			}
		}
	}

	type mediaRank struct {
		Title      string  `json:"title"`
		JellyfinId string  `json:"jellyfinId,omitempty"`
		Artist     string  `json:"artist,omitempty"`
		Seconds    int64   `json:"seconds"`
		Hours      float64 `json:"hours"`
		Plays      int64   `json:"plays"`
	}

	var topMovies []mediaRank
	for _, m := range moviesMap {
		topMovies = append(topMovies, mediaRank{Title: m.title, JellyfinId: m.jid, Seconds: m.seconds, Hours: float64(m.seconds) / 3600.0, Plays: m.plays})
	}
	sort.Slice(topMovies, func(i, j int) bool { return topMovies[i].Seconds > topMovies[j].Seconds })
	if len(topMovies) > 5 {
		topMovies = topMovies[:5]
	}

	var topSeries []mediaRank
	for _, s := range seriesMap {
		topSeries = append(topSeries, mediaRank{Title: s.title, Seconds: s.seconds, Hours: float64(s.seconds) / 3600.0, Plays: s.plays})
	}
	sort.Slice(topSeries, func(i, j int) bool { return topSeries[i].Seconds > topSeries[j].Seconds })
	if len(topSeries) > 5 {
		topSeries = topSeries[:5]
	}

	var topMusic []mediaRank
	for _, mu := range musicMap {
		topMusic = append(topMusic, mediaRank{Title: mu.title, Artist: mu.artist, Seconds: mu.seconds, Hours: float64(mu.seconds) / 3600.0, Plays: mu.plays})
	}
	sort.Slice(topMusic, func(i, j int) bool { return topMusic[i].Seconds > topMusic[j].Seconds })
	if len(topMusic) > 5 {
		topMusic = topMusic[:5]
	}

	type nameCount struct {
		Name  string `json:"name"`
		Count int64  `json:"count"`
	}
	var topGenres []nameCount
	for g, c := range genreMap {
		topGenres = append(topGenres, nameCount{Name: g, Count: c})
	}
	sort.Slice(topGenres, func(i, j int) bool { return topGenres[i].Count > topGenres[j].Count })
	if len(topGenres) > 5 {
		topGenres = topGenres[:5]
	}

	var topClients []nameCount
	for cl, c := range clientMap {
		topClients = append(topClients, nameCount{Name: cl, Count: c})
	}
	sort.Slice(topClients, func(i, j int) bool { return topClients[i].Count > topClients[j].Count })
	if len(topClients) > 5 {
		topClients = topClients[:5]
	}

	var peakDay, peakHour, peakMonth int
	var maxD, maxH, maxM int64
	for d, c := range dayCounts {
		if c > maxD {
			maxD = c
			peakDay = d
		}
	}
	for h, c := range hourCounts {
		if c > maxH {
			maxH = c
			peakHour = h
		}
	}
	for m, c := range monthCounts {
		if c > maxM {
			maxM = c
			peakMonth = m
		}
	}

	jsonResponse(w, 200, map[string]any{
		"userId":         uid,
		"username":       uname,
		"jellyfinUserId": jid,
		"year":           targetYear,
		"totalSeconds":   totalSeconds,
		"totalHours":     float64(totalSeconds) / 3600.0,
		"totalPlays":     totalPlays,
		"topMovies":      topMovies,
		"topSeries":      topSeries,
		"topMusic":       topMusic,
		"topGenres":      topGenres,
		"topClients":     topClients,
		"dayCounts":      dayCounts,
		"hourCounts":     hourCounts,
		"monthCounts":    monthCounts,
		"peakDay":        peakDay,
		"peakHour":       peakHour,
		"peakMonth":      peakMonth,
	})
}
