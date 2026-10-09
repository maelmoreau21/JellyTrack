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

// GranularResult holds data for the granular analysis charts.
type GranularResult struct {
	DailyData    []map[string]any      `json:"dailyData"`
	HourlyData   []GranularHourly      `json:"hourlyData"`
	Collections  []string              `json:"collections"`
	DropOffData  []GranularDropOff     `json:"dropOffData"`
	DropSegments []DashboardNamedValue `json:"dropSegments"`
	TopAbandoned []GranularAbandoned   `json:"topAbandoned"`
	AudioData    []DashboardNamedValue `json:"audioData"`
	SubtitleData []DashboardNamedValue `json:"subtitleData"`
	HeatmapData  []HeatmapCell         `json:"heatmapData"`
}

type GranularHourly struct {
	Time     string  `json:"time"`
	Plays    int64   `json:"plays"`
	Duration float64 `json:"duration"`
}

type GranularDropOff struct {
	Time       string `json:"time"`
	Completion int    `json:"completion"`
}

type GranularAbandoned struct {
	Title      string `json:"title"`
	FullTitle  string `json:"fullTitle"`
	MediaID    string `json:"mediaId"`
	Completion int    `json:"completion"`
	Count      int64  `json:"count"`
}

// NetworkResult holds metrics, tables and charts for network analysis.
type NetworkResult struct {
	Stats               NetworkStats           `json:"stats"`
	HourlyData          []NetworkHourly        `json:"hourlyData"`
	ClientTranscodeData []ClientTranscodePoint `json:"clientTranscodeData"`
	CoupableTable       []CoupableMediaRow     `json:"coupableTable"`
}

type NetworkStats struct {
	TotalSessions          int64 `json:"totalSessions"`
	DirectPlaySessions     int64 `json:"directPlaySessions"`
	TranscodePercent       int   `json:"transcodePercent"`
	TranscodeSessions      int64 `json:"transcodeSessions"`
	DirectStreamSessions   int64 `json:"directStreamSessions"`
	TotalTranscodeDuration int64 `json:"totalTranscodeDuration"`
}

type NetworkHourly struct {
	Time            string `json:"time"`
	Hour            string `json:"hour"`
	DirectPlay      int64  `json:"DirectPlay"`
	Transcode       int64  `json:"Transcode"`
	DirectStream    int64  `json:"DirectStream"`
	DirectPlayVal   int64  `json:"directPlay"`
	TranscodeVal    int64  `json:"transcode"`
	DirectStreamVal int64  `json:"directStream"`
}

type ClientTranscodePoint struct {
	Name             string `json:"name"`
	Total            int64  `json:"total"`
	Transcode        int64  `json:"transcode"`
	TranscodePercent int    `json:"transcodePercent"`
}

type CoupableMediaRow struct {
	Title       string `json:"title"`
	FullTitle   string `json:"fullTitle"`
	Resolution  string `json:"resolution"`
	Count       int64  `json:"count"`
	DurationMin int64  `json:"durationMin"`
	MainReason  string `json:"mainReason"`
	TopClient   string `json:"topClient"`
}

// PeakPrediction represents predicted peak sessions.
type PeakPrediction struct {
	DayOfWeek         int     `json:"dayOfWeek"`
	Hour              int     `json:"hour"`
	PredictedSessions float64 `json:"predictedSessions"`
	Confidence        int     `json:"confidence"`
}

