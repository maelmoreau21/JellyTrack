package plugin

import (
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

type notificationTransport func(*http.Request) (*http.Response, error)

func (f notificationTransport) RoundTrip(req *http.Request) (*http.Response, error) { return f(req) }

func recordNotifications(t *testing.T, handler *Handler) *[]map[string]any {
	t.Helper()
	embeds := []map[string]any{}
	handler.notificationClient = newNotificationClient()
	handler.notificationClient.Transport = notificationTransport(func(req *http.Request) (*http.Response, error) {
		if req.URL.Hostname() != "discord.com" || req.Method != "POST" || req.Header.Get("Content-Type") != "application/json" {
			t.Fatalf("unexpected webhook request: %s %s", req.Method, req.URL)
		}
		deadline, ok := req.Context().Deadline()
		if !ok || time.Until(deadline) > 10*time.Second {
			t.Fatal("notification request has no bounded deadline")
		}
		var payload struct {
			Embeds []map[string]any `json:"embeds"`
		}
		if err := json.NewDecoder(req.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		embeds = append(embeds, payload.Embeds...)
		return &http.Response{StatusCode: http.StatusNoContent, Body: io.NopCloser(strings.NewReader("")), Header: make(http.Header)}, nil
	})
	return &embeds
}

func configureNotifications(t *testing.T, db *sql.DB, enabled bool, condition string, capacity int, webhook string) {
	t.Helper()
	if _, err := db.Exec(`UPDATE "GlobalSettings" SET "discordAlertsEnabled"=?,"discordWebhookUrl"=?,"discordAlertCondition"=?,"maxConcurrentTranscodes"=? WHERE "id"='global'`, enabled, webhook, condition, capacity); err != nil {
		t.Fatal(err)
	}
}

func mustStart(t *testing.T, h *Handler, payload map[string]any) {
	t.Helper()
	if response := send(t, h, testKey, payload); response.Code != http.StatusOK {
		t.Fatalf("start status=%d body=%s", response.Code, response.Body)
	}
}

func TestPlaybackNotificationsConditionsAndReplay(t *testing.T) {
	for _, tc := range []struct {
		name, condition, method, webhook string
		enabled                          bool
		want                             int
	}{
		{"all", "ALL", "DirectPlay", "https://discord.com/api/webhooks/1/test", true, 1},
		{"transcode", "TRANSCODE_ONLY", "Transcode", "https://discord.com/api/webhooks/1/test", true, 1},
		{"directplay suppressed", "TRANSCODE_ONLY", "DirectPlay", "https://discord.com/api/webhooks/1/test", true, 0},
		{"new ip", "NEW_IP_ONLY", "DirectPlay", "https://discord.com/api/webhooks/1/test", true, 1},
		{"disabled", "ALL", "Transcode", "https://discord.com/api/webhooks/1/test", false, 0},
		{"invalid webhook", "ALL", "Transcode", "http://localhost/api/webhooks/1/test", true, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			db, h := testServer(t)
			embeds := recordNotifications(t, h)
			configureNotifications(t, db, tc.enabled, tc.condition, 0, tc.webhook)
			payload := baseEvent("PlaybackStart")
			payload["session"].(map[string]any)["playMethod"] = tc.method
			payload["session"].(map[string]any)["ipAddress"] = "203.0.113.10"
			mustStart(t, h, payload)
			mustStart(t, h, payload)
			if len(*embeds) != tc.want {
				t.Fatalf("notifications=%d want=%d", len(*embeds), tc.want)
			}
			if tc.want > 0 && (*embeds)[0]["title"] != "🎬 Now Playing: Film test" {
				t.Fatalf("lost historical embed: %+v", *embeds)
			}
			var rows int
			if err := db.QueryRow(`SELECT COUNT(*) FROM "ActiveStream"`).Scan(&rows); err != nil || rows != 1 {
				t.Fatalf("replay changed stream identity: rows=%d err=%v", rows, err)
			}
		})
	}
}

func TestNewIPNotificationsKeepUserAndServerScope(t *testing.T) {
	db, h := testServer(t)
	embeds := recordNotifications(t, h)
	configureNotifications(t, db, true, "NEW_IP_ONLY", 0, "https://discord.com/api/webhooks/1/test")
	payload := baseEvent("PlaybackStart")
	payload["session"].(map[string]any)["ipAddress"] = "203.0.113.10"
	mustStart(t, h, payload)
	if response := send(t, h, testKey, baseEvent("PlaybackStop")); response.Code != 200 {
		t.Fatalf("stop: %s", response.Body)
	}
	payload["session"].(map[string]any)["sessionId"] = "session-second"
	payload["sessionId"] = "session-second"
	mustStart(t, h, payload)
	if len(*embeds) != 1 {
		t.Fatalf("known IP notified again: %d", len(*embeds))
	}
	payload["serverId"] = "jf-other"
	payload["serverUrl"] = "http://jellyfin-other:8096"
	mustStart(t, h, payload)
	if len(*embeds) != 2 {
		t.Fatalf("other server first IP did not notify: %d", len(*embeds))
	}
	payload["user"].(map[string]any)["jellyfinUserId"] = "jf-other-user"
	payload["session"].(map[string]any)["sessionId"] = "session-third"
	payload["sessionId"] = "session-third"
	mustStart(t, h, payload)
	if len(*embeds) != 3 {
		t.Fatalf("other user first IP did not notify: %d", len(*embeds))
	}
}

func TestPlaybackCapacityNotificationIsStrictAndIndependentOfCondition(t *testing.T) {
	db, h := testServer(t)
	embeds := recordNotifications(t, h)
	configureNotifications(t, db, true, "TRANSCODE_ONLY", 1, "https://discord.com/api/webhooks/1/test")
	payload := baseEvent("PlaybackStart")
	payload["session"].(map[string]any)["playMethod"] = "Transcode"
	mustStart(t, h, payload)
	if len(*embeds) != 1 {
		t.Fatalf("capacity fired at exact threshold: %+v", *embeds)
	}
	payload["session"].(map[string]any)["sessionId"] = "session-2"
	payload["sessionId"] = "session-2"
	mustStart(t, h, payload)
	if len(*embeds) != 3 || (*embeds)[2]["title"] != "⚠️ Capacity Alert: Critical Transcode Usage" {
		t.Fatalf("missing capacity after crossing threshold: %+v", *embeds)
	}
	payload["session"].(map[string]any)["sessionId"] = "session-3"
	payload["sessionId"] = "session-3"
	payload["session"].(map[string]any)["playMethod"] = "DirectPlay"
	mustStart(t, h, payload)
	if len(*embeds) != 4 || (*embeds)[3]["title"] != "⚠️ Capacity Alert: Critical Transcode Usage" {
		t.Fatalf("capacity was incorrectly gated by transcode-only playback: %+v", *embeds)
	}
}

func TestNotificationFailureDoesNotUndoPlaybackAndRedirectsAreValidated(t *testing.T) {
	db, h := testServer(t)
	configureNotifications(t, db, true, "ALL", 0, "https://discord.com/api/webhooks/1/test")
	h.notificationClient = newNotificationClient()
	h.notificationClient.Transport = notificationTransport(func(req *http.Request) (*http.Response, error) { return nil, errors.New("offline") })
	mustStart(t, h, baseEvent("PlaybackStart"))
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM "ActiveStream"`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("playback lost after webhook failure: %d %v", count, err)
	}
	req, _ := http.NewRequest(http.MethodPost, "https://example.com/api/webhooks/1/test", nil)
	if err := h.notificationClient.CheckRedirect(req, []*http.Request{{}}); err == nil {
		t.Fatal("unsafe redirect accepted")
	}
}

func TestPluginTranscodeFPSAliasesAndPreservation(t *testing.T) {
	db, h := testServer(t)
	payload := baseEvent("PlaybackStart")
	payload["session"].(map[string]any)["TranscodeFps"] = 24.5
	mustStart(t, h, payload)
	assertFPS := func(want float64) {
		t.Helper()
		var fps float64
		if err := db.QueryRow(`SELECT "transcodeFps" FROM "ActiveStream"`).Scan(&fps); err != nil || fps != want {
			t.Fatalf("fps=%v want=%v err=%v", fps, want, err)
		}
	}
	assertFPS(24.5)
	progress := baseEvent("PlaybackProgress")
	if response := send(t, h, testKey, progress); response.Code != 200 {
		t.Fatalf("progress: %s", response.Body)
	}
	assertFPS(24.5)
	progress["session"].(map[string]any)["transcodeFps"] = "29.97"
	if response := send(t, h, testKey, progress); response.Code != 200 {
		t.Fatalf("progress: %s", response.Body)
	}
	assertFPS(29.97)
	progress["session"].(map[string]any)["transcodeFps"] = "NaN"
	if response := send(t, h, testKey, progress); response.Code != 200 {
		t.Fatalf("progress: %s", response.Body)
	}
	assertFPS(29.97)
	delete(payload["session"].(map[string]any), "TranscodeFps")
	mustStart(t, h, payload)
	assertFPS(29.97)
}
