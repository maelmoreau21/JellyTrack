package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"github.com/jackc/pgx/v5/pgtype"
	"io"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/auth"
	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/internal/history"
	"github.com/maelmoreau21/jellytrack/internal/security"
)

// The family relation accepts Jellyfin or internal parent IDs, always on the
// same server. UNION also terminates malformed cyclic hierarchies.
func (h *Handler) recoveredMediaBase(r *http.Request) (string, []any, error) {
	clauses := []string{excludedLibrariesClause(h.driver, "m")}
	args := []any{}
	if ids := getServerScope(r); len(ids) > 0 {
		marks := []string{}
		for _, id := range ids {
			marks = append(marks, "?")
			args = append(args, id)
		}
		clauses = append(clauses, `m."serverId" IN (`+strings.Join(marks, ",")+`)`)
	}
	playback := history.ZappingClause("p")
	if principal, ok := auth.PrincipalFromContext(r.Context()); ok && !principal.IsAdmin() {
		uid, sid, err := h.historyIdentity(r, principal)
		if err != nil {
			return "", nil, err
		}
		playback += ` AND p."userId"=? AND p."serverId"=?`
		args = append(args, uid, sid)
	}
	cte := `WITH RECURSIVE catalog AS (SELECT m.*,s."name" AS "server",(SELECT a."title" FROM "Media" a WHERE a."serverId"=m."serverId" AND (a."id"=m."parentId" OR a."jellyfinMediaId"=m."parentId") LIMIT 1) AS "parentTitle" FROM "Media" m LEFT JOIN "Server" s ON s."id"=m."serverId" WHERE ` + strings.Join(clauses, " AND ") + `), family("root","member") AS (SELECT "id","id" FROM catalog UNION SELECT f."root",c."id" FROM family f JOIN catalog p ON p."id"=f."member" JOIN catalog c ON c."serverId"=p."serverId" AND (c."parentId"=p."id" OR c."parentId"=p."jellyfinMediaId")), valid AS (SELECT p.* FROM "PlaybackHistory" p JOIN catalog m ON m."id"=p."mediaId" AND m."serverId"=p."serverId" WHERE ` + playback + `), agg AS (SELECT f."root",COUNT(p."id") AS "plays",COALESCE(SUM(p."durationWatched"),0)*1000 AS "watchTimeMs",MAX(p."startedAt") AS "lastPlayed",SUM(CASE WHEN p."playMethod"='DirectPlay' THEN 1 ELSE 0 END) AS "directPlays" FROM family f LEFT JOIN valid p ON p."mediaId"=f."member" GROUP BY f."root") `
	return cte, args, nil
}

// SQL result maps retain the old contract while adding nullable real metadata.
func (h *Handler) recoveredRows(r *http.Request, q string, args ...any) ([]map[string]any, error) {
	rows, err := h.db.QueryContext(r.Context(), database.Bind(q, h.driver), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	names, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	result := []map[string]any{}
	for rows.Next() {
		v := make([]any, len(names))
		ptr := make([]any, len(names))
		for i := range v {
			ptr[i] = &v[i]
		}
		if err = rows.Scan(ptr...); err != nil {
			return nil, err
		}
		entry := map[string]any{}
		for i, k := range names {
			value := v[i]
			if b, ok := value.([]byte); ok {
				value = string(b)
			}
			if k == "genres" || k == "directors" || k == "actors" || k == "studios" {
				switch x := value.(type) {
				case string:
					list := parseStringList(x)
					if h.driver == "postgres" && strings.HasPrefix(x, "{") {
						if err := pgtype.NewMap().Scan(pgtype.TextArrayOID, pgtype.TextFormatCode, []byte(x), &list); err != nil {
							return nil, err
						}
					}
					value = list
				case nil:
					value = []string{}
				}
			}
			if t, ok := value.(time.Time); ok {
				value = t.UTC().Format(time.RFC3339Nano)
			}
			entry[k] = value
		}
		if lib, ok := entry["libraryName"]; ok {
			entry["library"] = lib
		}
		if size, ok := entry["size"]; ok {
			entry["sizeBytes"] = size
		}
		result = append(result, entry)
	}
	return result, rows.Err()
}

func mediaNumber(v any) float64 {
	switch n := v.(type) {
	case int64:
		return float64(n)
	case int:
		return float64(n)
	case float64:
		return n
	case string:
		value, _ := strconv.ParseFloat(n, 64)
		return value
	}
	return 0
}
func mediaString(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}
func mediaQuality(s string) string {
	s = strings.ToLower(s)
	switch {
	case strings.Contains(s, "4k") || strings.Contains(s, "2160"):
		return "4K"
	case strings.Contains(s, "1440"):
		return "1440p"
	case strings.Contains(s, "1080"):
		return "1080p"
	case strings.Contains(s, "720"):
		return "720p"
	case s != "" && s != "unknown":
		return "SD"
	}
	return ""
}

func (h *Handler) recoveredMediaServerOptions(w http.ResponseWriter, r *http.Request) {
	options, err := h.recoveredRows(r, `SELECT "id","name","isActive" FROM "Server" WHERE "isActive"=1 OR NOT EXISTS(SELECT 1 FROM "Server" WHERE "isActive"=1) ORDER BY "name","id"`)
	if err != nil {
		jsonError(w, 500, "Impossible de charger les serveurs.")
		return
	}
	jsonResponse(w, 200, map[string]any{"servers": options, "selectedServers": getServerScope(r)})
}

// Fetch presentation metadata only from the already configured server. Never
// return MediaSources.Path or other server paths, API keys or network addresses.
// A short timeout keeps offline Jellyfin independent from persisted statistics.
func (h *Handler) recoveredLiveMetadata(r *http.Request, item map[string]any) {
	var serverURL, key sql.NullString
	if h.db.QueryRowContext(r.Context(), database.Bind(`SELECT "url","jellyfinApiKey" FROM "Server" WHERE "id"=?`, h.driver), item["serverId"]).Scan(&serverURL, &key) != nil || key.String == "" {
		return
	}
	parsed, err := security.ValidateSafeServerURL(serverURL.String)
	if err != nil || parsed.User != nil {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(parsed.String(), "/")+"/Items/"+url.PathEscape(mediaString(item["jellyfinMediaId"]))+"?Fields=Overview,ProductionYear,IndexNumber,ParentIndexNumber,People,ImageTags,MediaSources,IntroStartPositionMs,IntroStartPositionTicks,IntroEndPositionMs,IntroEndPositionTicks,CreditsPositionMs,CreditsPositionTicks", nil)
	if err != nil {
		return
	}
	request.Header.Set("X-MediaBrowser-Token", key.String)
	client := &http.Client{Timeout: 3 * time.Second, CheckRedirect: func(req *http.Request, via []*http.Request) error { return http.ErrUseLastResponse }}
	response, err := client.Do(request)
	if err != nil {
		return
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, (2<<20)+1))
	if err != nil || len(data) > 2<<20 {
		return
	}
	var raw map[string]any
	if json.Unmarshal(data, &raw) != nil {
		return
	}
	item["overview"] = mediaString(raw["Overview"])
	item["year"] = raw["ProductionYear"]
	if tags, ok := raw["ImageTags"].(map[string]any); ok {
		item["hasLogo"] = mediaString(tags["Logo"]) != ""
	}
	if tags, ok := raw["BackdropImageTags"].([]any); ok {
		item["hasBackdrop"] = len(tags) > 0
	}
	if mediaString(item["type"]) == "Episode" && mediaNumber(raw["IndexNumber"]) > 0 {
		if mediaNumber(raw["ParentIndexNumber"]) > 0 {
			item["episodeCode"] = fmt.Sprintf("S%02dE%02d", int(mediaNumber(raw["ParentIndexNumber"])), int(mediaNumber(raw["IndexNumber"])))
		} else {
			item["episodeCode"] = fmt.Sprintf("E%02d", int(mediaNumber(raw["IndexNumber"])))
		}
	}
	people := []map[string]any{}
	if values, ok := raw["People"].([]any); ok {
		for _, v := range values {
			p, ok := v.(map[string]any)
			if !ok || mediaString(p["Name"]) == "" {
				continue
			}
			people = append(people, map[string]any{"id": mediaString(p["Id"]), "name": mediaString(p["Name"]), "role": mediaString(p["Role"]), "type": mediaString(p["Type"]), "hasImage": mediaString(p["PrimaryImageTag"]) != ""})
			if len(people) >= 24 {
				break
			}
		}
	}
	item["people"] = people
	versions := []map[string]any{}
	if values, ok := raw["MediaSources"].([]any); ok {
		for _, v := range values {
			source, ok := v.(map[string]any)
			if !ok {
				continue
			}
			version := map[string]any{"id": mediaString(source["Id"]), "name": mediaString(source["Name"]), "container": mediaString(source["Container"]), "size": source["Size"]}
			if streams, ok := source["MediaStreams"].([]any); ok {
				for _, stream := range streams {
					st, ok := stream.(map[string]any)
					if !ok {
						continue
					}
					if mediaString(st["Type"]) == "Audio" && version["audio"] == nil {
						version["audio"] = mediaString(st["Codec"])
					}
					if mediaString(st["Type"]) == "Video" && version["video"] == nil {
						version["video"] = mediaString(st["Codec"])
					}
				}
			}
			versions = append(versions, version)
			if len(versions) >= 50 {
				break
			}
		}
	}
	item["versions"] = versions
	markers := []map[string]any{}
	for _, field := range []struct{ key, ms, ticks string }{{"markerIntroStart", "IntroStartPositionMs", "IntroStartPositionTicks"}, {"markerIntroEnd", "IntroEndPositionMs", "IntroEndPositionTicks"}, {"markerCreditsStart", "CreditsPositionMs", "CreditsPositionTicks"}} {
		value := mediaNumber(raw[field.ms])
		if value <= 0 {
			value = mediaNumber(raw[field.ticks]) / 10000
		}
		if value > 0 {
			markers = append(markers, map[string]any{"key": field.key, "positionMs": value})
		}
	}
	item["markers"] = markers
	item["metadataAvailable"] = map[string]bool{"peoplePortraits": true, "peopleRoles": true, "versions": true, "backdrop": true, "logo": true}
	item["metadataSource"] = "jellyfin"
}

