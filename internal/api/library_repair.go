package api

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/backup"
	"github.com/maelmoreau21/jellytrack/internal/jellyfin"
	"github.com/maelmoreau21/jellytrack/internal/security"
	"github.com/maelmoreau21/jellytrack/internal/stats"
)

var repairBackupName = regexp.MustCompile(`^JellyTrack-library-repair-[0-9]{8}T[0-9]{15}Z\.sqlite$`)
var importedRepairIdentity = regexp.MustCompile(`^imported-server-[1-9][0-9]*$`)

type libraryRepairChange struct {
	id, server, remote string
	before             sql.NullString
	after              string
	beforeResolution   sql.NullString
	afterResolution    string
}

type libraryRepairServerChange struct{ id, before, after string }
type libraryRepairDiagnostic struct {
	Title    string `json:"title"`
	RemoteID string `json:"remoteId"`
	ServerID string `json:"serverId"`
	Reason   string `json:"reason"`
}

func provisionalRepairIdentity(id, stored string) bool {
	stored = strings.TrimSpace(stored)
	return stored == "" || jellyfin.IsLegacyServerAlias(stored) || repairRemoteID(stored) == repairRemoteID(id) || importedRepairIdentity.MatchString(stored)
}

// Normalize UUID formatting only, preserving arbitrary case-sensitive remote IDs.
func repairRemoteID(id string) string {
	id = strings.TrimSpace(id)
	compact := strings.ReplaceAll(id, "-", "")
	if len(compact) == 32 {
		if _, err := hex.DecodeString(compact); err == nil {
			return strings.ToLower(compact)
		}
	}
	return id
}

func checkRepairIntegrity(ctx context.Context, db *sql.DB) error {
	var check string
	if err := db.QueryRowContext(ctx, `PRAGMA quick_check`).Scan(&check); err != nil {
		return err
	}
	if check != "ok" {
		return fmt.Errorf("intégrité SQLite invalide")
	}
	rows, err := db.QueryContext(ctx, `PRAGMA foreign_key_check`)
	if err != nil {
		return err
	}
	defer rows.Close()
	if rows.Next() {
		return fmt.Errorf("relations invalides après import ; réparation des noms interrompue")
	}
	return rows.Err()
}

