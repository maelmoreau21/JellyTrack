package auth

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/database"
)

// LinkedAccounts returns only explicit associations, never name/email matches.
// Permissions remain those of the active session, not the linked accounts.
func LinkedAccounts(ctx context.Context, db *sql.DB, driver string, p Principal) ([]AccountIdentity, error) {
	current, err := ResolveAccount(ctx, db, driver, p)
	if err != nil {
		return nil, err
	}
	rows, err := db.QueryContext(ctx, database.Bind(`SELECT u."id",u."serverId",u."jellyfinUserId",u."username",s."name"
 FROM "User" u JOIN "Server" s ON s."id"=u."serverId"
 WHERE u."isActive"=TRUE AND s."isActive"=TRUE AND
 (u."id"=? OR u."id" IN (SELECT a."accountId" FROM "PersonAccount" a WHERE a."personId"=(SELECT "personId" FROM "PersonAccount" WHERE "accountId"=?)))
 ORDER BY s."name",u."id"`, driver), current.ID, current.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	accounts := []AccountIdentity{}
	for rows.Next() {
		var account AccountIdentity
		if err := rows.Scan(&account.ID, &account.ServerID, &account.JellyfinUserID, &account.Username, &account.ServerName); err != nil {
			return nil, err
		}
		accounts = append(accounts, account)
	}
	return accounts, rows.Err()
}

func (m *Manager) recentAccount(r *http.Request) (Principal, AccountIdentity, error) {
	p, _ := PrincipalFromContext(r.Context())
	var created string
	err := m.db.QueryRowContext(r.Context(), database.Bind(`SELECT "createdAt" FROM "AuthSession" WHERE "id"=?`, m.driver), p.sessionID).Scan(&created)
	if err != nil {
		return p, AccountIdentity{}, err
	}
	date, err := parseTimeFlex(created)
	if err != nil || time.Since(date) > 10*time.Minute {
		return p, AccountIdentity{}, sql.ErrNoRows
	}
	account, err := ResolveAccount(r.Context(), m.db, m.driver, p)
	return p, account, err
}

func (m *Manager) linkedAccounts(w http.ResponseWriter, r *http.Request) {
	p, _ := PrincipalFromContext(r.Context())
	accounts, err := LinkedAccounts(r.Context(), m.db, m.driver, p)
	if err != nil {
		writeJSON(w, 403, map[string]string{"error": "Compte Jellyfin vérifiable requis."})
		return
	}
	current, err := ResolveAccount(r.Context(), m.db, m.driver, p)
	if err != nil {
		writeJSON(w, 403, map[string]string{"error": "Compte indisponible."})
		return
	}
	type view struct {
		ID         string `json:"id"`
		ServerID   string `json:"serverId"`
		Username   string `json:"username"`
		ServerName string `json:"serverName"`
		Current    bool   `json:"current"`
	}
	result := []view{}
	for _, a := range accounts {
		result = append(result, view{a.ID, a.ServerID, a.Username, a.ServerName, a.ID == current.ID})
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, 200, map[string]any{"accounts": result})
}

func proofHash(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func (m *Manager) accountProof(w http.ResponseWriter, r *http.Request) {
	p, account, err := m.recentAccount(r)
	if err != nil {
		writeJSON(w, 403, map[string]string{"error": "Reconnectez-vous à ce compte depuis moins de dix minutes."})
		return
	}
	code, err := randomValue(32)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "Génération impossible."})
		return
	}
	tx, err := m.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "Association indisponible."})
		return
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(r.Context(), database.Bind(`DELETE FROM "AccountLinkProof" WHERE "accountId"=? OR "expiresAt"<?`, m.driver), account.ID, time.Now().UTC().Format(time.RFC3339Nano)); err == nil {
		_, err = tx.ExecContext(r.Context(), database.Bind(`INSERT INTO "AccountLinkProof"("hash","accountId","sessionId","expiresAt") VALUES(?,?,?,?)`, m.driver), proofHash(code), account.ID, p.sessionID, time.Now().UTC().Add(5*time.Minute).Format(time.RFC3339Nano))
	}
	if err != nil || tx.Commit() != nil {
		writeJSON(w, 500, map[string]string{"error": "Association indisponible."})
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, 200, map[string]any{"code": code, "expiresIn": 300})
}

