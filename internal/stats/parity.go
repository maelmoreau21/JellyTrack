package stats

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"strings"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/internal/history"
	"github.com/maelmoreau21/jellytrack/internal/media"
)

// CompletionEntry represents one measured user/server/media completion. The
// selected period chooses the keys; progress includes earlier resumed sessions.
type CompletionEntry struct {
	UserID, ServerID, MediaID, JellyfinID, Title, Type, Library, Bucket string
	WatchedSeconds, RuntimeMS                                           int64
	Percent                                                             float64
}

type completionRule struct {
	Enabled   *bool    `json:"completionEnabled"`
	Completed *float64 `json:"completedThreshold"`
	Partial   *float64 `json:"partialThreshold"`
	Abandoned *float64 `json:"abandonedThreshold"`
}

type completionSettings struct {
	Default   completionRule            `json:"default"`
	Libraries map[string]completionRule `json:"libraries"`
}

func libraryKey(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	switch value {
	case "movie", "movies", "film", "films":
		return "movies"
	case "series", "season", "episode", "tv", "tvshows", "shows":
		return "tvshows"
	case "audio", "track", "musicalbum", "music", "albums":
		return "music"
	case "book", "audiobook", "books":
		return "books"
	}
	return value
}

func completionThresholds(key string, config completionSettings) (completed, partial, abandoned float64, enabled bool) {
	completed, partial, abandoned, enabled = 80, 20, 10, true
	if key == "music" {
		completed, partial, abandoned = 60, 30, 12
	}
	rule := config.Default
	if key == "movies" || key == "tvshows" || key == "music" || key == "books" || key == "filmsuhd" || key == "seriesuhd" || key == "homevideos" || key == "photos" || key == "livetv" {
		rule = completionRule{}
	}
	if configured, ok := config.Libraries[key]; ok {
		rule = configured
	}
	if rule.Enabled != nil && !*rule.Enabled {
		enabled = false
	}
	clamp := func(v float64) float64 { return math.Max(0, math.Min(100, math.Round(v))) }
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
	return
}

func completionBucket(percent float64, key string, config completionSettings) string {
	completed, partial, abandoned, enabled := completionThresholds(key, config)
	if !enabled {
		return "skipped"
	}
	switch {
	case percent >= completed:
		return "completed"
	case percent >= partial:
		return "partial"
	case percent >= abandoned:
		return "abandoned"
	default:
		return "skipped"
	}
}