func (h *Handler) repairLibraryNames(w http.ResponseWriter, r *http.Request) {
	fail := func(status int, message string) {
		slog.Warn("library repair failed", "status", status, "error", message)
		jsonError(w, status, message)
	}
	if !sameOrigin(r) {
		fail(403, "Origine refusée.")
		return
	}
	if h.driver != "sqlite" {
		fail(400, "Cette réparation temporaire concerne les bases SQLite importées.")
		return
	}
	if !h.libraryRepairMu.TryLock() {
		fail(409, "Une réparation est déjà en cours.")
		return
	}
	defer h.libraryRepairMu.Unlock()
	// The global server deadline is 30s; this manually launched operation is
	// bounded separately and may need to enumerate large remote libraries.
	_ = http.NewResponseController(w).SetWriteDeadline(time.Now().Add(30 * time.Minute))
	started := time.Now()
	slog.Info("library repair started")
	defer func() { slog.Info("library repair request finished", "elapsed", time.Since(started).String()) }()
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Minute)
	defer cancel()
	if err := checkRepairIntegrity(ctx, h.db); err != nil {
		fail(409, "Réparation interrompue : "+err.Error())
		return
	}
	changes, identities, unresolved, diagnostics, err := h.planLibraryRepair(ctx)
	if err != nil {
		fail(502, err.Error())
		return
	}
	if len(changes) == 0 && len(identities) == 0 {
		jsonResponse(w, 200, map[string]any{"success": true, "repaired": 0, "unresolved": unresolved, "unresolvedSamples": diagnostics, "message": fmt.Sprintf("Aucun nom à corriger. %d média(s) sans correspondance certaine, conservé(s).", unresolved)})
		return
	}
	directory, err := backup.GetBackupDirectory()
	if err != nil {
		fail(500, "Impossible de créer la sauvegarde ; aucune réparation effectuée.")
		return
	}
	stamp := time.Now().UTC()
	name := fmt.Sprintf("JellyTrack-library-repair-%s%09dZ.sqlite", stamp.Format("20060102T150405"), stamp.Nanosecond())
	path := filepath.Join(directory, name)
	reserved, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		fail(500, "Création de sauvegarde impossible ; aucune réparation effectuée.")
		return
	}
	if err = reserved.Close(); err != nil {
		fail(500, "Création de sauvegarde impossible ; aucune réparation effectuée.")
		return
	}
	// VACUUM INTO copies the entire SQLite database, including committed WAL data.
	if _, err = h.db.ExecContext(ctx, `VACUUM INTO ?`, path); err != nil {
		fail(500, "Sauvegarde SQLite impossible ; aucune réparation effectuée.")
		return
	}
	if err = os.Chmod(path, 0600); err != nil {
		fail(500, "Protection de la sauvegarde impossible ; aucune réparation effectuée.")
		return
	}
	snapshot, err := sql.Open("sqlite", "file:"+filepath.ToSlash(path)+"?mode=ro")
	if err == nil {
		err = checkRepairIntegrity(ctx, snapshot)
		snapshot.Close()
	}
	if err != nil {
		fail(500, "Vérification de sauvegarde échouée ; aucune réparation effectuée.")
		return
	}
	file, err := os.Open(path)
	if err != nil {
		fail(500, "Lecture de sauvegarde impossible ; aucune réparation effectuée.")
		return
	}
	hash := sha256.New()
	_, err = io.Copy(hash, file)
	file.Close()
	if err != nil {
		fail(500, "Vérification de sauvegarde impossible ; aucune réparation effectuée.")
		return
	}
	repaired, err := h.applyLibraryRepair(ctx, changes, identities...)
	if err != nil {
		fail(409, "Réparation annulée ; sauvegarde conservée : "+name+". "+err.Error())
		return
	}
	resolutionsRepaired := 0
	for _, change := range changes {
		if change.afterResolution != "" {
			resolutionsRepaired++
		}
	}
	slog.Info("library repair completed", "media_repaired", repaired, "resolutions_repaired", resolutionsRepaired, "unresolved_media", unresolved)
	_ = security.LogAudit(ctx, h.db, h.driver, "library_names.repair", nil, nil, nil, nil, map[string]any{"repaired": repaired, "serverIdentitiesRepaired": len(identities), "unresolved": unresolved, "backup": name})
	jsonResponse(w, 200, map[string]any{"success": true, "repaired": repaired, "resolutionsRepaired": resolutionsRepaired, "serverIdentitiesRepaired": len(identities), "unresolved": unresolved, "unresolvedSamples": diagnostics, "backup": name, "backupSHA256": hex.EncodeToString(hash.Sum(nil)), "backupURL": "/api/admin/library-repair-backup/" + name, "message": fmt.Sprintf("Réparation terminée : %d média(s) remis à jour, %d résolution(s) complétée(s), %d identifiant(s) de serveur importé corrigé(s), %d média(s) sans correspondance certaine conservé(s). Historique conservé. Sauvegarde : %s", repaired, resolutionsRepaired, len(identities), unresolved, name)})
}

