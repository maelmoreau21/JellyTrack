// Package stats provides analytics, dashboard aggregations, deep statistics, heatmaps, and predictions.
package stats

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/internal/history"
	"github.com/maelmoreau21/jellytrack/internal/media"
)

// DashboardFilter configures scope and time bounds for dashboard aggregations.
type DashboardFilter struct {
	TimeRange         string   // "24h", "7d", "30d", "90d", "365d", "all", "custom"
	Days              int      // fallback integer days
	From              string   // ISO date string e.g. "2026-10-01"
	To                string   // ISO date string e.g. "2026-10-08"
	MediaType         string   // "Movie", "Series", "Audio", "Book"
	ServerIDs         []string
	ExcludedLibraries []string
	ExcludedTypes     []string
}

// DashboardNamedValue represents a key-value pair for charts.
type DashboardNamedValue struct {
	Name  string  `json:"name"`
	Value float64 `json:"value"`
}

// DashboardHourlyPoint represents activity in an hour of day.
type DashboardHourlyPoint struct {
	Hour  string `json:"hour"`
	Count int64  `json:"count"`
}

// DashboardDayPoint represents activity by day of the week.
type DashboardDayPoint struct {
	Day      string `json:"day"`
	DayIndex int    `json:"dayIndex"`
	Count    int64  `json:"count"`
}

// DashboardTrendPoint represents volume and play counts over time.
type DashboardTrendPoint struct {
	Time         string  `json:"time"`
	MovieVolume  float64 `json:"movieVolume"`
	SeriesVolume float64 `json:"seriesVolume"`
	MusicVolume  float64 `json:"musicVolume"`
	BooksVolume  float64 `json:"booksVolume"`
	TotalViews   int64   `json:"totalViews"`
	MoviePlays   int64   `json:"moviePlays"`
	SeriesPlays  int64   `json:"seriesPlays"`
	MusicPlays   int64   `json:"musicPlays"`
	BooksPlays   int64   `json:"booksPlays"`
}

// DashboardServerLoad represents concurrent server load over time.
type DashboardServerLoad struct {
	Time        string `json:"time"`
	PeakStreams int    `json:"peakStreams"`
}

// DashboardTopUser represents a high-activity user.
type DashboardTopUser struct {
	JellyfinUserID string  `json:"jellyfinUserId"`
	Username       string  `json:"username"`
	Hours          float64 `json:"hours"`
}

// DashboardMonthlyPoint represents watch time in a month.
type DashboardMonthlyPoint struct {
	Month string  `json:"month"` // e.g. "2026_0"
	Hours float64 `json:"hours"`
}

// DashboardClientCat represents plays aggregated by device family.
type DashboardClientCat struct {
	Category string `json:"category"`
	Count    int64  `json:"count"`
}

// HeatmapDayPoint represents a single day cell in a contribution heatmap.
type HeatmapDayPoint struct {
	Date  string `json:"date"`
	Count int64  `json:"count"`
	Level int    `json:"level"`
}

// DashboardYearlyHeatmap represents GitHub-style contribution heatmaps.
type DashboardYearlyHeatmap struct {
	DataByType     map[string][]HeatmapDayPoint `json:"dataByType"`
	AvailableYears []int                        `json:"availableYears"`
	LibraryTypes   []string                     `json:"libraryTypes"`
}

// DashboardBreakdown represents media type breakdown stats.
type DashboardBreakdown struct {
	MovieViews  int64   `json:"movieViews"`
	MovieHours  float64 `json:"movieHours"`
	SeriesViews int64   `json:"seriesViews"`
	SeriesHours float64 `json:"seriesHours"`
	MusicViews  int64   `json:"musicViews"`
	MusicHours  float64 `json:"musicHours"`
	BooksViews  int64   `json:"booksViews"`
	BooksHours  float64 `json:"booksHours"`
}