// GetGranularAnalysis aggregates fine-grained data for GranularAnalysis.
func GetGranularAnalysis(ctx context.Context, db *sql.DB, driver string, filter DashboardFilter) (GranularResult, error) {
	whereClauses, args, since, daysCount, err := analyticsConditions(filter, time.Now().UTC())
	if err != nil {
		return GranularResult{}, err
	}
	if excluded := media.ExcludedLibrariesClause(driver, "m"); excluded != "" {
		whereClauses = append(whereClauses, excluded)
	}
	whereClauses = append(whereClauses, history.ZappingClause("p"))

	q := database.Bind(fmt.Sprintf(`
		SELECT p."startedAt", p."durationWatched", p."mediaId",
		       COALESCE(p."audioLanguage", ''), COALESCE(p."subtitleLanguage", ''), COALESCE(p."subtitleCodec", ''),
		       COALESCE(m."libraryName", COALESCE(m."collectionType", COALESCE(m."type", 'Unknown'))),
		       COALESCE(m."durationMs", 0), COALESCE(m."title", 'Unknown')
		FROM "PlaybackHistory" p
		LEFT JOIN "Media" m ON m."id" = p."mediaId"
		WHERE %s
		ORDER BY p."startedAt" ASC
	`, strings.Join(whereClauses, " AND ")), driver)

	rows, err := db.QueryContext(ctx, q, args...)
	if err != nil {
		return GranularResult{}, err
	}
	defer rows.Close()

	dailyMap := make(map[string]map[string]any)
	var dailyKeys []string
	if since != nil && daysCount > 0 && daysCount <= 366 {
		for d := 0; d < daysCount; d++ {
			dayKey := since.AddDate(0, 0, d).Format("2006-01-02")
			if _, ex := dailyMap[dayKey]; !ex {
				dailyMap[dayKey] = map[string]any{
					"time":          dayKey,
					"totalPlays":    int64(0),
					"totalDuration": float64(0),
				}
				dailyKeys = append(dailyKeys, dayKey)
			}
		}
	}

	hourlyPlays := make([]int64, 24)
	hourlyDur := make([]float64, 24)
	collectionSet := make(map[string]bool)
	audioMap := make(map[string]int64)
	subtitleMap := make(map[string]int64)

	// Heatmap 7x24 grid
	heatmapMatrix := make([][24]struct{ views, dur int64 }, 7)

	type dropInfo struct {
		mediaID         string
		title           string
		totalCompletion float64
		sessions        int64
	}
	mediaDropMap := make(map[string]*dropInfo)
	libCompletionMap := make(map[string]*struct {
		tot float64
		cnt int64
	})

	var dropSkipped, dropAbandoned, dropAlmost, dropFinished int64

	for rows.Next() {
		var startedStr, audioLang, subLang, subCodec, libName, title, mediaID string
		var durSec, mediaDurMs int64
		if rows.Scan(&startedStr, &durSec, &mediaID, &audioLang, &subLang, &subCodec, &libName, &mediaDurMs, &title) == nil {
			t, pErr := time.Parse(time.RFC3339Nano, startedStr)
			if pErr != nil {
				t, pErr = time.Parse("2006-01-02 15:04:05", startedStr)
			}
			if pErr != nil {
				t, pErr = time.Parse(time.RFC3339, startedStr)
			}
			if pErr != nil {
				continue
			}
			t = t.UTC()

			collectionSet[libName] = true
			dayKey := t.Format("2006-01-02")
			hr := t.Hour()
			dow := int(t.Weekday())
			durHours := float64(durSec) / 3600.0

			// Daily
			dayEntry, exists := dailyMap[dayKey]
			if !exists {
				dayEntry = map[string]any{
					"time":          dayKey,
					"totalPlays":    int64(0),
					"totalDuration": float64(0),
				}
				dailyMap[dayKey] = dayEntry
				dailyKeys = append(dailyKeys, dayKey)
			}
			dayEntry["totalPlays"] = dayEntry["totalPlays"].(int64) + 1
			dayEntry["totalDuration"] = math.Round((dayEntry["totalDuration"].(float64)+durHours)*100) / 100
			libPlayKey := libName + "_plays"
			libDurKey := libName + "_duration"
			if curP, ok := dayEntry[libPlayKey].(int64); ok {
				dayEntry[libPlayKey] = curP + 1
			} else {
				dayEntry[libPlayKey] = int64(1)
			}
			if curD, ok := dayEntry[libDurKey].(float64); ok {
				dayEntry[libDurKey] = math.Round((curD+durHours)*100) / 100
			} else {
				dayEntry[libDurKey] = math.Round(durHours*100) / 100
			}

			// Hourly
			hourlyPlays[hr]++
			hourlyDur[hr] += durHours

			// Heatmap
			heatmapMatrix[dow][hr].views++
			heatmapMatrix[dow][hr].dur += durSec

			// Audio / Subtitles
			if audioLang != "" {
				audioMap[audioLang]++
			}
			if subLang != "" {
				subtitleMap[subLang]++
			} else if subCodec != "" && subCodec != "none" {
				subtitleMap["UNKNOWN"]++
			} else {
				subtitleMap["OFF"]++
			}

			// Completion
			completionPct := 50.0
			if mediaDurMs > 0 {
				completionPct = math.Min(100.0, (float64(durSec)/float64(mediaDurMs/1000))*100.0)
			}
			if completionPct < 10 {
				dropSkipped++
			} else if completionPct < 50 {
				dropAbandoned++
			} else if completionPct < 85 {
				dropAlmost++
			} else {
				dropFinished++
			}

			// Library completion
			lc, lcEx := libCompletionMap[libName]
			if !lcEx {
				lc = &struct {
					tot float64
					cnt int64
				}{}
				libCompletionMap[libName] = lc
			}
			lc.tot += completionPct
			lc.cnt++

			// Media drop off
			md, mdEx := mediaDropMap[title]
			if !mdEx {
				md = &dropInfo{mediaID: mediaID, title: title}
				mediaDropMap[title] = md
			}
			md.totalCompletion += completionPct
			md.sessions++
		}
	}

	var dailyData []map[string]any
	for _, k := range dailyKeys {
		if entry, exists := dailyMap[k]; exists {
			dailyData = append(dailyData, entry)
		}
	}
	if len(dailyData) == 0 {
		for _, entry := range dailyMap {
			dailyData = append(dailyData, entry)
		}
		sort.Slice(dailyData, func(i, j int) bool {
			return dailyData[i]["time"].(string) < dailyData[j]["time"].(string)
		})
	}

	var hourlyData []GranularHourly
	for i := 0; i < 24; i++ {
		hourlyData = append(hourlyData, GranularHourly{
			Time:     fmt.Sprintf("%02d:00", i),
			Plays:    hourlyPlays[i],
			Duration: math.Round(hourlyDur[i]*10) / 10,
		})
	}

	var collections []string
	for c := range collectionSet {
		collections = append(collections, c)
	}
	sort.Strings(collections)

	var dropOffData []GranularDropOff
	for lib, lc := range libCompletionMap {
		avg := 0
		if lc.cnt > 0 {
			avg = int(math.Round(lc.tot / float64(lc.cnt)))
		}
		dropOffData = append(dropOffData, GranularDropOff{
			Time:       lib,
			Completion: avg,
		})
	}
	sort.Slice(dropOffData, func(i, j int) bool { return dropOffData[i].Completion > dropOffData[j].Completion })

	dropSegments := []DashboardNamedValue{
		{Name: "skipped", Value: float64(dropSkipped)},
		{Name: "abandoned", Value: float64(dropAbandoned)},
		{Name: "almost", Value: float64(dropAlmost)},
		{Name: "finished", Value: float64(dropFinished)},
	}

	var abandonedList []GranularAbandoned
	for _, md := range mediaDropMap {
		avgComp := int(math.Round(md.totalCompletion / float64(md.sessions)))
		shortTitle := md.title
		if len(shortTitle) > 25 {
			shortTitle = shortTitle[:25] + "…"
		}
		abandonedList = append(abandonedList, GranularAbandoned{
			Title:      shortTitle,
			FullTitle:  md.title,
			MediaID:    md.mediaID,
			Completion: avgComp,
			Count:      md.sessions,
		})
	}
	sort.Slice(abandonedList, func(i, j int) bool { return abandonedList[i].Completion < abandonedList[j].Completion })
	if len(abandonedList) > 5 {
		abandonedList = abandonedList[:5]
	}

	var audioData []DashboardNamedValue
	for lang, cnt := range audioMap {
		audioData = append(audioData, DashboardNamedValue{Name: lang, Value: float64(cnt)})
	}
	sort.Slice(audioData, func(i, j int) bool { return audioData[i].Value > audioData[j].Value })
	if len(audioData) > 6 {
		audioData = audioData[:6]
	}

	var subtitleData []DashboardNamedValue
	for lang, cnt := range subtitleMap {
		subtitleData = append(subtitleData, DashboardNamedValue{Name: lang, Value: float64(cnt)})
	}
	sort.Slice(subtitleData, func(i, j int) bool { return subtitleData[i].Value > subtitleData[j].Value })
	if len(subtitleData) > 6 {
		subtitleData = subtitleData[:6]
	}

	var heatmapData []HeatmapCell
	for d := 0; d < 7; d++ {
		for h := 0; h < 24; h++ {
			c := heatmapMatrix[d][h]
			heatmapData = append(heatmapData, HeatmapCell{
				DayOfWeek: d,
				Day:       d,
				Hour:      h,
				Views:     c.views,
				Value:     c.views,
				Duration:  c.dur,
			})
		}
	}

	return GranularResult{
		DailyData:    dailyData,
		HourlyData:   hourlyData,
		Collections:  collections,
		DropOffData:  dropOffData,
		DropSegments: dropSegments,
		TopAbandoned: abandonedList,
		AudioData:    audioData,
		SubtitleData: subtitleData,
		HeatmapData:  heatmapData,
	}, nil
}