func (h *Handler) planLibraryRepair(ctx context.Context) ([]libraryRepairChange, []libraryRepairServerChange, int, []libraryRepairDiagnostic, error) {
	type server struct{ id, jid, url, key string }
	rows, err := h.db.QueryContext(ctx, `SELECT "id","jellyfinServerId","url",COALESCE("jellyfinApiKey",'') FROM "Server" WHERE EXISTS(SELECT 1 FROM "Media" WHERE "serverId"="Server"."id")`)
	if err != nil {
		return nil, nil, 0, nil, err
	}
	var servers []server
	for rows.Next() {
		var s server
		if err = rows.Scan(&s.id, &s.jid, &s.url, &s.key); err != nil {
			rows.Close()
			return nil, nil, 0, nil, err
		}
		servers = append(servers, s)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, nil, 0, nil, err
	}
	var changes []libraryRepairChange
	var identities []libraryRepairServerChange
	unresolved := 0
	diagnostics := []libraryRepairDiagnostic{}
	for _, s := range servers {
		if _, err = security.ValidateSafeServerURL(s.url); err != nil {
			return nil, nil, 0, nil, fmt.Errorf("URL Jellyfin invalide pour le serveur %s ; aucune réparation effectuée", s.id)
		}
		client, e := jellyfin.New(s.url, s.key)
		if e != nil {
			return nil, nil, 0, nil, fmt.Errorf("Configurer la clé API Jellyfin du serveur %s avant la réparation", s.id)
		}
		info, e := client.SystemInfo(ctx)
		if e != nil {
			return nil, nil, 0, nil, fmt.Errorf("Jellyfin inaccessible pour le serveur %s ; aucune réparation effectuée", s.id)
		}
		identityMismatch := repairRemoteID(info.ID) != repairRemoteID(s.jid)
		provisional := provisionalRepairIdentity(s.id, s.jid)
		if strings.TrimSpace(info.ID) == "" || (identityMismatch && !provisional) {
			if strings.TrimSpace(info.ID) == "" {
				return nil, nil, 0, nil, fmt.Errorf("Jellyfin ne renvoie aucun identifiant pour le serveur %s ; aucune réparation effectuée", s.id)
			}
			hint := "Vérifier l'identifiant importé et le serveur configuré."
			return nil, nil, 0, nil, fmt.Errorf("Identité Jellyfin différente pour le serveur %s : enregistré dans la base = %q ; renvoyé par Jellyfin = %q. %s Aucune réparation effectuée.", s.id, s.jid, info.ID, hint)
		}
		if identityMismatch {
			others, e := h.db.QueryContext(ctx, `SELECT "jellyfinServerId" FROM "Server" WHERE "id"<>?`, s.id)
			if e != nil {
				return nil, nil, 0, nil, e
			}
			conflict := false
			for others.Next() {
				var jid string
				if e = others.Scan(&jid); e != nil {
					others.Close()
					return nil, nil, 0, nil, e
				}
				if repairRemoteID(jid) == repairRemoteID(info.ID) {
					conflict = true
				}
			}
			e = others.Err()
			others.Close()
			if e != nil {
				return nil, nil, 0, nil, e
			}
			if conflict {
				return nil, nil, 0, nil, fmt.Errorf("Cet identifiant Jellyfin est déjà lié à un autre serveur ; aucune fusion automatique.")
			}
		}
		libs, e := client.Libraries(ctx)
		if e != nil || len(libs) == 0 {
			return nil, nil, 0, nil, fmt.Errorf("Bibliothèques Jellyfin indisponibles pour le serveur %s ; aucune réparation effectuée", s.id)
		}
		membership := map[string]string{}
		resolutions := map[string]string{}
		ambiguous := map[string]bool{}
		for _, lib := range libs {
			if lib.ID == "" || strings.TrimSpace(lib.Name) == "" {
				return nil, nil, 0, nil, fmt.Errorf("Bibliothèque Jellyfin incomplète pour le serveur %s", s.id)
			}
			e = client.LibraryItems(ctx, lib.ID, func(item jellyfin.Item) error {
				key := repairRemoteID(item.ID)
				if resolution := jellyfin.ItemResolution(item); resolution != "" {
					resolutions[key] = resolution
				}
				if old, ok := membership[key]; ok && old != lib.Name {
					ambiguous[key] = true
				}
				membership[key] = lib.Name
				return nil
			})
			if e != nil {
				return nil, nil, 0, nil, fmt.Errorf("Lecture des bibliothèques Jellyfin échouée pour le serveur %s ; aucune réparation effectuée", s.id)
			}
		}
		mediaRows, e := h.db.QueryContext(ctx, `SELECT "id","jellyfinMediaId","libraryName","resolution","title" FROM "Media" WHERE "serverId"=?`, s.id)
		if e != nil {
			return nil, nil, 0, nil, e
		}
		matched := 0
		for mediaRows.Next() {
			var c libraryRepairChange
			var title string
			c.server = s.id
			if e = mediaRows.Scan(&c.id, &c.remote, &c.before, &c.beforeResolution, &title); e != nil {
				mediaRows.Close()
				return nil, nil, 0, nil, e
			}
			key := repairRemoteID(c.remote)
			name, ok := membership[key]
			if !ok || ambiguous[key] {
				unresolved++
				reason := "Identifiant absent du catalogue Jellyfin accessible"
				if ambiguous[key] {
					reason = "Présence dans plusieurs bibliothèques de noms différents"
				} else if strings.HasPrefix(key, "imported-media-") || key == "" {
					reason = "Identifiant Jellyfin manquant dans l’ancien import"
				}
				if len(diagnostics) < 20 {
					diagnostics = append(diagnostics, libraryRepairDiagnostic{title, c.remote, s.id, reason})
				}
				continue
			}
			matched++
			c.after = name
			if stats.NormalizeResolution(c.beforeResolution.String) == "Unknown" {
				c.afterResolution = resolutions[key]
			}
			if !c.before.Valid || c.before.String != name || c.afterResolution != "" {
				changes = append(changes, c)
			}
		}
		e = mediaRows.Err()
		mediaRows.Close()
		if e != nil {
			return nil, nil, 0, nil, e
		}
		if identityMismatch {
			if matched == 0 {
				return nil, nil, 0, nil, fmt.Errorf("Identifiant importé provisoire pour le serveur %s, mais aucun média existant confirmé par Jellyfin ; aucune réparation effectuée", s.id)
			}
			// Historical aliases are still used by scoped plugin keys. Recognize
			// them for this task without rewriting the key's configured scope.
			if !jellyfin.IsLegacyServerAlias(s.jid) {
				identities = append(identities, libraryRepairServerChange{s.id, s.jid, info.ID})
			}
		}
	}
	return changes, identities, unresolved, diagnostics, nil
}