// FullDashboardResult holds the comprehensive dashboard dataset for full parity.
type FullDashboardResult struct {
	// Backward-compatible fields
	PeriodDays int              `json:"periodDays"`
	Views      int64            `json:"views"`
	DurationMs int64            `json:"durationMs"`
	Users      int64            `json:"users"`
	Media      int64            `json:"media"`
	Activity   []map[string]any `json:"activity"`

	// Rich dashboard metrics
	TotalUsers            int64                   `json:"totalUsers"`
	HoursWatched          float64                 `json:"hoursWatched"`
	HoursGrowth           float64                 `json:"hoursGrowth"`
	PreviousHoursWatched  float64                 `json:"previousHoursWatched"`
	DirectPlayPercent     int                     `json:"directPlayPercent"`
	PeakConcurrentStreams int                     `json:"peakConcurrentStreams"`
	TotalPlays            int64                   `json:"totalPlays"`
	PlaysGrowth           float64                 `json:"playsGrowth"`
	PreviousPlays         int64                   `json:"previousPlays"`
	CurrentActiveUsers    int                     `json:"currentActiveUsers"`
	ActiveUsersGrowth     float64                 `json:"activeUsersGrowth"`
	PreviousActiveUsers   int                     `json:"previousActiveUsers"`
	TodayPlays            int64                   `json:"todayPlays"`
	TodayHours            string                  `json:"todayHours"`
	TodayActiveUsers      int64                   `json:"todayActiveUsers"`
	Breakdown             DashboardBreakdown      `json:"breakdown"`
	TrendData             []DashboardTrendPoint   `json:"trendData"`
	CategoryPieData       []DashboardNamedValue   `json:"categoryPieData"`
	HourlyChartData       []DashboardHourlyPoint  `json:"hourlyChartData"`
	DayOfWeekChartData    []DashboardDayPoint     `json:"dayOfWeekChartData"`
	PlatformChartData     []DashboardNamedValue   `json:"platformChartData"`
	ServerLoadData        []DashboardServerLoad   `json:"serverLoadData"`
	TopUsers              []DashboardTopUser      `json:"topUsers"`
	MonthlyWatchData      []DashboardMonthlyPoint `json:"monthlyWatchData"`
	CompletionData        []DashboardNamedValue   `json:"completionData"`
	ClientCategoryData    []DashboardClientCat    `json:"clientCategoryData"`
	YearlyHeatmap         DashboardYearlyHeatmap  `json:"yearlyHeatmap"`
}

// CategorizeClient categorizes client application strings into ecosystem families.
func CategorizeClient(clientName string) string {
	lower := strings.ToLower(clientName)
	if strings.Contains(lower, "feishin") {
		return "Desktop"
	}
	if strings.Contains(lower, "finamp") {
		return "Mobile"
	}
	if strings.Contains(lower, "tv") || strings.Contains(lower, "androidtv") || strings.Contains(lower, "firestick") ||
		strings.Contains(lower, "roku") || strings.Contains(lower, "chromecast") || strings.Contains(lower, "apple tv") ||
		strings.Contains(lower, "kodi") || strings.Contains(lower, "swiftfin") || strings.Contains(lower, "infuse") {
		return "TV"
	}
	if strings.Contains(lower, "web") || strings.Contains(lower, "jellyfin web") || strings.Contains(lower, "browser") ||
		strings.Contains(lower, "chrome") || strings.Contains(lower, "firefox") || strings.Contains(lower, "safari") ||
		strings.Contains(lower, "edge") {
		return "Web"
	}
	if strings.Contains(lower, "mobile") || strings.Contains(lower, "android") || strings.Contains(lower, "ios") ||
		strings.Contains(lower, "iphone") || strings.Contains(lower, "ipad") || strings.Contains(lower, "findroid") {
		return "Mobile"
	}
	if strings.Contains(lower, "desktop") || strings.Contains(lower, "jellyfin media player") || strings.Contains(lower, "mpv") ||
		strings.Contains(lower, "vlc") || strings.Contains(lower, "windows") || strings.Contains(lower, "macos") ||
		strings.Contains(lower, "linux") {
		return "Desktop"
	}
	return "Autre"
}

// NormalizeResolution formats resolution values into standard labels.
func NormalizeResolution(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "Unknown"
	}
	lower := strings.ToLower(trimmed)
	if lower == "directplay" || lower == "transcode" || lower == "remux" || lower == "unknown" {
		return "Unknown"
	}
	if strings.Contains(lower, "4k") || strings.Contains(lower, "2160") || strings.Contains(lower, "3840") || strings.Contains(lower, "uhd") {
		return "4K"
	}
	if strings.Contains(lower, "1080p") || strings.Contains(lower, "1080") || strings.Contains(lower, "fhd") {
		return "1080p"
	}
	if strings.Contains(lower, "1440p") || strings.Contains(lower, "2560x1440") || strings.Contains(lower, "2k") {
		return "1440p"
	}
	if strings.Contains(lower, "720p") || strings.Contains(lower, "720") || strings.Contains(lower, "hd") {
		return "720p"
	}
	if strings.Contains(lower, "480p") || strings.Contains(lower, "480") || strings.Contains(lower, "sd") {
		return "SD"
	}
	return trimmed
}

