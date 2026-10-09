package stats

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

// timeBounds is shared by dashboards and analytics so a selected period has the
// same meaning everywhere. Custom end dates include the entire selected day.
func timeBounds(filter DashboardFilter, now time.Time) (start, end *time.Time, days int, err error) {
	rangeName := strings.ToLower(strings.TrimSpace(filter.TimeRange))
	days = filter.Days
	if days <= 0 {
		days = 30
	}
	switch rangeName {
	case "all":
		return nil, nil, 0, nil
	case "custom":
		from, e := time.Parse("2006-01-02", filter.From)
		if e != nil {
			return nil, nil, 0, fmt.Errorf("invalid start date")
		}
		to, e := time.Parse("2006-01-02", filter.To)
		if e != nil || to.Before(from) {
			return nil, nil, 0, fmt.Errorf("invalid end date")
		}
		to = to.AddDate(0, 0, 1)
		return &from, &to, int(to.Sub(from).Hours() / 24), nil
	case "24h", "1d":
		days = 1
	case "1y":
		days = 365
	case "":
	default:
		if parsed, e := strconv.Atoi(strings.TrimSuffix(rangeName, "d")); e == nil && parsed > 0 && parsed <= 36500 {
			days = parsed
		} else {
			return nil, nil, 0, fmt.Errorf("invalid time range")
		}
	}
	from := now.UTC().AddDate(0, 0, -days)
	if days > 1 {
		from = from.Truncate(24 * time.Hour)
	}
	return &from, nil, days, nil
}

func mediaTypeCondition(kind, alias string) string {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "movie":
		return alias + `."type" = 'Movie'`
	case "series", "episode", "season":
		return alias + `."type" IN ('Series','Episode','Season')`
	case "audio", "music":
		return alias + `."type" IN ('Audio','Track','MusicAlbum')`
	case "book", "audiobook":
		return alias + `."type" IN ('Book','AudioBook')`
	default:
		return ""
	}
}

func analyticsConditions(filter DashboardFilter, now time.Time) ([]string, []any, *time.Time, int, error) {
	start, end, days, err := timeBounds(filter, now)
	if err != nil {
		return nil, nil, nil, 0, err
	}
	clauses := []string{}
	args := []any{}
	if start != nil {
		clauses = append(clauses, `p."startedAt" >= ?`)
		args = append(args, start.Format(time.RFC3339Nano))
	}
	if end != nil {
		clauses = append(clauses, `p."startedAt" < ?`)
		args = append(args, end.Format(time.RFC3339Nano))
	}
	if clause := mediaTypeCondition(filter.MediaType, "m"); clause != "" {
		clauses = append(clauses, clause)
	}
	if len(filter.ServerIDs) > 0 {
		marks := make([]string, len(filter.ServerIDs))
		for i, id := range filter.ServerIDs {
			marks[i] = "?"
			args = append(args, id)
		}
		clauses = append(clauses, `p."serverId" IN (`+strings.Join(marks, ",")+`)`)
	}
	return clauses, args, start, days, nil
}

// PlaybackConditions supplies the same period/media/server clauses to chart
// drilldowns as their aggregate dataset. Aliases must be p (history), m (media).
func PlaybackConditions(filter DashboardFilter) ([]string, []any, error) {
	clauses, args, _, _, err := analyticsConditions(filter, time.Now().UTC())
	return clauses, args, err
}
