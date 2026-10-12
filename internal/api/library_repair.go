package api

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/backup"
	"github.com/maelmoreau21/jellytrack/internal/jellyfin"
	"github.com/maelmoreau21/jellytrack/internal/security"
)

var repairBackupName = regexp.MustCompile(`^JellyTrack-library-repair-[0-9]{8}T[0-9]{15}Z\.sqlite$`)

type libraryRepairChange struct {
	id, server, remote string
	before             sql.NullString
	after              string
}

// Normalize UUID formatting only, preserving arbitrary case-sensitive remote IDs.
func repairRemoteID(id string) string {
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
	if !sameOrigin(r) {
		jsonError(w, 403, "Origine refusée.")
		return
	}
	if h.driver != "sqlite" {
		jsonError(w, 400, "Cette réparation temporaire concerne les bases SQLite importées.")
		return
	}
	if !h.libraryRepairMu.TryLock() {
		jsonError(w, 409, "Une réparation est déjà en cours.")
		return
	}
	defer h.libraryRepairMu.Unlock()
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Minute)
	defer cancel()
	if err := checkRepairIntegrity(ctx, h.db); err != nil {
		jsonError(w, 409, "Réparation interrompue : "+err.Error())
		return
	}
	changes, unresolved, err := h.planLibraryRepair(ctx)
	if err != nil {
		jsonError(w, 502, err.Error())
		return
	}
	if len(changes) == 0 {
		jsonResponse(w, 200, map[string]any{"success": true, "repaired": 0, "unresolved": unresolved, "message": fmt.Sprintf("Aucun nom à corriger. %d média(s) sans correspondance certaine, conservé(s).", unresolved)})
		return
	}
	directory, err := backup.GetBackupDirectory()
	if err != nil {
		jsonError(w, 500, "Impossible de créer la sauvegarde ; aucune réparation effectuée.")
		return
	}
	stamp := time.Now().UTC()
	name := fmt.Sprintf("JellyTrack-library-repair-%s%09dZ.sqlite", stamp.Format("20060102T150405"), stamp.Nanosecond())
	path := filepath.Join(directory, name)
	reserved, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		jsonError(w, 500, "Création de sauvegarde impossible ; aucune réparation effectuée.")
		return
	}
	if err = reserved.Close(); err != nil {
		jsonError(w, 500, "Création de sauvegarde impossible ; aucune réparation effectuée.")
		return
	}
	// VACUUM INTO copies the entire SQLite database, including committed WAL data.
	if _, err = h.db.ExecContext(ctx, `VACUUM INTO ?`, path); err != nil {
		jsonError(w, 500, "Sauvegarde SQLite impossible ; aucune réparation effectuée.")
		return
	}
	if err = os.Chmod(path, 0600); err != nil {
		jsonError(w, 500, "Protection de la sauvegarde impossible ; aucune réparation effectuée.")
		return
	}
	snapshot, err := sql.Open("sqlite", "file:"+filepath.ToSlash(path)+"?mode=ro")
	if err == nil {
		err = checkRepairIntegrity(ctx, snapshot)
		snapshot.Close()
	}
	if err != nil {
		jsonError(w, 500, "Vérification de sauvegarde échouée ; aucune réparation effectuée.")
		return
	}
	file, err := os.Open(path)
	if err != nil {
		jsonError(w, 500, "Lecture de sauvegarde impossible ; aucune réparation effectuée.")
		return
	}
	hash := sha256.New()
	_, err = io.Copy(hash, file)
	file.Close()
	if err != nil {
		jsonError(w, 500, "Vérification de sauvegarde impossible ; aucune réparation effectuée.")
		return
	}
	repaired, err := h.applyLibraryRepair(ctx, changes)
	if err != nil {
		jsonError(w, 409, "Réparation annulée ; sauvegarde conservée : "+name+". "+err.Error())
		return
	}
	_ = security.LogAudit(ctx, h.db, h.driver, "library_names.repair", nil, nil, nil, nil, map[string]any{"repaired": repaired, "unresolved": unresolved, "backup": name})
	jsonResponse(w, 200, map[string]any{"success": true, "repaired": repaired, "unresolved": unresolved, "backup": name, "backupSHA256": hex.EncodeToString(hash.Sum(nil)), "backupURL": "/api/admin/library-repair-backup/" + name, "message": fmt.Sprintf("Réparation terminée : %d nom(s) corrigé(s), %d média(s) sans correspondance certaine conservé(s). Historique conservé. Sauvegarde : %s", repaired, unresolved, name)})
}

