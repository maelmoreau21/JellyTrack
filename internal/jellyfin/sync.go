package jellyfin

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/database"
)

type SyncResult struct {
	Users int `json:"users"`
	Media int `json:"media"`
}

// SyncOne synchronizes one configured server incrementally and persists each media row as it arrives.
func SyncOne(ctx context.Context, db *sql.DB, driver string, serverID, jellyfinID, name, baseURL, apiKey string, recentOnly ...bool) (SyncResult, error) {
	client, err := New(baseURL, apiKey)
	if err != nil {
		return SyncResult{}, err
	}
	info, err := client.SystemInfo(ctx)
	if err != nil {
		return SyncResult{}, fmt.Errorf("read Jellyfin system info: %w", err)
	}
	if info.ID != "" {
		jellyfinID = info.ID
	}
	if info.ServerName != "" {
		name = info.ServerName
	}
	if jellyfinID == "" {
		return SyncResult{}, fmt.Errorf("Jellyfin server did not return an identifier")
	}
	if serverID == "" {
		serverID = stableID("srv", jellyfinID)
	}
	if _, err = db.ExecContext(ctx, database.Bind(`INSERT INTO "Server" ("id","jellyfinServerId","name","url","jellyfinApiKey","isActive") VALUES (?,?,?,?,?,1) ON CONFLICT("jellyfinServerId") DO UPDATE SET "name"=excluded."name","url"=excluded."url","jellyfinApiKey"=excluded."jellyfinApiKey","isActive"=1,"updatedAt"=CURRENT_TIMESTAMP`, driver), serverID, jellyfinID, name, strings.TrimRight(baseURL, "/"), apiKey); err != nil {
		return SyncResult{}, fmt.Errorf("save Jellyfin server: %w", err)
	}
	if err := db.QueryRowContext(ctx, database.Bind(`SELECT "id" FROM "Server" WHERE "jellyfinServerId"=?`, driver), jellyfinID).Scan(&serverID); err != nil {
		return SyncResult{}, fmt.Errorf("read Jellyfin server record: %w", err)
	}
	var result SyncResult
	users, err := client.Users(ctx)
	if err != nil {
		return result, fmt.Errorf("fetch Jellyfin users: %w", err)
	}
	for _, u := range users {
		if u.ID == "" {
			continue
		}
		username := strings.TrimSpace(u.Name)
		if username == "" {
			username = u.ID
		}
		var lastActive any
		for _, raw := range []string{u.LastActivityDate, u.LastLoginDate} {
			if raw != "" {
				if parsed, e := time.Parse(time.RFC3339Nano, raw); e == nil && parsed.Year() > 2000 {
					lastActive = parsed.UTC().Format(time.RFC3339Nano)
					break
				}
			}
		}
		_, err = db.ExecContext(ctx, database.Bind(`INSERT INTO "User" ("id","serverId","jellyfinUserId","username","lastActive") VALUES (?,?,?,?,?) ON CONFLICT("jellyfinUserId","serverId") DO UPDATE SET "username"=excluded."username","lastActive"=COALESCE(excluded."lastActive","User"."lastActive"),"isActive"=1,"updatedAt"=CURRENT_TIMESTAMP`, driver), stableID("usr", serverID+":"+u.ID), serverID, u.ID, username, lastActive)
		if err != nil {
			return result, fmt.Errorf("save Jellyfin user: %w", err)
		}
		result.Users++
	}
	libraries, _ := client.Libraries(ctx) // Jellyfin permissions and versions may make this hint endpoint unavailable.
	byLibrary := make(map[string]Library, len(libraries))
	for _, lib := range libraries {
		byLibrary[lib.ID] = lib
	}
	since := ""
	if len(recentOnly) > 0 && recentOnly[0] {
		since = time.Now().UTC().AddDate(0, 0, -7).Format(time.RFC3339Nano)
	}
	err = client.ItemsSince(ctx, since, func(item Item) error {
		if item.ID == "" || item.Type == "" {
			return nil
		}
		parent := firstNonEmpty(item.AlbumID, item.SeasonID, item.SeriesID, item.ParentID)
		libraryName, collection := "", ""
		if lib, ok := byLibrary[item.ParentID]; ok {
			libraryName, collection = lib.Name, lib.CollectionType
		}
		if collection == "" {
			switch item.Type {
			case "Movie", "BoxSet":
				collection = "movies"
			case "Series", "Season", "Episode":
				collection = "tvshows"
			case "Audio", "MusicAlbum":
				collection = "music"
			case "Book", "AudioBook", "Comic":
				collection = "books"
			}
		}
		genres, _ := json.Marshal(item.Genres)
		directors, _ := json.Marshal(item.Directors)
		actors, _ := json.Marshal(item.Actors)
		studios, _ := json.Marshal(item.Studios)
		var size any
		var resolution any
		for _, source := range item.MediaSources {
			if source.Size > 0 {
				size = source.Size
			}
			for _, stream := range source.MediaStreams {
				if stream.Type == "Video" {
					resolution = resolutionLabel(stream.Width, stream.Height)
				}
			}
		}
		var dateAdded any
		if item.DateCreated != "" {
			if parsed, e := time.Parse(time.RFC3339Nano, item.DateCreated); e == nil {
				dateAdded = parsed.UTC().Format(time.RFC3339Nano)
			}
		}
		var duration any
		if item.RunTimeTicks > 0 {
			duration = item.RunTimeTicks / 10000
		}
		var col any
		if collection != "" {
			col = collection
		}
		var lib any
		if libraryName != "" {
			lib = libraryName
		}
		var par any
		if parent != "" {
			par = parent
		}
		var res any
		if resolution != nil {
			res = resolution
		}
		var artist any
		if item.AlbumArtist != "" {
			artist = item.AlbumArtist
		}
		_, e := db.ExecContext(ctx, database.Bind(`INSERT INTO "Media" ("id","serverId","jellyfinMediaId","title","type","collectionType","libraryName","genres","durationMs","size","directors","actors","studios","parentId","artist","dateAdded","resolution") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT("jellyfinMediaId","serverId") DO UPDATE SET "title"=excluded."title","type"=excluded."type","collectionType"=COALESCE(excluded."collectionType","Media"."collectionType"),"libraryName"=COALESCE(excluded."libraryName","Media"."libraryName"),"genres"=excluded."genres","durationMs"=COALESCE(excluded."durationMs","Media"."durationMs"),"size"=COALESCE(excluded."size","Media"."size"),"directors"=excluded."directors","actors"=excluded."actors","studios"=excluded."studios","parentId"=COALESCE(excluded."parentId","Media"."parentId"),"artist"=COALESCE(excluded."artist","Media"."artist"),"dateAdded"=COALESCE(excluded."dateAdded","Media"."dateAdded"),"resolution"=COALESCE(excluded."resolution","Media"."resolution"),"updatedAt"=CURRENT_TIMESTAMP`, driver), stableID("med", serverID+":"+item.ID), serverID, item.ID, firstNonEmpty(item.Name, "Unknown"), item.Type, col, lib, string(genres), duration, size, string(directors), string(actors), string(studios), par, artist, dateAdded, res)
		if e != nil {
			return fmt.Errorf("save media %q: %w", item.ID, e)
		}
		result.Media++
		return nil
	})
	if err != nil {
		return result, fmt.Errorf("fetch Jellyfin media: %w", err)
	}
	return result, nil
}

func stableID(prefix, value string) string { // Deterministic key preserves stable database IDs across syncs.
	sum := sha256.Sum256([]byte(value))
	return prefix + "_" + hex.EncodeToString(sum[:16])
}
func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}
func resolutionLabel(w, h int) any {
	if w <= 0 || h <= 0 {
		return nil
	}
	if w >= 3800 || h >= 2100 {
		return "4K"
	}
	if w >= 1900 || h >= 1000 {
		return "1080p"
	}
	if w >= 1200 || h >= 700 {
		return "720p"
	}
	if w >= 700 || h >= 400 {
		return "480p"
	}
	return "SD"
}