const recoveredResolution = `COALESCE(NULLIF(m."resolution",''),(SELECT c."resolution" FROM family f JOIN catalog c ON c."id"=f."member" WHERE f."root"=m."id" AND c."resolution" IS NOT NULL AND c."resolution"<>'' GROUP BY c."resolution" ORDER BY COUNT(*) DESC,c."resolution" LIMIT 1))`
const recoveredQualityRank = `CASE WHEN LOWER(COALESCE(` + recoveredResolution + `,'')) LIKE '%4k%' OR COALESCE(` + recoveredResolution + `,'') LIKE '%2160%' THEN 5 WHEN COALESCE(` + recoveredResolution + `,'') LIKE '%1440%' THEN 4 WHEN COALESCE(` + recoveredResolution + `,'') LIKE '%1080%' THEN 3 WHEN COALESCE(` + recoveredResolution + `,'') LIKE '%720%' THEN 2 WHEN COALESCE(` + recoveredResolution + `,'')<>'' THEN 1 ELSE 0 END`
const recoveredItemSelect = `SELECT m.*,COALESCE(a."plays",0) AS "plays",COALESCE(a."watchTimeMs",0) AS "watchTimeMs",a."lastPlayed",CASE WHEN a."plays">0 THEN 100.0*a."directPlays"/a."plays" ELSE NULL END AS "directPlayPercent",` + recoveredResolution + ` AS "displayResolution",(SELECT CASE WHEN SUM(c."durationMs")>0 THEN SUM(c."size")*8.0/SUM(c."durationMs") ELSE NULL END FROM family f JOIN catalog c ON c."id"=f."member" WHERE f."root"=m."id" AND c."type" IN ('Audio','Track') AND c."size">0 AND c."durationMs">0) AS "bitrateKbps" FROM catalog m LEFT JOIN agg a ON a."root"=m."id" `