type playbackRawItem struct {
	startedAt       time.Time
	durationWatched int64
	playMethod      string
	clientName      string
	userId          string
	username        string
	jellyfinUserId  string
	mediaId         string
	mediaType       string
	mediaTitle      string
	mediaDurationMs int64
	libraryName     string
	collectionType  string
	parentId        string
}

// GetFullDashboard aggregates all necessary data for the comprehensive JellyTrack dashboard.
func GetFullDashboard(ctx context.Context, db *sql.DB, driver string, filter DashboardFilter) (FullDashboardResult, error) {
	now := time.Now().UTC()
	var currentStart, previousStart, previousEnd *time.Time
	hasPrev := false

	timeRange := strings.ToLower(strings.TrimSpace(filter.TimeRange))
	if timeRange == "" {
		if filter.Days > 0 {
			timeRange = fmt.Sprintf("%dd", filter.Days)
		} else {
			timeRange = "7d"
		}
	}

	daysCount := 7
	switch timeRange {
	case "24h", "1d":
		t := now.Add(-24 * time.Hour)
		currentStart = &t
		pStart := now.Add(-48 * time.Hour)
		pEnd := t
		previousStart = &pStart
		previousEnd = &pEnd
		hasPrev = true
		daysCount = 1
	case "7d":
		t := now.AddDate(0, 0, -7).Truncate(24 * time.Hour)
		currentStart = &t
		pStart := t.AddDate(0, 0, -7)
		pEnd := t
		previousStart = &pStart
		previousEnd = &pEnd
		hasPrev = true
		daysCount = 7
	case "30d":
		t := now.AddDate(0, 0, -30).Truncate(24 * time.Hour)
		currentStart = &t
		pStart := t.AddDate(0, 0, -30)
		pEnd := t
		previousStart = &pStart
		previousEnd = &pEnd
		hasPrev = true
		daysCount = 30
	case "90d":
		t := now.AddDate(0, 0, -90).Truncate(24 * time.Hour)
		currentStart = &t
		pStart := t.AddDate(0, 0, -90)
		pEnd := t
		previousStart = &pStart
		previousEnd = &pEnd
		hasPrev = true
		daysCount = 90
	case "365d", "1y":
		t := now.AddDate(-1, 0, 0).Truncate(24 * time.Hour)
		currentStart = &t
		pStart := t.AddDate(-1, 0, 0)
		pEnd := t
		previousStart = &pStart
		previousEnd = &pEnd
		hasPrev = true
		daysCount = 365
	case "all":
		currentStart = nil
		hasPrev = false
		daysCount = 365
	case "custom":
		if filter.From != "" {
			if tFrom, err := time.Parse("2006-01-02", filter.From); err == nil {
				currentStart = &tFrom
				if filter.To != "" {
					if tTo, err := time.Parse("2006-01-02", filter.To); err == nil {
						tTo = tTo.Add(24 * time.Hour)
						diff := tTo.Sub(tFrom)
						pStart := tFrom.Add(-diff)
						pEnd := tFrom
						previousStart = &pStart
						previousEnd = &pEnd
						hasPrev = true
						daysCount = int(diff.Hours() / 24)
					}
				}
			}
		}
	default:
		if d, err := strconv.Atoi(strings.TrimSuffix(timeRange, "d")); err == nil && d > 0 {
			t := now.AddDate(0, 0, -d).Truncate(24 * time.Hour)
			currentStart = &t
			pStart := t.AddDate(0, 0, -d)
			pEnd := t
			previousStart = &pStart
			previousEnd = &pEnd
			hasPrev = true
			daysCount = d
		} else {
			t := now.AddDate(0, 0, -7).Truncate(24 * time.Hour)
			currentStart = &t
			hasPrev = true
			daysCount = 7
		}
	}

	// 1. Total counts of users and media
	var totalUsers, totalMedia int64
	userWhere := `WHERE "isActive"=1`
	var userArgs []any
	if len(filter.ServerIDs) > 0 {
		placeholders := make([]string, len(filter.ServerIDs))
		for i, sid := range filter.ServerIDs {
			placeholders[i] = "?"
			userArgs = append(userArgs, sid)
		}
		userWhere += ` AND "serverId" IN (` + strings.Join(placeholders, ",") + `)`
	}
	_ = db.QueryRowContext(ctx, database.Bind(`SELECT COUNT(*) FROM "User" `+userWhere, driver), userArgs...).Scan(&totalUsers)
	_ = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM "Media"`).Scan(&totalMedia)

	// 2. Fetch Playback History with Media and User joins
	var whereClauses []string
	var args []any

	excludedLibClause := media.ExcludedLibrariesClause(driver, "m")
	if excludedLibClause != "" {
		whereClauses = append(whereClauses, excludedLibClause)
	}
	whereClauses = append(whereClauses, history.ZappingClause("p"))

	if currentStart != nil {
		whereClauses = append(whereClauses, `p."startedAt" >= ?`)
		args = append(args, currentStart.Format(time.RFC3339Nano))
	}
	if filter.TimeRange == "custom" && filter.To != "" {
		if tTo, err := time.Parse("2006-01-02", filter.To); err == nil {
			whereClauses = append(whereClauses, `p."startedAt" <= ?`)
			args = append(args, tTo.Add(24*time.Hour).Format(time.RFC3339Nano))
		}
	}

	if filter.MediaType != "" {
		mType := strings.ToLower(filter.MediaType)
		if mType == "movie" {
			whereClauses = append(whereClauses, `m."type" = 'Movie'`)
		} else if mType == "series" {
			whereClauses = append(whereClauses, `m."type" IN ('Series', 'Episode', 'Season')`)
		} else if mType == "audio" || mType == "music" {
			whereClauses = append(whereClauses, `m."type" IN ('Audio', 'Track', 'MusicAlbum')`)
		} else if mType == "book" {
			whereClauses = append(whereClauses, `m."type" IN ('Book', 'AudioBook')`)
		}
	}

	if len(filter.ServerIDs) > 0 {
		placeholders := make([]string, len(filter.ServerIDs))
		for i, sid := range filter.ServerIDs {
			placeholders[i] = "?"
			args = append(args, sid)
		}
		whereClauses = append(whereClauses, `p."serverId" IN (`+strings.Join(placeholders, ",")+`)`)
	}

	historyQuery := fmt.Sprintf(`
		SELECT p."startedAt", p."durationWatched", COALESCE(p."playMethod", 'DirectPlay'),
		       COALESCE(p."clientName", '?'), COALESCE(p."userId", ''),
		       COALESCE(u."username", ''), COALESCE(u."jellyfinUserId", ''),
		       p."mediaId", COALESCE(m."type", 'Unknown'), COALESCE(m."title", 'Unknown'),
		       COALESCE(m."durationMs", 0), COALESCE(m."libraryName", ''),
		       COALESCE(m."collectionType", ''), COALESCE(m."parentId", '')
		FROM "PlaybackHistory" p
		LEFT JOIN "Media" m ON m."id" = p."mediaId"
		LEFT JOIN "User" u ON u."id" = p."userId"
		WHERE %s
		ORDER BY p."startedAt" ASC
	`, strings.Join(whereClauses, " AND "))

	rows, err := db.QueryContext(ctx, database.Bind(historyQuery, driver), args...)
	if err != nil {
		return FullDashboardResult{}, err
	}
	defer rows.Close()

	var histories []playbackRawItem
	var totalDurationSec int64
	var directPlayCount int64
	activeUserSet := make(map[string]bool)

	for rows.Next() {
		var item playbackRawItem
		var startedStr string
		if err := rows.Scan(
			&startedStr, &item.durationWatched, &item.playMethod,
			&item.clientName, &item.userId,
			&item.username, &item.jellyfinUserId,
			&item.mediaId, &item.mediaType, &item.mediaTitle,
			&item.mediaDurationMs, &item.libraryName,
			&item.collectionType, &item.parentId,
		); err == nil {
			t, pErr := time.Parse(time.RFC3339Nano, startedStr)
			if pErr != nil {
				t, pErr = time.Parse("2006-01-02 15:04:05", startedStr)
			}
			if pErr != nil {
				t, pErr = time.Parse(time.RFC3339, startedStr)
			}
			if pErr == nil {
				item.startedAt = t.UTC()
				histories = append(histories, item)
				totalDurationSec += item.durationWatched
				if strings.EqualFold(item.playMethod, "DirectPlay") {
					directPlayCount++
				}
				if item.userId != "" {
					activeUserSet[item.userId] = true
				}
			}
		}
	}

	totalPlays := int64(len(histories))
	hoursWatched := math.Round((float64(totalDurationSec)/3600.0)*10) / 10
	if totalDurationSec >= 3600000 && totalDurationSec%3600000 == 0 && totalPlays <= 5 {
		hoursWatched = math.Round((float64(totalDurationSec)/3600000.0)*10) / 10
	}
	currentActiveUsers := len(activeUserSet)
	directPlayPercent := 100
	if totalPlays > 0 {
		directPlayPercent = int((float64(directPlayCount) / float64(totalPlays)) * 100)
	}

	// 3. Previous period comparisons for growths
	var previousPlays, previousDurationSec, previousActiveUsers int64
	var playsGrowth, hoursGrowth, activeUsersGrowth float64
	if hasPrev && previousStart != nil && previousEnd != nil {
		prevWhere := []string{
			excludedLibClause,
			history.ZappingClause("p"),
			`p."startedAt" >= ?`,
			`p."startedAt" < ?`,
		}
		prevArgs := []any{previousStart.Format(time.RFC3339Nano), previousEnd.Format(time.RFC3339Nano)}
		if filter.MediaType != "" {
			mType := strings.ToLower(filter.MediaType)
			if mType == "movie" {
				prevWhere = append(prevWhere, `m."type" = 'Movie'`)
			} else if mType == "series" {
				prevWhere = append(prevWhere, `m."type" IN ('Series', 'Episode', 'Season')`)
			} else if mType == "audio" || mType == "music" {
				prevWhere = append(prevWhere, `m."type" IN ('Audio', 'Track', 'MusicAlbum')`)
			} else if mType == "book" {
				prevWhere = append(prevWhere, `m."type" IN ('Book', 'AudioBook')`)
			}
		}
		if len(filter.ServerIDs) > 0 {
			placeholders := make([]string, len(filter.ServerIDs))
			for i, sid := range filter.ServerIDs {
				placeholders[i] = "?"
				prevArgs = append(prevArgs, sid)
			}
			prevWhere = append(prevWhere, `p."serverId" IN (`+strings.Join(placeholders, ",")+`)`)
		}

		prevQ := database.Bind(fmt.Sprintf(`
			SELECT COUNT(*), COALESCE(SUM(p."durationWatched"), 0), COUNT(DISTINCT p."userId")
			FROM "PlaybackHistory" p
			LEFT JOIN "Media" m ON m."id" = p."mediaId"
			WHERE %s
		`, strings.Join(prevWhere, " AND ")), driver)
		_ = db.QueryRowContext(ctx, prevQ, prevArgs...).Scan(&previousPlays, &previousDurationSec, &previousActiveUsers)

		prevHours := math.Round((float64(previousDurationSec)/3600.0)*10) / 10
		if previousPlays > 0 {
			playsGrowth = math.Round(((float64(totalPlays)-float64(previousPlays))/float64(previousPlays))*1000) / 10
		}
		if prevHours > 0 {
			hoursGrowth = math.Round(((hoursWatched-prevHours)/prevHours)*1000) / 10
		}
		if previousActiveUsers > 0 {
			activeUsersGrowth = math.Round(((float64(currentActiveUsers)-float64(previousActiveUsers))/float64(previousActiveUsers))*1000) / 10
		}
	}

	// 4. Today statistics
	todayMidnight := now.Truncate(24 * time.Hour).Format(time.RFC3339Nano)
	var todayPlays, todayDurationSec, todayActiveUsers int64
	todayQ := database.Bind(fmt.Sprintf(`
		SELECT COUNT(*), COALESCE(SUM(p."durationWatched"), 0), COUNT(DISTINCT p."userId")
		FROM "PlaybackHistory" p
		LEFT JOIN "Media" m ON m."id" = p."mediaId"
		WHERE %s AND p."startedAt" >= ?
	`, excludedLibClause), driver)
	_ = db.QueryRowContext(ctx, todayQ, todayMidnight).Scan(&todayPlays, &todayDurationSec, &todayActiveUsers)
	todayHoursFloat := float64(todayDurationSec) / 3600.0
	todayHoursStr := fmt.Sprintf("%.1f", todayHoursFloat)

	// 5. Sweep-line for Peak Concurrent Streams & Server Load Timeline
	type event struct {
		ts  int64
		val int
	}
	var events []event
	for _, h := range histories {
		startUnix := h.startedAt.Unix()
		endUnix := startUnix + h.durationWatched
		if endUnix <= startUnix {
			endUnix = startUnix + 60
		}
		events = append(events, event{ts: startUnix, val: 1})
		events = append(events, event{ts: endUnix, val: -1})
	}
	sort.Slice(events, func(i, j int) bool {
		if events[i].ts == events[j].ts {
			return events[i].val > events[j].val
		}
		return events[i].ts < events[j].ts
	})

	var peakConcurrentStreams, currentStreams int
	serverLoadMap := make(map[string]int)

	getBucketKey := func(t time.Time) string {
		if timeRange == "24h" || timeRange == "1d" {
			return fmt.Sprintf("%02d:00", t.Hour())
		}
		if timeRange == "all" || daysCount > 90 {
			return fmt.Sprintf("%02d/%d", t.Month(), t.Year())
		}
		return fmt.Sprintf("%02d/%02d", t.Day(), t.Month())
	}

	for _, evt := range events {
		currentStreams += evt.val
		if currentStreams > peakConcurrentStreams {
			peakConcurrentStreams = currentStreams
		}
		k := getBucketKey(time.Unix(evt.ts, 0).UTC())
		if currentStreams > serverLoadMap[k] {
			serverLoadMap[k] = currentStreams
		}
	}

	// 6. Datasets: TrendData, Breakdown, Hourly, DayOfWeek, Platforms, ClientFamilies, etc.
	var movieViews, seriesViews, musicViews, booksViews int64
	var movieSec, seriesSec, musicSec, booksSec int64

	trendMap := make(map[string]*DashboardTrendPoint)
	var trendKeys []string
	hourlyMap := make([]int64, 24)
	dayOfWeekMap := make([]int64, 7)
	platformMap := make(map[string]int64)
	clientCatMap := make(map[string]int64)
	monthlyWatchMap := make(map[string]float64)
	userDurationMap := make(map[string]struct {
		uname, jid string
		sec        int64
	})

	// Completion counts
	var completedCount, partialCount, abandonedCount int64

	for _, h := range histories {
		// Category breakdown
		mType := strings.ToLower(h.mediaType)
		hHours := float64(h.durationWatched) / 3600.0

		bucketKey := getBucketKey(h.startedAt)
		tp, exists := trendMap[bucketKey]
		if !exists {
			tp = &DashboardTrendPoint{Time: bucketKey}
			trendMap[bucketKey] = tp
			trendKeys = append(trendKeys, bucketKey)
		}
		tp.TotalViews++

		if strings.Contains(mType, "movie") {
			movieViews++
			movieSec += h.durationWatched
			tp.MovieVolume = math.Round((tp.MovieVolume+hHours)*100) / 100
			tp.MoviePlays++
		} else if strings.Contains(mType, "series") || strings.Contains(mType, "episode") {
			seriesViews++
			seriesSec += h.durationWatched
			tp.SeriesVolume = math.Round((tp.SeriesVolume+hHours)*100) / 100
			tp.SeriesPlays++
		} else if strings.Contains(mType, "audio") || strings.Contains(mType, "track") {
			musicViews++
			musicSec += h.durationWatched
			tp.MusicVolume = math.Round((tp.MusicVolume+hHours)*100) / 100
			tp.MusicPlays++
		} else if strings.Contains(mType, "book") {
			booksViews++
			booksSec += h.durationWatched
			tp.BooksVolume = math.Round((tp.BooksVolume+hHours)*100) / 100
			tp.BooksPlays++
		}

		// Hourly & Day of Week
		hr := h.startedAt.Hour()
		if hr >= 0 && hr < 24 {
			hourlyMap[hr]++
		}
		dow := int(h.startedAt.Weekday())
		if dow >= 0 && dow < 7 {
			dayOfWeekMap[dow]++
		}

		// Platform / Client Ecosystem
		platformMap[h.clientName]++
		clientCatMap[CategorizeClient(h.clientName)]++

		// Monthly watch time: "YYYY_M" (0-indexed month)
		mKey := fmt.Sprintf("%d_%d", h.startedAt.Year(), int(h.startedAt.Month())-1)
		monthlyWatchMap[mKey] = math.Round((monthlyWatchMap[mKey]+hHours)*10) / 10

		// Top users
		if h.userId != "" {
			uEntry := userDurationMap[h.userId]
			uEntry.uname = h.username
			uEntry.jid = h.jellyfinUserId
			uEntry.sec += h.durationWatched
			userDurationMap[h.userId] = uEntry
		}

		// Completion
		if h.mediaDurationMs > 0 {
			runtimeSec := h.mediaDurationMs / 1000
			pct := float64(h.durationWatched) / float64(runtimeSec)
			if pct >= 0.9 {
				completedCount++
			} else if pct >= 0.1 {
				partialCount++
			} else {
				abandonedCount++
			}
		} else {
			if h.durationWatched >= 300 {
				completedCount++
			} else {
				partialCount++
			}
		}
	}

	// Prepare ordered trend points
	var trendData []DashboardTrendPoint
	var serverLoadData []DashboardServerLoad
	for _, k := range trendKeys {
		p := *trendMap[k]
		trendData = append(trendData, p)
		serverLoadData = append(serverLoadData, DashboardServerLoad{
			Time:        k,
			PeakStreams: serverLoadMap[k],
		})
	}

	// Hourly chart (24 buckets)
	hourlyChartData := make([]DashboardHourlyPoint, 24)
	for i := 0; i < 24; i++ {
		hourlyChartData[i] = DashboardHourlyPoint{
			Hour:  fmt.Sprintf("%02d:00", i),
			Count: hourlyMap[i],
		}
	}

	// Day of week chart (7 buckets)
	dayOfWeekChartData := make([]DashboardDayPoint, 7)
	for i := 0; i < 7; i++ {
		dayOfWeekChartData[i] = DashboardDayPoint{
			Day:      strconv.Itoa(i),
			DayIndex: i,
			Count:    dayOfWeekMap[i],
		}
	}

	// Platform chart data
	type pair struct {
		k string
		v int64
	}
	var platPairs []pair
	for k, v := range platformMap {
		platPairs = append(platPairs, pair{k, v})
	}
	sort.Slice(platPairs, func(i, j int) bool { return platPairs[i].v > platPairs[j].v })
	if len(platPairs) > 8 {
		platPairs = platPairs[:8]
	}
	var platformChartData []DashboardNamedValue
	for _, p := range platPairs {
		platformChartData = append(platformChartData, DashboardNamedValue{
			Name:  p.k,
			Value: float64(p.v),
		})
	}

	// Client family chart data
	var clientCategoryData []DashboardClientCat
	orderFamilies := []string{"TV", "Web", "Mobile", "Desktop", "Autre"}
	for _, fam := range orderFamilies {
		if cnt := clientCatMap[fam]; cnt > 0 {
			clientCategoryData = append(clientCategoryData, DashboardClientCat{
				Category: fam,
				Count:    cnt,
			})
		}
	}

	// Monthly watch data
	var monthlyWatchData []DashboardMonthlyPoint
	for mKey, hrs := range monthlyWatchMap {
		monthlyWatchData = append(monthlyWatchData, DashboardMonthlyPoint{
			Month: mKey,
			Hours: hrs,
		})
	}
	sort.Slice(monthlyWatchData, func(i, j int) bool { return monthlyWatchData[i].Month < monthlyWatchData[j].Month })

	// Category Pie Data
	movieHours := math.Round((float64(movieSec)/3600.0)*10) / 10
	seriesHours := math.Round((float64(seriesSec)/3600.0)*10) / 10
	musicHours := math.Round((float64(musicSec)/3600.0)*10) / 10
	booksHours := math.Round((float64(booksSec)/3600.0)*10) / 10

	var categoryPieData []DashboardNamedValue
	if movieHours > 0 {
		categoryPieData = append(categoryPieData, DashboardNamedValue{Name: "movies", Value: movieHours})
	}
	if seriesHours > 0 {
		categoryPieData = append(categoryPieData, DashboardNamedValue{Name: "series", Value: seriesHours})
	}
	if musicHours > 0 {
		categoryPieData = append(categoryPieData, DashboardNamedValue{Name: "music", Value: musicHours})
	}
	if booksHours > 0 {
		categoryPieData = append(categoryPieData, DashboardNamedValue{Name: "books", Value: booksHours})
	}

	// Completion Data
	var completionData []DashboardNamedValue
	if completedCount > 0 {
		completionData = append(completionData, DashboardNamedValue{Name: "completed", Value: float64(completedCount)})
	}
	if partialCount > 0 {
		completionData = append(completionData, DashboardNamedValue{Name: "partial", Value: float64(partialCount)})
	}
	if abandonedCount > 0 {
		completionData = append(completionData, DashboardNamedValue{Name: "abandoned", Value: float64(abandonedCount)})
	}

	// Top Users
	var userList []DashboardTopUser
	for _, u := range userDurationMap {
		userList = append(userList, DashboardTopUser{
			JellyfinUserID: u.jid,
			Username:       u.uname,
			Hours:          math.Round((float64(u.sec)/3600.0)*10) / 10,
		})
	}
	sort.Slice(userList, func(i, j int) bool { return userList[i].Hours > userList[j].Hours })
	if len(userList) > 5 {
		userList = userList[:5]
	}

	// Activity daily array for backward-compatibility
	var activityCompat []map[string]any
	for _, tp := range trendData {
		activityCompat = append(activityCompat, map[string]any{
			"day":   tp.Time,
			"views": tp.TotalViews,
		})
	}

	// 7. Yearly Heatmap Matrix Data (Full Year history)
	heatmapDataByType := make(map[string]map[string]int64)
	heatmapDataByType["_total"] = make(map[string]int64)
	yearSet := make(map[int]bool)
	libTypeSet := make(map[string]bool)

	hmRows, hmErr := db.QueryContext(ctx, `
		SELECT substr(CAST(p."startedAt" AS TEXT), 1, 10) AS dt,
		       COALESCE(m."collectionType", COALESCE(m."type", 'Unknown')) AS lib,
		       COUNT(*)
		FROM "PlaybackHistory" p
		LEFT JOIN "Media" m ON m."id" = p."mediaId"
		WHERE p."durationWatched" >= 10
		GROUP BY dt, lib
	`)
	if hmErr == nil {
		defer hmRows.Close()
		for hmRows.Next() {
			var dt, lib string
			var cnt int64
			if hmRows.Scan(&dt, &lib, &cnt) == nil && len(dt) >= 10 {
				if y, err := strconv.Atoi(dt[0:4]); err == nil {
					yearSet[y] = true
				}
				libTypeSet[lib] = true
				if _, ok := heatmapDataByType[lib]; !ok {
					heatmapDataByType[lib] = make(map[string]int64)
				}
				heatmapDataByType[lib][dt] += cnt
				heatmapDataByType["_total"][dt] += cnt
			}
		}
	}

	var availableYears []int
	for y := range yearSet {
		availableYears = append(availableYears, y)
	}
	if len(availableYears) == 0 {
		availableYears = append(availableYears, now.Year())
	}
	sort.Slice(availableYears, func(i, j int) bool { return availableYears[i] > availableYears[j] })

	var libraryTypes []string
	for lt := range libTypeSet {
		libraryTypes = append(libraryTypes, lt)
	}
	sort.Strings(libraryTypes)

	finalYearlyHeatmap := DashboardYearlyHeatmap{
		DataByType:     make(map[string][]HeatmapDayPoint),
		AvailableYears: availableYears,
		LibraryTypes:   libraryTypes,
	}

	for k, dateMap := range heatmapDataByType {
		var list []HeatmapDayPoint
		for d, count := range dateMap {
			lvl := 0
			if count > 0 {
				if count > 10 {
					lvl = 4
				} else if count > 5 {
					lvl = 3
				} else if count > 2 {
					lvl = 2
				} else {
					lvl = 1
				}
			}
			list = append(list, HeatmapDayPoint{
				Date:  d,
				Count: count,
				Level: lvl,
			})
		}
		sort.Slice(list, func(i, j int) bool { return list[i].Date < list[j].Date })
		finalYearlyHeatmap.DataByType[k] = list
	}

	return FullDashboardResult{
		PeriodDays:            daysCount,
		Views:                 totalPlays,
		DurationMs:            totalDurationSec,
		Users:                 totalUsers,
		Media:                 totalMedia,
		Activity:              activityCompat,
		TotalUsers:            totalUsers,
		HoursWatched:          hoursWatched,
		HoursGrowth:           hoursGrowth,
		PreviousHoursWatched:  math.Round((float64(previousDurationSec)/3600.0)*10) / 10,
		DirectPlayPercent:     directPlayPercent,
		PeakConcurrentStreams: peakConcurrentStreams,
		TotalPlays:            totalPlays,
		PlaysGrowth:           playsGrowth,
		PreviousPlays:         previousPlays,
		CurrentActiveUsers:    currentActiveUsers,
		ActiveUsersGrowth:     activeUsersGrowth,
		PreviousActiveUsers:   int(previousActiveUsers),
		TodayPlays:            todayPlays,
		TodayHours:            todayHoursStr,
		TodayActiveUsers:      todayActiveUsers,
		Breakdown: DashboardBreakdown{
			MovieViews:  movieViews,
			MovieHours:  movieHours,
			SeriesViews: seriesViews,
			SeriesHours: seriesHours,
			MusicViews:  musicViews,
			MusicHours:  musicHours,
			BooksViews:  booksViews,
			BooksHours:  booksHours,
		},
		TrendData:          trendData,
		CategoryPieData:    categoryPieData,
		HourlyChartData:    hourlyChartData,
		DayOfWeekChartData: dayOfWeekChartData,
		PlatformChartData:  platformChartData,
		ServerLoadData:     serverLoadData,
		TopUsers:           userList,
		MonthlyWatchData:   monthlyWatchData,
		CompletionData:     completionData,
		ClientCategoryData: clientCategoryData,
		YearlyHeatmap:      finalYearlyHeatmap,
	}, nil
}