// GetNetworkAnalysis aggregates data for NetworkAnalysis view.
func GetNetworkAnalysis(ctx context.Context, db *sql.DB, driver string, filter DashboardFilter) (NetworkResult, error) {
	whereClauses, args, _, _, err := analyticsConditions(filter, time.Now().UTC())
	if err != nil {
		return NetworkResult{}, err
	}
	if excluded := media.ExcludedLibrariesClause(driver, "m"); excluded != "" {
		whereClauses = append(whereClauses, excluded)
	}
	whereClauses = append(whereClauses, history.ZappingClause("p"))
	q := database.Bind(fmt.Sprintf(`
		SELECT p."id", COALESCE(p."playMethod", 'DirectPlay'), COALESCE(p."clientName", '?'),
		       COALESCE(p."deviceName", '?'), COALESCE(p."audioCodec", ''),
		       COALESCE(p."subtitleLanguage", ''), COALESCE(p."subtitleCodec", ''),
		       p."startedAt", p."durationWatched",
		       COALESCE(m."title", 'Unknown'), COALESCE(m."type", 'Unknown'), COALESCE(m."resolution", 'Unknown')
		FROM "PlaybackHistory" p
		LEFT JOIN "Media" m ON m."id" = p."mediaId"
		WHERE %s
		ORDER BY p."startedAt" ASC
	`, strings.Join(whereClauses, " AND ")), driver)

	rows, err := db.QueryContext(ctx, q, args...)
	if err != nil {
		return NetworkResult{}, err
	}
	defer rows.Close()

	var totalSessions, directPlaySessions, transcodeSessions, directStreamSessions, totalTranscodeDuration int64
	hourlyMethod := make([]struct{ dp, tc, ds int64 }, 24)
	clientTranscodeMap := make(map[string]*struct{ tot, tc int64 })

	type coupableInfo struct {
		title       string
		resolution  string
		count       int64
		durationSec int64
		reasons     map[string]int
		clients     map[string]int
	}
	coupableMap := make(map[string]*coupableInfo)

	for rows.Next() {
		var id, playMethod, clientName, deviceName, audioCodec, subLang, subCodec, startedStr, title, mType, res string
		var durSec int64
		if rows.Scan(&id, &playMethod, &clientName, &deviceName, &audioCodec, &subLang, &subCodec, &startedStr, &durSec, &title, &mType, &res) == nil {
			t, pErr := time.Parse(time.RFC3339Nano, startedStr)
			if pErr != nil {
				t, pErr = time.Parse("2006-01-02 15:04:05", startedStr)
			}
			if pErr != nil {
				t, pErr = time.Parse(time.RFC3339, startedStr)
			}
			if pErr != nil {
				continue
			}

			totalSessions++
			hr := t.Hour()
			methodLower := strings.ToLower(playMethod)

			ct, ctEx := clientTranscodeMap[clientName]
			if !ctEx {
				ct = &struct{ tot, tc int64 }{}
				clientTranscodeMap[clientName] = ct
			}
			ct.tot++

			if strings.Contains(methodLower, "transcode") {
				transcodeSessions++
				totalTranscodeDuration += durSec
				hourlyMethod[hr].tc++
				ct.tc++

				// Track in coupable table
				c, cEx := coupableMap[title]
				if !cEx {
					c = &coupableInfo{
						title:      title,
						resolution: NormalizeResolution(res),
						reasons:    make(map[string]int),
						clients:    make(map[string]int),
					}
					coupableMap[title] = c
				}
				c.count++
				c.durationSec += durSec
				c.clients[clientName]++

				// Infer reason
				reason := "transcodeCodec"
				subCodecLower := strings.ToLower(subCodec)
				if subLang != "" && (subCodecLower == "ass" || subCodecLower == "ssa" || subCodecLower == "pgs" || subCodecLower == "pgssub") {
					reason = "subtitlesBurnIn"
				} else if audioCodec != "" && (strings.Contains(strings.ToLower(audioCodec), "truehd") || strings.Contains(strings.ToLower(audioCodec), "dts")) {
					reason = "audioHDNotSupported"
				} else if c.resolution == "4K" {
					reason = "resolution4K"
				}
				c.reasons[reason]++

			} else if strings.Contains(methodLower, "directstream") || strings.Contains(methodLower, "remux") {
				directStreamSessions++
				hourlyMethod[hr].ds++
			} else {
				directPlaySessions++
				hourlyMethod[hr].dp++
			}
		}
	}

	transcodePercent := 0
	if totalSessions > 0 {
		transcodePercent = int(math.Round((float64(transcodeSessions) / float64(totalSessions)) * 100))
	}

	var hourlyData []NetworkHourly
	for i := 0; i < 24; i++ {
		hourlyData = append(hourlyData, NetworkHourly{
			Time:            fmt.Sprintf("%02dh", i),
			Hour:            fmt.Sprintf("%02dh", i),
			DirectPlay:      hourlyMethod[i].dp,
			Transcode:       hourlyMethod[i].tc,
			DirectStream:    hourlyMethod[i].ds,
			DirectPlayVal:   hourlyMethod[i].dp,
			TranscodeVal:    hourlyMethod[i].tc,
			DirectStreamVal: hourlyMethod[i].ds,
		})
	}

	var clientTranscodeData []ClientTranscodePoint
	for cName, cData := range clientTranscodeMap {
		pct := 0
		if cData.tot > 0 {
			pct = int(math.Round((float64(cData.tc) / float64(cData.tot)) * 100))
		}
		clientTranscodeData = append(clientTranscodeData, ClientTranscodePoint{
			Name:             cName,
			Total:            cData.tot,
			Transcode:        cData.tc,
			TranscodePercent: pct,
		})
	}
	sort.Slice(clientTranscodeData, func(i, j int) bool { return clientTranscodeData[i].Total > clientTranscodeData[j].Total })
	if len(clientTranscodeData) > 8 {
		clientTranscodeData = clientTranscodeData[:8]
	}

	var coupableTable []CoupableMediaRow
	for _, c := range coupableMap {
		// find most frequent reason
		mainReason := "transcodeCodec"
		maxRCount := 0
		for r, cnt := range c.reasons {
			if cnt > maxRCount {
				maxRCount = cnt
				mainReason = r
			}
		}
		// find top client
		topClient := "?"
		maxCClient := 0
		for cl, cnt := range c.clients {
			if cnt > maxCClient {
				maxCClient = cnt
				topClient = cl
			}
		}

		shortTitle := c.title
		if len(shortTitle) > 30 {
			shortTitle = shortTitle[:30] + "…"
		}

		coupableTable = append(coupableTable, CoupableMediaRow{
			Title:       shortTitle,
			FullTitle:   c.title,
			Resolution:  c.resolution,
			Count:       c.count,
			DurationMin: c.durationSec / 60,
			MainReason:  mainReason,
			TopClient:   topClient,
		})
	}
	sort.Slice(coupableTable, func(i, j int) bool { return coupableTable[i].Count > coupableTable[j].Count })
	if len(coupableTable) > 10 {
		coupableTable = coupableTable[:10]
	}

	return NetworkResult{
		Stats: NetworkStats{
			TotalSessions:          totalSessions,
			DirectPlaySessions:     directPlaySessions,
			TranscodePercent:       transcodePercent,
			TranscodeSessions:      transcodeSessions,
			DirectStreamSessions:   directStreamSessions,
			TotalTranscodeDuration: totalTranscodeDuration,
		},
		HourlyData:          hourlyData,
		ClientTranscodeData: clientTranscodeData,
		CoupableTable:       coupableTable,
	}, nil
}

