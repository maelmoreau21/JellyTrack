package api

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/internal/security"
)

func nullableIntValue(value sql.NullInt64) any {
	if value.Valid {
		return value.Int64
	}
	return nil
}
func nullableFloatValue(value sql.NullFloat64) any {
	if value.Valid {
		return value.Float64
	}
	return nil
}

// A Jellyfin session ID is unique only within its server. Resolve the persisted
// stream before sending a command; never guess a server from the environment.
func (h *Handler) streamCommand(w http.ResponseWriter, r *http.Request, stop bool) {
	var body struct {
		SessionID string `json:"sessionId"`
		ServerID  string `json:"serverId"`
		Text      string `json:"text"`
		Message   string `json:"message"`
		Header    string `json:"header"`
		TimeoutMs int    `json:"timeoutMs"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 8192)
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.SessionID) == "" {
		jsonError(w, 400, "sessionId requis.")
		return
	}
	if body.Text == "" {
		body.Text = body.Message
	}
	if !stop && strings.TrimSpace(body.Text) == "" {
		jsonError(w, 400, "Message requis.")
		return
	}
	if body.TimeoutMs == 0 {
		body.TimeoutMs = 10000
	}
	if body.TimeoutMs < 1000 || body.TimeoutMs > 300000 {
		jsonError(w, 400, "Durée du message invalide.")
		return
	}
	query := `SELECT a."serverId",s."url",s."jellyfinApiKey" FROM "ActiveStream" a JOIN "Server" s ON s."id"=a."serverId" WHERE a."sessionId"=?`
	args := []any{body.SessionID}
	if body.ServerID != "" {
		query += ` AND a."serverId"=?`
		args = append(args, body.ServerID)
	}
	rows, err := h.db.QueryContext(r.Context(), database.Bind(query, h.driver), args...)
	if err != nil {
		jsonError(w, 500, "Impossible de retrouver la session.")
		return
	}
	var serverID, baseURL string
	var apiKey sql.NullString
	count := 0
	for rows.Next() {
		if err = rows.Scan(&serverID, &baseURL, &apiKey); err != nil {
			break
		}
		count++
	}
	if rows.Err() != nil {
		err = rows.Err()
	}
	rows.Close()
	if err != nil {
		jsonError(w, 500, "Session illisible.")
		return
	}
	if count == 0 {
		jsonError(w, 404, "Session introuvable.")
		return
	}
	if count != 1 {
		jsonError(w, 409, "Session ambiguë : précisez le serveur.")
		return
	}
	if !apiKey.Valid || apiKey.String == "" {
		jsonError(w, 503, "Jellyfin non configuré.")
		return
	}
	safeURL, err := security.ValidateSafeServerURL(baseURL)
	if err != nil {
		jsonError(w, 400, "Adresse Jellyfin invalide.")
		return
	}
	path := "/Sessions/" + url.PathEscape(body.SessionID) + "/Message"
	var payload []byte
	if stop {
		path = "/Sessions/" + url.PathEscape(body.SessionID) + "/Playing/Stop"
	} else {
		payload, _ = json.Marshal(map[string]any{"Text": body.Text, "Header": body.Header, "TimeoutMs": body.TimeoutMs})
	}
	request, err := http.NewRequestWithContext(r.Context(), http.MethodPost, strings.TrimRight(safeURL.String(), "/")+path, strings.NewReader(string(payload)))
	if err != nil {
		jsonError(w, 400, "Commande invalide.")
		return
	}
	request.Header.Set("Authorization", fmt.Sprintf(`MediaBrowser Token="%s"`, apiKey.String))
	request.Header.Set("Content-Type", "application/json")
	response, err := (&http.Client{Timeout: 5 * time.Second}).Do(request)
	if err != nil {
		jsonError(w, 502, "Jellyfin n'a pas répondu.")
		return
	}
	response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		jsonError(w, 502, "Jellyfin a refusé la commande.")
		return
	}
	if stop {
		if _, err := h.db.ExecContext(r.Context(), database.Bind(`DELETE FROM "ActiveStream" WHERE "serverId"=? AND "sessionId"=?`, h.driver), serverID, body.SessionID); err != nil {
			jsonError(w, 500, "Lecture arrêtée, mais état local non actualisé.")
			return
		}
	}
	jsonResponse(w, 200, map[string]bool{"ok": true})
}
