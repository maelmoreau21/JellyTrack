package api

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"github.com/maelmoreau21/jellytrack/internal/jellyfin"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/media"
	"github.com/maelmoreau21/jellytrack/internal/security"
)

type unassignedCleanupPlan struct {
	Media     int                       `json:"media"`
	History   int                       `json:"history"`
	Telemetry int                       `json:"telemetry"`
	Token     string                    `json:"token"`
	Samples   []libraryRepairDiagnostic `json:"samples"`
	ids       []string
}
type cleanupQueryer interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

func cleanupEligibleSQL() string {
	return `SELECT m."id" FROM "Media" m WHERE m."id"=? AND (` + media.LibraryNameSQL("m") + `='Unknown'
 OR (LOWER(m."type") IN ('movie','episode','video','musicvideo','trailer') AND LOWER(TRIM(COALESCE(m."resolution",''))) IN ('','unknown','undefined','null','n/a','na','-','?','directplay','transcode','remux')))
 AND NOT EXISTS(SELECT 1 FROM "ActiveStream" a WHERE a."mediaId"=m."id")
 AND NOT EXISTS(SELECT 1 FROM "PlaybackHistory" p WHERE p."mediaId"=m."id" AND p."serverId"<>m."serverId")`
}

// Remove descendants before their parents. Keep parents that still have a
// retained child, and malformed cycles, rather than breaking their links.
func cleanupDeletionOrder(ctx context.Context, q cleanupQueryer, ids []string) ([]string, error) {
	candidates := map[string]bool{}
	for _, id := range ids {
		candidates[id] = true
	}
	children := map[string][]string{}
	// Restrict the join to the reviewed candidates; avoid a catalogue-wide
	// parent lookup for every cleanup, and stay below SQLite parameter limits.
	for start := 0; start < len(ids); start += 400 {
		end := start + 400
		if end > len(ids) {
			end = len(ids)
		}
		args := make([]any, 0, end-start)
		for _, id := range ids[start:end] {
			args = append(args, id)
		}
		marks := strings.TrimSuffix(strings.Repeat("?,", len(args)), ",")
		rows, err := q.QueryContext(ctx, `SELECT parent."id",child."id" FROM "Media" parent JOIN "Media" child ON parent."serverId"=child."serverId" AND `+media.ParentMatchSQL("parent", "child")+` WHERE parent."id" IN (`+marks+`)`, args...)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var parent, child string
			if err = rows.Scan(&parent, &child); err != nil {
				rows.Close()
				return nil, err
			}
			if candidates[parent] {
				children[parent] = append(children[parent], child)
			}
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return nil, err
		}
	}
	var order []string
	removed := map[string]bool{}
	sorted := append([]string{}, ids...)
	sort.Strings(sorted)
	for {
		progress := false
		for _, id := range sorted {
			if removed[id] {
				continue
			}
			ready := true
			for _, child := range children[id] {
				if !removed[child] {
					ready = false
					break
				}
			}
			if ready {
				order = append(order, id)
				removed[id] = true
				progress = true
			}
		}
		if !progress {
			break
		}
	}
	return order, nil
}

