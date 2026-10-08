// Package stats provides analytics, dashboard aggregations, deep statistics, heatmaps, and predictions.
package stats

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/internal/history"
	"github.com/maelmoreau21/jellytrack/internal/media"
)

// DashboardResult holds dashboard KPIs and trends.
type DashboardResult struct {
	PeriodDays int              `json:"periodDays"`
	Views      int64            `json:"views"`
	DurationMs int64            `json:"durationMs"`
	Users      int64            `json:"users"`
	Media      int64            `json:"media"`
	Activity   []map[string]any `json:"activity"`
}

// GetDashboard calculates high-level statistics for the dashboard view.
func GetDashboard(ctx context.Context, db *sql.DB, driver string, days int) (DashboardResult, error) {
	if days <= 0 || days > 365 {
		days = 30
	}
	since := time.Now().UTC().AddDate(0, 0, -days).Format(time.RFC3339Nano)
	excluded := media.ExcludedLibrariesClause(driver, "m")
	zapping := history.ZappingClause("p")

	var views, durationSec int64

	summaryQ := database.Bind(fmt.Sprintf(`
		SELECT COUNT(*), COALESCE(SUM(p."durationWatched"), 0)
		FROM "PlaybackHistory" p
		JOIN "Media" m ON m."id" = p."mediaId"
		WHERE p."startedAt" >= ? AND %s AND %s
	`, excluded, zapping), driver)

	if err := db.QueryRowContext(ctx, summaryQ, since).Scan(&views, &durationSec); err != nil {
		return DashboardResult{}, err
	}

	var users, mediaCount int64
	_ = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM "User" WHERE "isActive" = 1`).Scan(&users)
	_ = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM "Media"`).Scan(&mediaCount)

	activityQ := database.Bind(fmt.Sprintf(`
		SELECT substr(CAST(p."startedAt" AS TEXT), 1, 10) AS "day", COUNT(*)
		FROM "PlaybackHistory" p
		JOIN "Media" m ON m."id" = p."mediaId"
		WHERE p."startedAt" >= ? AND %s AND %s
		GROUP BY "day"
		ORDER BY "day" ASC
	`, excluded, zapping), driver)

	rows, err := db.QueryContext(ctx, activityQ, since)
	var activity []map[string]any
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var day string
			var count int64
			if err := rows.Scan(&day, &count); err == nil {
				activity = append(activity, map[string]any{"day": day, "views": count})
			}
		}
	}

	return DashboardResult{
		PeriodDays: days,
		Views:      views,
		DurationMs: durationSec * 1000,
		Users:      users,
		Media:      mediaCount,
		Activity:   activity,
	}, nil
}

// DeepStatsResult holds top directors, actors, and studios from the media catalog.
type DeepStatsResult struct {
	Directors []map[string]any `json:"directors"`
	Actors    []map[string]any `json:"actors"`
	Studios   []map[string]any `json:"studios"`
}

