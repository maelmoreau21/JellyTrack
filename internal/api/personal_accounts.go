package api

import (
	"context"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/auth"
	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/internal/jellyfin"
)

func (h *Handler) personalWrapped(w http.ResponseWriter, r *http.Request) {
	p, ok := auth.PrincipalFromContext(r.Context())
	if !ok {
		jsonError(w, 401, "Authentification requise.")
		return
	}
	// Reuse the existing visibility/calendar guard, even for linked accounts.
	guard := personalWrappedAvailable(h, w, r, p)
	if !guard {
		return
	}
	accounts, err := auth.LinkedAccounts(r.Context(), h.db, h.driver, p)
	if err != nil || len(accounts) == 0 {
		jsonError(w, 403, "Compte Jellyfin vérifiable requis.")
		return
	}
	clauses := []string{}
	args := []any{}
	included := []map[string]string{}
	if len(accounts) > 8 {
		jsonError(w, 409, "Dissociez des comptes pour respecter la limite de huit.")
		return
	}
	type policyResult struct {
		clause string
		args   []any
	}
	policies := make([]policyResult, len(accounts))
	ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
	defer cancel()
	var pending sync.WaitGroup
	slots := make(chan struct{}, 4)
	for i, a := range accounts {
		pending.Add(1)
		go func(i int, a auth.AccountIdentity) {
			defer pending.Done()
			select {
			case slots <- struct{}{}:
				defer func() { <-slots }()
			case <-ctx.Done():
				policies[i].clause = "1=0"
				return
			}
			identity := auth.Principal{Role: "user", Username: a.Username, AuthServerID: a.ServerID, JellyfinUserID: a.JellyfinUserID, IdentityVersion: 2}
			ownRequest := r.WithContext(context.WithValue(ctx, auth.PrincipalContextKey, identity))
			policies[i].clause, policies[i].args = h.libraryAccessClauseFresh(ownRequest, "m")
		}(i, a)
	}
	pending.Wait()
	for i, a := range accounts {
		// Re-read each account's own library policy. Association confers no library
		// access to the current session and never bypasses a disabled account.
		access, accessArgs := policies[i].clause, policies[i].args
		if access == "1=0" {
			jsonError(w, 403, "Les droits d’un compte associé ne sont pas vérifiables. Dissociez-le ou rétablissez sa connexion.")
			return
		}
		clauses = append(clauses, `(p."userId"=? AND p."serverId"=? AND (`+access+`))`)
		args = append(args, a.ID, a.ServerID)
		args = append(args, accessArgs...)
		included = append(included, map[string]string{"serverId": a.ServerID, "serverName": a.ServerName, "username": a.Username})
	}
	w.Header().Set("Cache-Control", "private, no-store")
	h.wrappedAccounts(w, r, "me", p.Username, "", "", strings.Join(clauses, " OR "), args, included)
}

func personalWrappedAvailable(h *Handler, w http.ResponseWriter, r *http.Request, p auth.Principal) bool {
	if p.IsAdmin() {
		return true
	}
	year, err := wrappedYear(r)
	if err != nil {
		jsonError(w, 400, "Année invalide.")
		return false
	}
	var visible, period bool
	var sm, sd, em, ed int
	err = h.db.QueryRowContext(r.Context(), `SELECT "wrappedVisible","wrappedPeriodEnabled","wrappedStartMonth","wrappedStartDay","wrappedEndMonth","wrappedEndDay" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&visible, &period, &sm, &sd, &em, &ed)
	if err != nil || !visible || (period && year == time.Now().UTC().Year() && !historicalWrappedVisible(time.Now().UTC(), sm, sd, em, ed)) {
		jsonError(w, 404, "Le Wrapped n’est pas disponible actuellement.")
		return false
	}
	return true
}

// Server administrators can observe/synchronize their own server only. Global
// configuration, credentials, backups and other accounts stay super-admin only.
func (h *Handler) ownServer(w http.ResponseWriter, r *http.Request) {
	p, ok := auth.PrincipalFromContext(r.Context())
	if !ok || p.AuthServerID == "" || !p.CanAdminServer(p.AuthServerID) {
		jsonError(w, 403, "Droits administrateur du serveur requis.")
		return
	}
	var id, jid, name, address, key string
	err := h.db.QueryRowContext(r.Context(), database.Bind(`SELECT "id","jellyfinServerId","name","url",COALESCE("jellyfinApiKey",'') FROM "Server" WHERE "id"=? AND "isActive"=TRUE`, h.driver), p.AuthServerID).Scan(&id, &jid, &name, &address, &key)
	if err != nil {
		jsonError(w, 404, "Serveur indisponible.")
		return
	}
	client, err := jellyfin.New(address, key)
	if err != nil {
		jsonError(w, 403, "Droits invérifiables.")
		return
	}
	current, err := client.AuthenticationUser(r.Context(), p.JellyfinUserID)
	if err != nil || current.Policy.IsDisabled || !current.Policy.IsAdministrator || !sameLibraryID(current.ID, p.JellyfinUserID) {
		jsonError(w, 403, "Droits administrateur révoqués ou invérifiables.")
		return
	}
	if r.Method == http.MethodPost {
		defer h.clearLibraryAccessCache()
		result, err := jellyfin.SyncOne(r.Context(), h.db, h.driver, id, jid, name, address, key)
		if err != nil {
			jsonError(w, 502, "Synchronisation du serveur échouée.")
			return
		}
		jsonResponse(w, 200, result)
		return
	}
	rows, err := h.recoveredRows(r, `SELECT s."id",s."name",(SELECT COUNT(*) FROM "User" u WHERE u."serverId"=s."id") AS "users",(SELECT COUNT(*) FROM "Media" m WHERE m."serverId"=s."id") AS "media",(SELECT COUNT(*) FROM "PlaybackHistory" p WHERE p."serverId"=s."id") AS "plays" FROM "Server" s WHERE s."id"=?`, id)
	if err != nil {
		jsonError(w, 500, "Lecture impossible.")
		return
	}
	jsonResponse(w, 200, map[string]any{"servers": rows})
}