// GetPeakPredictions computes predicted sessions for upcoming slots based on 4-week EMA patterns.
func GetPeakPredictions(ctx context.Context, db *sql.DB, driver string) ([]PeakPrediction, error) {
	now := time.Now().UTC()
	fourWeeksAgo := now.AddDate(0, 0, -28).Format(time.RFC3339Nano)

	rows, err := db.QueryContext(ctx, database.Bind(`
		SELECT "startedAt"
		FROM "PlaybackHistory"
		WHERE "startedAt" >= ? AND "durationWatched" >= 10
	`, driver), fourWeeksAgo)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// 7 days x 24 hours x 4 weeks
	weekGrid := make(map[string][4]float64)
	for d := 0; d < 7; d++ {
		for h := 0; h < 24; h++ {
			weekGrid[fmt.Sprintf("%d-%d", d, h)] = [4]float64{0, 0, 0, 0}
		}
	}

	for rows.Next() {
		var sStr string
		if rows.Scan(&sStr) == nil {
			t, pErr := time.Parse(time.RFC3339Nano, sStr)
			if pErr != nil {
				t, pErr = time.Parse("2006-01-02 15:04:05", sStr)
			}
			if pErr != nil {
				t, pErr = time.Parse(time.RFC3339, sStr)
			}
			if pErr == nil {
				t = t.UTC()
				dow := int(t.Weekday())
				hr := t.Hour()
				weeksAgo := int(now.Sub(t).Hours() / (24 * 7))
				if weeksAgo < 0 {
					weeksAgo = 0
				}
				if weeksAgo > 3 {
					weeksAgo = 3
				}
				k := fmt.Sprintf("%d-%d", dow, hr)
				counts := weekGrid[k]
				counts[weeksAgo]++
				weekGrid[k] = counts
			}
		}
	}

	weights := [4]float64{0.4, 0.3, 0.2, 0.1}
	var predictions []PeakPrediction

	for k, counts := range weekGrid {
		parts := strings.Split(k, "-")
		if len(parts) != 2 {
			continue
		}
		d, _ := strconv.Atoi(parts[0])
		h, _ := strconv.Atoi(parts[1])

		ema := 0.0
		sum := 0.0
		for i := 0; i < 4; i++ {
			ema += counts[i] * weights[i]
			sum += counts[i]
		}
		avg := sum / 4.0
		variance := 0.0
		for i := 0; i < 4; i++ {
			variance += math.Pow(counts[i]-avg, 2)
		}
		variance /= 4.0
		stdDev := math.Sqrt(variance)

		confidence := 0
		if avg > 0 {
			confidence = int(math.Max(0, math.Min(100, math.Round(100.0-(stdDev/avg)*50.0))))
		}

		if ema >= 0.5 {
			predictions = append(predictions, PeakPrediction{
				DayOfWeek:         d,
				Hour:              h,
				PredictedSessions: math.Round(ema*10) / 10,
				Confidence:        confidence,
			})
		}
	}

	sort.Slice(predictions, func(i, j int) bool {
		return predictions[i].PredictedSessions > predictions[j].PredictedSessions
	})

	if len(predictions) > 24 {
		predictions = predictions[:24]
	}

	return predictions, nil
}