func cleanupFingerprint(ctx context.Context, q cleanupQueryer, ids []string) (string, int, int, error) {
	hash := sha256.New()
	history, telemetry := 0, 0
	for _, id := range ids {
		rows, err := q.QueryContext(ctx, `SELECT "id","serverId","jellyfinMediaId",COALESCE("libraryName",''),COALESCE("parentId",''),"title",COALESCE("resolution",''),"type" FROM "Media" WHERE "id"=?`, id)
		if err != nil {
			return "", 0, 0, err
		}
		for rows.Next() {
			var a, b, c, d, e, f, resolution, kind string
			if err = rows.Scan(&a, &b, &c, &d, &e, &f, &resolution, &kind); err != nil {
				rows.Close()
				return "", 0, 0, err
			}
			data, _ := json.Marshal([]string{a, b, c, d, e, f, resolution, kind})
			hash.Write(data)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return "", 0, 0, err
		}
		rows, err = q.QueryContext(ctx, `SELECT "id","serverId",CAST("startedAt" AS TEXT),COALESCE(CAST("endedAt" AS TEXT),''),"durationWatched" FROM "PlaybackHistory" WHERE "mediaId"=? ORDER BY "id"`, id)
		if err != nil {
			return "", 0, 0, err
		}
		for rows.Next() {
			var a, b, c, d string
			var watched int64
			if err = rows.Scan(&a, &b, &c, &d, &watched); err != nil {
				rows.Close()
				return "", 0, 0, err
			}
			data, _ := json.Marshal([]any{a, b, c, d, watched})
			hash.Write(data)
			history++
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return "", 0, 0, err
		}
		rows, err = q.QueryContext(ctx, `SELECT t."id",t."serverId",p."serverId" FROM "TelemetryEvent" t JOIN "PlaybackHistory" p ON p."id"=t."playbackId" WHERE p."mediaId"=? ORDER BY t."id"`, id)
		if err != nil {
			return "", 0, 0, err
		}
		for rows.Next() {
			var a, b, c string
			if err = rows.Scan(&a, &b, &c); err != nil {
				rows.Close()
				return "", 0, 0, err
			}
			if b != c {
				rows.Close()
				return "", 0, 0, fmt.Errorf("Événement associé à un autre serveur ; nettoyage interrompu")
			}
			data, _ := json.Marshal([]string{a, b, c})
			hash.Write(data)
			telemetry++
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return "", 0, 0, err
		}
	}
	return hex.EncodeToString(hash.Sum(nil)), history, telemetry, nil
}

func (h *Handler) planUnassignedCleanup(ctx context.Context) (unassignedCleanupPlan, error) {
	_, _, _, unresolved, err := h.planLibraryRepair(ctx)
	if err != nil {
		return unassignedCleanupPlan{}, err
	}
	plan := unassignedCleanupPlan{Samples: []libraryRepairDiagnostic{}}
	for _, item := range unresolved {
		if !item.purgeEligible {
			continue
		}
		var id string
		err = h.db.QueryRowContext(ctx, cleanupEligibleSQL(), item.mediaID).Scan(&id)
		if err == sql.ErrNoRows {
			continue
		}
		if err != nil {
			return plan, err
		}
		plan.ids = append(plan.ids, id)
		plan.Samples = append(plan.Samples, item)
	}
	plan.ids, err = cleanupDeletionOrder(ctx, h.db, plan.ids)
	if err != nil {
		return plan, err
	}
	kept := map[string]bool{}
	for _, id := range plan.ids {
		kept[id] = true
	}
	samples := plan.Samples[:0]
	for _, item := range plan.Samples {
		if kept[item.mediaID] {
			samples = append(samples, item)
		}
	}
	plan.Samples = repairDiagnosticSamples(samples)
	plan.Media = len(plan.ids)
	plan.Token, plan.History, plan.Telemetry, err = cleanupFingerprint(ctx, h.db, plan.ids)
	return plan, err
}

