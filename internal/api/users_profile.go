package api

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/auth"
	"github.com/maelmoreau21/jellytrack/internal/database"
)

type profileSession struct {
	id, mediaID, jellyfinMediaID, title, kind, source, method, started string
	userID, serverID                                                   string
	ended, client, device, genres                                      sql.NullString
	duration, runtime                                                  int64
	bitrate                                                            sql.NullInt64
}

// Historically administrator profiles merge accounts sharing the canonical
// display name. A standard session always keeps its authenticated server pair.
func profileScope(r *http.Request, userID, serverID string) (string, []any) {
	if p, ok := auth.PrincipalFromContext(r.Context()); ok && p.IsAdmin() {
		return `p."userId" IN (SELECT linked."id" FROM "User" linked WHERE LOWER(linked."username")=LOWER((SELECT seed."username" FROM "User" seed WHERE seed."id"=? AND seed."serverId"=?))) AND p."serverId"=(SELECT account."serverId" FROM "User" account WHERE account."id"=p."userId")`, []any{userID, serverID}
	}
	return `p."userId"=? AND p."serverId"=?`, []any{userID, serverID}
}

func profileLocation() *time.Location {
	if loc, err := time.LoadLocation(os.Getenv("TZ")); err == nil {
		return loc
	}
	return time.UTC
}

// These sections are scoped to the account/server already authorized by userDetail.
// Keep the all-session chart population distinct from meaningful-session cards.
func (h *Handler) userProfileData(r *http.Request, userID, serverID string) (map[string]any, error) {
	scope, args := profileScope(r, userID, serverID)
	order := ""
	if h.driver != "postgres" {
		order = ` ORDER BY p.rowid ASC`
	}
	rows, err := h.db.QueryContext(r.Context(), database.Bind(`SELECT p."id",p."mediaId",p."durationWatched",p."startedAt",p."endedAt",p."eventSource",p."playMethod",p."clientName",p."deviceName",p."bitrate",COALESCE(m."jellyfinMediaId",''),COALESCE(m."title",''),COALESCE(m."type",''),COALESCE(m."durationMs",0),m."genres",p."userId",p."serverId" FROM "PlaybackHistory" p LEFT JOIN "Media" m ON m."id"=p."mediaId" WHERE `+scope+order, h.driver), args...)
	if err != nil {
		return nil, err
	}
	sessions := []profileSession{}
	for rows.Next() {
		var s profileSession
		if err := rows.Scan(&s.id, &s.mediaID, &s.duration, &s.started, &s.ended, &s.source, &s.method, &s.client, &s.device, &s.bitrate, &s.jellyfinMediaID, &s.title, &s.kind, &s.runtime, &s.genres, &s.userID, &s.serverID); err != nil {
			rows.Close()
			return nil, err
		}
		sessions = append(sessions, s)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	stats, activity, charts := aggregateProfileSessions(sessions, time.Now(), profileLocation())
	if selected := getServerScope(r); len(selected) > 0 {
		servers := map[string]bool{}
		for _, id := range selected {
			servers[id] = true
		}
		scoped := []profileSession{}
		for _, s := range sessions {
			if servers[s.serverID] {
				scoped = append(scoped, s)
			}
		}
		_, _, charts = aggregateProfileSessions(scoped, time.Now(), profileLocation())
	}
	hist, err := h.profileHistory(r, userID, serverID)
	if err != nil {
		return nil, err
	}
	var totalDuration int64
	for _, s := range sessions {
		totalDuration += s.duration
	}
	return map[string]any{"stats": stats, "activity30d": activity, "charts": charts, "history": hist, "totalPlays": len(sessions), "totalDurationMs": totalDuration * 1000}, nil
}

type profileCount struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

func orderedProfileCounts(counts map[string]int, insertion ...[]string) []profileCount {
	out := []profileCount{}
	for name, count := range counts {
		out = append(out, profileCount{name, count})
	}
	positions := map[string]int{}
	if len(insertion) > 0 {
		for i, name := range insertion[0] {
			positions[name] = i
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Count != out[j].Count {
			return out[i].Count > out[j].Count
		}
		if len(insertion) > 0 {
			return positions[out[i].Name] < positions[out[j].Name]
		}
		return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name)
	})
	return out
}
func topProfileCount(counts map[string]int, fallback string, insertion ...[]string) string {
	items := orderedProfileCounts(counts, insertion...)
	if len(items) > 0 {
		return items[0].Name
	}
	return fallback
}
func profileCompletion(watched, runtime int64, kind string) (float64, string) {
	if watched <= 0 || runtime <= 0 {
		return 0, "skipped"
	}
	pct := math.Min(100, float64(watched)*100000/float64(runtime))
	complete, partial, abandoned := 80.0, 20.0, 10.0
	if kind == "Audio" || kind == "Track" || kind == "MusicAlbum" {
		complete, partial, abandoned = 60, 30, 12
	}
	if pct >= complete {
		return pct, "completed"
	}
	if pct >= partial {
		return pct, "partial"
	}
	if pct >= abandoned {
		return pct, "abandoned"
	}
	return pct, "skipped"
}