// DetailedDeepInsights holds deep analytics for the Analytics tab.
type DetailedDeepInsights struct {
	Categorized            map[string][]CategorizedItem `json:"categorized"`
	TopGenres              []GenreStatItem              `json:"topGenres"`
	TopClients             []ClientStatItem             `json:"topClients"`
	StreamMethodsChartData []DashboardNamedValue        `json:"streamMethodsChartData"`
	ResolutionChartData    []DashboardNamedValue        `json:"resolutionChartData"`
	DeviceChartData        []DashboardNamedValue        `json:"deviceChartData"`
	AudioChartData         []DashboardNamedValue        `json:"audioChartData"`
	SubtitleChartData      []DashboardNamedValue        `json:"subtitleChartData"`
	TopDirectors           []map[string]any             `json:"topDirectors"`
	TopActors              []map[string]any             `json:"topActors"`
	TopStudios             []map[string]any             `json:"topStudios"`
}

type CategorizedItem struct {
	Title    string  `json:"title"`
	Name     string  `json:"name"`
	Type     string  `json:"type"`
	Plays    int64   `json:"plays"`
	Duration float64 `json:"duration"`
}

type GenreStatItem struct {
	Name     string  `json:"name"`
	Plays    int64   `json:"plays"`
	Duration float64 `json:"duration"`
}

