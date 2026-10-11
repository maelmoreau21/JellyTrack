package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/auth"
	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/internal/jellyfin"
)

func verifyConfiguredServer(r *http.Request, address, key, expected string) error {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	client, err := jellyfin.New(address, key)
	if err != nil {
		return err
	}
	info, err := client.SystemInfo(ctx)
	if err != nil {
		return err
	}
	if info.ID != expected {
		return errors.New("different Jellyfin server")
	}
	return nil
}

func (h *Handler) serverConnectionInfo(r *http.Request) ([]map[string]any, error) {
	return h.recoveredRows(r, `SELECT s."id",s."name",s."isActive",COALESCE(c."status",'unknown') AS "status",c."latencyMs",c."lastConnectedAt",c."lastAttemptAt" FROM "Server" s LEFT JOIN "ServerConnectionState" c ON c."serverId"=s."id" ORDER BY s."name",s."id"`)
}

func (h *Handler) mediaAvailability(r *http.Request, item map[string]any) ([]map[string]any, error) {
	// Provider IDs, never names or server-local Jellyfin IDs, identify copies.
	var seed map[string]string
	_ = json.Unmarshal([]byte(mediaString(item["providerIds"])), &seed)
	copyRequest := r.Clone(r.Context())
	copyURL := *r.URL
	q := copyURL.Query()
	q.Del("serverId")
	q.Set("servers", "all")
	copyURL.RawQuery = q.Encode()
	copyRequest.URL = &copyURL
	base, args, err := h.recoveredMediaBase(copyRequest)
	if err != nil {
		return nil, err
	}
	rows, err := h.recoveredRows(copyRequest, base+`SELECT m."id",m."serverId",m."server",m."providerIds" FROM catalog m WHERE m."type"=?`, append(args, item["type"])...)
	if err != nil {
		return nil, err
	}
	available := []map[string]any{}
	seen := map[string]bool{}
	for _, row := range rows {
		match := row["id"] == item["id"]
		var ids map[string]string
		_ = json.Unmarshal([]byte(mediaString(row["providerIds"])), &ids)
		for _, provider := range []string{"Imdb", "Tmdb", "Tvdb", "MusicBrainzAlbum", "MusicBrainzTrack"} {
			if seed[provider] != "" && ids[provider] == seed[provider] {
				match = true
			}
		}
		if match && !seen[mediaString(row["serverId"])] {
			seen[mediaString(row["serverId"])] = true
			available = append(available, map[string]any{"serverId": row["serverId"], "name": row["server"], "mediaId": row["id"]})
		}
	}
	return available, nil
}

// Resolve exact internal IDs first; remote IDs and names must be unambiguous.
func (h *Handler) resolveProfileAccount(r *http.Request, id string) (auth.AccountIdentity, error) {
	forms := auth.JellyfinIDForms(id)
	marks := make([]string, len(forms))
	args := []any{id}
	for i, value := range forms {
		marks[i] = "?"
		args = append(args, value)
	}
	args = append(args, id)
	where := `(u."id"=? OR LOWER(u."jellyfinUserId") IN (` + strings.Join(marks, ",") + `) OR LOWER(u."username")=LOWER(?))`
	if server := r.URL.Query().Get("serverId"); server != "" {
		where += ` AND (u."serverId"=? OR s."jellyfinServerId"=?)`
		args = append(args, server, server)
	}
	args = append(args, id)
	rows, err := h.db.QueryContext(r.Context(), database.Bind(`SELECT u."id",u."serverId",u."jellyfinUserId",u."username" FROM "User" u JOIN "Server" s ON s."id"=u."serverId" WHERE `+where+` ORDER BY CASE WHEN u."id"=? THEN 0 ELSE 1 END LIMIT 2`, h.driver), args...)
	if err != nil {
		return auth.AccountIdentity{}, err
	}
	defer rows.Close()
	var accounts []auth.AccountIdentity
	for rows.Next() {
		var a auth.AccountIdentity
		if err = rows.Scan(&a.ID, &a.ServerID, &a.JellyfinUserID, &a.Username); err != nil {
			return a, err
		}
		accounts = append(accounts, a)
	}
	if err = rows.Err(); err != nil {
		return auth.AccountIdentity{}, err
	}
	if len(accounts) == 0 || (len(accounts) > 1 && accounts[0].ID != id) {
		return auth.AccountIdentity{}, errors.New("ambiguous or missing account")
	}
	return accounts[0], nil
}

func (h *Handler) serverNames(r *http.Request) (map[string]string, error) {
	rows, err := h.db.QueryContext(r.Context(), `SELECT "id","name" FROM "Server"`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	names := map[string]string{}
	for rows.Next() {
		var id, name string
		if err = rows.Scan(&id, &name); err != nil {
			return nil, err
		}
		names[id] = name
	}
	return names, rows.Err()
}