func aggregateProfileSessions(sessions []profileSession, now time.Time, loc *time.Location) (map[string]any, []map[string]any, map[string]any) {
	clients, devices, genres, formats, allClients, allGenres := map[string]int{}, map[string]int{}, map[string]int{}, map[string]int{}, map[string]int{}, map[string]int{}
	clientOrder, deviceOrder, genreOrder, formatOrder, allClientOrder, allGenreOrder := []string{}, []string{}, []string{}, []string{}, []string{}, []string{}
	dayOrder, hourOrder, mostOrder := []int{}, []int{}, []string{}
	add := func(counts map[string]int, order *[]string, key string) {
		if counts[key] == 0 {
			*order = append(*order, key)
		}
		counts[key]++
	}
	days, hours := [7]int{}, [24]int{}
	cardDays, cardHours := [7]int{}, [24]int{}
	uniqueDates := map[string]bool{}
	uniqueMovies, uniqueEpisodes, uniqueAudio := map[string]bool{}, map[string]bool{}, map[string]bool{}
	type totalMedia struct {
		seconds, runtime int64
		title, jid, kind string
		count            int
	}
	allMedia, cardMedia, mostMedia := map[string]*totalMedia{}, map[string]*totalMedia{}, map[string]*totalMedia{}
	var seconds int64
	count, direct, bitrateCount := 0, 0, 0
	bitrateSum := 0.0
	lastActive := ""
	today := now.In(loc)
	today = time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, loc)
	activitySeconds := map[string]int64{}
	for _, s := range sessions {
		completionKey := s.userID + "::" + s.serverID + "::" + s.mediaID
		startedMS := parseTimeMs(s.started)
		date := time.UnixMilli(startedMS).In(loc)
		if startedMS > 0 {
			days[int(date.Weekday())]++
			hours[date.Hour()]++
		}
		if s.method == "DirectPlay" {
			direct++
		}
		client := s.client.String
		if client == "" {
			client = "Unknown Client"
		}
		add(allClients, &allClientOrder, client)
		if s.bitrate.Valid && s.bitrate.Int64 > 0 {
			b := float64(s.bitrate.Int64)
			if b >= 10000 {
				b /= 1000
			}
			bitrateSum += math.Round(b)
			bitrateCount++
		}
		var gs []string
		_ = json.Unmarshal([]byte(s.genres.String), &gs)
		for _, g := range gs {
			if g != "" {
				add(allGenres, &allGenreOrder, g)
			}
		}
		if allMedia[completionKey] == nil {
			allMedia[completionKey] = &totalMedia{runtime: s.runtime, kind: s.kind}
		}
		allMedia[completionKey].seconds += s.duration
		if startedMS > 0 && !date.Before(today.AddDate(0, 0, -29)) && date.Before(today.AddDate(0, 0, 1)) {
			activitySeconds[date.Format("2006-01-02")] += s.duration
		}
		ref := s.started
		if s.ended.Valid {
			ref = s.ended.String
		}
		if parseTimeMs(ref) > parseTimeMs(lastActive) {
			lastActive = ref
		}
		if s.source != "download" && s.duration < 60 {
			continue
		}
		seconds += s.duration
		count++
		if s.client.String != "" {
			add(clients, &clientOrder, s.client.String)
		}
		if s.device.String != "" {
			add(devices, &deviceOrder, s.device.String)
		}
		for _, g := range gs {
			add(genres, &genreOrder, g)
		}
		if s.kind != "" {
			add(formats, &formatOrder, s.kind)
		}
		if startedMS > 0 {
			if cardDays[int(date.Weekday())] == 0 {
				dayOrder = append(dayOrder, int(date.Weekday()))
			}
			if cardHours[date.Hour()] == 0 {
				hourOrder = append(hourOrder, date.Hour())
			}
			cardDays[int(date.Weekday())]++
			cardHours[date.Hour()]++
			uniqueDates[date.Format("2006-01-02")] = true
		}
		if s.jellyfinMediaID != "" {
			switch s.kind {
			case "Movie":
				uniqueMovies[s.jellyfinMediaID] = true
			case "Episode":
				uniqueEpisodes[s.jellyfinMediaID] = true
			case "Audio":
				uniqueAudio[s.jellyfinMediaID] = true
			}
			if mostMedia[s.jellyfinMediaID] == nil {
				mostOrder = append(mostOrder, s.jellyfinMediaID)
				mostMedia[s.jellyfinMediaID] = &totalMedia{title: s.title, jid: s.jellyfinMediaID}
			}
			mostMedia[s.jellyfinMediaID].seconds += s.duration
			mostMedia[s.jellyfinMediaID].count++
		}
		if cardMedia[completionKey] == nil {
			cardMedia[completionKey] = &totalMedia{runtime: s.runtime, kind: s.kind}
		}
		cardMedia[completionKey].seconds += s.duration
	}
	completionCounts := map[string]int{}
	for _, m := range allMedia {
		_, bucket := profileCompletion(m.seconds, m.runtime, m.kind)
		if bucket != "skipped" {
			completionCounts[bucket]++
		}
	}
	avgCompletion := 0.0
	for _, m := range cardMedia {
		pct, _ := profileCompletion(m.seconds, m.runtime, m.kind)
		avgCompletion += pct
	}
	if len(cardMedia) > 0 {
		avgCompletion = math.Round(avgCompletion / float64(len(cardMedia)))
	}
	var peakDay any
	peakHour := 0
	if len(hourOrder) > 0 {
		peakHour = hourOrder[0]
	}
	for _, d := range dayOrder {
		if cardDays[d] > 0 && (peakDay == nil || cardDays[d] > cardDays[peakDay.(int)]) {
			peakDay = d
		}
	}
	for _, hour := range hourOrder {
		if cardHours[hour] > cardHours[peakHour] {
			peakHour = hour
		}
	}
	dateKeys := []string{}
	for key := range uniqueDates {
		dateKeys = append(dateKeys, key)
	}
	sort.Strings(dateKeys)
	streak, best := 0, 0
	previous := time.Time{}
	for _, key := range dateKeys {
		d, _ := time.Parse("2006-01-02", key)
		if !previous.IsZero() && d.Sub(previous) == 24*time.Hour {
			streak++
		} else {
			streak = 1
		}
		if streak > best {
			best = streak
		}
		previous = d
	}
	var most any
	var mostSeconds int64
	for _, key := range mostOrder {
		m := mostMedia[key]
		if most == nil || m.seconds > mostSeconds {
			mostSeconds = m.seconds
			most = map[string]any{"title": m.title, "jellyfinMediaId": m.jid, "sessionsCount": m.count, "minutes": int(math.Round(float64(m.seconds) / 60))}
		}
	}
	topGenres := []string{}
	for i, g := range orderedProfileCounts(genres, genreOrder) {
		if i >= 3 {
			break
		}
		topGenres = append(topGenres, g.Name)
	}
	var effectiveActive any
	if count > 0 && lastActive != "" {
		effectiveActive = lastActive
	}
	avgMinutes := 0
	if count > 0 {
		avgMinutes = int(math.Round(float64(seconds) / float64(count) / 60))
	}
	stats := map[string]any{"totalHours": math.Round(float64(seconds)/360) / 10, "sessionsCount": count, "avgSessionMinutes": avgMinutes, "topGenres": topGenres, "averageCompletion": avgCompletion, "peakDay": peakDay, "peakHour": peakHour, "bestStreak": best, "uniqueMovies": len(uniqueMovies), "uniqueEpisodes": len(uniqueEpisodes), "uniqueAudio": len(uniqueAudio), "favoriteFormat": topProfileCount(formats, "N/A", formatOrder), "mostWatched": most, "favoriteClient": topProfileCount(clients, "N/A", clientOrder), "favoriteDevice": topProfileCount(devices, "N/A", deviceOrder), "lastActive": effectiveActive}
	activity := []map[string]any{}
	for i := 29; i >= 0; i-- {
		d := today.AddDate(0, 0, -i)
		activity = append(activity, map[string]any{"date": fmt.Sprintf("%d/%d", d.Day(), d.Month()), "hours": math.Round(float64(activitySeconds[d.Format("2006-01-02")])/360) / 10})
	}
	dayData, hourData, completion := []map[string]any{}, []map[string]any{}, []map[string]any{}
	for d, c := range days {
		dayData = append(dayData, map[string]any{"day": d, "count": c})
	}
	for hour, c := range hours {
		hourData = append(hourData, map[string]any{"hour": hour, "count": c})
	}
	for _, name := range []string{"completed", "partial", "abandoned"} {
		if c := completionCounts[name]; c > 0 {
			completion = append(completion, map[string]any{"name": name, "value": c})
		}
	}
	chartGenres := orderedProfileCounts(allGenres, allGenreOrder)
	if len(chartGenres) > 10 {
		chartGenres = chartGenres[:10]
	}
	ratio := 100
	if len(sessions) > 0 {
		ratio = int(math.Round(float64(direct) * 100 / float64(len(sessions))))
	}
	var avgBitrate any
	if bitrateCount > 0 {
		avgBitrate = math.Round(bitrateSum / float64(bitrateCount))
	}
	charts := map[string]any{"hasHistory": len(sessions) > 0, "dayOfWeek": dayData, "hours": hourData, "completion": completion, "genres": chartGenres, "favoriteClient": topProfileCount(allClients, "Aucun", allClientOrder), "directPlayRatio": ratio, "averageBitrateKbps": avgBitrate}
	return stats, activity, charts
}

