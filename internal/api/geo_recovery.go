package api

import (
	"net/http"
	"os"
	"sort"

	"github.com/maelmoreau21/jellytrack/internal/geoip"
)

func (h *Handler) recoveredGeoStats(w http.ResponseWriter, r *http.Request) {
	path := os.Getenv("GEOIP_DATABASE_PATH")
	if path == "" {
		path = "/data/GeoLite2-Country.mmdb"
	}
	resolver, lookupErr := geoip.Open(path)
	defer resolver.Close()
	rows, err := h.db.QueryContext(r.Context(), `SELECT COALESCE("country",''),COALESCE("city",''),COALESCE("ipAddress",''),COUNT(*),CAST(MAX("startedAt") AS TEXT) FROM "PlaybackHistory" GROUP BY "country","city","ipAddress"`)
	if err != nil {
		jsonError(w, 500, "Erreur de lecture géographique.")
		return
	}
	defer rows.Close()
	type location struct {
		Country  string `json:"country"`
		City     string `json:"city"`
		Sessions int64  `json:"sessions"`
		LastSeen string `json:"lastSeen"`
		Kind     string `json:"kind"`
	}
	groups := map[string]*location{}
	var local, missing, total int64
	for rows.Next() {
		var country, city, address, last string
		var count int64
		if err = rows.Scan(&country, &city, &address, &count, &last); err != nil {
			jsonError(w, 500, "Erreur de lecture géographique.")
			return
		}
		total += count
		country, city, kind := resolver.Recorded(country, city, address)
		if kind == "local" {
			local += count
		}
		if kind == "missing" {
			missing += count
		}
		key := kind + "\x00" + country + "\x00" + city
		entry := groups[key]
		if entry == nil {
			entry = &location{Country: country, City: city, Kind: kind}
			groups[key] = entry
		}
		entry.Sessions += count
		if last > entry.LastSeen {
			entry.LastSeen = last
		}
	}
	if err = rows.Err(); err != nil {
		jsonError(w, 500, "Erreur de lecture géographique.")
		return
	}
	rows.Close()
	locations := []location{}
	countries := map[string]int64{}
	for _, entry := range groups {
		locations = append(locations, *entry)
		if entry.Kind == "located" && entry.Country != "" {
			countries[entry.Country] += entry.Sessions
		}
	}
	sort.Slice(locations, func(i, j int) bool { return locations[i].Sessions > locations[j].Sessions })
	countryList := []map[string]any{}
	for country, count := range countries {
		cities := []string{}
		for _, entry := range locations {
			if entry.Kind == "located" && entry.Country == country && entry.City != "" && len(cities) < 5 {
				cities = append(cities, entry.City)
			}
		}
		countryList = append(countryList, map[string]any{"name": country, "sessions": count, "cities": cities})
	}
	sort.Slice(countryList, func(i, j int) bool { return countryList[i]["sessions"].(int64) > countryList[j]["sessions"].(int64) })
	message := ""
	if lookupErr != nil && missing > 0 {
		message = "Base GeoIP absente ou illisible : les IP publiques sans localisation enregistrée ne peuvent pas être situées. Les connexions locales sont distinguées."
	}
	liveLocations := []map[string]string{}
	live, err := h.db.QueryContext(r.Context(), `SELECT COALESCE(s."country",''),COALESCE(s."city",''),COALESCE(s."ipAddress",''),COALESCE(u."username",''),COALESCE(m."title",'') FROM "ActiveStream" s LEFT JOIN "User" u ON u."id"=s."userId" AND u."serverId"=s."serverId" LEFT JOIN "Media" m ON m."id"=s."mediaId" AND m."serverId"=s."serverId"`)
	if err == nil {
		for live.Next() {
			var country, city, address, user, title string
			if live.Scan(&country, &city, &address, &user, &title) != nil {
				continue
			}
			country, city, kind := resolver.Recorded(country, city, address)
			liveLocations = append(liveLocations, map[string]string{"country": country, "city": city, "kind": kind, "username": user, "mediaTitle": title})
		}
		live.Close()
	}
	jsonResponse(w, 200, map[string]any{"locations": locations, "countries": countryList, "liveLocations": liveLocations, "localSessions": local, "unlocatedSessions": missing, "totalSessions": total, "geoipAvailable": lookupErr == nil, "message": message})
}