func (h *Handler) planLibraryRepair(ctx context.Context) ([]libraryRepairChange, int, error) {
	type server struct{ id, jid, url, key string }
	rows, err := h.db.QueryContext(ctx, `SELECT "id","jellyfinServerId","url",COALESCE("jellyfinApiKey",'') FROM "Server" WHERE EXISTS(SELECT 1 FROM "Media" WHERE "serverId"="Server"."id")`)
	if err != nil {
		return nil, 0, err
	}
	var servers []server
	for rows.Next() {
		var s server
		if err = rows.Scan(&s.id, &s.jid, &s.url, &s.key); err != nil {
			rows.Close()
			return nil, 0, err
		}
		servers = append(servers, s)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, 0, err
	}
	var changes []libraryRepairChange
	unresolved := 0
	for _, s := range servers {
		if _, err = security.ValidateSafeServerURL(s.url); err != nil {
			return nil, 0, fmt.Errorf("URL Jellyfin invalide pour le serveur %s ; aucune réparation effectuée", s.id)
		}
		client, e := jellyfin.New(s.url, s.key)
		if e != nil {
			return nil, 0, fmt.Errorf("Configurer la clé API Jellyfin du serveur %s avant la réparation", s.id)
		}
		info, e := client.SystemInfo(ctx)
		if e != nil {
			return nil, 0, fmt.Errorf("Jellyfin inaccessible pour le serveur %s ; aucune réparation effectuée", s.id)
		}
		if info.ID == "" || repairRemoteID(info.ID) != repairRemoteID(s.jid) {
			return nil, 0, fmt.Errorf("Identité Jellyfin différente pour le serveur %s ; aucune réparation effectuée", s.id)
		}
		libs, e := client.Libraries(ctx)
		if e != nil || len(libs) == 0 {
			return nil, 0, fmt.Errorf("Bibliothèques Jellyfin indisponibles pour le serveur %s ; aucune réparation effectuée", s.id)
		}
		membership := map[string]string{}
		ambiguous := map[string]bool{}
		for _, lib := range libs {
			if lib.ID == "" || strings.TrimSpace(lib.Name) == "" {
				return nil, 0, fmt.Errorf("Bibliothèque Jellyfin incomplète pour le serveur %s", s.id)
			}
			e = client.LibraryItemIDs(ctx, lib.ID, func(id string) error {
				key := repairRemoteID(id)
				if old, ok := membership[key]; ok && old != lib.Name {
					ambiguous[key] = true
				}
				membership[key] = lib.Name
				return nil
			})
			if e != nil {
				return nil, 0, fmt.Errorf("Lecture des bibliothèques Jellyfin échouée pour le serveur %s ; aucune réparation effectuée", s.id)
			}
		}
		mediaRows, e := h.db.QueryContext(ctx, `SELECT "id","jellyfinMediaId","libraryName" FROM "Media" WHERE "serverId"=?`, s.id)
		if e != nil {
			return nil, 0, e
		}
		for mediaRows.Next() {
			var c libraryRepairChange
			c.server = s.id
			if e = mediaRows.Scan(&c.id, &c.remote, &c.before); e != nil {
				mediaRows.Close()
				return nil, 0, e
			}
			key := repairRemoteID(c.remote)
			name, ok := membership[key]
			if !ok || ambiguous[key] {
				unresolved++
				continue
			}
			if !c.before.Valid || c.before.String != name {
				c.after = name
				changes = append(changes, c)
			}
		}
		e = mediaRows.Err()
		mediaRows.Close()
		if e != nil {
			return nil, 0, e
		}
	}
	return changes, unresolved, nil
}

func (h *Handler) applyLibraryRepair(ctx context.Context, changes []libraryRepairChange) (int, error) {
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	for _, c := range changes {
		var before any
		if c.before.Valid {
			before = c.before.String
		}
		result, e := tx.ExecContext(ctx, `UPDATE "Media" SET "libraryName"=?,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=? AND "serverId"=? AND "jellyfinMediaId"=? AND "libraryName" IS ?`, c.after, c.id, c.server, c.remote, before)
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
