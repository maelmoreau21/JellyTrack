package api

import (
	"context"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/auth"
	"github.com/maelmoreau21/jellytrack/internal/jellyfin"
)

func (h *Handler) remoteSessions(w http.ResponseWriter, r *http.Request) {
	rows, err := h.recoveredRows(r, `SELECT "id","name","url",COALESCE("jellyfinApiKey",'') AS "key" FROM "Server" WHERE "isActive"=TRUE`)
	if err != nil {
		jsonError(w, 500, "Cannot read servers")
		return
	}
	scope := getServerScope(r)
	selected := map[string]bool{}
	for _, id := range scope {
		selected[id] = true
	}
	var own *auth.AccountIdentity
	if p, ok := auth.PrincipalFromContext(r.Context()); ok && !p.IsAdmin() {
		a, err := auth.ResolveAccount(r.Context(), h.db, h.driver, p)
		if err != nil {
			jsonError(w, 403, "Forbidden")
			return
		}
		own = &a
	}
	if len(rows) == 0 && own == nil && len(scope) == 0 && os.Getenv("JELLYFIN_URL") != "" {
		rows = append(rows, map[string]any{"id": "", "name": "Jellyfin", "url": os.Getenv("JELLYFIN_URL"), "key": first(os.Getenv("JELLYFIN_API_KEY"), os.Getenv("JELLYTRACK_JELLYFIN_API_KEY"))})
	}
	items := []map[string]any{}
	failed := []string{}
	var mu sync.Mutex
	var wg sync.WaitGroup
	limit := make(chan struct{}, 4)
	targets := 0
	for _, row := range rows {
		id := mediaString(row["id"])
		if (len(scope) > 0 && !selected[id]) || (own != nil && own.ServerID != id) {
			continue
		}
		targets++
		wg.Add(1)
		go func(row map[string]any, id string) {
			defer wg.Done()
			ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
			defer cancel()
			select {
			case limit <- struct{}{}:
				defer func() { <-limit }()
			case <-ctx.Done():
				mu.Lock()
				failed = append(failed, id)
				mu.Unlock()
				return
			}
			client, e := jellyfin.New(mediaString(row["url"]), mediaString(row["key"]))
			var sessions []jellyfin.Session
			if e == nil {
				sessions, e = client.Sessions(ctx)
			}
			mu.Lock()
			defer mu.Unlock()
			if e != nil {
				failed = append(failed, id)
				return
			}
			for _, session := range sessions {
				if own != nil {
					match := false
					for _, form := range auth.JellyfinIDForms(own.JellyfinUserID) {
						if strings.EqualFold(session.UserID, form) {
							match = true
						}
					}
					if !match {
						continue
					}
				}
				items = append(items, map[string]any{"Id": session.ID, "UserId": session.UserID, "UserName": session.UserName, "Client": session.Client, "DeviceName": session.DeviceName, "NowPlayingItem": session.NowPlayingItem, "PlayState": session.PlayState, "RemoteEndPoint": session.RemoteEndPoint, "serverId": id, "serverName": row["name"], "serverStatus": "online"})
			}
		}(row, id)
	}
	wg.Wait()
	if targets > 0 && len(failed) == targets {
		jsonResponse(w, 502, map[string]any{"error": "Jellyfin unavailable", "items": items, "failedServers": failed})
		return
	}
	jsonResponse(w, 200, map[string]any{"items": items, "failedServers": failed})
}
