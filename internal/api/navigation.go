package api

import (
	"database/sql"
	"net/http"
	"os"
	"strings"
	"time"
)

// navigation exposes only presentation context, never administrator settings or keys.
func (h *Handler) navigation(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	loc := time.UTC
	if configured, err := time.LoadLocation(os.Getenv("TZ")); err == nil {
		loc = configured
	}
	var visible, period sql.NullBool
	var startMonth, startDay, endMonth, endDay sql.NullInt64
	err := h.db.QueryRowContext(r.Context(), `SELECT "wrappedVisible", "wrappedPeriodEnabled", "wrappedStartMonth", "wrappedStartDay", "wrappedEndMonth", "wrappedEndDay" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&visible, &period, &startMonth, &startDay, &endMonth, &endDay)
	wrapped := true
	if err == nil {
		wrapped = !visible.Valid || visible.Bool
		if wrapped && (!period.Valid || period.Bool) {
			wrapped = historicalWrappedVisible(time.Now().In(loc), int(startMonth.Int64), int(startDay.Int64), int(endMonth.Int64), int(endDay.Int64))
		}
	}
	version := os.Getenv("APP_VERSION")
	if version == "" {
		version = "2.1.1"
	}
	jsonResponse(w, http.StatusOK, map[string]any{
		"multiServer":    strings.ToLower(os.Getenv("JELLYTRACK_MODE")) == "multi",
		"wrappedVisible": wrapped,
		"appVersion":     version,
	})
}

// Preserve main's RootLayout date calculation, including midnight on the last
// day and its current-year anchor for periods spanning December and January.
func historicalWrappedVisible(now time.Time, sm, sd, em, ed int) bool {
	if sm == 0 {
		sm = 12
	}
	if sd == 0 {
		sd = 1
	}
	if em == 0 {
		em = 1
	}
	if ed == 0 {
		ed = 31
	}
	year := now.Year()
	endYear := year
	if em < sm {
		endYear++
	}
	start := time.Date(year, time.Month(sm), sd, 0, 0, 0, 0, now.Location())
	end := time.Date(endYear, time.Month(em), ed, 0, 0, 0, 0, now.Location())
	return !now.Before(start) && !now.After(end)
}
