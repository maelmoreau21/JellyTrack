package api

import (
	"database/sql"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/internal/history"
)

type wrappedRank struct {
	Title      string  `json:"title"`
	Name       string  `json:"name"`
	JellyfinID string  `json:"jellyfinId,omitempty"`
	Artist     string  `json:"artist,omitempty"`
	Seconds    int64   `json:"seconds"`
	Hours      float64 `json:"hours"`
	Plays      int64   `json:"plays"`
	Count      int64   `json:"count"`
}

func rankWrapped(items map[string]*wrappedRank) []wrappedRank {
	out := make([]wrappedRank, 0, len(items))
	for _, value := range items {
		value.Hours = float64(value.Seconds) / 3600
		out = append(out, *value)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Seconds == out[j].Seconds {
			return out[i].Title < out[j].Title
		}
		return out[i].Seconds > out[j].Seconds
	})
	if len(out) > 5 {
		out = out[:5]
	}
	return out
}

func wrappedYear(r *http.Request) (int, error) {
	year := time.Now().UTC().Year()
	if raw := r.URL.Query().Get("year"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 2000 || parsed > 2100 {
			return 0, strconv.ErrSyntax
		}
		year = parsed
	}
	return year, nil
}

func (h *Handler) recoveredNewsletter(w http.ResponseWriter, r *http.Request) {
	now := time.Now().UTC()
	from := now.AddDate(0, 0, -30).Format(time.RFC3339Nano)
	var duration, plays int64
	if err := h.db.QueryRowContext(r.Context(), database.Bind(`SELECT COALESCE(SUM(p."durationWatched"),0),COUNT(*) FROM "PlaybackHistory" p WHERE p."startedAt">=? AND `+history.ZappingClause("p"), h.driver), from).Scan(&duration, &plays); err != nil {
		jsonError(w, 500, "Impossible de charger la newsletter.")
		return
	}
	media, err := h.recoveredRows(r, `SELECT m."id",m."serverId",m."title",m."type",m."jellyfinMediaId",SUM(p."durationWatched")/3600.0 AS "hours",COUNT(*) AS "plays" FROM "PlaybackHistory" p JOIN "Media" m ON m."id"=p."mediaId" AND m."serverId"=p."serverId" WHERE p."startedAt">=? AND `+history.ZappingClause("p")+` GROUP BY m."id",m."serverId",m."title",m."type",m."jellyfinMediaId" ORDER BY SUM(p."durationWatched") DESC,m."id" LIMIT 5`, from)
	if err != nil {
		jsonError(w, 500, "Impossible de charger les médias de la newsletter.")
		return
	}
	users, err := h.recoveredRows(r, `SELECT u."id",u."serverId",u."username",u."jellyfinUserId",SUM(p."durationWatched")/3600.0 AS "hours",COUNT(*) AS "plays" FROM "PlaybackHistory" p JOIN "User" u ON u."id"=p."userId" AND u."serverId"=p."serverId" WHERE p."startedAt">=? AND `+history.ZappingClause("p")+` GROUP BY u."id",u."serverId",u."username",u."jellyfinUserId" ORDER BY SUM(p."durationWatched") DESC,u."id" LIMIT 5`, from)
	if err != nil {
		jsonError(w, 500, "Impossible de charger les spectateurs de la newsletter.")
		return
	}
	jsonResponse(w, 200, map[string]any{"totalPlays": plays, "totalDuration": duration, "totalHours": float64(duration) / 3600, "topMedia": media, "topUsers": users, "startDate": from, "endDate": now.Format(time.RFC3339), "dateRange": now.AddDate(0, 0, -30).Format("02 Jan 2006") + " - " + now.Format("02 Jan 2006")})
}