// CompletionFilterClause matches the same all-time user/server/media progress as
// the charts. rulesJSON may be empty for historical defaults or the completionRules
// object from settings. The selected period is applied to the outer history query.
func CompletionFilterClause(historyAlias, mediaAlias, bucket, rulesJSON string, zapping bool) (string, error) {
	validAlias := regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*$`)
	if !validAlias.MatchString(historyAlias) || !validAlias.MatchString(mediaAlias) {
		return "", fmt.Errorf("invalid SQL alias")
	}
	switch bucket {
	case "finished", "completed":
		bucket = "completed"
	case "almost", "partial":
		bucket = "partial"
	case "abandoned", "skipped":
	default:
		return "", fmt.Errorf("invalid completion bucket")
	}
	var config completionSettings
	if rulesJSON != "" {
		if err := json.Unmarshal([]byte(rulesJSON), &config); err != nil {
			return "", err
		}
	}
	h, m := historyAlias, mediaAlias
	key := `LOWER(REPLACE(REPLACE(REPLACE(COALESCE(NULLIF(` + m + `."collectionType",''),` + m + `."type"),' ',''),'_',''),'-',''))`
	kind := `(CASE ` + key + ` WHEN 'audio' THEN 'music' WHEN 'track' THEN 'music' WHEN 'musicalbum' THEN 'music' WHEN 'episode' THEN 'tvshows' WHEN 'season' THEN 'tvshows' WHEN 'series' THEN 'tvshows' WHEN 'movie' THEN 'movies' WHEN 'audiobook' THEN 'books' WHEN 'book' THEN 'books' ELSE ` + key + ` END)`
	keys := []string{"movies", "tvshows", "music", "books", "filmsuhd", "seriesuhd", "homevideos", "photos", "livetv"}
	thresholdSQL := func(which int) string {
		value := func(k string) string {
			c, p, a, e := completionThresholds(k, config)
			if !e {
				return "101"
			}
			return fmt.Sprintf("%.0f", []float64{c, p, a}[which])
		}
		parts := []string{"CASE " + kind}
		for _, k := range keys {
			parts = append(parts, "WHEN '"+k+"' THEN "+value(k))
		}
		return strings.Join(parts, " ") + " ELSE " + value("other") + " END"
	}
	refWhere := `COALESCE(cp."userId",'')=COALESCE(` + h + `."userId",'') AND cp."serverId"=` + h + `."serverId" AND cp."mediaId"=` + h + `."mediaId"`
	if zapping {
		refWhere += " AND " + history.ZappingClause("cp")
	}
	measured := `SUM(cp."durationWatched") * 100000.0 / NULLIF(` + m + `."durationMs",0)`
	percent := `(CASE WHEN ` + measured + `>100 THEN 100 WHEN ` + measured + `<0 THEN 0 ELSE ` + measured + ` END)`
	c, p, a := thresholdSQL(0), thresholdSQL(1), thresholdSQL(2)
	bucketSQL := `(CASE WHEN ` + percent + `>=(` + c + `) THEN 'completed' WHEN ` + percent + `>=(` + p + `) THEN 'partial' WHEN ` + percent + `>=(` + a + `) THEN 'abandoned' ELSE 'skipped' END)`
	return `(` + m + `."durationMs">0 AND EXISTS(SELECT 1 FROM "PlaybackHistory" cp WHERE ` + refWhere + ` GROUP BY cp."userId",cp."serverId",cp."mediaId" HAVING ` + bucketSQL + `='` + bucket + `'))`, nil
}

// GetCumulativeCompletion omits unknown runtimes instead of manufacturing a
// progress percentage. Server and user remain part of the key to avoid merging
// separate accounts or same-named media on different servers.
func GetCumulativeCompletion(ctx context.Context, db *sql.DB, driver string, filter DashboardFilter) ([]CompletionEntry, error) {
	return getCumulativeCompletion(ctx, db, driver, filter, false)
}

func getCumulativeCompletion(ctx context.Context, db *sql.DB, driver string, filter DashboardFilter, zapping bool) ([]CompletionEntry, error) {
	clauses, args, _, _, err := analyticsConditions(filter, time.Now().UTC())
	if err != nil {
		return nil, err
	}
	clauses = append(clauses, media.ExcludedLibrariesClause(driver, "m"))
	if zapping {
		clauses = append(clauses, history.ZappingClause("p"))
	}
	refClause := ""
	if zapping {
		refClause = " AND " + history.ZappingClause("p")
	}
	query := database.Bind(`WITH scoped AS (
 SELECT DISTINCT COALESCE(p."userId",'' ) AS "userId",p."serverId",p."mediaId"
 FROM "PlaybackHistory" p JOIN "Media" m ON m."id"=p."mediaId"
 WHERE `+strings.Join(clauses, " AND ")+`)
 SELECT scoped."userId",scoped."serverId",m."id",m."jellyfinMediaId",m."title",m."type",
 `+media.LibraryNameSQL("m")+`,COALESCE(NULLIF(m."collectionType",''),m."type"),m."durationMs",SUM(p."durationWatched")
 FROM scoped JOIN "PlaybackHistory" p ON COALESCE(p."userId",'')=scoped."userId" AND p."serverId"=scoped."serverId" AND p."mediaId"=scoped."mediaId"
 JOIN "Media" m ON m."id"=scoped."mediaId"
 WHERE m."durationMs">0`+refClause+`
 GROUP BY scoped."userId",scoped."serverId",m."id",m."serverId",m."parentId",m."jellyfinMediaId",m."title",m."type",m."collectionType",m."libraryName",m."durationMs"`, driver)
	var config completionSettings
	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []CompletionEntry{}
	for rows.Next() {
		var entry CompletionEntry
		var completionKind string
		if err := rows.Scan(&entry.UserID, &entry.ServerID, &entry.MediaID, &entry.JellyfinID, &entry.Title, &entry.Type, &entry.Library, &completionKind, &entry.RuntimeMS, &entry.WatchedSeconds); err != nil {
			return nil, err
		}
		entry.Percent = math.Max(0, math.Min(100, float64(entry.WatchedSeconds)*100000/float64(entry.RuntimeMS)))
		entry.Bucket = completionBucket(entry.Percent, libraryKey(completionKind), config)
		ruleKey := libraryKey(entry.Library)
		if configured, ok := config.Libraries[ruleKey]; ok {
			entry.Bucket = completionBucket(entry.Percent, ruleKey, completionSettings{Libraries: map[string]completionRule{ruleKey: configured}})
		}
		result = append(result, entry)
	}
	return result, rows.Err()
}

var parenthesizedLanguage = regexp.MustCompile(`\(.*\)`)
var twoLetterLanguage = regexp.MustCompile(`^([a-z]{2})(?:-[a-z]{2})?$`)
var languageLetters = regexp.MustCompile(`[^a-z]+`)

// NormalizeLanguageTag follows the historical primary-language normalization,
// retaining raw playback records for exact drilldown aliases at the API boundary.
func NormalizeLanguageTag(value string) string {
	value = strings.TrimSpace(parenthesizedLanguage.ReplaceAllString(value, ""))
	value = strings.NewReplacer("\\", "/", ",", "/", ";", "/").Replace(value)
	value = strings.ToLower(strings.TrimSpace(strings.Split(value, "/")[0]))
	value = strings.ReplaceAll(value, "_", "-")
	if invalidTelemetryToken(value) {
		return ""
	}
	if match := twoLetterLanguage.FindStringSubmatch(value); len(match) > 1 {
		return strings.ToUpper(match[1])
	}
	token := strings.Fields(value)
	if len(token) == 0 || invalidTelemetryToken(token[0]) {
		return ""
	}
	quick := map[string]string{"fre": "FR", "fra": "FR", "eng": "EN", "spa": "ES", "por": "PT", "deu": "DE", "ger": "DE", "ita": "IT", "nld": "NL", "zho": "ZH", "chi": "ZH", "jpn": "JA", "kor": "KO", "rus": "RU", "pol": "PL", "french": "FR", "english": "EN", "spanish": "ES", "portuguese": "PT", "german": "DE", "italian": "IT", "dutch": "NL", "chinese": "ZH", "japanese": "JA", "korean": "KO", "russian": "RU", "polish": "PL"}
	if normalized := quick[token[0]]; normalized != "" {
		return normalized
	}
	letters := languageLetters.ReplaceAllString(token[0], "")
	if len(letters) >= 2 {
		return strings.ToUpper(letters[:2])
	}
	return ""
}

func invalidTelemetryToken(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", "none", "off", "disabled", "unknown", "unk", "und", "undefined", "null", "n/a", "na", "-":
		return true
	}
	return false
}

func visualTelemetry(kind string) bool {
	switch strings.ToLower(kind) {
	case "audio", "track", "musicalbum", "book", "audiobook":
		return false
	}
	return true
}