// GetDeepStats computes top directors, actors, and studios across movies and series.
func GetDeepStats(ctx context.Context, db *sql.DB) (DeepStatsResult, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT "directors", "actors", "studios"
		FROM "Media"
		WHERE "type" IN ('Movie', 'Series')
	`)
	if err != nil {
		return DeepStatsResult{}, err
	}
	defer rows.Close()

	dirMap := make(map[string]int)
	actMap := make(map[string]int)
	stuMap := make(map[string]int)

	for rows.Next() {
		var dStr, aStr, sStr any
		if rows.Scan(&dStr, &aStr, &sStr) == nil {
			for _, d := range parseList(dStr) {
				dirMap[d]++
			}
			for _, a := range parseList(aStr) {
				actMap[a]++
			}
			for _, s := range parseList(sStr) {
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
		out := make([]map[string]any, len(list))
		for i, p := range list {
			out[i] = map[string]any{"name": p.k, "count": p.v}
		}
		return out
	}

	return DeepStatsResult{
		Directors: sortLimit(dirMap),
		Actors:    sortLimit(actMap),
		Studios:   sortLimit(stuMap),
	}, nil
}

// GetGeoStats returns view counts and watch duration aggregated by country and city.
func GetGeoStats(ctx context.Context, db *sql.DB, driver string, days int) (map[string]any, error) {
	if days <= 0 {
		days = 30
	}
	since := time.Now().UTC().AddDate(0, 0, -days).Format(time.RFC3339Nano)

	query := database.Bind(`
		SELECT COALESCE("country", 'Unknown') AS c, COUNT(*), COALESCE(SUM("durationWatched"), 0)
		FROM "PlaybackHistory"
		WHERE "startedAt" >= ? AND "country" IS NOT NULL AND "country" != ''
		GROUP BY c
		ORDER BY 2 DESC
		LIMIT 50
	`, driver)

	rows, err := db.QueryContext(ctx, query, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var countries []map[string]any
	for rows.Next() {
		var country string
		var views, duration int64
		if rows.Scan(&country, &views, &duration) == nil {
			countries = append(countries, map[string]any{
				"country":  country,
				"views":    views,
				"duration": duration,
			})
		}
	}

	return map[string]any{
		"periodDays": days,
		"countries":  countries,
	}, nil
}

// HeatmapCell represents activity during a specific day of the week and hour.
type HeatmapCell struct {
	DayOfWeek int   `json:"dayOfWeek"` // 0=Sunday, 6=Saturday
	Day       int   `json:"day"`       // Alias for frontend compatibility
	Hour      int   `json:"hour"`      // 0-23
	Views     int64 `json:"views"`
	Value     int64 `json:"value"`     // Alias for frontend compatibility
	Duration  int64 `json:"duration"`
}

// GetHeatmapDetail generates a 7x24 viewing matrix.
func GetHeatmapDetail(ctx context.Context, db *sql.DB, driver string, days int, userID string) ([]HeatmapCell, error) {
	if days <= 0 {
		days = 90
	}
	since := time.Now().UTC().AddDate(0, 0, -days).Format(time.RFC3339Nano)

	var conditions []string
	var args []any
	conditions = append(conditions, `"startedAt" >= ?`)
	args = append(args, since)

	if userID != "" {
		conditions = append(conditions, `"userId" = ?`)
		args = append(args, userID)
	}

	whereClause := "WHERE " + strings.Join(conditions, " AND ")

	query := database.Bind(fmt.Sprintf(`
		SELECT "startedAt", "durationWatched"
		FROM "PlaybackHistory"
		%s
	`, whereClause), driver)

	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// 7 days x 24 hours
	matrix := make([][24]struct{ views, dur int64 }, 7)

	for rows.Next() {
		var startedStr string
		var dur int64
		if rows.Scan(&startedStr, &dur) == nil {
			var t time.Time
			var parseErr error
			if t, parseErr = time.Parse(time.RFC3339Nano, startedStr); parseErr != nil {
				t, parseErr = time.Parse("2006-01-02 15:04:05", startedStr)
			}
			if parseErr == nil {
				w := int(t.Weekday())
				h := t.Hour()
				cell := matrix[w][h]
				cell.views++
				cell.dur += dur
				matrix[w][h] = cell
			}
		}
	}

	var result []HeatmapCell
	for d := 0; d < 7; d++ {
		for h := 0; h < 24; h++ {
			c := matrix[d][h]
			if c.views > 0 {
				result = append(result, HeatmapCell{
					DayOfWeek: d,
					Hour:      h,
					Views:     c.views,
					Duration:  c.dur,
				})
			}
		}
	}

	return result, nil
}

// GetPredictions estimates future watch volume based on 30-day historical trend.
func GetPredictions(ctx context.Context, db *sql.DB, driver string) (map[string]any, error) {
	since := time.Now().UTC().AddDate(0, 0, -30).Format(time.RFC3339Nano)

	var count30d, dur30d int64
	q := database.Bind(`SELECT COUNT(*), COALESCE(SUM("durationWatched"), 0) FROM "PlaybackHistory" WHERE "startedAt" >= ?`, driver)
	_ = db.QueryRowContext(ctx, q, since).Scan(&count30d, &dur30d)

	dailyAvgViews := float64(count30d) / 30.0
	dailyAvgDur := float64(dur30d) / 30.0

	return map[string]any{
		"dailyEstimatedViews":     mathRound(dailyAvgViews, 1),
		"weeklyEstimatedViews":    mathRound(dailyAvgViews*7, 1),
		"monthlyEstimatedViews":   mathRound(dailyAvgViews*30, 0),
		"dailyEstimatedDurationS": mathRound(dailyAvgDur, 0),
	}, nil
}

// GetMetadataAudit identifies media items missing posters, resolutions, genres, or duration.
func GetMetadataAudit(ctx context.Context, db *sql.DB) (map[string]any, error) {
	var missingRes, missingDur, missingGenres int64
	_ = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM "Media" WHERE "resolution" IS NULL OR "resolution" = ''`).Scan(&missingRes)
	_ = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM "Media" WHERE "durationMs" IS NULL OR "durationMs" <= 0`).Scan(&missingDur)
	_ = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM "Media" WHERE "genres" IS NULL OR "genres" = '[]' OR "genres" = '{}'`).Scan(&missingGenres)

	var totalMedia int64
	_ = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM "Media"`).Scan(&totalMedia)

	return map[string]any{
		"totalMedia":         totalMedia,
		"missingResolution": missingRes,
		"missingDuration":   missingDur,
		"missingGenres":     missingGenres,
	}, nil
}

func parseList(val any) []string {
	if val == nil {
		return nil
	}
	switch v := val.(type) {
	case string:
		var list []string
		if json.Unmarshal([]byte(v), &list) == nil {
			return list
		}
		// Try comma-separated or postgres array format "{A,B}"
		trimmed := strings.Trim(v, "{}")
		if trimmed != "" {
			return strings.Split(trimmed, ",")
		}
	case []string:
		return v
	case []byte:
		var list []string
		if json.Unmarshal(v, &list) == nil {
			return list
		}
	}
	return nil
}

func mathRound(val float64, precision int) float64 {
	pow := 1.0
	for i := 0; i < precision; i++ {
		pow *= 10.0
	}
	return float64(int64(val*pow+0.5)) / pow
}
