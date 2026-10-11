package plugin

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/security"
)

func newNotificationClient() *http.Client {
	return &http.Client{Timeout: 10 * time.Second, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 || !security.IsValidDiscordWebhook(req.URL.String()) {
			return fmt.Errorf("invalid Discord webhook redirect")
		}
		return nil
	}}
}

// Notification failure never fails an already stored playback event. The HTTP
// client is injectable so tests never contact Discord.
func (h *Handler) postNotification(ctx context.Context, webhook string, embed map[string]any) {
	if !security.IsValidDiscordWebhook(webhook) {
		return
	}
	body, err := json.Marshal(map[string]any{"embeds": []map[string]any{embed}})
	if err != nil {
		return
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimSpace(webhook), bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	client := h.notificationClient
	if client == nil {
		client = newNotificationClient()
	}
	resp, err := client.Do(req)
	if err != nil {
		h.logger.Warn("Discord playback notification failed")
		return
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
	if resp.StatusCode >= 400 {
		h.logger.Warn("Discord playback notification rejected", "status", resp.StatusCode)
	}
}

func notificationField(name, value string) map[string]any {
	if value == "" {
		value = "Unknown"
	}
	return map[string]any{"name": name, "value": value, "inline": true}
}

func (h *Handler) notifyPlaybackStart(ctx context.Context, serverID, userID, playbackID, mediaKey, title, method, client, device string, ip any) {
	var enabled bool
	var webhook, condition sql.NullString
	var capacity int
	if err := h.queryRow(ctx, `SELECT "discordAlertsEnabled","discordWebhookUrl","discordAlertCondition","maxConcurrentTranscodes" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&enabled, &webhook, &condition, &capacity); err != nil {
		return
	}
	if !enabled || !webhook.Valid || !security.IsValidDiscordWebhook(webhook.String) {
		return
	}
	sendPlayback := true
	switch condition.String {
	case "TRANSCODE_ONLY":
		sendPlayback = method == "Transcode"
	case "NEW_IP_ONLY":
		var count int
		// The current playback was just stored; only prior playbacks count.
		if err := h.queryRow(ctx, `SELECT COUNT(*) FROM "PlaybackHistory" WHERE "serverId"=? AND "userId"=? AND "id"<>? AND COALESCE("ipAddress",'')=COALESCE(CAST(? AS TEXT),'')`, serverID, userID, playbackID, ip).Scan(&count); err != nil {
			return
		}
		sendPlayback = count == 0
	}
	if sendPlayback {
		var username string
		var country, city sql.NullString
		_ = h.queryRow(ctx, `SELECT "username" FROM "User" WHERE "id"=?`, userID).Scan(&username)
		_ = h.queryRow(ctx, `SELECT "country","city" FROM "ActiveStream" WHERE "serverId"=? AND "playbackId"=? LIMIT 1`, serverID, playbackID).Scan(&country, &city)
		location := "Unknown"
		if country.Valid && country.String != "" && country.String != "Unknown" {
			location = country.String
			if city.Valid && city.String != "" {
				location = city.String + ", " + location
			}
		}
		embed := map[string]any{"title": "🎬 Now Playing: " + title, "color": 10181046, "timestamp": time.Now().UTC().Format(time.RFC3339), "fields": []map[string]any{
			notificationField("👤 User", username), notificationField("📱 Device", client+" ("+device+")"), notificationField("🌍 Location", location),
		}}
		if appURL := firstEnv("NEXTAUTH_URL", "APP_URL"); appURL != "" {
			embed["thumbnail"] = map[string]string{"url": strings.TrimRight(appURL, "/") + "/api/jellyfin/image?itemId=" + url.QueryEscape(mediaKey) + "&type=Primary&serverId=" + url.QueryEscape(serverID)}
		}
		h.postNotification(ctx, webhook.String, embed)
	}
	if capacity > 0 {
		var count int
		if err := h.queryRow(ctx, `SELECT COUNT(*) FROM "ActiveStream" WHERE "playMethod"='Transcode'`).Scan(&count); err == nil && count > capacity {
			h.postNotification(ctx, webhook.String, map[string]any{"title": "⚠️ Capacity Alert: Critical Transcode Usage", "color": 16711680,
				"description": "The number of simultaneous transcodes has reached a critical level.", "timestamp": time.Now().UTC().Format(time.RFC3339),
				"fields": []map[string]any{notificationField("Current Transcodes", strconv.Itoa(count)), notificationField("Configured Threshold", strconv.Itoa(capacity))}})
		}
	}
}

func transcodeRate(session map[string]any) any {
	for _, key := range []string{"transcodeFps", "TranscodeFps"} {
		if raw, ok := session[key]; ok && raw != nil {
			var value float64
			var err error
			switch number := raw.(type) {
			case json.Number:
				value, err = number.Float64()
			case float64:
				value = number
			case string:
				value, err = strconv.ParseFloat(number, 64)
			default:
				return nil
			}
			if err == nil && !math.IsNaN(value) && !math.IsInf(value, 0) && value >= 0 {
				return value
			}
		}
	}
	return nil
}