// Resolve parent entities within the same server. Album/season IDs can collide
// across Jellyfin installations; rankings must never join by ID alone.
func (h *Handler) recoveredWrapped(w http.ResponseWriter, r *http.Request, uid, username, jid, serverID string) {
	year, err := wrappedYear(r)
	if err != nil {
		jsonError(w, 400, "Année invalide.")
		return
	}
	filter := r.URL.Query().Get("type")
	if filter != "" && filter != "general" && filter != "Movies" && filter != "TV" && filter != "Music" && filter != "Books" {
		jsonError(w, 400, "Catégorie invalide.")
		return
	}
	query := `SELECT p."durationWatched",p."startedAt",p."clientName",p."deviceName",m."id",m."jellyfinMediaId",m."title",m."type",m."genres",m."artist",parent."id",parent."title",parent."type",grand."id",grand."title",grand."type"
 FROM "PlaybackHistory" p JOIN "Media" m ON m."id"=p."mediaId"
 LEFT JOIN "Media" parent ON parent."id"=COALESCE((SELECT pm."id" FROM "Media" pm WHERE pm."serverId"=m."serverId" AND pm."id"=m."parentId"),(SELECT pm."id" FROM "Media" pm WHERE pm."serverId"=m."serverId" AND pm."jellyfinMediaId"=m."parentId"))
 LEFT JOIN "Media" grand ON grand."id"=COALESCE((SELECT gm."id" FROM "Media" gm WHERE gm."serverId"=parent."serverId" AND gm."id"=parent."parentId"),(SELECT gm."id" FROM "Media" gm WHERE gm."serverId"=parent."serverId" AND gm."jellyfinMediaId"=parent."parentId"))
 WHERE p."userId"=? AND p."serverId"=? AND p."startedAt">=? AND p."startedAt"<? AND ` + history.ZappingClause("p") + ` AND ` + excludedLibrariesClause(h.driver, "m")
	rows, err := h.db.QueryContext(r.Context(), database.Bind(query, h.driver), uid, serverID, time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC).Format(time.RFC3339), time.Date(year+1, 1, 1, 0, 0, 0, 0, time.UTC).Format(time.RFC3339))
	if err != nil {
		jsonError(w, 500, "Impossible de charger le Wrapped.")
		return
	}
	tops := map[string]map[string]*wrappedRank{}
	for _, key := range []string{"media", "movies", "series", "music", "books", "artists", "albums", "genres", "clients", "devices"} {
		tops[key] = map[string]*wrappedRank{}
	}
	add := func(group, key, title, jellyfinID, artist string, seconds int64) {
		if key == "" {
			return
		}
		item := tops[group][key]
		if item == nil {
			item = &wrappedRank{Title: title, Name: title, JellyfinID: jellyfinID, Artist: artist}
			tops[group][key] = item
		}
		item.Seconds += seconds
		item.Plays++
		item.Count++
	}
	var totalSeconds, totalPlays int64
	days := make([]int64, 7)
	hours := make([]int64, 24)
	months := make([]int64, 12)
	monthSeconds := make([]int64, 12)
	categorySeconds := map[string]int64{"movies": 0, "series": 0, "music": 0, "books": 0}
	for rows.Next() {
		var duration int64
		var started, id, mediaJID, title, kind string
		var client, device, genres, artist, parentID, parentTitle, parentKind, grandID, grandTitle, grandKind sql.NullString
		if err = rows.Scan(&duration, &started, &client, &device, &id, &mediaJID, &title, &kind, &genres, &artist, &parentID, &parentTitle, &parentKind, &grandID, &grandTitle, &grandKind); err != nil {
			break
		}
		category := ""
		switch kind {
		case "Movie":
			category = "movies"
		case "Episode", "Series", "Season":
			category = "series"
		case "Audio", "Track", "MusicAlbum":
			category = "music"
		case "Book", "AudioBook":
			category = "books"
		}
		want := map[string]string{"Movies": "movies", "TV": "series", "Music": "music", "Books": "books"}[filter]
		if want != "" && category != want {
			continue
		}
		totalSeconds += duration
		totalPlays++
		categorySeconds[category] += duration
		add("media", id, title, mediaJID, artist.String, duration)
		entityID, entityTitle := id, title
		if category == "series" {
			if grandKind.String == "Series" {
				entityID, entityTitle = grandID.String, grandTitle.String
			} else if parentKind.String == "Series" {
				entityID, entityTitle = parentID.String, parentTitle.String
			}
		}
		if category != "" {
			add(category, entityID, entityTitle, mediaJID, artist.String, duration)
		}
		if category == "music" {
			add("artists", artist.String, artist.String, "", artist.String, duration)
			if parentKind.String == "MusicAlbum" {
				add("albums", parentID.String, parentTitle.String, "", artist.String, duration)
			} else if kind == "MusicAlbum" {
				add("albums", id, title, mediaJID, artist.String, duration)
			}
		}
		for _, genre := range parseStringList(genres.String) {
			add("genres", genre, genre, "", "", duration)
		}
		if client.Valid && client.String != "" {
			add("clients", client.String, client.String, "", "", duration)
		}
		if device.Valid && device.String != "" {
			add("devices", device.String, device.String, "", "", duration)
		} else if client.Valid && client.String != "" {
			add("devices", client.String, client.String, "", "", duration)
		}
		date, dateErr := time.Parse(time.RFC3339Nano, started)
		if dateErr != nil {
			date, dateErr = time.Parse("2006-01-02 15:04:05", started)
		}
		if dateErr == nil {
			days[int(date.Weekday())]++
			hours[date.Hour()]++
			months[int(date.Month())-1]++
			monthSeconds[int(date.Month())-1] += duration
		}
	}
	if rows.Err() != nil {
		err = rows.Err()
	}
	rows.Close()
	if err != nil {
		jsonError(w, 500, "Données Wrapped illisibles.")
		return
	}
	availableYears := []int{}
	yearRows, err := h.db.QueryContext(r.Context(), database.Bind(`SELECT DISTINCT substr(CAST("startedAt" AS TEXT),1,4) FROM "PlaybackHistory" WHERE "userId"=? AND "serverId"=? ORDER BY 1 DESC`, h.driver), uid, serverID)
	if err != nil {
		jsonError(w, 500, "Impossible de charger les années.")
		return
	}
	for yearRows.Next() {
		var raw string
		if err = yearRows.Scan(&raw); err != nil {
			break
		}
		if y, e := strconv.Atoi(raw); e == nil {
			availableYears = append(availableYears, y)
		}
	}
	if yearRows.Err() != nil {
		err = yearRows.Err()
	}
	yearRows.Close()
	if err != nil {
		jsonError(w, 500, "Années illisibles.")
		return
	}
	// The historical selector offers every year since the first playback,
	// including years without sessions and the current year.
	oldestYear := time.Now().UTC().Year()
	for _, availableYear := range availableYears {
		if availableYear < oldestYear {
			oldestYear = availableYear
		}
	}
	availableYears = []int{}
	for availableYear := time.Now().UTC().Year(); availableYear >= oldestYear; availableYear-- {
		availableYears = append(availableYears, availableYear)
	}
	peak := func(values []int64) int {
		best := 0
		for i, v := range values {
			if v > values[best] {
				best = i
			}
		}
		return best
	}
	monthNames := strings.Split("jan,feb,mar,apr,may,jun,jul,aug,sep,oct,nov,dec", ",")
	monthlyHours := make([]map[string]any, 12)
	for i, name := range monthNames {
		monthlyHours[i] = map[string]any{"name": name, "hours": float64(monthSeconds[i]) / 3600}
	}
	categories := map[string]any{}
	for _, name := range []string{"movies", "series", "music", "books"} {
		categories[name] = map[string]any{"totalSeconds": categorySeconds[name], "totalHours": float64(categorySeconds[name]) / 3600, "topMedia": rankWrapped(tops[name])}
	}
	topDevice := "N/A"
	devices := rankWrapped(tops["devices"])
	if len(devices) > 0 {
		topDevice = devices[0].Title
	}
	jsonResponse(w, 200, map[string]any{
		"userId": uid, "username": username, "jellyfinUserId": jid, "serverId": serverID, "year": year, "filterType": filter, "availableYears": availableYears,
		"totalSeconds": totalSeconds, "totalHours": float64(totalSeconds) / 3600, "totalPlays": totalPlays,
		"topMedia": rankWrapped(tops["media"]), "topMovies": rankWrapped(tops["movies"]), "topSeries": rankWrapped(tops["series"]), "topMusic": rankWrapped(tops["music"]), "topTracks": rankWrapped(tops["music"]), "topBooks": rankWrapped(tops["books"]),
		"topArtists": rankWrapped(tops["artists"]), "topAlbums": rankWrapped(tops["albums"]), "topGenres": rankWrapped(tops["genres"]), "topClients": rankWrapped(tops["clients"]), "topDevice": topDevice, "categories": categories,
		"dayCounts": days, "hourCounts": hours, "monthCounts": months, "monthlyHours": monthlyHours, "peakDay": peak(days), "peakHour": peak(hours), "peakMonth": peak(months), "peakHourSessions": hours[peak(hours)],
	})
}