func (h *Handler) recoveredMediaFilters(r *http.Request) (string, []any) {
	q := r.URL.Query()
	clauses := []string{"1=1"}
	args := []any{}
	// Existing Go consumers keep all types; the restored page requests parents.
	if q.Get("parents") == "true" {
		clauses = append(clauses, `m."type" IN ('Movie','Series','MusicAlbum') AND m."libraryName" IS NOT NULL AND m."libraryName"<>''`)
	}
	for _, f := range []struct{ key, col string }{{"library", "libraryName"}, {"artist", "artist"}, {"type", "type"}} {
		if val := q.Get(f.key); val != "" {
			if f.key == "type" && (val == "music" || val == "Audio") {
				clauses = append(clauses, `m."type" IN ('MusicAlbum','Audio','Track')`)
			} else if f.key == "type" && strings.EqualFold(val, "book") {
				clauses = append(clauses, `m."type" IN ('Book','AudioBook')`)
			} else {
				clauses = append(clauses, `m."`+f.col+`"=?`)
				args = append(args, val)
			}
		}
	}
	if excluded := q.Get("excludeTypes"); excluded != "" {
		marks := []string{}
		for _, part := range strings.Split(excluded, ",") {
			marks = append(marks, "?")
			args = append(args, part)
		}
		clauses = append(clauses, `m."type" NOT IN (`+strings.Join(marks, ",")+`)`)
	}
	if text := strings.TrimSpace(q.Get("q")); text != "" {
		parts := []string{`LOWER(m."title") LIKE LOWER(?)`, `LOWER(m."artist") LIKE LOWER(?)`}
		for _, column := range []string{"directors", "actors", "studios"} {
			if h.driver == "postgres" {
				parts = append(parts, `EXISTS (SELECT 1 FROM unnest(m."`+column+`") term WHERE LOWER(term) LIKE LOWER(?))`)
			} else {
				parts = append(parts, `EXISTS (SELECT 1 FROM json_each(m."`+column+`") term WHERE LOWER(term.value) LIKE LOWER(?))`)
			}
		}
		clauses = append(clauses, "("+strings.Join(parts, " OR ")+")")
		for i := 0; i < 5; i++ {
			args = append(args, "%"+text+"%")
		}
	}
	if genre := q.Get("genre"); genre != "" {
		if h.driver == "postgres" {
			clauses = append(clauses, `EXISTS (SELECT 1 FROM unnest(m."genres") genre WHERE LOWER(genre)=LOWER(?))`)
		} else {
			clauses = append(clauses, `EXISTS (SELECT 1 FROM json_each(m."genres") genre WHERE LOWER(genre.value)=LOWER(?))`)
		}
		args = append(args, genre)
	}
	if resolution := q.Get("resolution"); resolution != "" {
		if rank, ok := map[string]int{"4K": 5, "1440p": 4, "1080p": 3, "720p": 2, "SD": 1}[resolution]; ok {
			clauses = append(clauses, recoveredQualityRank+"=?")
			args = append(args, rank)
		} else {
			marks := []string{resolution}
			if resolution == "4K" {
				marks = []string{"4K", "2160"}
			}
			sub := []string{}
			for _, x := range marks {
				sub = append(sub, `LOWER(COALESCE(m."resolution",(SELECT c."resolution" FROM family f JOIN catalog c ON c."id"=f."member" WHERE f."root"=m."id" AND c."resolution" IS NOT NULL AND c."resolution"<>'' GROUP BY c."resolution" ORDER BY COUNT(*) DESC,c."resolution" LIMIT 1))) LIKE LOWER(?)`)
				args = append(args, "%"+x+"%")
			}
			clauses = append(clauses, "("+strings.Join(sub, " OR ")+")")
		}
	}
	return strings.Join(clauses, " AND "), args
}