func (h *Handler) profileHistory(r *http.Request, userID, serverID string) (map[string]any, error) {
	q := r.URL.Query()
	scope, args := profileScope(r, userID, serverID)
	clauses := []string{scope}
	if q.Get("hideZapped") != "false" {
		clauses = append(clauses, `(p."eventSource"='download' OR p."durationWatched">=60 OR p."endedAt" IS NULL)`)
	}
	if text := strings.TrimSpace(q.Get("query")); text != "" {
		clauses = append(clauses, `(LOWER(m."title") LIKE LOWER(?) OR LOWER(p."ipAddress") LIKE LOWER(?) OR LOWER(p."clientName") LIKE LOWER(?))`)
		for i := 0; i < 3; i++ {
			args = append(args, "%"+text+"%")
		}
	}
	if kinds := q.Get("type"); kinds != "" {
		marks := []string{}
		for _, kind := range strings.Split(kinds, ",") {
			if kind = strings.TrimSpace(kind); kind != "" {
				marks = append(marks, "?")
				args = append(args, kind)
			}
		}
		if len(marks) > 0 {
			clauses = append(clauses, `m."type" IN (`+strings.Join(marks, ",")+`)`)
		}
	}
	for _, f := range []struct{ key, column string }{{"client", "clientName"}, {"resolution", "resolution"}, {"playMethod", "playMethod"}} {
		if value := q.Get(f.key); value != "" {
			alias := "p"
			if f.key == "resolution" {
				alias = "m"
			}
			predicates := []string{}
			values := strings.Split(value, ",")
			for _, selected := range values {
				selected = strings.TrimSpace(selected)
				if selected == "" {
					continue
				}
				op := ` LIKE LOWER(?)`
				if f.key == "playMethod" || (f.key == "client" && len(values) > 1) {
					op = ` = LOWER(?)`
				} else {
					selected = "%" + selected + "%"
				}
				predicates = append(predicates, `LOWER(`+alias+`."`+f.column+`")`+op)
				args = append(args, selected)
			}
			if len(predicates) > 0 {
				clauses = append(clauses, "("+strings.Join(predicates, " OR ")+")")
			}
		}
	}
	for _, f := range []struct{ key, a, b string }{{"audio", "audioCodec", "audioLanguage"}, {"subtitle", "subtitleCodec", "subtitleLanguage"}} {
		if v := q.Get(f.key); v != "" {
			predicates := []string{}
			for _, selected := range strings.Split(v, ",") {
				selected = strings.TrimSpace(selected)
				if selected == "" {
					continue
				}
				predicates = append(predicates, `(LOWER(p."`+f.a+`") LIKE LOWER(?) OR LOWER(p."`+f.b+`") LIKE LOWER(?))`)
				args = append(args, "%"+selected+"%", "%"+selected+"%")
			}
			if len(predicates) > 0 {
				clauses = append(clauses, "("+strings.Join(predicates, " OR ")+")")
			}
		}
	}
	for _, bound := range []struct{ key, op string }{{"dateFrom", ">="}, {"dateTo", "<"}} {
		if v := q.Get(bound.key); v != "" {
			date, err := time.ParseInLocation("2006-01-02", v, profileLocation())
			if err != nil {
				return nil, fmt.Errorf("invalid profile date")
			}
			if bound.key == "dateTo" {
				date = date.AddDate(0, 0, 1)
			}
			condition := `p."startedAt" ` + bound.op + ` ?`
			if h.driver != "postgres" {
				condition = `datetime(p."startedAt") ` + bound.op + ` datetime(?)`
			}
			clauses = append(clauses, condition)
			args = append(args, date.UTC().Format(time.RFC3339Nano))
		}
	}
	base := ` FROM "PlaybackHistory" p LEFT JOIN "Media" m ON m."id"=p."mediaId" WHERE ` + strings.Join(clauses, " AND ")
	var total int
	if err := h.db.QueryRowContext(r.Context(), database.Bind(`SELECT COUNT(*)`+base, h.driver), args...).Scan(&total); err != nil {
		return nil, err
	}
	limit := 50
	totalPages := (total + limit - 1) / limit
	if totalPages < 1 {
		totalPages = 1
	}
	pg := boundedInt(q.Get("page"), 1, 1, 100000000)
	if q.Get("page") == "" {
		pg = boundedInt(q.Get("historyPage"), 1, 1, 100000000)
	}
	if pg > totalPages {
		pg = totalPages
	}
	offset := (pg - 1) * limit
	if q.Get("export") == "true" {
		limit = total
		offset = 0
		pg = 1
		totalPages = 1
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
	query := `SELECT p."id",p."mediaId",p."startedAt",p."endedAt",p."durationWatched",p."playMethod",p."eventSource",p."clientName",p."deviceName",p."ipAddress",p."country",p."city",p."audioLanguage",p."audioCodec",p."subtitleLanguage",p."subtitleCodec",p."bitrate",p."pauseCount",p."audioChanges",p."subtitleChanges",p."seekCount",p."rewatchCount",p."speedChangeCount",p."maxPlaybackRate",COALESCE(m."title",''),COALESCE(m."type",''),m."jellyfinMediaId",m."resolution",m."parentId",m."artist",m."libraryName",COALESCE(m."durationMs",0),p."userId",p."serverId",(SELECT a."videoCodec" FROM "ActiveStream" a WHERE a."userId"=p."userId" AND a."serverId"=p."serverId" AND a."mediaId"=p."mediaId" AND (a."playbackId"=p."id" OR (a."playbackId" IS NULL AND p."endedAt" IS NULL)) ORDER BY a."startedAt" DESC LIMIT 1),EXISTS(SELECT 1 FROM "ActiveStream" a WHERE a."userId"=p."userId" AND a."serverId"=p."serverId" AND a."mediaId"=p."mediaId" AND (a."playbackId"=p."id" OR (a."playbackId" IS NULL AND p."endedAt" IS NULL)))` + base + ` ORDER BY ` + order + ` LIMIT ? OFFSET ?`
	rows, err := h.db.QueryContext(r.Context(), database.Bind(query, h.driver), append(append([]any{}, args...), limit, offset)...)
	if err != nil {
		return nil, err
	}
	items := []map[string]any{}
	for rows.Next() {
		var id, mid, started, method, source, title, kind, itemUserID, itemServerID string
		var ended, client, device, ip, country, city, audio, acodec, sub, scodec, jid, resolution, parent, artist, library, videoCodec sql.NullString
		var duration, mediaDuration int64
		var bitrate sql.NullInt64
		var pauses, aChanges, sChanges, seeks, rewatches, speedChanges int
		var maxRate sql.NullFloat64
		var active bool
		if err := rows.Scan(&id, &mid, &started, &ended, &duration, &method, &source, &client, &device, &ip, &country, &city, &audio, &acodec, &sub, &scodec, &bitrate, &pauses, &aChanges, &sChanges, &seeks, &rewatches, &speedChanges, &maxRate, &title, &kind, &jid, &resolution, &parent, &artist, &library, &mediaDuration, &itemUserID, &itemServerID, &videoCodec, &active); err != nil {
			rows.Close()
			return nil, err
		}
		var kbps any
		if bitrate.Valid && bitrate.Int64 > 0 {
			b := float64(bitrate.Int64)
			if b >= 10000 {
				b /= 1000
			}
			kbps = math.Round(b)
		}
		items = append(items, map[string]any{"id": id, "mediaId": mid, "userId": itemUserID, "serverId": itemServerID, "startedAt": started, "endedAt": nullable(ended), "durationWatched": duration, "durationMs": duration * 1000, "mediaDurationMs": mediaDuration, "playMethod": method, "eventSource": source, "title": title, "type": kind, "jellyfinMediaId": nullable(jid), "clientName": nullable(client), "deviceName": nullable(device), "ipAddress": nullable(ip), "country": nullable(country), "city": nullable(city), "audioLanguage": nullable(audio), "audioCodec": nullable(acodec), "subtitleLanguage": nullable(sub), "subtitleCodec": nullable(scodec), "bitrate": kbps, "resolution": nullable(resolution), "parentId": nullable(parent), "artist": nullable(artist), "library": nullable(library), "pauseCount": pauses, "audioChanges": aChanges, "subtitleChanges": sChanges, "seekCount": seeks, "rewatchCount": rewatches, "speedChangeCount": speedChanges, "maxPlaybackRate": maxRate.Float64, "videoCodec": nullable(videoCodec), "isActuallyActive": active, "isReconnection": false})
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	markProfileReconnections(items)
	for _, item := range items {
		parent, _ := item["parentId"].(string)
		artist, _ := item["artist"].(string)
		item["mediaSubtitle"] = h.profileMediaSubtitle(r, item["serverId"].(string), item["type"].(string), parent, artist)
		telemetry, err := h.profileTelemetry(r, item["id"].(string), item["userId"].(string), item["serverId"].(string))
		if err != nil {
			return nil, err
		}
		item["telemetryEvents"] = telemetry
	}
	// Filters cover this account's entire history, independent of the selected page.
	filterRows, err := h.db.QueryContext(r.Context(), database.Bind(`SELECT p."clientName",p."audioLanguage",p."audioCodec",p."subtitleLanguage",p."subtitleCodec",m."resolution",m."type",p."playMethod" FROM "PlaybackHistory" p LEFT JOIN "Media" m ON m."id"=p."mediaId" WHERE `+scope, h.driver), args[:2]...)
	if err != nil {
		return nil, err
	}
	sets := map[string]map[string]bool{}
	for _, key := range []string{"clients", "audio", "subtitles", "resolutions", "types", "playMethods"} {
		sets[key] = map[string]bool{}
	}
	for filterRows.Next() {
		var values [8]sql.NullString
		if err := filterRows.Scan(&values[0], &values[1], &values[2], &values[3], &values[4], &values[5], &values[6], &values[7]); err != nil {
			filterRows.Close()
			return nil, err
		}
		for i, key := range []string{"clients", "audio", "audio", "subtitles", "subtitles", "resolutions", "types", "playMethods"} {
			if v := values[i].String; v != "" {
				sets[key][v] = true
			}
		}
	}
	err = filterRows.Err()
	filterRows.Close()
	if err != nil {
		return nil, err
	}
	filters := map[string][]string{}
	for key, set := range sets {
		values := []string{}
		for v := range set {
			values = append(values, v)
		}
		sort.Strings(values)
		filters[key] = values
	}
	return map[string]any{"items": items, "total": total, "limit": limit, "offset": offset, "page": pg, "totalPages": totalPages, "filters": filters}, nil
}

// Main compares the sessions on the visible page: a new session reconnects
// when another session for the same account/media ended within thirty seconds.
// Missing end timestamps cannot establish a reconnection.
func markProfileReconnections(items []map[string]any) {
	type endpoint struct {
		id string
		at int64
	}
	ends := map[string][]endpoint{}
	key := func(item map[string]any) string {
		return fmt.Sprint(item["userId"]) + "::" + fmt.Sprint(item["serverId"]) + "::" + fmt.Sprint(item["mediaId"])
	}
	for _, item := range items {
		item["isReconnection"] = false
		if ended, ok := item["endedAt"].(string); ok {
			if at := parseTimeMs(ended); at > 0 {
				k := key(item)
				ends[k] = append(ends[k], endpoint{item["id"].(string), at})
			}
		}
	}
	for k := range ends {
		sort.Slice(ends[k], func(i, j int) bool { return ends[k][i].at < ends[k][j].at })
	}
	for _, item := range items {
		started, _ := item["startedAt"].(string)
		at := parseTimeMs(started)
		if at <= 0 {
			continue
		}
		candidates := ends[key(item)]
		start := sort.Search(len(candidates), func(i int) bool { return candidates[i].at >= at-30000 })
		for i := start; i < len(candidates) && candidates[i].at <= at+30000; i++ {
			if candidates[i].id != item["id"] {
				item["isReconnection"] = true
				break
			}
		}
	}
}

func (h *Handler) profileMediaSubtitle(r *http.Request, serverID, kind, parentID, artist string) string {
	var parentTitle, parentParent, parentArtist sql.NullString
	if parentID != "" {
		_ = h.db.QueryRowContext(r.Context(), database.Bind(`SELECT "title","parentId","artist" FROM "Media" WHERE "serverId"=? AND "jellyfinMediaId"=? LIMIT 1`, h.driver), serverID, parentID).Scan(&parentTitle, &parentParent, &parentArtist)
	}
	if kind == "Episode" {
		var grandparent sql.NullString
		if parentParent.Valid {
			_ = h.db.QueryRowContext(r.Context(), database.Bind(`SELECT "title" FROM "Media" WHERE "serverId"=? AND "jellyfinMediaId"=? LIMIT 1`, h.driver), serverID, parentParent.String).Scan(&grandparent)
		}
		if grandparent.String != "" && parentTitle.String != "" {
			return grandparent.String + " — " + parentTitle.String
		}
		if grandparent.String != "" {
			return grandparent.String
		}
		return parentTitle.String
	}
	if kind == "Audio" || kind == "Track" {
		if artist == "" {
			artist = parentArtist.String
		}
		parts := []string{}
		if artist != "" {
			parts = append(parts, artist)
		}
		if parentTitle.String != "" {
			parts = append(parts, parentTitle.String)
		}
		return strings.Join(parts, " — ")
	}
	return parentTitle.String
}

func (h *Handler) profileTelemetry(r *http.Request, playbackID, userID, serverID string) ([]map[string]any, error) {
	rows, err := h.db.QueryContext(r.Context(), database.Bind(`SELECT t."eventType",t."positionMs",t."createdAt",t."metadata" FROM "TelemetryEvent" t JOIN "PlaybackHistory" p ON p."id"=t."playbackId" AND p."serverId"=t."serverId" WHERE t."playbackId"=? AND p."userId"=? AND p."serverId"=? ORDER BY t."createdAt" DESC,t."id" DESC LIMIT 200`, h.driver), playbackID, userID, serverID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	events := []map[string]any{}
	for rows.Next() {
		var event, created string
		var position int64
		var metadata sql.NullString
		if err := rows.Scan(&event, &position, &created, &metadata); err != nil {
			return nil, err
		}
		var meta any
		if metadata.Valid {
			_ = json.Unmarshal([]byte(metadata.String), &meta)
		}
		events = append(events, map[string]any{"eventType": event, "positionMs": position, "createdAt": created, "metadata": meta})
	}
	return events, rows.Err()
}