func (h *Handler) cleanupUnassignedHistory(w http.ResponseWriter, r *http.Request) {
	if !sameOrigin(r) {
		jsonError(w, 403, "Origine refusée.")
		return
	}
	if h.driver != "sqlite" {
		jsonError(w, 400, "Ce nettoyage temporaire concerne SQLite.")
		return
	}
	if !h.libraryRepairMu.TryLock() {
		jsonError(w, 409, "Une réparation ou un nettoyage est déjà en cours.")
		return
	}
	defer h.libraryRepairMu.Unlock()
	_ = http.NewResponseController(w).SetWriteDeadline(time.Now().Add(30 * time.Minute))
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	var input struct {
		Apply bool   `json:"apply"`
		Token string `json:"token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		jsonError(w, 400, "Demande invalide.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Minute)
	defer cancel()
	if err := checkRepairIntegrity(ctx, h.db); err != nil {
		jsonError(w, 409, err.Error())
		return
	}
	plan, err := h.planUnassignedCleanup(ctx)
	if err != nil {
		jsonError(w, 502, err.Error())
		return
	}
	if !input.Apply {
		jsonResponse(w, 200, map[string]any{"success": true, "preview": plan, "message": fmt.Sprintf("Nettoyage proposé : %d médias, %d lectures et %d événements associés. Les médias identifiables, les parents et les lectures actives sont conservés.", plan.Media, plan.History, plan.Telemetry)})
		return
	}
	if input.Token == "" || input.Token != plan.Token {
		jsonError(w, 409, "Les données ont changé. Relancer l'aperçu avant suppression.")
		return
	}
	if plan.Media == 0 {
		jsonResponse(w, 200, map[string]any{"success": true, "message": "Aucun enregistrement à supprimer."})
		return
	}
	backupName, checksum, err := h.createLibraryRepairBackup(ctx)
	if err != nil {
		jsonError(w, 500, "Sauvegarde impossible ; aucune suppression effectuée. "+err.Error())
		return
	}
	deleted, err := h.applyUnassignedCleanup(ctx, plan)
	if err != nil {
		jsonError(w, 409, "Nettoyage annulé ; sauvegarde conservée : "+backupName+". "+err.Error())
		return
	}
	_ = security.LogAudit(ctx, h.db, h.driver, "history.unassigned_cleanup", nil, nil, nil, nil, map[string]any{"media": deleted.Media, "history": deleted.History, "telemetry": deleted.Telemetry, "backup": backupName})
	jsonResponse(w, 200, map[string]any{"success": true, "deleted": deleted, "backup": backupName, "backupSHA256": checksum, "backupURL": "/api/admin/library-repair-backup/" + backupName, "message": fmt.Sprintf("Nettoyage terminé : %d médias, %d lectures et %d événements associés supprimés. Sauvegarde : %s", deleted.Media, deleted.History, deleted.Telemetry, backupName)})
}

func (h *Handler) applyUnassignedCleanup(ctx context.Context, plan unassignedCleanupPlan) (unassignedCleanupPlan, error) {
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return unassignedCleanupPlan{}, err
	}
	defer tx.Rollback()
	for _, id := range plan.ids {
		var found string
		if err = tx.QueryRowContext(ctx, cleanupEligibleSQL(), id).Scan(&found); err != nil {
			return unassignedCleanupPlan{}, fmt.Errorf("Un média a changé ou est utilisé. Relancer l'aperçu.")
		}
	}
	token, history, telemetry, err := cleanupFingerprint(ctx, tx, plan.ids)
	if err != nil {
		return unassignedCleanupPlan{}, err
	}
	if token != plan.Token || history != plan.History || telemetry != plan.Telemetry {
		return unassignedCleanupPlan{}, fmt.Errorf("Les historiques ont changé. Relancer l'aperçu.")
	}
	order, err := cleanupDeletionOrder(ctx, tx, plan.ids)
	if err != nil {
		return unassignedCleanupPlan{}, err
	}
	if len(order) != len(plan.ids) {
		return unassignedCleanupPlan{}, fmt.Errorf("Les liens des médias ont changé. Relancer l'aperçu.")
	}
	for _, id := range order {
		if _, err = tx.ExecContext(ctx, `DELETE FROM "TelemetryEvent" WHERE "playbackId" IN(SELECT "id" FROM "PlaybackHistory" WHERE "mediaId"=?)`, id); err != nil {
			return unassignedCleanupPlan{}, err
		}
		if _, err = tx.ExecContext(ctx, `DELETE FROM "PlaybackHistory" WHERE "mediaId"=?`, id); err != nil {
			return unassignedCleanupPlan{}, err
		}
		result, err := tx.ExecContext(ctx, `DELETE FROM "Media" WHERE "id"=?`, id)
		if err != nil {
			return unassignedCleanupPlan{}, err
		}
		count, err := result.RowsAffected()
		if err != nil || count != 1 {
			return unassignedCleanupPlan{}, fmt.Errorf("Suppression non confirmée")
		}
		var countRemaining int
		if err = tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM "PlaybackHistory" WHERE "mediaId"=?`, id).Scan(&countRemaining); err != nil || countRemaining != 0 {
			return unassignedCleanupPlan{}, fmt.Errorf("Vérification de suppression échouée")
		}
	}
	if err = tx.Commit(); err != nil {
		return unassignedCleanupPlan{}, err
	}
	return plan, nil
}

func syncResultMessage(result jellyfin.SyncResult) string {
	message := fmt.Sprintf("Synchronisation terminée (%d utilisateurs, %d médias)", result.Users, result.Media)
	if len(result.Warnings) > 0 {
		message += ". " + strings.Join(result.Warnings, " ")
	}
	return message
}