func (h *Handler) applyLibraryRepair(ctx context.Context, changes []libraryRepairChange, identities ...libraryRepairServerChange) (int, error) {
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	// Reconcile only imported placeholders. Internal IDs and all child links stay intact.
	for _, identity := range identities {
		rows, e := tx.QueryContext(ctx, `SELECT "id","jellyfinServerId" FROM "Server"`)
		if e != nil {
			return 0, e
		}
		conflict := false
		for rows.Next() {
			var id, jid string
			if e = rows.Scan(&id, &jid); e != nil {
				rows.Close()
				return 0, e
			}
			if id != identity.id && repairRemoteID(jid) == repairRemoteID(identity.after) {
				conflict = true
			}
		}
		e = rows.Err()
		rows.Close()
		if e != nil {
			return 0, e
		}
		if conflict {
			return 0, fmt.Errorf("Cet identifiant Jellyfin est déjà lié à un autre serveur ; aucune fusion automatique.")
		}
		result, e := tx.ExecContext(ctx, `UPDATE "Server" SET "jellyfinServerId"=?,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=? AND "jellyfinServerId"=?`, identity.after, identity.id, identity.before)
		if e != nil {
			return 0, e
		}
		n, e := result.RowsAffected()
		if e != nil {
			return 0, e
		}
		if n != 1 {
			return 0, fmt.Errorf("Configuration du serveur modifiée pendant la préparation. Relancer la tâche.")
		}
		var actual string
		if e = tx.QueryRowContext(ctx, `SELECT "jellyfinServerId" FROM "Server" WHERE "id"=?`, identity.id).Scan(&actual); e != nil {
			return 0, e
		}
		if actual != identity.after {
			return 0, fmt.Errorf("Vérification de l'identifiant du serveur échouée")
		}
	}
	for _, c := range changes {
		var before any
		if c.before.Valid {
			before = c.before.String
		}
		var beforeResolution any
		if c.beforeResolution.Valid {
			beforeResolution = c.beforeResolution.String
		}
		result, e := tx.ExecContext(ctx, `UPDATE "Media" SET "libraryName"=?,"resolution"=CASE WHEN ?<>'' THEN ? ELSE "resolution" END,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=? AND "serverId"=? AND "jellyfinMediaId"=? AND "libraryName" IS ? AND (?='' OR "resolution" IS ?)`, c.after, c.afterResolution, c.afterResolution, c.id, c.server, c.remote, before, c.afterResolution, beforeResolution)
		if e != nil {
			return 0, e
		}
		n, e := result.RowsAffected()
		if e != nil {
			return 0, e
		}
		if n != 1 {
			return 0, fmt.Errorf("Les données ont changé pendant la préparation. Relancer la tâche.")
		}
		var actual string
		if e = tx.QueryRowContext(ctx, `SELECT "libraryName" FROM "Media" WHERE "id"=? AND "serverId"=?`, c.id, c.server).Scan(&actual); e != nil {
			return 0, e
		}
		if actual != c.after {
			return 0, fmt.Errorf("Vérification de la réparation échouée")
		}
		if c.afterResolution != "" {
			if e = tx.QueryRowContext(ctx, `SELECT "resolution" FROM "Media" WHERE "id"=?`, c.id).Scan(&actual); e != nil {
				return 0, e
			}
			if actual != c.afterResolution {
				return 0, fmt.Errorf("Vérification de résolution échouée")
			}
		}
	}
	if err = tx.Commit(); err != nil {
		return 0, err
	}
	return len(changes), nil
}

func (h *Handler) downloadLibraryRepairBackup(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !repairBackupName.MatchString(name) {
		jsonError(w, 404, "Sauvegarde introuvable.")
		return
	}
	directory, err := backup.GetBackupDirectory()
	if err != nil {
		jsonError(w, 404, "Sauvegarde introuvable.")
		return
	}
	path := filepath.Join(directory, name)
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() {
		jsonError(w, 404, "Sauvegarde introuvable.")
		return
	}
	w.Header().Set("Content-Disposition", `attachment; filename="`+name+`"`)
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/octet-stream")
	http.ServeFile(w, r, path)
}
