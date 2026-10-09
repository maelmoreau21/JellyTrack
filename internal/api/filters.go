package api

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/stats"
)

func dashboardFilter(r *http.Request, defaultDays int) (stats.DashboardFilter, error) {
	q := r.URL.Query()
	rangeName := first(q.Get("timeRange"), q.Get("range"))
	from := first(q.Get("from"), q.Get("startDate"), q.Get("dateFrom"))
	to := first(q.Get("to"), q.Get("endDate"), q.Get("dateTo"))
	if from != "" || to != "" {
		start, e1 := time.Parse("2006-01-02", from)
		end, e2 := time.Parse("2006-01-02", to)
		if e1 != nil || e2 != nil || end.Before(start) {
			return stats.DashboardFilter{}, fmt.Errorf("Période personnalisée invalide.")
		}
		rangeName = "custom"
	} else if strings.EqualFold(rangeName, "custom") {
		return stats.DashboardFilter{}, fmt.Errorf("Dates de début et de fin requises.")
	}
	return stats.DashboardFilter{TimeRange: rangeName, Days: boundedInt(q.Get("days"), defaultDays, 1, 3650), From: from, To: to, MediaType: q.Get("type"), ServerIDs: getServerScope(r)}, nil
}