type ClientStatItem struct {
	ClientName string `json:"clientName"`
	Count      int64  `json:"count"`
}

// GetDetailedDeepInsights computes comprehensive deep analytics for media, genres, and clients.
func GetDetailedDeepInsights(ctx context.Context, db *sql.DB, driver string, filter DashboardFilter) (DetailedDeepInsights, error) {
	whereClauses, args, _, _, err := analyticsConditions(filter, time.Now().UTC())
	if err != nil {
		return DetailedDeepInsights{}, err
	}
	if excluded := media.ExcludedLibrariesClause(driver, "m"); excluded != "" {
		whereClauses = append(whereClauses, excluded)
	}
	whereClauses = append(whereClauses, history.ZappingClause("p"))
	q := database.Bind(fmt.Sprintf(`
		SELECT p."playMethod", COALESCE(p."clientName", '?'), COALESCE(p."deviceName", '?'),
		       COALESCE(p."audioLanguage", ''), COALESCE(p."subtitleLanguage", ''),
		       p."durationWatched",
		       COALESCE(m."title", 'Unknown'), COALESCE(m."type", 'Unknown'),
		       COALESCE(m."resolution", 'Unknown'), COALESCE(m."genres", '[]'),
		       COALESCE(m."directors", '[]'), COALESCE(m."actors", '[]'), COALESCE(m."studios", '[]')
		FROM "PlaybackHistory" p
		LEFT JOIN "Media" m ON m."id" = p."mediaId"
		WHERE %s
	`, strings.Join(whereClauses, " AND ")), driver)

	rows, err := db.QueryContext(ctx, q, args...)
	if err != nil {
		return DetailedDeepInsights{}, err
	}
	defer rows.Close()

	catMovie := make(map[string]*CategorizedItem)
	catSeries := make(map[string]*CategorizedItem)
	catAlbum := make(map[string]*CategorizedItem)
	catBook := make(map[string]*CategorizedItem)

	genresMap := make(map[string]*GenreStatItem)
	clientMap := make(map[string]int64)
	methodMap := make(map[string]int64)
	resMap := make(map[string]int64)
	deviceMap := make(map[string]int64)
	audioMap := make(map[string]int64)
	subMap := make(map[string]int64)

	dirMap := make(map[string]int)
	actMap := make(map[string]int)
	stuMap := make(map[string]int)

	for rows.Next() {
		var method, client, device, audio, sub, title, mType, res, genresStr, dirStr, actStr, stuStr string
		var durSec int64
		if rows.Scan(&method, &client, &device, &audio, &sub, &durSec, &title, &mType, &res, &genresStr, &dirStr, &actStr, &stuStr) == nil {
			durH := math.Round((float64(durSec)/3600.0)*10) / 10
			mTypeLower := strings.ToLower(mType)

			// Categorized
			targetCat := catMovie
			catType := "Movie"
			if strings.Contains(mTypeLower, "series") || strings.Contains(mTypeLower, "episode") {
				targetCat = catSeries
				catType = "Series"
			} else if strings.Contains(mTypeLower, "audio") || strings.Contains(mTypeLower, "track") || strings.Contains(mTypeLower, "album") {
				targetCat = catAlbum
				catType = "Music"
			} else if strings.Contains(mTypeLower, "book") {
				targetCat = catBook
				catType = "Book"
			}

			item, ok := targetCat[title]
			if !ok {
				item = &CategorizedItem{Title: title, Name: title, Type: catType}
				targetCat[title] = item
			}
			item.Plays++
			item.Duration = math.Round((item.Duration+durH)*10) / 10

			// Clients, methods, resolutions, devices
			clientMap[client]++
			deviceMap[CategorizeClient(client)]++

			cleanMethod := "DirectPlay"
			if strings.Contains(strings.ToLower(method), "transcode") {
				cleanMethod = "Transcode"
			} else if strings.Contains(strings.ToLower(method), "stream") || strings.Contains(strings.ToLower(method), "remux") {
				cleanMethod = "DirectStream"
			}
			methodMap[cleanMethod]++
			resMap[NormalizeResolution(res)]++

			if audio != "" {
				audioMap[audio]++
			}
			if sub != "" {
				subMap[sub]++
			}

			// Genres, directors, actors, studios
			for _, g := range parseList(genresStr) {
				gItem, gOk := genresMap[g]
				if !gOk {
					gItem = &GenreStatItem{Name: g}
					genresMap[g] = gItem
				}
				gItem.Plays++
				gItem.Duration = math.Round((gItem.Duration+durH)*10) / 10
			}
			for _, d := range parseList(dirStr) {
				dirMap[d]++
			}
			for _, a := range parseList(actStr) {
				actMap[a]++
			}
			for _, s := range parseList(stuStr) {
				stuMap[s]++
			}
		}
	}

	sortLimitCat := func(m map[string]*CategorizedItem, limit int) []CategorizedItem {
		var list []CategorizedItem
		for _, v := range m {
			list = append(list, *v)
		}
		sort.Slice(list, func(i, j int) bool { return list[i].Plays > list[j].Plays })
		if len(list) > limit {
			list = list[:limit]
		}
		return list
	}

	var topGenres []GenreStatItem
	for _, g := range genresMap {
		topGenres = append(topGenres, *g)
	}
	sort.Slice(topGenres, func(i, j int) bool { return topGenres[i].Plays > topGenres[j].Plays })
	if len(topGenres) > 10 {
		topGenres = topGenres[:10]
	}

	var topClients []ClientStatItem
	for cl, cnt := range clientMap {
		topClients = append(topClients, ClientStatItem{ClientName: cl, Count: cnt})
	}
	sort.Slice(topClients, func(i, j int) bool { return topClients[i].Count > topClients[j].Count })
	if len(topClients) > 8 {
		topClients = topClients[:8]
	}

	toNamedValue := func(m map[string]int64, limit int) []DashboardNamedValue {
		var list []DashboardNamedValue
		for k, v := range m {
			list = append(list, DashboardNamedValue{Name: k, Value: float64(v)})
		}
		sort.Slice(list, func(i, j int) bool { return list[i].Value > list[j].Value })
		if limit > 0 && len(list) > limit {
			list = list[:limit]
		}
		return list
	}

	sortLimitStringMap := func(m map[string]int, limit int) []map[string]any {
		type pair struct {
			k string
			v int
		}
		var list []pair
		for k, v := range m {
			list = append(list, pair{k, v})
		}
		sort.Slice(list, func(i, j int) bool { return list[i].v > list[j].v })
		if limit > 0 && len(list) > limit {
			list = list[:limit]
		}
		out := make([]map[string]any, len(list))
		for i, p := range list {
			out[i] = map[string]any{"name": p.k, "count": p.v}
		}
		return out
	}

	return DetailedDeepInsights{
		Categorized: map[string][]CategorizedItem{
			"movie":  sortLimitCat(catMovie, 5),
			"series": sortLimitCat(catSeries, 5),
			"album":  sortLimitCat(catAlbum, 5),
			"book":   sortLimitCat(catBook, 5),
		},
		TopGenres:              topGenres,
		TopClients:             topClients,
		StreamMethodsChartData: toNamedValue(methodMap, 4),
		ResolutionChartData:    toNamedValue(resMap, 6),
		DeviceChartData:        toNamedValue(deviceMap, 6),
		AudioChartData:         toNamedValue(audioMap, 6),
		SubtitleChartData:      toNamedValue(subMap, 6),
		TopDirectors:           sortLimitStringMap(dirMap, 10),
		TopActors:              sortLimitStringMap(actMap, 10),
		TopStudios:             sortLimitStringMap(stuMap, 10),
	}, nil
}
