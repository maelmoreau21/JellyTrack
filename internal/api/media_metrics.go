package api

import (
	"database/sql"
	"net/http"
	"sort"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/database"
)

// Each authorized playback is grouped once. Panels consume these compact groups
// without materializing the wide history and sorting it separately six times.
func (h *Handler) recoveredDetailMetrics(r *http.Request, base string, args []any, id string, runtime float64, full bool) (map[string]any, error) {
	const counters = `COALESCE(SUM(p."pauseCount"),0) AS "pauseCount",COALESCE(SUM(p."audioChanges"),0) AS "audioChanges",COALESCE(SUM(p."subtitleChanges"),0) AS "subtitleChanges",COALESCE(SUM(p."seekCount"),0) AS "seekCount",COALESCE(SUM(p."rewatchCount"),0) AS "rewatchCount",COALESCE(SUM(p."speedChangeCount"),0) AS "speedChangeCount",MAX(p."maxPlaybackRate") AS "maxPlaybackRate"`
	family := ` FROM valid p LEFT JOIN "User" u ON u."id"=p."userId" JOIN catalog c ON c."id"=p."mediaId" WHERE p."mediaId" IN (SELECT "member" FROM family WHERE "root"=?)`
	if !full {
		rows, err := h.recoveredRows(r, base+`SELECT `+counters+family, append(append([]any{}, args...), id)...)
		if err != nil {
			return nil, err
		}
		return rows[0], nil
	}
	percent := `NULL`
	params := append([]any{}, args...)
	if runtime > 0 {
		percent = `CASE WHEN p."durationWatched"*1000>=? THEN 90 ELSE CAST((p."durationWatched"*1000.0/?)/10 AS INTEGER)*10 END`
		params = append(params, runtime, runtime)
	}
	params = append(params, id)
	query := base + `SELECT u."id",u."username",p."audioLanguage",p."audioCodec",p."subtitleLanguage",p."subtitleCodec",p."startedAt",` + percent + ` AS "percent",COUNT(*) AS "plays",SUM(p."durationWatched")*1000 AS "watchTimeMs",` + counters + family + ` GROUP BY u."id",u."username",p."audioLanguage",p."audioCodec",p."subtitleLanguage",p."subtitleCodec",p."startedAt","percent"`
	rows, err := h.db.QueryContext(r.Context(), database.Bind(query, h.driver), params...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	type viewerKey struct{ id, name sql.NullString }
	type languageKey struct{ language, codec sql.NullString }
	type viewer struct {
		key            viewerKey
		plays, watched int64
	}
	type point struct {
		at     string
		counts [6]int64
	}
	viewers := map[viewerKey]*viewer{}
	audio, subtitles := map[languageKey]int64{}, map[languageKey]int64{}
	completion := map[int64]int64{}
	timeline := map[string]*point{}
	totals := [6]int64{}
	maxRate := sql.NullFloat64{}
	for rows.Next() {
		var id, name, alang, acodec, slang, scodec sql.NullString
		var started any
		var bucket sql.NullInt64
		var plays, watched int64
		var counts [6]int64
		var rate sql.NullFloat64
		if err := rows.Scan(&id, &name, &alang, &acodec, &slang, &scodec, &started, &bucket, &plays, &watched, &counts[0], &counts[1], &counts[2], &counts[3], &counts[4], &counts[5], &rate); err != nil {
			return nil, err
		}
		at := ""
		switch value := started.(type) {
		case time.Time:
			at = value.UTC().Format(time.RFC3339Nano)
		case string:
			at = value
		case []byte:
			at = string(value)
		}
		key := viewerKey{id, name}
		v := viewers[key]
		if v == nil {
			v = &viewer{key: key}
			viewers[key] = v
		}
		v.plays += plays
		v.watched += watched
		audio[languageKey{alang, acodec}] += plays
		subtitles[languageKey{slang, scodec}] += plays
		if bucket.Valid {
			completion[bucket.Int64] += plays
		}
		hasCounters := false
		for i, value := range counts {
			totals[i] += value
			hasCounters = hasCounters || value != 0
		}
		if hasCounters {
			p := timeline[at]
			if p == nil {
				p = &point{at: at}
				timeline[at] = p
			}
			for i, value := range counts {
				p.counts[i] += value
			}
		}
		if rate.Valid && (!maxRate.Valid || rate.Float64 > maxRate.Float64) {
			maxRate = rate
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	result := map[string]any{"viewers": []map[string]any{}, "audioDistribution": []map[string]any{}, "subtitleDistribution": []map[string]any{}, "completion": []map[string]any{}, "counterTimeline": []map[string]any{}, "maxPlaybackRate": nullableFloatValue(maxRate)}
	keys := []string{"pauseCount", "audioChanges", "subtitleChanges", "seekCount", "rewatchCount", "speedChangeCount"}
	for i, key := range keys {
		result[key] = totals[i]
	}
	sortedViewers := make([]*viewer, 0, len(viewers))
	for _, v := range viewers {
		sortedViewers = append(sortedViewers, v)
	}
	sort.Slice(sortedViewers, func(i, j int) bool {
		a, b := sortedViewers[i], sortedViewers[j]
		if a.watched != b.watched {
			return a.watched > b.watched
		}
		if a.key.name.Valid != b.key.name.Valid {
			// Match each driver's default ascending NULL ordering.
			if h.driver == "postgres" {
				return a.key.name.Valid
			}
			return !a.key.name.Valid
		}
		return a.key.name.String < b.key.name.String
	})
	for _, v := range sortedViewers {
		result["viewers"] = append(result["viewers"].([]map[string]any), map[string]any{"userId": nullable(v.key.id), "username": nullable(v.key.name), "plays": v.plays, "watchTimeMs": v.watched})
	}
	for _, kind := range []string{"audio", "subtitle"} {
		data := audio
		if kind == "subtitle" {
			data = subtitles
		}
		ordered := make([]languageKey, 0, len(data))
		for key := range data {
			ordered = append(ordered, key)
		}
		sort.Slice(ordered, func(i, j int) bool {
			a, b := ordered[i], ordered[j]
			if data[a] != data[b] {
				return data[a] > data[b]
			}
			return a.language.String+"\x00"+a.codec.String < b.language.String+"\x00"+b.codec.String
		})
		for _, key := range ordered {
			field := kind + "Distribution"
			result[field] = append(result[field].([]map[string]any), map[string]any{"language": key.language.String, "codec": key.codec.String, "count": data[key]})
		}
	}
	buckets := make([]int64, 0, len(completion))
	for key := range completion {
		buckets = append(buckets, key)
	}
	sort.Slice(buckets, func(i, j int) bool { return buckets[i] < buckets[j] })
	for _, bucket := range buckets {
		result["completion"] = append(result["completion"].([]map[string]any), map[string]any{"percent": bucket, "count": completion[bucket]})
	}
	dates := make([]string, 0, len(timeline))
	for at := range timeline {
		dates = append(dates, at)
	}
	sort.Strings(dates)
	for _, at := range dates {
		p := timeline[at]
		var total int64
		for _, count := range p.counts {
			total += count
		}
		if total <= 0 {
			continue
		}
		row := map[string]any{"startedAt": at}
		for i, key := range keys {
			row[key] = p.counts[i]
		}
		result["counterTimeline"] = append(result["counterTimeline"].([]map[string]any), row)
	}
	// Keep historical null/empty language groups separate even if their displayed
	// labels match; no session is dropped or counted twice by panel aggregation.
	return result, nil
}
