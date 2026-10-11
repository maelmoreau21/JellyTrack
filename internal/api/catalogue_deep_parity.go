package api

import (
	"net/http"
	"sort"
	"strings"
)

// The historical media analysis ranks people by catalogue titles, whereas the
// dashboard's existing deep insights rank them by watched sessions. Opting in
// keeps the dashboard contract intact and avoids multiplying a film's credits
// by its number of playbacks. This endpoint remains an admin route.
func (h *Handler) catalogueDeepStats(w http.ResponseWriter, r *http.Request) {
	clauses := []string{`m."type" IN ('Movie','Series')`, excludedLibrariesClause(h.driver, "m")}
	args := []any{}
	if servers := getServerScope(r); len(servers) > 0 {
		marks := make([]string, len(servers))
		for i, server := range servers {
			marks[i] = "?"
			args = append(args, server)
		}
		clauses = append(clauses, `m."serverId" IN (`+strings.Join(marks, ",")+`)`)
	}
	rows, err := h.recoveredRows(r, `SELECT m."directors",m."actors",m."studios" FROM "Media" m WHERE `+strings.Join(clauses, " AND "), args...)
	if err != nil {
		jsonError(w, 500, "Impossible de charger les classements du catalogue.")
		return
	}
	counts := map[string]map[string]int{"directors": {}, "actors": {}, "studios": {}}
	for _, row := range rows {
		for key, names := range counts {
			if values, ok := row[key].([]string); ok {
				for _, name := range values {
					if strings.TrimSpace(name) != "" {
						names[name]++
					}
				}
			}
		}
	}
	result := map[string]any{}
	for _, kind := range []struct{ field, response string }{{"directors", "topDirectors"}, {"actors", "topActors"}, {"studios", "topStudios"}} {
		items := make([]catalogueCreditCount, 0, len(counts[kind.field]))
		for name, count := range counts[kind.field] {
			items = append(items, catalogueCreditCount{Name: name, Count: count})
		}
		sort.Slice(items, func(i, j int) bool {
			if items[i].Count == items[j].Count {
				return items[i].Name < items[j].Name
			}
			return items[i].Count > items[j].Count
		})
		if len(items) > 10 {
			items = items[:10]
		}
		result[kind.response] = items
	}
	jsonResponse(w, 200, result)
}

type catalogueCreditCount struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}
