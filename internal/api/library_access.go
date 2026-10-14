package api

import (
	"context"
	"crypto/sha256"
	"fmt"
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
		return h.libraryAccessClauseFresh(r, alias)
	}
	identity, err := auth.ResolveAccount(r.Context(), h.db, h.driver, p)
	if err != nil {
		return "1=0", nil
	}
	var address, key, updated string
	err = h.db.QueryRowContext(r.Context(), database.Bind(`SELECT "url",COALESCE("jellyfinApiKey",''),CAST("updatedAt" AS TEXT) FROM "Server" WHERE "id"=? AND "isActive"=TRUE`, h.driver), identity.ServerID).Scan(&address, &key, &updated)
	if err != nil {
		return "1=0", nil
	}
	cacheKey := fmt.Sprintf("%x", sha256.Sum256([]byte(identity.ServerID+"\x00"+identity.JellyfinUserID+"\x00"+address+"\x00"+key+"\x00"+updated+"\x00"+os.Getenv("JELLYFIN_API_KEY")+"\x00"+os.Getenv("JELLYTRACK_JELLYFIN_API_KEY"))))
	h.libraryCacheMu.Lock()
	entry, found := h.libraryCache[cacheKey]
	h.libraryCacheMu.Unlock()
	if found && time.Now().Before(entry.expires) {
		return strings.ReplaceAll(entry.clause, "__library_media__", alias), append([]any{}, entry.args...)
	}
	clause, args := h.libraryAccessClauseFresh(r, "__library_media__")
	// Never retain a failed provider response or stale permissions.
	if clause != "1=0" {
		h.libraryCacheMu.Lock()
		if h.libraryCache == nil || len(h.libraryCache) > 512 {
			h.libraryCache = map[string]libraryAccessEntry{}
		}
		h.libraryCache[cacheKey] = libraryAccessEntry{clause: clause, args: append([]any{}, args...), expires: time.Now().Add(10 * time.Second)}
		h.libraryCacheMu.Unlock()
	}
	return strings.ReplaceAll(clause, "__library_media__", alias), args
}

type libraryAccessEntry struct {
	clause  string
	args    []any
	expires time.Time
}

type historyLibraryAccessKey struct{}
type historyLibraryAccess struct {
	clause string
	args   []any
}

// A request uses one freshly checked policy consistently for its rows, counts,
// aggregates and exports. Do not reuse the catalogue's cross-request cache.
func (h *Handler) withHistoryLibraryAccess(r *http.Request) *http.Request {
	if _, ok := r.Context().Value(historyLibraryAccessKey{}).(historyLibraryAccess); ok {
		return r
	}
	clause, args := h.libraryAccessClauseFresh(r, "m")
	return r.WithContext(context.WithValue(r.Context(), historyLibraryAccessKey{}, historyLibraryAccess{clause, args}))
}

func (h *Handler) historyLibraryClause(r *http.Request) (string, []any) {
	if access, ok := r.Context().Value(historyLibraryAccessKey{}).(historyLibraryAccess); ok {
		return access.clause, append([]any{}, access.args...)
	}
	return h.libraryAccessClauseFresh(r, "m")
}

func (h *Handler) clearLibraryAccessCache() {
	h.libraryCacheMu.Lock()
	h.libraryCache = nil
	h.libraryCacheMu.Unlock()
	h.dashboardCacheMu.Lock()
	h.dashboardCache = nil
	h.dashboardCacheMu.Unlock()
}

func (h *Handler) libraryAccessClauseFresh(r *http.Request, alias string) (string, []any) {
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
