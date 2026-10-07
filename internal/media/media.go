// Package media provides media catalog queries, library exclusions filtering, and metadata detail.
package media

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/maelmoreau21/jellytrack/internal/database"
)

// NormalizeLibraryKey converts names like "film-1" or "Séries TV" into standardized lookup keys.
func NormalizeLibraryKey(name string) string {
	s := strings.ToLower(strings.TrimSpace(name))
	s = strings.ReplaceAll(s, "-", "_")
	s = strings.ReplaceAll(s, " ", "_")
	return s
}

// IsLibraryExcluded checks if a media item belongs to any excluded library or collection type.
func IsLibraryExcluded(libraryName, collectionType, mediaType string, excludedLibraries []string) bool {
	if len(excludedLibraries) == 0 {
		return false
	}
	excludedMap := make(map[string]bool, len(excludedLibraries))
	for _, ex := range excludedLibraries {
		excludedMap[NormalizeLibraryKey(ex)] = true
	}

	if libraryName != "" && excludedMap[NormalizeLibraryKey(libraryName)] {
		return true
	}
	if collectionType != "" && excludedMap[NormalizeLibraryKey(collectionType)] {
		return true
	}
	if mediaType != "" && excludedMap[NormalizeLibraryKey(mediaType)] {
		return true
	}
	return false
}

// ExcludedLibrariesClause returns the SQL fragment filtering out media matching excludedLibraries from GlobalSettings.
func ExcludedLibrariesClause(driver, alias string) string {
	prefix := ""
	if alias != "" {
		prefix = alias + "."
	}
	if driver == "postgres" {
		return fmt.Sprintf(`(%s"libraryName" IS NULL OR NOT (%s"libraryName" = ANY(COALESCE((SELECT "excludedLibraries" FROM "GlobalSettings" WHERE "id"='global'), ARRAY[]::TEXT[]))))`, prefix, prefix)
	}
	return fmt.Sprintf(`(%s"libraryName" IS NULL OR NOT EXISTS (SELECT 1 FROM json_each((SELECT COALESCE(NULLIF("excludedLibraries",''), '[]') FROM "GlobalSettings" WHERE "id"='global')) WHERE value = %s"libraryName"))`, prefix, prefix)
}

// MediaListResult holds paginated media items.
type MediaListResult struct {
	Media []map[string]any `json:"media"`
	Total int64            `json:"total"`
	Page  int              `json:"page"`
}

// ListMedia returns paginated media items matching filters.
func ListMedia(ctx context.Context, db *sql.DB, driver string, page, pageSize int, search, mediaType, serverID string) (MediaListResult, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 50
	}
	offset := (page - 1) * pageSize

	var conditions []string
	var args []any

	conditions = append(conditions, ExcludedLibrariesClause(driver, "m"))

	if search != "" {
		conditions = append(conditions, `LOWER(m."title") LIKE ?`)
		args = append(args, "%"+strings.ToLower(search)+"%")
	}
	if mediaType != "" {
		conditions = append(conditions, `m."type" = ?`)
		args = append(args, mediaType)
	}
	if serverID != "" {
		conditions = append(conditions, `m."serverId" = ?`)
		args = append(args, serverID)
	}

	whereClause := "WHERE " + strings.Join(conditions, " AND ")

	countQ := database.Bind(fmt.Sprintf(`SELECT COUNT(*) FROM "Media" m %s`, whereClause), driver)
	var total int64
	if err := db.QueryRowContext(ctx, countQ, args...).Scan(&total); err != nil {
		return MediaListResult{}, err
	}

	query := database.Bind(fmt.Sprintf(`
		SELECT m."id", m."serverId", m."jellyfinMediaId", m."title", m."type", m."collectionType",
		       m."libraryName", m."resolution", m."durationMs", m."size", m."parentId", m."artist",
		       m."dateAdded", m."createdAt", s."name" AS "serverName"
		FROM "Media" m
		JOIN "Server" s ON s."id" = m."serverId"
		%s
		ORDER BY m."title" ASC
		LIMIT ? OFFSET ?
	`, whereClause), driver)

	queryArgs := append(args, pageSize, offset)
	rows, err := db.QueryContext(ctx, query, queryArgs...)
	if err != nil {
		return MediaListResult{}, err
	}
	defer rows.Close()

	var list []map[string]any
	for rows.Next() {
		var id, srvID, jID, title, mType, srvName string
		var colType, libName, res, parentID, artist, dateAdded, createdAt sql.NullString
		var durMs, size sql.NullInt64

		if err := rows.Scan(&id, &srvID, &jID, &title, &mType, &colType, &libName, &res, &durMs, &size, &parentID, &artist, &dateAdded, &createdAt, &srvName); err == nil {
			item := map[string]any{
				"id":              id,
				"serverId":        srvID,
				"serverName":      srvName,
				"jellyfinMediaId": jID,
				"title":           title,
				"type":            mType,
				"collectionType":  nullableStr(colType),
				"libraryName":     nullableStr(libName),
				"resolution":      nullableStr(res),
				"durationMs":      nullableInt(durMs),
				"size":            nullableInt(size),
				"parentId":        nullableStr(parentID),
				"artist":          nullableStr(artist),
				"dateAdded":       nullableStr(dateAdded),
				"createdAt":       nullableStr(createdAt),
			}
			list = append(list, item)
		}
	}

	return MediaListResult{
		Media: list,
		Total: total,
		Page:  page,
	}, nil
}

