package api

import (
	"github.com/maelmoreau21/jellytrack/internal/backup"
	"net/http"
)

func (h *Handler) backupExportFull(w http.ResponseWriter, r *http.Request) {
	data, err := backup.CreateEncryptedBackup(r.Context(), h.db, h.driver)
	if err != nil {
		jsonError(w, 503, "Configurez BACKUP_ENCRYPTION_KEY (32 octets aléatoires encodés en base64) avant l’export complet.")
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", `attachment; filename="JellyTrack-complete.jtb"`)
	_, _ = w.Write(data)
}
