package api

import (
	"database/sql"
	"encoding/json"
	"math"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"time"
)

type cleanupNavigationMedia struct {
	ID                 string  `json:"id"`
	ServerID           string  `json:"serverId"`
	JellyfinMediaID    string  `json:"jellyfinMediaId"`
	Title              string  `json:"title"`
	Type               string  `json:"type"`
	Library            string  `json:"libraryName"`
	Resolution         string  `json:"resolution"`
	CreatedAt          string  `json:"createdAt"`
	Duration           int64   `json:"durationMs"`
	Size               int64   `json:"size"`
	Completion         float64 `json:"maxCompletion"`
	LastPlayed         string  `json:"lastPlayed"`
	parent, collection string
	plays              int64
	bestWatched        int64
}

// Read-only data for the three historic nested cleanup panels. Go's existing
// cleanup actions remain separate and retain their original API contracts.
func (h *Handler) navigationCleanup(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.QueryContext(r.Context(), `SELECT "id","serverId","jellyfinMediaId","title","type",COALESCE("libraryName",''),COALESCE("resolution",''),"createdAt",COALESCE("durationMs",0),COALESCE("size",0),COALESCE("parentId",''),COALESCE("collectionType",'') FROM "Media"`)
	if err != nil {
		jsonError(w, 500, "Impossible de lire les médias.")
		return
	}
	items := map[string]*cleanupNavigationMedia{}
	byJellyfin := map[string]*cleanupNavigationMedia{}
	for rows.Next() {
		m := &cleanupNavigationMedia{}
		if err := rows.Scan(&m.ID, &m.ServerID, &m.JellyfinMediaID, &m.Title, &m.Type, &m.Library, &m.Resolution, &m.CreatedAt, &m.Duration, &m.Size, &m.parent, &m.collection); err != nil {
			rows.Close()
			jsonError(w, 500, "Impossible de lire les médias.")
			return
		}
		items[m.ID] = m
		byJellyfin[m.ServerID+"\x00"+m.JellyfinMediaID] = m
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		jsonError(w, 500, "Impossible de lire les médias.")
		return
	}
	history, err := h.db.QueryContext(r.Context(), `SELECT "mediaId",COALESCE("userId",'anonymous'),COUNT(*),COALESCE(SUM(CASE WHEN "durationWatched">0 THEN "durationWatched" ELSE 0 END),0),MAX(CASE WHEN "durationWatched">0 THEN "startedAt" END) FROM "PlaybackHistory" GROUP BY "mediaId",COALESCE("userId",'anonymous')`)
	if err != nil {
		jsonError(w, 500, "Impossible de lire les lectures.")
		return
	}
	for history.Next() {
		var id, user string
		var count, watched int64
		var last sql.NullString
		if err := history.Scan(&id, &user, &count, &watched, &last); err != nil {
			history.Close()
			jsonError(w, 500, "Impossible de lire les lectures.")
			return
		}
		if m := items[id]; m != nil {
			m.plays += count
			if watched > m.bestWatched {
				m.bestWatched = watched
			}
			if last.Valid && last.String > m.LastPlayed {
				m.LastPlayed = last.String
			}
		}
	}
	err = history.Err()
	history.Close()
	if err != nil {
		jsonError(w, 500, "Impossible de lire les lectures.")
		return
	}
	// Aggregate children's play counts within their server, through two ancestors.
	childPlays := map[string]int64{}
	for _, m := range items {
		parent := m.parent
		for level := 0; level < 2 && parent != ""; level++ {
			key := m.ServerID + "\x00" + parent
			childPlays[key] += m.plays
			p := byJellyfin[key]
			if p == nil {
				break
			}
			parent = p.parent
		}
	}
	var settingsRaw sql.NullString
	_ = h.db.QueryRowContext(r.Context(), `SELECT "resolutionThresholds" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&settingsRaw)
	var settings map[string]json.RawMessage
	_ = json.Unmarshal([]byte(settingsRaw.String), &settings)
	var rules map[string]json.RawMessage
	_ = json.Unmarshal(settings["completionRules"], &rules)
	ghosts, abandoned, duplicates := []cleanupNavigationMedia{}, []cleanupNavigationMedia{}, []cleanupNavigationMedia{}
	groups := map[string][]*cleanupNavigationMedia{}
	separators := regexp.MustCompile(`[\s\-_.:]+`)
	cutoff := time.Now().AddDate(0, 0, -30)
	for _, m := range items {
		parentType := m.Type == "Movie" || m.Type == "Series" || m.Type == "MusicAlbum"
		if parentType {
			key := m.Type + ":" + separators.ReplaceAllString(strings.ToLower(strings.TrimSpace(m.Title)), " ")
			if m.Type != "MusicAlbum" {
				groups[key] = append(groups[key], m)
			}
			created := cleanupCreatedTime(m.CreatedAt)
			if !created.IsZero() && created.Before(cutoff) && m.plays == 0 && (m.Type == "Movie" || childPlays[m.ServerID+"\x00"+m.JellyfinMediaID] == 0) {
				ghosts = append(ghosts, *m)
			}
		}
		if m.Duration > 0 && m.bestWatched > 0 && (m.Type == "Movie" || m.Type == "Episode" || m.Type == "Audio") {
			m.Completion = math.Min(100, float64(m.bestWatched)*100000/float64(m.Duration))
			if cleanupAbandoned(m, rules) {
				copy := *m
				if p := byJellyfin[m.ServerID+"\x00"+m.parent]; p != nil {
					copy.Title = p.Title + " — " + copy.Title
					if m.Type == "Episode" {
						if gp := byJellyfin[m.ServerID+"\x00"+p.parent]; gp != nil {
							copy.Title = gp.Title + " — " + copy.Title
						}
					}
				}
				abandoned = append(abandoned, copy)
			}
		}
	}
	for _, group := range groups {
		if len(group) > 1 {
			for _, m := range group {
				duplicates = append(duplicates, *m)
			}
		}
	}
	sort.Slice(ghosts, func(i, j int) bool { return ghosts[i].CreatedAt < ghosts[j].CreatedAt })
	sort.Slice(abandoned, func(i, j int) bool { return abandoned[i].Completion < abandoned[j].Completion })
	sort.Slice(duplicates, func(i, j int) bool { return duplicates[i].Title < duplicates[j].Title })
	jsonResponse(w, 200, map[string]any{"ghostMedia": ghosts, "abandonedMedia": abandoned, "duplicateMedia": duplicates})
}

func cleanupCreatedTime(value string) time.Time {
	for _, layout := range []string{time.RFC3339Nano, "2006-01-02 15:04:05"} {
		if t, err := time.Parse(layout, value); err == nil {
			return t
		}
	}
	return time.Time{}
}

func cleanupAbandoned(m *cleanupNavigationMedia, rules map[string]json.RawMessage) bool {
	key := strings.ToLower(m.collection)
	if key == "" {
		switch m.Type {
		case "Movie":
			key = "movies"
		case "Episode":
			key = "tvshows"
		case "Audio":
			key = "music"
		}
	}
	partial, abandoned := 20.0, 10.0
	if key == "music" {
		partial, abandoned = 30, 12
	}
	var libraries map[string]json.RawMessage
	_ = json.Unmarshal(rules["libraries"], &libraries)
	raw := libraries[key]
	if len(raw) == 0 {
		raw = rules[key]
	}
	var rule struct {
		Enabled   *bool    `json:"completionEnabled"`
		Completed *float64 `json:"completedThreshold"`
		Partial   *float64 `json:"partialThreshold"`
		Abandoned *float64 `json:"abandonedThreshold"`
	}
	_ = json.Unmarshal(raw, &rule)
	if rule.Enabled != nil && !*rule.Enabled {
		return false
	}
	completed := 80.0
	if key == "music" {
		completed = 60
	}
	clamp := func(value float64) float64 { return math.Max(0, math.Min(100, math.Round(value))) }
	if rule.Completed != nil {
		completed = clamp(*rule.Completed)
	}
	completed = math.Max(1, completed)
	if rule.Partial != nil {
		partial = clamp(*rule.Partial)
	}
	partial = math.Max(1, math.Min(partial, completed-1))
	if rule.Abandoned != nil {
		abandoned = clamp(*rule.Abandoned)
	}
	abandoned = math.Max(0, math.Min(abandoned, partial-1))
	return m.Completion < completed && m.Completion < partial && m.Completion >= abandoned
}