// MediaDetailResult holds full media metadata, playback stats, dropoff timeline, and telemetry.
type MediaDetailResult struct {
	Media          map[string]any   `json:"media"`
	TotalPlays     int64            `json:"totalPlays"`
	TotalDurationS int64            `json:"totalDurationS"`
	RecentPlays    []map[string]any `json:"recentPlays"`
}

// GetMediaDetail fetches media metadata and playback timeline.
func GetMediaDetail(ctx context.Context, db *sql.DB, driver, mediaID string) (MediaDetailResult, error) {
	q := database.Bind(`
		SELECT m."id", m."serverId", m."jellyfinMediaId", m."title", m."type", m."collectionType",
		       m."libraryName", m."resolution", m."durationMs", m."size", m."parentId", m."artist",
		       m."dateAdded", m."createdAt", s."name" AS "serverName"
		FROM "Media" m
		JOIN "Server" s ON s."id" = m."serverId"
		WHERE m."id" = ?
	`, driver)

	var id, srvID, jID, title, mType, srvName string
	var colType, libName, res, parentID, artist, dateAdded, createdAt sql.NullString
	var durMs, size sql.NullInt64

	if err := db.QueryRowContext(ctx, q, mediaID).Scan(&id, &srvID, &jID, &title, &mType, &colType, &libName, &res, &durMs, &size, &parentID, &artist, &dateAdded, &createdAt, &srvName); err != nil {
		return MediaDetailResult{}, err
	}

	mediaObj := map[string]any{
		"id":              id,
		"serverId":        srvID,
		"serverName":      srvName,
		"jellyfinMediaId": jID,
		"title":           title,
		"type":            mType,
		"collectionType":  nullableStr(colType),
		"libraryName":     nullableStr(libName),
		"resolution":      nullableStr(res),
		"durationMs":      nullableInt(durMs),
		"size":            nullableInt(size),
		"parentId":        nullableStr(parentID),
		"artist":          nullableStr(artist),
		"dateAdded":       nullableStr(dateAdded),
		"createdAt":       nullableStr(createdAt),
	}

	var totalPlays, totalDur int64
	_ = db.QueryRowContext(ctx, database.Bind(`SELECT COUNT(*), COALESCE(SUM("durationWatched"),0) FROM "PlaybackHistory" WHERE "mediaId"=?`, driver), mediaID).Scan(&totalPlays, &totalDur)

	recentQ := database.Bind(`
		SELECT p."id", p."userId", p."playMethod", p."eventSource", p."durationWatched", p."startedAt", u."username"
		FROM "PlaybackHistory" p
		LEFT JOIN "User" u ON u."id" = p."userId"
		WHERE p."mediaId" = ?
		ORDER BY p."startedAt" DESC
		LIMIT 20
	`, driver)

	rows, err := db.QueryContext(ctx, recentQ, mediaID)
	var recent []map[string]any
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var pid, method, source, started string
			var uid, uname sql.NullString
			var dur int64
			if err := rows.Scan(&pid, &uid, &method, &source, &dur, &started, &uname); err == nil {
				recent = append(recent, map[string]any{
					"id":              pid,
					"userId":          nullableStr(uid),
					"username":        nullableStr(uname),
					"playMethod":      method,
					"eventSource":     source,
					"durationWatched": dur,
					"startedAt":       started,
				})
			}
		}
	}

	return MediaDetailResult{
		Media:          mediaObj,
		TotalPlays:     totalPlays,
		TotalDurationS: totalDur,
		RecentPlays:    recent,
	}, nil
}

func nullableStr(ns sql.NullString) any {
	if ns.Valid {
		return ns.String
	}
	return nil
}

func nullableInt(ni sql.NullInt64) any {
	if ni.Valid {
		return ni.Int64
	}
	return nil
}
