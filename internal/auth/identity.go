package auth

import (
	"context"
	"database/sql"
	"encoding/hex"
	"strings"

	"github.com/maelmoreau21/jellytrack/internal/database"
)

type AccountIdentity struct {
	ID, ServerID, JellyfinUserID, Username, ServerName string
}

// JellyfinIDForms recognises UUID-only compact/dashed aliases. Other IDs remain
// opaque and case-sensitive; arbitrary punctuation cannot be discarded.
func JellyfinIDForms(value string) []string {
	compact := value
	if len(value) == 36 && value[8] == '-' && value[13] == '-' && value[18] == '-' && value[23] == '-' {
		compact = value[:8] + value[9:13] + value[14:18] + value[19:23] + value[24:]
	}
	if len(compact) != 32 {
		return []string{value}
	}
	if _, err := hex.DecodeString(compact); err != nil {
		return []string{value}
	}
	compact = strings.ToLower(compact)
	return []string{compact, compact[:8] + "-" + compact[8:12] + "-" + compact[12:16] + "-" + compact[16:20] + "-" + compact[20:]}
}

func (identity AccountIdentity) Matches(alias string) bool {
	if alias == "me" || alias == "@me" || alias == identity.ID || strings.EqualFold(alias, identity.Username) {
		return true
	}
	for _, left := range JellyfinIDForms(alias) {
		for _, right := range JellyfinIDForms(identity.JellyfinUserID) {
			if left == right {
				return true
			}
		}
	}
	return false
}

// ResolveAccount binds a session to one account and server. Old sessions may
// fall back to a display name only when one compatible real account exists.
func ResolveAccount(ctx context.Context, db *sql.DB, driver string, principal Principal) (AccountIdentity, error) {
	if db == nil {
		return AccountIdentity{}, sql.ErrNoRows
	}
	where := `LOWER(u."username")=LOWER(?) AND u."jellyfinUserId" NOT LIKE 'oidc-%'`
	args := []any{principal.Username}
	if principal.IdentityVersion > 0 && principal.AuthServerID == "" {
		return AccountIdentity{}, sql.ErrNoRows
	}
	if principal.AuthServerID != "" {
		if principal.JellyfinUserID == "" {
			return AccountIdentity{}, sql.ErrNoRows
		}
		where = `u."serverId"=?`
		args = []any{principal.AuthServerID}
	} else if strings.HasPrefix(principal.JellyfinUserID, "oidc-") {
		return AccountIdentity{}, sql.ErrNoRows
	}
	if principal.JellyfinUserID != "" {
		forms := JellyfinIDForms(principal.JellyfinUserID)
		if len(forms) == 2 {
			where += ` AND (LOWER(u."jellyfinUserId") IN (?,?)`
			args = append(args, forms[0], forms[1])
		} else {
			where += ` AND (u."jellyfinUserId"=?`
			args = append(args, forms[0])
		}
		if principal.AuthServerID == "" {
			where += ` OR u."id"=?`
			args = append(args, principal.JellyfinUserID)
		}
		where += `)`
	}
	rows, err := db.QueryContext(ctx, database.Bind(`SELECT u."id",u."serverId",u."jellyfinUserId",u."username",COALESCE(s."name",'') FROM "User" u LEFT JOIN "Server" s ON s."id"=u."serverId" WHERE `+where+` LIMIT 2`, driver), args...)
	if err != nil {
		return AccountIdentity{}, err
	}
	defer rows.Close()
	var identity AccountIdentity
	count := 0
	for rows.Next() {
		if err := rows.Scan(&identity.ID, &identity.ServerID, &identity.JellyfinUserID, &identity.Username, &identity.ServerName); err != nil {
			return AccountIdentity{}, err
		}
		count++
	}
	if err := rows.Err(); err != nil {
		return AccountIdentity{}, err
	}
	if count != 1 {
		return AccountIdentity{}, sql.ErrNoRows
	}
	return identity, nil
}

func (m *Manager) resolveOIDCAccount(ctx context.Context, username, subject string) (string, string) {
	identity, err := ResolveAccount(ctx, m.db, m.driver, Principal{Username: username})
	if err != nil {
		// Keep an unlinked session identifiable without creating a phantom user
		// or silently attaching it to a homonymous account on a later request.
		return "oidc-" + first(subject, username), ""
	}
	return identity.JellyfinUserID, identity.ServerID
}