func (h *Handler) recoveredMediaList(w http.ResponseWriter, r *http.Request) {
	base, args, err := h.recoveredMediaBase(r)
	if err != nil {
		jsonError(w, 403, "Identité utilisateur introuvable.")
		return
	}
	where, filters := h.recoveredMediaFilters(r)
	args = append(args, filters...)
	var total int
	if err = h.db.QueryRowContext(r.Context(), database.Bind(base+`SELECT COUNT(*) FROM catalog m WHERE `+where, h.driver), args...).Scan(&total); err != nil {
		jsonError(w, 500, "Impossible de charger les médias.")
		return
	}
	limit, offset := page(r)
	if p := r.URL.Query().Get("page"); p != "" {
		offset = (boundedInt(p, 1, 1, 1000000) - 1) * limit
	}
	if total > 0 && offset >= total {
		offset = ((total - 1) / limit) * limit
	}
	if total == 0 {
		offset = 0
	}
	order := `m."title" ASC,m."id" ASC`
	switch first(r.URL.Query().Get("sortBy"), r.URL.Query().Get("sort")) {
	case "plays", "popular":
		order = `COALESCE(a."plays",0) DESC,m."title" ASC,m."id" ASC`
	case "watchTime", "time", "watchtime":
		order = `COALESCE(a."watchTimeMs",0) DESC,m."title" ASC,m."id" ASC`
	case "quality":
		order = recoveredQualityRank + ` DESC,m."title" ASC,m."id" ASC`
	case "duration":
		order = `m."durationMs" DESC,m."title" ASC`
	case "recent":
		order = `a."lastPlayed" DESC,m."title" ASC`
	case "added", "new", "recentlyAdded":
		order = `m."dateAdded" DESC,m."createdAt" DESC,m."id" DESC`
	}
	items, err := h.recoveredRows(r, base+recoveredItemSelect+`WHERE `+where+` ORDER BY `+order+` LIMIT ? OFFSET ?`, append(args, limit, offset)...)
	if err != nil {
		jsonError(w, 500, "Impossible de charger les médias.")
		return
	}
	badges := true
	var raw sql.NullString
	if h.db.QueryRowContext(r.Context(), `SELECT "resolutionThresholds" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&raw) == nil {
		var cfg map[string]any
		if json.Unmarshal([]byte(raw.String), &cfg) == nil {
			if b, ok := cfg["showLibraryMediaBadges"].(bool); ok {
				badges = b
			}
		}
	}
	jsonResponse(w, 200, map[string]any{"items": items, "total": total, "limit": limit, "offset": offset, "showLibraryMediaBadges": badges})
}

func (h *Handler) recoveredMediaDetail(w http.ResponseWriter, r *http.Request) {
	base, args, err := h.recoveredMediaBase(r)
	if err != nil {
		jsonError(w, 403, "Identité utilisateur introuvable.")
		return
	}
	id := r.PathValue("id")
	items, err := h.recoveredRows(r, base+recoveredItemSelect+`WHERE m."id"=? OR m."jellyfinMediaId"=? ORDER BY CASE WHEN m."id"=? THEN 0 ELSE 1 END LIMIT 2`, append(append([]any{}, args...), id, id, id)...)
	if err != nil {
		jsonError(w, 500, "Impossible de charger le média.")
		return
	}
	if len(items) == 0 {
		jsonError(w, 404, "Média introuvable.")
		return
	}
	if len(items) > 1 && mediaString(items[0]["id"]) != id {
		jsonError(w, 409, "Plusieurs serveurs contiennent cet identifiant. Sélectionnez un serveur.")
		return
	}
	item := items[0]
	id = mediaString(item["id"])
	item["totalPlays"] = item["plays"]
	item["totalDurationMs"] = item["watchTimeMs"]
	read := func(query string, extra ...any) ([]map[string]any, error) {
		return h.recoveredRows(r, base+query, append(append([]any{}, args...), extra...)...)
	}
	children, err := read(recoveredItemSelect+`WHERE m."serverId"=? AND (m."parentId"=? OR m."parentId"=?) ORDER BY m."type",m."title",m."id"`, item["serverId"], id, item["jellyfinMediaId"])
	if err != nil {
		jsonError(w, 500, "Impossible de charger la hiérarchie.")
		return
	}
	item["children"] = children
	hierarchy := []map[string]any{}
	parent := mediaString(item["parentId"])
	seen := map[string]bool{id: true}
	for parent != "" && !seen[parent] && len(hierarchy) < 12 {
		seen[parent] = true
		parents, e := read(recoveredItemSelect+`WHERE m."serverId"=? AND (m."id"=? OR m."jellyfinMediaId"=?) LIMIT 1`, item["serverId"], parent, parent)
		if e != nil {
			jsonError(w, 500, "Impossible de charger la hiérarchie.")
			return
		}
		if len(parents) == 0 {
			break
		}
		hierarchy = append([]map[string]any{parents[0]}, hierarchy...)
		parent = mediaString(parents[0]["parentId"])
	}
	item["hierarchy"] = hierarchy
	familyWhere := ` FROM valid p LEFT JOIN "User" u ON u."id"=p."userId" JOIN catalog c ON c."id"=p."mediaId" WHERE p."mediaId" IN (SELECT "member" FROM family WHERE "root"=?)`
	summary, err := read(`SELECT COALESCE(SUM(p."pauseCount"),0) AS "pauseCount",COALESCE(SUM(p."audioChanges"),0) AS "audioChanges",COALESCE(SUM(p."subtitleChanges"),0) AS "subtitleChanges",COALESCE(SUM(p."seekCount"),0) AS "seekCount",COALESCE(SUM(p."rewatchCount"),0) AS "rewatchCount",COALESCE(SUM(p."speedChangeCount"),0) AS "speedChangeCount",MAX(p."maxPlaybackRate") AS "maxPlaybackRate"`+familyWhere, id)
	if err != nil {
		jsonError(w, 500, "Impossible de charger les statistiques.")
		return
	}
	for k, v := range summary[0] {
		item[k] = v
	}
	viewers, err := read(`SELECT u."id" AS "userId",u."username",COUNT(*) AS "plays",SUM(p."durationWatched")*1000 AS "watchTimeMs"`+familyWhere+` GROUP BY u."id",u."username" ORDER BY SUM(p."durationWatched") DESC,u."username"`, id)
	if err != nil {
		jsonError(w, 500, "Impossible de charger les spectateurs.")
		return
	}
	item["viewers"] = viewers
	for _, lang := range []string{"audio", "subtitle"} {
		distribution, e := read(`SELECT COALESCE(p."`+lang+`Language",'') AS "language",COALESCE(p."`+lang+`Codec",'') AS "codec",COUNT(*) AS "count"`+familyWhere+` GROUP BY p."`+lang+`Language",p."`+lang+`Codec" ORDER BY COUNT(*) DESC`, id)
		if e != nil {
			jsonError(w, 500, "Impossible de charger les langues.")
			return
		}
		item[lang+"Distribution"] = distribution
	}
	completion := []map[string]any{}
	if runtime := mediaNumber(item["durationMs"]); runtime > 0 {
		completion, err = read(`SELECT CASE WHEN p."durationWatched"*1000>=? THEN 90 ELSE CAST((p."durationWatched"*1000.0/?)/10 AS INTEGER)*10 END AS "percent",COUNT(*) AS "count"`+familyWhere+` GROUP BY CASE WHEN p."durationWatched"*1000>=? THEN 90 ELSE CAST((p."durationWatched"*1000.0/?)/10 AS INTEGER)*10 END ORDER BY "percent"`, runtime, runtime, id, runtime, runtime)
		if err != nil {
			jsonError(w, 500, "Impossible de charger la complétion.")
			return
		}
	}
	item["completion"] = completion
	counters, err := read(`SELECT p."startedAt",SUM(p."pauseCount") AS "pauseCount",SUM(p."seekCount") AS "seekCount",SUM(p."rewatchCount") AS "rewatchCount",SUM(p."speedChangeCount") AS "speedChangeCount",SUM(p."audioChanges") AS "audioChanges",SUM(p."subtitleChanges") AS "subtitleChanges"`+familyWhere+` GROUP BY p."startedAt" HAVING SUM(p."pauseCount"+p."seekCount"+p."rewatchCount"+p."speedChangeCount"+p."audioChanges"+p."subtitleChanges")>0 ORDER BY p."startedAt" ASC`, id)
	if err != nil {
		jsonError(w, 500, "Impossible de charger les compteurs.")
		return
	}
	item["counterTimeline"] = counters
	limit := boundedInt(r.URL.Query().Get("historyLimit"), 25, 1, 100)
	pg := boundedInt(r.URL.Query().Get("historyPage"), 1, 1, 1000000)
	total := int(mediaNumber(item["plays"]))
	pages := (total + limit - 1) / limit
	if pages < 1 {
		pages = 1
	}
	if pg > pages {
		pg = pages
	}
	sessions, err := read(`SELECT p.*,u."username",c."title",c."type",c."durationMs" AS "runtimeMs",p."durationWatched"*1000 AS "durationMs"`+familyWhere+` ORDER BY p."startedAt" DESC,p."id" DESC LIMIT ? OFFSET ?`, id, limit, (pg-1)*limit)
	if err != nil {
		jsonError(w, 500, "Impossible de charger l'historique.")
		return
	}
	item["history"] = sessions
	item["recentActivity"] = sessions
	item["historyPage"] = pg
	item["historyPages"] = pages
	item["historyLimit"] = limit
	eventWhere := ` FROM "TelemetryEvent" e JOIN valid p ON p."id"=e."playbackId" AND p."serverId"=e."serverId" LEFT JOIN "User" u ON u."id"=p."userId" WHERE p."mediaId" IN (SELECT "member" FROM family WHERE "root"=?)`
	extra := []any{id}
	if session := r.URL.Query().Get("session"); session != "" {
		eventWhere += ` AND p."id"=?`
		extra = append(extra, session)
	}
	if user := r.URL.Query().Get("user"); user != "" {
		eventWhere += ` AND p."userId"=?`
		extra = append(extra, user)
	}
	eventTotal, e := read(`SELECT COUNT(*) AS "count"`+eventWhere, extra...)
	if e != nil {
		jsonError(w, 500, "Impossible de charger la télémétrie.")
		return
	}
	events, e := read(`SELECT e.*,u."id" AS "userId",u."username"`+eventWhere+` ORDER BY e."createdAt",e."id" LIMIT 2000`, extra...)
	if e != nil {
		jsonError(w, 500, "Impossible de charger la télémétrie.")
		return
	}
	item["telemetry"] = events
	item["telemetryTotal"] = eventTotal[0]["count"]
	item["telemetryLimit"] = 2000
	// Behavioral aggregates cover every authorized event even when the
	// interactive positional timeline is bounded to 2000 visible events.
	behavior, err := h.recoveredMediaBehavior(r, base, args, id)
	if err != nil {
		jsonError(w, 500, "Impossible de charger les comportements.")
		return
	}
	item["behavior"] = behavior
	item["metadataAvailable"] = map[string]bool{"peoplePortraits": false, "peopleRoles": false, "versions": false, "backdrop": false, "logo": false}
	if r.URL.Query().Get("metadata") == "true" {
		h.recoveredLiveMetadata(r, item)
	}
	jsonResponse(w, 200, item)
}

func recoveredChangeLabel(v any) string {
	if text, ok := v.(string); ok {
		return text
	}
	if record, ok := v.(map[string]any); ok {
		label := first(mediaString(record["language"]), mediaString(record["displayTitle"]), mediaString(record["title"]), mediaString(record["name"]))
		if codec := mediaString(record["codec"]); codec != "" {
			if label != "" {
				label += " (" + codec + ")"
			} else {
				label = codec
			}
		}
		return label
	}
	return ""
}

// Stream in playback/position order, retain only aggregate counters and the
// current session. No full-history or full-event payload is sent to the browser.
func (h *Handler) recoveredMediaBehavior(r *http.Request, base string, args []any, id string) (map[string]any, error) {
	query := base + `SELECT p."id",p."durationWatched",p."audioLanguage",p."audioCodec",p."subtitleLanguage",p."subtitleCodec",e."eventType",e."positionMs",e."metadata" FROM valid p LEFT JOIN "TelemetryEvent" e ON e."playbackId"=p."id" AND e."serverId"=p."serverId" WHERE p."mediaId" IN (SELECT "member" FROM family WHERE "root"=?) ORDER BY p."id",e."positionMs",e."id"`
	rows, err := h.db.QueryContext(r.Context(), database.Bind(query, h.driver), append(append([]any{}, args...), id)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	type signal struct {
		label, kind string
		count       int
		sessions    map[string]bool
	}
	ranges := map[string]*signal{}
	speeds := map[string]*signal{}
	switches := map[string]*signal{}
	segments := map[string]*signal{}
	add := func(target map[string]*signal, key, label, kind, sid string) {
		s := target[key]
		if s == nil {
			s = &signal{label: label, kind: kind, sessions: map[string]bool{}}
			target[key] = s
		}
		s.count++
		s.sessions[sid] = true
	}
	current := ""
	duration := float64(0)
	labels := map[string]string{}
	starts := map[string]float64{}
	furthest := float64(0)
	segment := func(kind string, end float64) {
		if labels[kind] == "" || end <= starts[kind] {
			return
		}
		label := labels[kind]
		key := fmt.Sprintf("%s:%s:%g:%g", kind, label, starts[kind], end)
		add(segments, key, fmt.Sprintf("%s · %.0f–%.0f s", label, starts[kind]/1000, end/1000), kind, current)
	}
	flush := func() {
		if current != "" {
			end := duration
			if furthest > end {
				end = furthest
			}
			segment("audio", end)
			segment("subtitle", end)
		}
	}
	for rows.Next() {
		var sid string
		var watched int64
		var audio, audioCodec, subtitle, subtitleCodec, eventType, metadata sql.NullString
		var position sql.NullInt64
		if err = rows.Scan(&sid, &watched, &audio, &audioCodec, &subtitle, &subtitleCodec, &eventType, &position, &metadata); err != nil {
			return nil, err
		}
		if sid != current {
			flush()
			current = sid
			duration = float64(watched) * 1000
			furthest = 0
			labels = map[string]string{"audio": audio.String, "subtitle": subtitle.String}
			if labels["audio"] != "" && audioCodec.String != "" {
				labels["audio"] += " (" + audioCodec.String + ")"
			}
			if labels["subtitle"] != "" && subtitleCodec.String != "" {
				labels["subtitle"] += " (" + subtitleCodec.String + ")"
			}
			starts = map[string]float64{"audio": 0, "subtitle": 0}
		}
		if !eventType.Valid {
			continue
		}
		pos := float64(position.Int64)
		if pos > furthest {
			furthest = pos
		}
		var m map[string]any
		if json.Unmarshal([]byte(metadata.String), &m) != nil {
			continue
		}
		switch eventType.String {
		case "seek", "replay":
			from, okFrom := m["fromMs"].(float64)
			to, okTo := m["toMs"].(float64)
			if okFrom && okTo && from >= 0 && to >= 0 {
				label := fmt.Sprintf("%.0f → %.0f s", from/1000, to/1000)
				add(ranges, eventType.String+":"+label, label, eventType.String, sid)
			}
		case "speed_change":
			rate := mediaNumber(m["toRate"])
			if rate == 0 {
				rate = mediaNumber(m["playbackRate"])
			}
			if rate > 0 && rate != 1 {
				label := fmt.Sprintf("%g×", rate)
				add(speeds, label, label, "speed_change", sid)
			}
		case "audio_change", "subtitle_change":
			kind := strings.TrimSuffix(eventType.String, "_change")
			from, to := recoveredChangeLabel(m["from"]), recoveredChangeLabel(m["to"])
			if from != "" || to != "" {
				label := from + " → " + to
				add(switches, kind+":"+label, label, kind, sid)
			}
			if labels[kind] == "" && from != "" {
				labels[kind] = from
			}
			segment(kind, pos)
			labels[kind] = to
			starts[kind] = pos
		}
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	flush()
	list := func(signals map[string]*signal) []map[string]any {
		out := []map[string]any{}
		for _, s := range signals {
			out = append(out, map[string]any{"label": s.label, "kind": s.kind, "count": s.count, "sessions": len(s.sessions)})
		}
		sort.Slice(out, func(i, j int) bool {
			if out[i]["count"] == out[j]["count"] {
				return mediaString(out[i]["label"]) < mediaString(out[j]["label"])
			}
			return out[i]["count"].(int) > out[j]["count"].(int)
		})
		if len(out) > 6 {
			out = out[:6]
		}
		return out
	}
	return map[string]any{"ranges": list(ranges), "speeds": list(speeds), "switches": list(switches), "languageSegments": list(segments)}, nil
}

func (h *Handler) recoveredMediaCollections(w http.ResponseWriter, r *http.Request) {
	base, args, err := h.recoveredMediaBase(r)
	if err != nil {
		jsonError(w, 403, "Identité utilisateur introuvable.")
		return
	}
	types, err := h.recoveredRows(r, base+`SELECT m."serverId",m."server",m."libraryName" AS "name",m."collectionType",m."type",COUNT(*) AS "count",COALESCE(SUM(m."durationMs"),0) AS "durationMs",COALESCE(SUM(m."size"),0) AS "sizeBytes" FROM catalog m WHERE m."libraryName" IS NOT NULL AND m."libraryName"<>'' AND COALESCE(m."collectionType",'')<>'boxsets' GROUP BY m."serverId",m."server",m."libraryName",m."collectionType",m."type" ORDER BY m."libraryName",m."serverId",m."type"`, args...)
	if err != nil {
		jsonError(w, 500, "Impossible de charger les collections.")
		return
	}
	groups := map[string]map[string]any{}
	result := []map[string]any{}
	var totalItems, totalBytes, totalMs float64
	for _, t := range types {
		key := mediaString(t["serverId"]) + "\x00" + mediaString(t["name"])
		g := groups[key]
		if g == nil {
			g = map[string]any{"name": t["name"], "serverId": t["serverId"], "server": t["server"], "collectionType": t["collectionType"], "types": []map[string]any{}, "ignoredCounts": []map[string]any{}, "totalItems": float64(0), "sizeBytes": float64(0), "durationMs": float64(0)}
			groups[key] = g
			result = append(result, g)
		}
		kind := mediaString(t["type"])
		isChild := kind == "Episode" || kind == "Season" || kind == "Audio" || kind == "Track"
		g["types"] = append(g["types"].([]map[string]any), t)
		g["sizeBytes"] = mediaNumber(g["sizeBytes"]) + mediaNumber(t["sizeBytes"])
		totalBytes += mediaNumber(t["sizeBytes"])
		if isChild {
			g["ignoredCounts"] = append(g["ignoredCounts"].([]map[string]any), t)
		} else {
			g["totalItems"] = mediaNumber(g["totalItems"]) + mediaNumber(t["count"])
			totalItems += mediaNumber(t["count"])
		}
		if kind != "Series" && kind != "Season" && kind != "MusicAlbum" {
			g["durationMs"] = mediaNumber(g["durationMs"]) + mediaNumber(t["durationMs"])
			totalMs += mediaNumber(t["durationMs"])
		}
	}
	for _, ranking := range []struct{ key, order string }{{"topItem", `COALESCE(a."plays",0) DESC,m."title" ASC`}, {"lastAdded", `m."dateAdded" DESC,m."id" DESC`}} {
		items, e := h.recoveredRows(r, base+`, ranked AS (`+recoveredItemSelect+`WHERE m."type" IN ('Movie','Series','MusicAlbum','Book','AudioBook')) SELECT * FROM (SELECT ranked.*,ROW_NUMBER() OVER (PARTITION BY "serverId","libraryName" ORDER BY `+strings.ReplaceAll(strings.ReplaceAll(ranking.order, `COALESCE(a."plays",0)`, `"plays"`), `m.`, ``)+`) AS rn FROM ranked) picked WHERE rn=1`, args...)
		if e != nil {
			jsonError(w, 500, "Impossible de charger les détails des collections.")
			return
		}
		for _, i := range items {
			g := groups[mediaString(i["serverId"])+"\x00"+mediaString(i["libraryName"])]
			if g != nil && (ranking.key != "topItem" || mediaNumber(i["plays"]) > 0) && (ranking.key != "lastAdded" || i["dateAdded"] != nil) {
				g[ranking.key] = i
			}
		}
	}
	for _, g := range result {
		// Historical Collections counts music tracks when present, falling back
		// to albums for libraries without tracks. Keep the raw album count and
		// the Go child breakdown available separately.
		var tracks, albums float64
		albumIndex := -1
		groupTypes := g["types"].([]map[string]any)
		for i, row := range groupTypes {
			switch mediaString(row["type"]) {
			case "Audio", "Track":
				tracks += mediaNumber(row["count"])
			case "MusicAlbum":
				albums += mediaNumber(row["count"])
				albumIndex = i
			}
		}
		g["albumCount"] = albums
		g["trackCount"] = tracks
		if tracks > 0 {
			g["totalItems"] = mediaNumber(g["totalItems"]) - albums + tracks
			totalItems += tracks - albums
			if albumIndex >= 0 {
				row := make(map[string]any, len(groupTypes[albumIndex]))
				for key, value := range groupTypes[albumIndex] {
					row[key] = value
				}
				row["count"] = tracks
				groupTypes[albumIndex] = row
			} else {
				groupTypes = append(groupTypes, map[string]any{"type": "MusicAlbum", "count": tracks})
			}
			g["types"] = groupTypes
		}
		g["totalHours"] = mediaNumber(g["durationMs"]) / 3600000
	}
	jsonResponse(w, 200, map[string]any{"collections": result, "totals": map[string]any{"items": totalItems, "sizeBytes": totalBytes, "durationMs": totalMs}})
}

func (h *Handler) recoveredMediaPopular(w http.ResponseWriter, r *http.Request) {
	base, args, err := h.recoveredMediaBase(r)
	if err != nil {
		jsonError(w, 403, "Identité utilisateur introuvable.")
		return
	}
	result := map[string]any{}
	for _, category := range []struct{ key, kind string }{{"movies", "Movie"}, {"series", "Series"}, {"musicAlbums", "MusicAlbum"}} {
		items, e := h.recoveredRows(r, base+recoveredItemSelect+`WHERE m."type"=? AND COALESCE(a."plays",0)>0 ORDER BY a."plays" DESC,a."watchTimeMs" DESC,m."title" LIMIT 5`, append(append([]any{}, args...), category.kind)...)
		if e != nil {
			jsonError(w, 500, "Impossible de charger les classements.")
			return
		}
		result[category.key] = items
	}
	tracks, err := h.recoveredRows(r, base+recoveredItemSelect+`WHERE m."type" IN ('Audio','Track') AND COALESCE(a."plays",0)>0 ORDER BY a."plays" DESC,a."watchTimeMs" DESC,m."title" LIMIT 5`, args...)
	if err != nil {
		jsonError(w, 500, "Impossible de charger le classement musical.")
		return
	}
	result["music"] = tracks
	// Episodes carry sparse person metadata. The historical rankings credit
	// their Series, resolved by the scoped family relation, alongside movies.
	played, err := h.recoveredRows(r, base+`SELECT source."directors",source."actors",source."studios",COUNT(p."id") AS "plays",SUM(p."durationWatched")*1000 AS "watchTimeMs" FROM valid p JOIN catalog m ON m."id"=p."mediaId" JOIN catalog source ON source."id"=CASE WHEN m."type"='Movie' THEN m."id" ELSE (SELECT series."id" FROM family f JOIN catalog series ON series."id"=f."root" WHERE f."member"=m."id" AND series."type"='Series' LIMIT 1) END WHERE m."type" IN ('Movie','Episode') GROUP BY source."id",source."directors",source."actors",source."studios"`, args...)
	if err != nil {
		jsonError(w, 500, "Impossible de charger les classements.")
		return
	}
	for _, key := range []string{"directors", "actors", "studios"} {
		scores := map[string]map[string]any{}
		for _, m := range played {
			for _, name := range m[key].([]string) {
				name = strings.TrimSpace(name)
				if name == "" {
					continue
				}
				s := scores[name]
				if s == nil {
					s = map[string]any{"name": name, "plays": float64(0), "watchTimeMs": float64(0)}
					scores[name] = s
				}
				s["plays"] = mediaNumber(s["plays"]) + mediaNumber(m["plays"])
				s["watchTimeMs"] = mediaNumber(s["watchTimeMs"]) + mediaNumber(m["watchTimeMs"])
			}
		}
		list := []map[string]any{}
		for _, s := range scores {
			list = append(list, s)
		}
		sort.Slice(list, func(i, j int) bool {
			if list[i]["plays"] == list[j]["plays"] {
				return mediaString(list[i]["name"]) < mediaString(list[j]["name"])
			}
			return mediaNumber(list[i]["plays"]) > mediaNumber(list[j]["plays"])
		})
		if len(list) > 5 {
			list = list[:5]
		}
		result[key] = list
	}
	jsonResponse(w, 200, result)
}

func (h *Handler) recoveredMediaArtist(w http.ResponseWriter, r *http.Request) {
	base, args, err := h.recoveredMediaBase(r)
	if err != nil {
		jsonError(w, 403, "Identité utilisateur introuvable.")
		return
	}
	name := r.PathValue("name")
	artistWhere := `LOWER(TRIM(COALESCE(m."artist",'')))=LOWER(TRIM(?))`
	artistArgs := append(append([]any{}, args...), name)
	albums, err := h.recoveredRows(r, base+recoveredItemSelect+`WHERE m."type"='MusicAlbum' AND (`+artistWhere+` OR EXISTS(SELECT 1 FROM family f JOIN catalog t ON t."id"=f."member" WHERE f."root"=m."id" AND LOWER(TRIM(COALESCE(t."artist",'')))=LOWER(TRIM(?)))) ORDER BY COALESCE(a."plays",0) DESC,m."title"`, append(artistArgs, name)...)
	if err != nil {
		jsonError(w, 500, "Impossible de charger l'artiste.")
		return
	}
	trackWhere := `m."type" IN ('Audio','Track') AND (` + artistWhere + ` OR EXISTS(SELECT 1 FROM family f JOIN catalog album ON album."id"=f."root" WHERE f."member"=m."id" AND album."type"='MusicAlbum' AND LOWER(TRIM(COALESCE(album."artist",'')))=LOWER(TRIM(?))))`
	summary, err := h.recoveredRows(r, base+`SELECT COUNT(*) AS "tracks",COALESCE(SUM(a."plays"),0) AS "plays",COALESCE(SUM(a."watchTimeMs"),0) AS "watchTimeMs" FROM catalog m LEFT JOIN agg a ON a."root"=m."id" WHERE `+trackWhere, append(artistArgs, name)...)
	if err != nil {
		jsonError(w, 500, "Impossible de charger l'artiste.")
		return
	}
	limit := boundedInt(r.URL.Query().Get("tracksLimit"), 25, 25, 50)
	pg := boundedInt(r.URL.Query().Get("tracksPage"), 1, 1, 1000000)
	pages := (int(mediaNumber(summary[0]["tracks"])) + limit - 1) / limit
	if pages < 1 {
		pages = 1
	}
	if pg > pages {
		pg = pages
	}
	tracks, err := h.recoveredRows(r, base+recoveredItemSelect+`WHERE `+trackWhere+` ORDER BY COALESCE(a."plays",0) DESC,m."title" LIMIT ? OFFSET ?`, append(append(artistArgs, name), limit, (pg-1)*limit)...)
	if err != nil {
		jsonError(w, 500, "Impossible de charger les pistes.")
		return
	}
	jsonResponse(w, 200, map[string]any{"name": name, "albums": albums, "tracks": tracks, "stats": summary[0], "tracksPage": pg, "tracksPages": pages, "tracksLimit": limit})
}

func (h *Handler) recoveredMediaAnalysis(w http.ResponseWriter, r *http.Request) {
	if p, ok := auth.PrincipalFromContext(r.Context()); ok && !p.IsAdmin() {
		jsonError(w, 403, "Accès administrateur requis.")
		return
	}
	base, args, err := h.recoveredMediaBase(r)
	if err != nil {
		jsonError(w, 403, "Identité utilisateur introuvable.")
		return
	}
	catalog, err := h.recoveredRows(r, base+recoveredItemSelect+`WHERE m."type" IN ('Movie','Series','MusicAlbum')`, args...)
	if err != nil {
		jsonError(w, 500, "Impossible de charger les analyses.")
		return
	}
	genres := map[string]int{}
	quality := map[string]int{}
	libraries := map[string]int{}
	var duration float64
	durationCount := 0
	for _, m := range catalog {
		for _, g := range m["genres"].([]string) {
			if strings.TrimSpace(g) != "" {
				genres[g]++
			}
		}
		if mediaString(m["type"]) != "MusicAlbum" {
			if q := mediaQuality(mediaString(m["displayResolution"])); q != "" {
				quality[q]++
			}
		}
		if lib := mediaString(m["library"]); lib != "" {
			libraries[lib]++
		}
		if d := mediaNumber(m["durationMs"]); d > 0 {
			duration += d
			durationCount++
		}
	}
	counts := func(m map[string]int) []map[string]any {
		out := []map[string]any{}
		for k, v := range m {
			out = append(out, map[string]any{"name": k, "count": v})
		}
		sort.Slice(out, func(i, j int) bool {
			if out[i]["count"] == out[j]["count"] {
				return mediaString(out[i]["name"]) < mediaString(out[j]["name"])
			}
			return out[i]["count"].(int) > out[j]["count"].(int)
		})
		return out
	}
	avg := float64(0)
	if durationCount > 0 {
		avg = duration / float64(durationCount)
	}
	sessions, err := h.recoveredRows(r, base+`SELECT p."id",p."userId",u."username",p."startedAt",p."durationWatched",m."type",m."genres",m."artist",series."id" AS "seriesId",series."title" AS "seriesTitle" FROM valid p JOIN catalog m ON m."id"=p."mediaId" LEFT JOIN "User" u ON u."id"=p."userId" LEFT JOIN family f ON f."member"=m."id" AND f."root" IN (SELECT "id" FROM catalog WHERE "type"='Series') LEFT JOIN catalog series ON series."id"=f."root" WHERE p."startedAt">=? ORDER BY p."userId",p."startedAt",p."id"`, append(append([]any{}, args...), time.Now().UTC().AddDate(0, 0, -30).Format(time.RFC3339Nano))...)
	if err != nil {
		jsonError(w, 500, "Impossible de charger les tendances.")
		return
	}
	binge, taste := recoveredMediaInsights(sessions)
	jsonResponse(w, 200, map[string]any{"totalMedia": len(catalog), "uniqueGenres": len(genres), "averageDurationMs": avg, "genres": counts(genres), "quality": counts(quality), "libraries": counts(libraries), "binge": binge, "taste": taste})
}

func recoveredMediaInsights(sessions []map[string]any) (map[string]any, map[string]any) {
	genreHours := map[string]map[string]any{}
	artists := map[string]map[string]any{}
	totalSeconds := float64(0)
	type runStats struct {
		title               string
		runs, episodes, max int
		seconds             float64
		users               map[string]int
	}
	runs := map[string]*runStats{}
	uid, series, user := "", "", ""
	count := 0
	seconds := float64(0)
	lastEnd := time.Time{}
	flush := func() {
		if count >= 3 && series != "" {
			s := runs[series]
			s.runs++
			s.episodes += count
			s.seconds += seconds
			if count > s.max {
				s.max = count
			}
			s.users[user] += count
		}
	}
	for _, p := range sessions {
		d := mediaNumber(p["durationWatched"])
		totalSeconds += d
		for _, g := range p["genres"].([]string) {
			g = strings.TrimSpace(g)
			if g == "" {
				continue
			}
			s := genreHours[g]
			if s == nil {
				s = map[string]any{"name": g, "seconds": float64(0), "plays": float64(0)}
				genreHours[g] = s
			}
			s["seconds"] = mediaNumber(s["seconds"]) + d
			s["plays"] = mediaNumber(s["plays"]) + 1
		}
		a := strings.TrimSpace(mediaString(p["artist"]))
		if a != "" {
			s := artists[a]
			if s == nil {
				s = map[string]any{"name": a, "seconds": float64(0), "plays": float64(0)}
				artists[a] = s
			}
			s["seconds"] = mediaNumber(s["seconds"]) + d
			s["plays"] = mediaNumber(s["plays"]) + 1
		}
		if mediaString(p["type"]) != "Episode" {
			continue
		}
		start, e := time.Parse(time.RFC3339Nano, mediaString(p["startedAt"]))
		if e != nil {
			continue
		}
		puid := mediaString(p["userId"])
		sid := mediaString(p["seriesId"])
		if puid == "" || sid == "" {
			continue
		}
		if puid != uid || sid != series || start.Sub(lastEnd) > 45*time.Minute {
			flush()
			uid = puid
			series = sid
			user = mediaString(p["username"])
			count = 0
			seconds = 0
			if runs[series] == nil {
				runs[series] = &runStats{title: mediaString(p["seriesTitle"]), users: map[string]int{}}
			}
		}
		count++
		seconds += d
		lastEnd = start.Add(time.Duration(d) * time.Second)
	}
	flush()
	bingeList := []map[string]any{}
	totalRuns := 0
	for sid, s := range runs {
		if s.runs == 0 {
			continue
		}
		top := ""
		best := 0
		for name, n := range s.users {
			if n > best || (n == best && name < top) {
				top = name
				best = n
			}
		}
		bingeList = append(bingeList, map[string]any{"seriesId": sid, "seriesTitle": s.title, "totalBingeSessions": s.runs, "avgEpisodesPerSession": float64(s.episodes) / float64(s.runs), "maxEpisodesInSingleRun": s.max, "topBingerUsername": top, "totalHoursBunged": s.seconds / 3600})
		totalRuns += s.runs
	}
	sort.Slice(bingeList, func(i, j int) bool {
		return bingeList[i]["totalBingeSessions"].(int) > bingeList[j]["totalBingeSessions"].(int)
	})
	ranked := func(scores map[string]map[string]any) []map[string]any {
		out := []map[string]any{}
		for _, s := range scores {
			s["hours"] = mediaNumber(s["seconds"]) / 3600
			pct := float64(0)
			if totalSeconds > 0 {
				pct = mediaNumber(s["seconds"]) / totalSeconds * 100
			}
			s["percentage"] = pct
			out = append(out, s)
		}
		sort.Slice(out, func(i, j int) bool {
			if out[i]["seconds"] == out[j]["seconds"] {
				return mediaString(out[i]["name"]) < mediaString(out[j]["name"])
			}
			return mediaNumber(out[i]["seconds"]) > mediaNumber(out[j]["seconds"])
		})
		return out
	}
	topGenres := ranked(genreHours)
	topArtists := ranked(artists)
	// Historical editorial scores are heuristics, not probabilities. Preserve
	// their fields alongside the measured demand added by the Go architecture.
	suggestions := []map[string]any{}
	demandSuggestions := []map[string]any{}
	for i, g := range topGenres {
		if i >= 2 {
			break
		}
		demand := map[string]any{"kind": "genre", "name": g["name"], "hours": g["hours"], "percentage": g["percentage"], "plays": g["plays"]}
		demandSuggestions = append(demandSuggestions, demand)
		suggestions = append(suggestions, recoveredAcquisitionSuggestion(demand, i, totalSeconds/3600))
	}
	if len(topArtists) > 0 {
		a := topArtists[0]
		demand := map[string]any{"kind": "artist", "name": a["name"], "hours": a["hours"], "plays": a["plays"]}
		demandSuggestions = append(demandSuggestions, demand)
		suggestions = append(suggestions, recoveredAcquisitionSuggestion(demand, 0, totalSeconds/3600))
	}
	if len(topGenres) > 8 {
		topGenres = topGenres[:8]
	}
	if len(topArtists) > 6 {
		topArtists = topArtists[:6]
	}
	return map[string]any{"allBingedSeries": bingeList, "totalBingeSessionsMonth": totalRuns}, map[string]any{"topGenres": topGenres, "topArtists": topArtists, "acquisitionSuggestions": suggestions, "demandSuggestions": demandSuggestions, "totalAnalyzedHours": totalSeconds / 3600}
}

func recoveredAcquisitionSuggestion(demand map[string]any, rank int, totalHours float64) map[string]any {
	suggestion := map[string]any{"scoreKind": "historical_heuristic"}
	for key, value := range demand {
		suggestion[key] = value
	}
	name := mediaString(demand["name"])
	hours := math.Round(mediaNumber(demand["hours"])*10) / 10
	percentage := float64(0)
	if totalHours > 0 {
		percentage = math.Min(100, math.Round(hours/totalHours*100))
	}
	if demand["kind"] == "artist" {
		suggestion["category"] = "Artiste / Réalisateur Vedette"
		suggestion["title"] = "Compléter la filmographie / discographie de " + name
		suggestion["reason"] = fmt.Sprintf("Cumule %gh d'écoute/visionnage sur %g lectures.", hours, mediaNumber(demand["plays"]))
		suggestion["scorePercent"] = 92
		suggestion["badge"] = "Favori Utilisateurs"
	} else if rank == 0 {
		suggestion["category"] = "Genre Dominant"
		suggestion["title"] = "Enrichir la collection " + name
		suggestion["reason"] = fmt.Sprintf("Représente %g%% du temps total de visionnage (%gh). Vos spectateurs en redemandent !", percentage, hours)
		suggestion["scorePercent"] = math.Min(99, math.Max(70, percentage+20))
		suggestion["badge"] = "Très Forte Demande"
	} else {
		suggestion["category"] = "Genre Tendance"
		suggestion["title"] = "Films & Séries " + name
		suggestion["reason"] = fmt.Sprintf("Deuxième genre le plus plébiscité avec %gh visionnées sur les 30 derniers jours.", hours)
		suggestion["scorePercent"] = math.Min(85, math.Max(50, percentage+15))
		suggestion["badge"] = "Tendance Forte"
	}
	return suggestion
}
