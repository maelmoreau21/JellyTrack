package api

import (
	"context"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/auth"
	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/internal/jellyfin"
)

// Read current permissions with the server API key, using the authenticated
// account's exact server and remote ID. Unavailable or ambiguous data denies
// access; request filters and display names never establish identity.
func (h *Handler) libraryAccessClause(r *http.Request, alias string) (string, []any) {
	p, ok := auth.PrincipalFromContext(r.Context())
	if !ok || p.IsAdmin() {
		return "1=1", nil
	}
	deny := "1=0"
	if p.AuthServerID == "" || p.JellyfinUserID == "" {
		return deny, nil
	}
	identity, err := auth.ResolveAccount(r.Context(), h.db, h.driver, p)
	if err != nil {
		return deny, nil
	}
	var address, key string
	err = h.db.QueryRowContext(r.Context(), database.Bind(`SELECT "url",COALESCE("jellyfinApiKey",'') FROM "Server" WHERE "id"=? AND "isActive"=TRUE`, h.driver), identity.ServerID).Scan(&address, &key)
	if err != nil {
		return deny, nil
	}
	if strings.EqualFold(strings.TrimRight(address, "/"), strings.TrimRight(os.Getenv("JELLYFIN_URL"), "/")) {
		key = first(os.Getenv("JELLYFIN_API_KEY"), os.Getenv("JELLYTRACK_JELLYFIN_API_KEY"), key)
	}
	client, err := jellyfin.New(address, key)
	if err != nil {
		return deny, nil
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	user, err := client.AuthenticationUser(ctx, identity.JellyfinUserID)
	if err != nil || user.Policy.IsDisabled || !sameLibraryID(identity.JellyfinUserID, user.ID) {
		return deny, nil
	}
	args := []any{identity.ServerID}
	scope := alias + `."serverId"=?`
	if user.Policy.EnableAllFolders {
		return scope, args
	}
	libraries, err := client.Libraries(ctx)
	if err != nil {
		return deny, nil
	}
	allowed := map[string]bool{}
	for _, id := range user.Policy.EnabledFolders {
		for _, form := range auth.JellyfinIDForms(id) {
			allowed[form] = true
		}
	}
	// Media currently stores the library name. A shared name is safe only
	// when every library with that name is authorized.
	names := map[string]bool{}
	for _, lib := range libraries {
		permitted := false
		for _, form := range auth.JellyfinIDForms(lib.ID) {
			permitted = permitted || allowed[form]
		}
		if previous, exists := names[lib.Name]; exists {
			permitted = permitted && previous
		}
		names[lib.Name] = permitted
	}
	marks := []string{}
	for name, permitted := range names {
		if permitted && name != "" {
			marks = append(marks, "?")
			args = append(args, name)
		}
	}
	if len(marks) == 0 {
		return deny, nil
	}
	return scope + ` AND ` + alias + `."libraryName" IN (` + strings.Join(marks, ",") + `)`, args
}

func sameLibraryID(left, right string) bool {
	for _, a := range auth.JellyfinIDForms(left) {
		for _, b := range auth.JellyfinIDForms(right) {
			if a == b && a != "" {
				return true
			}
		}
	}
	return false
}