func (m *Manager) linkAccount(w http.ResponseWriter, r *http.Request) {
	_, current, err := m.recentAccount(r)
	if err != nil {
		writeJSON(w, 403, map[string]string{"error": "Reconnectez-vous avant d’associer un compte."})
		return
	}
	var input struct {
		Code string `json:"code"`
	}
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 2048)).Decode(&input) != nil || len(input.Code) != 43 {
		writeJSON(w, 400, map[string]string{"error": "Code invalide."})
		return
	}
	tx, err := m.db.BeginTx(r.Context(), &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "Association indisponible."})
		return
	}
	defer tx.Rollback()
	now := time.Now().UTC().Format(time.RFC3339Nano)
	var target, expires string
	err = tx.QueryRowContext(r.Context(), database.Bind(`SELECT p."accountId",p."expiresAt" FROM "AccountLinkProof" p JOIN "AuthSession" s ON s."id"=p."sessionId" JOIN "User" u ON u."id"=p."accountId" JOIN "Server" v ON v."id"=u."serverId" WHERE p."hash"=? AND u."isActive"=TRUE AND v."isActive"=TRUE AND s."expiresAt">?`, m.driver), proofHash(input.Code), now).Scan(&target, &expires)
	expiry, e := time.Parse(time.RFC3339Nano, expires)
	if err != nil || e != nil || !expiry.After(time.Now()) || target == current.ID {
		writeJSON(w, 400, map[string]string{"error": "Code expiré, révoqué ou compte identique."})
		return
	}
	var revoked sql.NullString
	var created string
	err = tx.QueryRowContext(r.Context(), database.Bind(`SELECT s."createdAt" FROM "AuthSession" s JOIN "AccountLinkProof" p ON p."sessionId"=s."id" WHERE p."hash"=?`, m.driver), proofHash(input.Code)).Scan(&created)
	_ = tx.QueryRowContext(r.Context(), `SELECT "authSessionsRevokedAt" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&revoked)
	if err != nil {
		writeJSON(w, 400, map[string]string{"error": "Code révoqué."})
		return
	}
	if revoked.Valid {
		rev, re := parseTimeFlex(revoked.String)
		date, de := parseTimeFlex(created)
		if re != nil || de != nil || !date.After(rev) {
			writeJSON(w, 400, map[string]string{"error": "Code révoqué."})
			return
		}
	}
	person, err := randomValue(24)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "Association indisponible."})
		return
	}
	if _, err = tx.ExecContext(r.Context(), database.Bind(`INSERT INTO "PersonAccount"("accountId","personId","createdAt") VALUES(?,?,?) ON CONFLICT("accountId") DO NOTHING`, m.driver), current.ID, person, now); err != nil {
		writeJSON(w, 409, map[string]string{"error": "Réessayez l’association."})
		return
	}
	if err = tx.QueryRowContext(r.Context(), database.Bind(`SELECT "personId" FROM "PersonAccount" WHERE "accountId"=?`, m.driver), current.ID).Scan(&person); err != nil {
		writeJSON(w, 500, map[string]string{"error": "Association indisponible."})
		return
	}
	var existing string
	err = tx.QueryRowContext(r.Context(), database.Bind(`SELECT "personId" FROM "PersonAccount" WHERE "accountId"=?`, m.driver), target).Scan(&existing)
	if err != nil && err != sql.ErrNoRows {
		writeJSON(w, 409, map[string]string{"error": "Ce compte appartient déjà à une autre association. Dissociez-le d’abord."})
		return
	}
	if existing != "" && existing != person {
		var members int
		if err = tx.QueryRowContext(r.Context(), database.Bind(`SELECT COUNT(*) FROM "PersonAccount" WHERE "personId"=?`, m.driver), existing).Scan(&members); err != nil || members != 1 {
			writeJSON(w, 409, map[string]string{"error": "Ce compte appartient déjà à une autre association. Dissociez-le d’abord."})
			return
		}
		if _, err = tx.ExecContext(r.Context(), database.Bind(`UPDATE "PersonAccount" SET "personId"=? WHERE "accountId"=? AND "personId"=?`, m.driver), person, target, existing); err != nil {
			writeJSON(w, 409, map[string]string{"error": "Réessayez l’association."})
			return
		}
	}
	var accountCount int
	if err = tx.QueryRowContext(r.Context(), database.Bind(`SELECT COUNT(*) FROM "PersonAccount" WHERE "personId"=?`, m.driver), person).Scan(&accountCount); err != nil || (existing == "" && accountCount >= 8) || accountCount > 8 {
		writeJSON(w, 409, map[string]string{"error": "Huit comptes maximum par personne."})
		return
	}
	if _, err = tx.ExecContext(r.Context(), database.Bind(`INSERT INTO "PersonAccount"("accountId","personId","createdAt") VALUES(?,?,?) ON CONFLICT("accountId") DO NOTHING`, m.driver), target, person, now); err != nil {
		writeJSON(w, 409, map[string]string{"error": "Réessayez l’association."})
		return
	}
	result, err := tx.ExecContext(r.Context(), database.Bind(`DELETE FROM "AccountLinkProof" WHERE "hash"=?`, m.driver), proofHash(input.Code))
	if err != nil {
		writeJSON(w, 409, map[string]string{"error": "Code déjà utilisé."})
		return
	}
	count, err := result.RowsAffected()
	if err != nil || count != 1 || tx.Commit() != nil {
		writeJSON(w, 409, map[string]string{"error": "Réessayez avec un nouveau code."})
		return
	}
	writeJSON(w, 200, map[string]bool{"linked": true})
}

func (m *Manager) unlinkAccount(w http.ResponseWriter, r *http.Request) {
	_, current, err := m.recentAccount(r)
	if err != nil {
		writeJSON(w, 403, map[string]string{"error": "Reconnectez-vous avant de dissocier un compte."})
		return
	}
	target := r.PathValue("id")
	tx, err := m.db.BeginTx(r.Context(), &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "Dissociation indisponible."})
		return
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(r.Context(), database.Bind(`DELETE FROM "PersonAccount" WHERE "accountId"=? AND "personId"=(SELECT "personId" FROM "PersonAccount" WHERE "accountId"=?)`, m.driver), target, current.ID)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "Dissociation indisponible."})
		return
	}
	count, _ := result.RowsAffected()
	if count != 1 {
		writeJSON(w, 404, map[string]string{"error": "Compte associé introuvable."})
		return
	}
	if _, err = tx.ExecContext(r.Context(), database.Bind(`DELETE FROM "AccountLinkProof" WHERE "accountId"=?`, m.driver), target); err != nil || tx.Commit() != nil {
		writeJSON(w, 500, map[string]string{"error": "Dissociation indisponible."})
		return
	}
	writeJSON(w, 200, map[string]bool{"unlinked": true})
}
