package plugin

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/maelmoreau21/jellytrack/v3/internal/database"
	"golang.org/x/crypto/scrypt"
)

const (
	maxEventBytes          = 1 << 20
	currentSchemaVersion   = 3
	minSchemaVersion       = 3
	keyHashLength          = 64
	keyPepperContext       = "JellyTrack scoped plugin key v1"
	maxCollectionBatchSize = 10000
)

var downloadAliases = map[string]struct{}{"ItemDownloaded": {}, "DownloadCompleted": {}}
var allowedEvents = map[string]struct{}{
	"Heartbeat": {}, "MediaDownloaded": {}, "PlaybackStart": {}, "PlaybackProgress": {},
	"PlaybackStop": {}, "PlaybackStateChanged": {}, "SessionEnded": {}, "LibraryChanged": {},
}

type Handler struct {
	db               *sql.DB
	driver           string
	logger           *slog.Logger
	rate             *limiter
	pepper           string
	peppers          []string
	maxBytes         int64
	monitorMu        sync.Mutex
	lastMonitorWrite time.Time
}

func NewHandler(db *sql.DB, driver string, logger *slog.Logger) *Handler {
	maxBytes := int64(maxEventBytes)
	if raw := strings.TrimSpace(os.Getenv("PLUGIN_EVENT_MAX_BYTES")); raw != "" {
		if n, err := strconv.ParseInt(raw, 10, 64); err == nil && n >= 1024 && n <= 16<<20 {
			maxBytes = n
		}
	}
	pepper := firstEnv("PLUGIN_KEY_PEPPER", "JELLYTRACK_SECRET", "NEXTAUTH_SECRET")
	legacy := strings.Split(os.Getenv("PLUGIN_KEY_PREVIOUS_PEPPERS"), ",")
	return &Handler{
		db: db, driver: driver, logger: logger, rate: newLimiter(), pepper: pepper,
		peppers: append([]string{pepper}, legacy...), maxBytes: maxBytes,
	}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	setCORS(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method == http.MethodGet {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "endpoint": "/api/plugin/events", "method": "POST", "message": "Endpoint reachable. Send plugin events with POST and API key headers."})
		return
	}
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "GET, POST, OPTIONS")
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed."})
		return
	}
	contentType := strings.ToLower(strings.TrimSpace(strings.Split(r.Header.Get("Content-Type"), ";")[0]))
	if contentType != "application/json" {
		writeJSON(w, http.StatusUnsupportedMediaType, map[string]string{"error": "Unsupported content type. Expected application/json."})
		return
	}
	if r.ContentLength > h.maxBytes {
		writeJSON(w, http.StatusRequestEntityTooLarge, map[string]string{"error": "Payload too large."})
		return
	}
	ip := clientIP(r)
	if retry, ok := h.rate.consume("preauth:" + ip); !ok {
		w.Header().Set("Retry-After", strconv.Itoa(retry))
		writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "Too many plugin events. Please retry later.", "retryAfterSeconds": retry})
		return
	}
	key := extractKey(r)
	current, previous, previousExpiry, err := h.readKeySnapshot(r.Context())
	if err != nil {
		h.logger.Error("read plugin authentication settings", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Internal Server Error"})
		return
	}
	usedPrevious, scopedServer, authorized := h.verifyKey(key, current, previous, previousExpiry)
	if !authorized {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized — invalid or missing API key."})
		return
	}
	keyDigest := sha256.Sum256([]byte(key))
	if retry, ok := h.rate.consume(ip + ":" + base64.RawURLEncoding.EncodeToString(keyDigest[:12])); !ok {
		w.Header().Set("Retry-After", strconv.Itoa(retry))
		writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "Too many plugin events. Please retry later.", "retryAfterSeconds": retry})
		return
	}
	reader := http.MaxBytesReader(w, r.Body, h.maxBytes)
	defer reader.Close()
	decoder := json.NewDecoder(reader)
	decoder.UseNumber()
	var payload map[string]any
	if err := decoder.Decode(&payload); err != nil || payload == nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			writeJSON(w, http.StatusRequestEntityTooLarge, map[string]string{"error": "Payload too large."})
		} else {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON payload."})
		}
		return
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON payload."})
		return
	}
	if err := validatePayload(payload); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	event := stringValue(payload, "event", "Event")
	if event == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Missing 'event' field."})
		return
	}
	if _, ok := downloadAliases[event]; ok {
		event = "MediaDownloaded"
	}
	if _, ok := allowedEvents[event]; !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Unknown event: " + event})
		return
	}
	version, present, valid := schemaVersion(payload)
	if !present || !valid {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid or missing eventSchemaVersion. Expected a positive integer.", "minSupported": minSchemaVersion, "maxSupported": currentSchemaVersion})
		return
	}
	if version < minSchemaVersion || version > currentSchemaVersion {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Unsupported eventSchemaVersion.", "schemaVersion": version, "minSupported": minSchemaVersion, "maxSupported": currentSchemaVersion})
		return
	}
	server := serverIdentity(payload)
	if scopedServer != "" && scopedServer != server.id {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "Forbidden — scoped plugin key does not match payload server.", "tokenServerId": scopedServer, "payloadServerId": server.id})
		return
	}
	serverID, err := h.upsertServer(r.Context(), server)
	if err != nil {
		h.fail(w, "upsert server", err)
		return
	}
	if event != "Heartbeat" && event != "PlaybackProgress" {
		_, _ = h.exec(r.Context(), `INSERT INTO "GlobalSettings" ("id","pluginLastSeen") VALUES ('global',?) ON CONFLICT("id") DO UPDATE SET "pluginLastSeen"=excluded."pluginLastSeen"`, time.Now().UTC().Format(time.RFC3339Nano))
	}
	status, result, err := h.handleEvent(r.Context(), event, payload, serverID, server.id, version)
	if err != nil {
		h.fail(w, "handle plugin event", err)
		return
	}
	if usedPrevious {
		h.logger.Warn("plugin event used previous key", "server_id", server.id)
	}
	writeJSON(w, status, result)
}

func (h *Handler) handleEvent(ctx context.Context, event string, p map[string]any, serverID, jellyfinServerID string, schemaVersion int) (int, any, error) {
	switch event {
	case "MediaDownloaded":
		return h.mediaDownloaded(ctx, p, serverID)
	case "Heartbeat":
		return h.heartbeat(ctx, p, serverID, schemaVersion)
	case "PlaybackStart":
		return h.playbackStart(ctx, p, serverID)
	case "PlaybackProgress":
		return h.playbackProgress(ctx, p, serverID)
	case "PlaybackStop", "SessionEnded":
		return h.playbackEnd(ctx, p, event, serverID)
	case "PlaybackStateChanged":
		return h.stateChanged(ctx, p, serverID)
	case "LibraryChanged":
		return h.libraryChanged(ctx, p, serverID)
	default:
		return http.StatusBadRequest, map[string]string{"error": "Unknown event: " + event}, nil
	}
}

type serverInfo struct{ id, name, url string }

func serverIdentity(p map[string]any) serverInfo {
	node := objectValue(p, "server", "Server")
	serverID := firstString(node, "serverId", "ServerId", "jellyfinServerId", "JellyfinServerId")
	if serverID == "" {
		serverID = firstString(p, "serverId", "ServerId", "jellyfinServerId", "JellyfinServerId", "serverUniqueId", "ServerUniqueId")
	}
	serverURL := firstString(node, "serverUrl", "ServerUrl", "url", "Url")
	if serverURL == "" {
		serverURL = firstString(p, "serverUrl", "ServerUrl", "url", "Url")
	}
	if serverID == "" {
		serverID = firstEnv("JELLYFIN_SERVER_ID")
	}
	if serverURL == "" {
		serverURL = firstEnv("JELLYFIN_URL")
	}
	if serverURL == "" {
		serverURL = "http://localhost"
	}
	parsed, err := url.Parse(serverURL)
	if serverID == "" {
		if err == nil && parsed.Host != "" {
			host := strings.ToLower(parsed.Host)
			host = invalidServerIDCharacter.ReplaceAllString(host, "_")
			serverID = "srv:" + host
		} else {
			serverID = "master"
		}
	}
	name := firstString(node, "serverName", "ServerName", "name", "Name")
	if name == "" {
		name = firstString(p, "serverName", "ServerName", "pluginServerName", "PluginServerName", "server", "Server")
	}
	if name == "" && err == nil {
		name = parsed.Hostname()
	}
	if name == "" {
		name = firstEnv("JELLYFIN_SERVER_NAME")
	}
	if name == "" {
		name = "Master Jellyfin"
	}
	return serverInfo{id: serverID, name: name, url: strings.TrimRight(serverURL, "/")}
}

func validatePayload(p map[string]any) error {
	if err := validateJSONValue(p, 0); err != nil {
		return err
	}
	for _, key := range []string{"user", "User", "media", "Media", "session", "Session", "server", "Server", "metadata", "Metadata", "pluginMetrics", "PluginMetrics"} {
		if value, ok := p[key]; ok && value != nil {
			if _, valid := value.(map[string]any); !valid {
				return fmt.Errorf("Field %q must be an object.", key)
			}
		}
	}
	for _, key := range []string{"users", "Users", "items", "Items"} {
		if value, ok := p[key]; ok && value != nil {
			items, valid := value.([]any)
			if !valid || len(items) > maxCollectionBatchSize {
				return fmt.Errorf("Field %q must be an array of at most %d items.", key, maxCollectionBatchSize)
			}
		}
	}
	return nil
}

func validateJSONValue(value any, depth int) error {
	if depth > 32 {
		return errors.New("Event JSON is nested too deeply.")
	}
	switch typed := value.(type) {
	case map[string]any:
		if len(typed) > 100 {
			return errors.New("Too many event fields.")
		}
		for key, item := range typed {
			if len(key) > 128 {
				return errors.New("Invalid field name.")
			}
			if err := validateJSONValue(item, depth+1); err != nil {
				return fmt.Errorf("Field %q: %w", key, err)
			}
		}
	case []any:
		if len(typed) > maxCollectionBatchSize {
			return fmt.Errorf("Event arrays may contain at most %d items.", maxCollectionBatchSize)
		}
		for _, item := range typed {
			if err := validateJSONValue(item, depth+1); err != nil {
				return err
			}
		}
	case string:
		if len(typed) > 8192 {
			return errors.New("Event strings may contain at most 8192 bytes.")
		}
	}
	return nil
}

func (h *Handler) readKeySnapshot(ctx context.Context) (string, string, sql.NullString, error) {
	var current, previous sql.NullString
	var previousExpiry sql.NullString
	err := h.db.QueryRowContext(ctx, `SELECT "pluginApiKey","pluginPreviousApiKey","pluginPreviousApiKeyExpiresAt" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&current, &previous, &previousExpiry)
	if errors.Is(err, sql.ErrNoRows) {
		return "", "", sql.NullString{}, nil
	}
	return current.String, previous.String, previousExpiry, err
}

func extractKey(r *http.Request) string {
	if auth := strings.TrimSpace(r.Header.Get("Authorization")); len(auth) > 7 && strings.EqualFold(auth[:7], "Bearer ") {
		return strings.TrimSpace(auth[7:])
	}
	return strings.TrimSpace(r.Header.Get("X-Api-Key"))
}

func (h *Handler) verifyKey(token, current, previous string, expiry sql.NullString) (bool, string, bool) {
	if token == "" {
		return false, "", false
	}
	parsed, scoped := parseScopedToken(token)
	for _, candidate := range []struct {
		hash string
		old  bool
	}{{current, false}, {previous, true}} {
		if candidate.hash == "" {
			continue
		}
		if scoped {
			if verifyScoped(candidate.hash, parsed.serverID, parsed.signature) {
				if candidate.old && !validExpiry(expiry) {
					continue
				}
				return candidate.old, parsed.serverID, true
			}
			continue
		}
		if verifyHash(token, candidate.hash, h.peppers) {
			if candidate.old && !validExpiry(expiry) {
				continue
			}
			return candidate.old, "", true
		}
	}
	return false, "", false
}

type scopedToken struct{ serverID, signature string }

func parseScopedToken(token string) (scopedToken, bool) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 || parts[0] != "jts4" {
		return scopedToken{}, false
	}
	decoded, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || len(decoded) == 0 || len(decoded) > 512 {
		return scopedToken{}, true
	}
	serverID := strings.TrimSpace(string(decoded))
	if serverID == "" {
		return scopedToken{}, true
	}
	return scopedToken{serverID: serverID, signature: parts[2]}, true
}

func verifyScoped(storedHash, serverID, signature string) bool {
	if serverID == "" || signature == "" {
		return false
	}
	mac := hmac.New(sha256.New, []byte(storedHash))
	mac.Write([]byte(keyPepperContext))
	mac.Write([]byte{0})
	mac.Write([]byte(serverID))
	expected := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return constantStringEqual(expected, signature)
}

func verifyHash(rawKey, stored string, peppers []string) bool {
	parts := strings.Split(stored, "$")
	if len(parts) != 3 || parts[0] != "s1" {
		return false
	}
	salt, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || len(salt) == 0 || len(salt) > 64 {
		return false
	}
	digest, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil || len(digest) != keyHashLength {
		return false
	}
	if len(peppers) == 0 {
		peppers = []string{""}
	}
	matched := 0
	for _, pepper := range uniqueStrings(peppers) {
		input := rawKey
		if pepper != "" {
			input = pepper + ":" + rawKey
		}
		computed, err := scrypt.Key([]byte(input), salt, 1<<14, 8, 1, keyHashLength)
		if err != nil {
			continue
		}
		matched |= subtle.ConstantTimeCompare(computed, digest)
	}
	return matched == 1
}

func validExpiry(value sql.NullString) bool {
	if !value.Valid {
		return false
	}
	date, err := parseTime(value.String)
	return err == nil && date.After(time.Now())
}

func constantStringEqual(a, b string) bool {
	left, right := []byte(a), []byte(b)
	if len(left) != len(right) {
		return false
	}
	return subtle.ConstantTimeCompare(left, right) == 1
}

func uniqueStrings(values []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if _, ok := seen[value]; !ok {
			seen[value] = struct{}{}
			out = append(out, value)
		}
	}
	return out
}

func (h *Handler) upsertServer(ctx context.Context, server serverInfo) (string, error) {
	id, err := newID()
	if err != nil {
		return "", err
	}
	var serverDBID string
	err = h.queryRow(ctx, `INSERT INTO "Server" ("id","jellyfinServerId","name","url","isActive") VALUES (?,?,?,?,?) ON CONFLICT("jellyfinServerId") DO UPDATE SET "name"=excluded."name","url"=excluded."url","isActive"=TRUE,"updatedAt"=CURRENT_TIMESTAMP RETURNING "id"`, id, server.id, server.name, server.url, true).Scan(&serverDBID)
	return serverDBID, err
}

func (h *Handler) mediaDownloaded(ctx context.Context, p map[string]any, serverID string) (int, any, error) {
	user, media, session := objectValue(p, "user", "User"), objectValue(p, "media", "Media", "item", "Item"), objectValue(p, "session", "Session", "client", "Client")
	userKey := firstString(user, "jellyfinUserId", "JellyfinUserId", "id", "Id")
	if userKey == "" {
		userKey = firstString(p, "userId", "UserId")
	}
	mediaKey := firstString(media, "jellyfinMediaId", "JellyfinMediaId", "id", "Id")
	if mediaKey == "" {
		mediaKey = firstString(p, "mediaId", "MediaId", "itemId", "ItemId")
	}
	if userKey == "" || mediaKey == "" {
		return http.StatusBadRequest, map[string]string{"error": "Missing userId or mediaId."}, nil
	}
	username := firstString(user, "username", "Username", "name", "Name")
	if username == "" {
		username = "Unknown"
	}
	title := firstString(media, "title", "Title", "name", "Name")
	if title == "" {
		title = "Unknown"
	}
	typeName := firstString(media, "type", "Type")
	if typeName == "" {
		typeName = "Unknown"
	}
	collection := firstString(media, "collectionType", "CollectionType")
	if collection == "" {
		collection = inferLibrary(typeName)
	}
	library := firstString(media, "libraryName", "LibraryName")
	if h.libraryExcluded(ctx, serverID, library, collection, typeName) {
		return http.StatusOK, map[string]any{"success": true, "ignored": true, "message": "Library excluded."}, nil
	}
	userDB, err := h.upsertUser(ctx, serverID, userKey, username, true)
	if err != nil {
		return 500, nil, err
	}
	mediaDB, mediaDuration, size, err := h.upsertMedia(ctx, serverID, media, mediaKey, title, typeName, collection)
	if err != nil {
		return 500, nil, err
	}
	durationMs := mediaDuration
	if durationMs <= 0 {
		return http.StatusBadRequest, map[string]string{"error": "Downloaded media requires a positive duration."}, nil
	}
	sourceEventID := firstString(p, "sourceEventId", "SourceEventId", "eventId", "EventId", "downloadId", "DownloadId")
	completed := time.Now().UTC()
	if observed := eventTime(p); !observed.IsZero() {
		completed = observed
	}
	if sourceEventID == "" {
		if observed := eventTime(p); !observed.IsZero() {
			sum := sha256.Sum256([]byte(fmt.Sprintf("%s:%s:%s:%d", serverID, userKey, mediaKey, observed.UnixMilli())))
			sourceEventID = fmt.Sprintf("%x", sum)
		}
	}
	if sourceEventID != "" {
		var existing string
		err = h.queryRow(ctx, `SELECT "id" FROM "PlaybackHistory" WHERE "serverId"=? AND "sourceEventId"=? LIMIT 1`, serverID, sourceEventID).Scan(&existing)
		if err == nil {
			return http.StatusOK, map[string]any{"success": true, "duplicate": true, "playbackId": existing, "message": "MediaDownloaded already processed."}, nil
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return 500, nil, err
		}
	}
	playbackID, err := newID()
	if err != nil {
		return 500, nil, err
	}
	telemetryID, err := newID()
	if err != nil {
		return 500, nil, err
	}
	seconds := int64(math.Ceil(float64(durationMs) / 1000))
	bitrate := any(nil)
	if size > 0 {
		bitrate = int64(math.Round(float64(size) * 8000 / float64(durationMs)))
	}
	var ip any
	rawIP := firstString(session, "ipAddress", "IpAddress")
	if rawIP == "" {
		rawIP = firstString(p, "ipAddress", "IpAddress")
	}
	if clean := net.ParseIP(strings.Split(rawIP, ",")[0]); clean != nil {
		ip = clean.String()
	}
	client := firstString(session, "clientName", "ClientName")
	if client == "" {
		client = firstString(p, "clientName", "ClientName")
	}
	if client == "" {
		client = "Download"
	}
	device := nullableString(firstString(session, "deviceName", "DeviceName"))
	if !hasObjectKey(session, "deviceName", "DeviceName") {
		device = nullableString(firstString(p, "deviceName", "DeviceName"))
	}
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return 500, nil, err
	}
	defer tx.Rollback()
	_, err = h.execTx(ctx, tx, `INSERT INTO "PlaybackHistory" ("id","serverId","userId","mediaId","playMethod","eventSource","sourceEventId","clientName","deviceName","ipAddress","durationWatched","startedAt","endedAt","bitrate","audioLanguage","audioCodec","subtitleLanguage","subtitleCodec") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, playbackID, serverID, userDB, mediaDB, "Download", "download", nullableString(sourceEventID), client, device, ip, seconds, completed.Format(time.RFC3339Nano), completed.Format(time.RFC3339Nano), bitrate, nullableString(firstString(session, "audioLanguage", "AudioLanguage")), nullableString(firstString(session, "audioCodec", "AudioCodec")), nullableString(firstString(session, "subtitleLanguage", "SubtitleLanguage")), nullableString(firstString(session, "subtitleCodec", "SubtitleCodec")))
	if err == nil {
		_, err = h.execTx(ctx, tx, `INSERT INTO "TelemetryEvent" ("id","serverId","playbackId","eventType","positionMs","metadata","createdAt") VALUES (?,?,?,?,?,?,?)`, telemetryID, serverID, playbackID, "download", durationMs, jsonText(map[string]any{"sourceEventId": sourceEventID, "fullView": true, "durationMs": durationMs, "event": "MediaDownloaded"}), time.Now().UTC().Format(time.RFC3339Nano))
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		if sourceEventID != "" {
			var existing string
			if findErr := h.queryRow(ctx, `SELECT "id" FROM "PlaybackHistory" WHERE "serverId"=? AND "sourceEventId"=?`, serverID, sourceEventID).Scan(&existing); findErr == nil {
				return http.StatusOK, map[string]any{"success": true, "duplicate": true, "playbackId": existing, "message": "MediaDownloaded already processed."}, nil
			}
		}
		return 500, nil, err
	}
	return http.StatusOK, map[string]any{"success": true, "playbackId": playbackID, "message": "MediaDownloaded processed."}, nil
}

func (h *Handler) heartbeat(ctx context.Context, p map[string]any, serverID string, schema int) (int, any, error) {
	users := arrayValue(p, "users", "Users")
	synced := 0
	for _, raw := range users {
		user, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		id := firstString(user, "jellyfinUserId", "JellyfinUserId", "id", "Id")
		name := firstString(user, "username", "Username", "name", "Name")
		if id == "" || name == "" {
			continue
		}
		if _, err := h.upsertUser(ctx, serverID, id, name, false); err != nil {
			return 500, nil, err
		}
		synced++
	}
	metrics := objectValue(p, "pluginMetrics", "PluginMetrics")
	if err := h.markMonitorPoll(ctx, len(users)); err != nil {
		return 500, nil, err
	}
	details := map[string]any{"sessions": len(users), "version": firstString(p, "pluginVersion", "PluginVersion"), "jellyfinVersion": firstString(p, "jellyfinVersion", "JellyfinVersion"), "eventSchemaVersion": schema, "queueDepth": nonNegativeInteger(metrics, "queueDepth", "QueueDepth"), "retries": nonNegativeInteger(metrics, "retries", "Retries", "retryCount", "RetryCount"), "lastHttpCode": nonNegativeInteger(metrics, "lastHttpCode", "LastHttpCode", "lastHttpStatusCode", "LastHttpStatusCode"), "coalescedProgressEvents": nonNegativeInteger(metrics, "coalescedProgressEvents", "CoalescedProgressEvents")}
	_, err := h.exec(ctx, `INSERT INTO "GlobalSettings" ("id","pluginLastSeen","pluginVersion","pluginServerName") VALUES ('global',?,?,?) ON CONFLICT("id") DO UPDATE SET "pluginLastSeen"=excluded."pluginLastSeen","pluginVersion"=excluded."pluginVersion","pluginServerName"=excluded."pluginServerName"`, time.Now().UTC().Format(time.RFC3339Nano), nullableString(firstString(p, "pluginVersion", "PluginVersion")), firstString(p, "serverName", "ServerName"))
	if err == nil {
		_, err = h.exec(ctx, `INSERT INTO "SystemHealthState" ("id") VALUES ('global') ON CONFLICT("id") DO NOTHING`)
	}
	if err == nil {
		id, e := newID()
		if e != nil {
			return 500, nil, e
		}
		_, err = h.exec(ctx, `INSERT INTO "SystemHealthEvent" ("id","source","kind","message","details","createdAt") VALUES (?,'monitor','monitor_ping',?,?,?)`, id, fmt.Sprintf("Monitor heartbeat received (%d sessions)", len(users)), jsonText(details), time.Now().UTC().Format(time.RFC3339Nano))
	}
	if err != nil {
		return 500, nil, err
	}
	return http.StatusOK, map[string]any{"success": true, "message": fmt.Sprintf("Heartbeat OK, %d users synced.", synced)}, nil
}

func (h *Handler) playbackStart(ctx context.Context, p map[string]any, serverID string) (int, any, error) {
	user, media, session := objectValue(p, "user", "User"), objectValue(p, "media", "Media"), objectValue(p, "session", "Session")
	userKey := firstString(user, "jellyfinUserId", "JellyfinUserId", "id", "Id")
	mediaKey := firstString(media, "jellyfinMediaId", "JellyfinMediaId", "id", "Id")
	sessionID := firstString(session, "sessionId", "SessionId")
	if sessionID == "" {
		sessionID = firstString(p, "sessionId", "SessionId")
	}
	if userKey == "" || mediaKey == "" {
		return 400, map[string]string{"error": "Missing userId or mediaId."}, nil
	}
	if sessionID == "" {
		return 400, map[string]string{"error": "Missing sessionId."}, nil
	}
	if err := h.markMonitorPoll(ctx, 1); err != nil {
		return 500, nil, err
	}
	userID, err := h.upsertUser(ctx, serverID, userKey, firstString(user, "username", "Username", "name", "Name"), true)
	if err != nil {
		return 500, nil, err
	}
	title := firstString(media, "title", "Title", "name", "Name")
	if title == "" {
		title = "Unknown"
	}
	typeName := firstString(media, "type", "Type")
	if typeName == "" {
		typeName = "Unknown"
	}
	collection := firstString(media, "collectionType", "CollectionType")
	if collection == "" {
		collection = inferLibrary(typeName)
	}
	mediaID, mediaDuration, size, err := h.upsertMedia(ctx, serverID, media, mediaKey, title, typeName, collection)
	if err != nil {
		return 500, nil, err
	}
	playbackID, err := h.openPlayback(ctx, serverID, userID, mediaID)
	if err != nil {
		return 500, nil, err
	}
	streamID, err := newID()
	if err != nil {
		return 500, nil, err
	}
	position := integerValue(p, "positionTicks", "PositionTicks")
	if position == 0 {
		position = integerValue(session, "positionTicks", "PositionTicks")
	}
	playMethod := firstString(session, "playMethod", "PlayMethod")
	if playMethod == "" {
		playMethod = "Unknown"
	}
	client := firstString(session, "clientName", "ClientName")
	device := firstString(session, "deviceName", "DeviceName")
	ip := normalizedIP(firstString(session, "ipAddress", "IpAddress"))
	bitrate := integerValue(session, "bitrate", "Bitrate")
	if bitrate <= 0 && size > 0 && mediaDuration > 0 {
		bitrate = int64(math.Round(float64(size) * 8000 / float64(mediaDuration)))
	}
	_, err = h.exec(ctx, `UPDATE "PlaybackHistory" SET "endedAt"=NULL,"playMethod"=?,"clientName"=?,"deviceName"=?,"ipAddress"=?,"bitrate"=COALESCE(?,"bitrate"),"audioLanguage"=?,"audioCodec"=?,"subtitleLanguage"=?,"subtitleCodec"=? WHERE "id"=?`, playMethod, nullableString(client), nullableString(device), ip, nullableInt(bitrate), nullableString(firstWord(firstString(session, "audioLanguage", "AudioLanguage"))), nullableString(firstString(session, "audioCodec", "AudioCodec")), nullableString(firstWord(firstString(session, "subtitleLanguage", "SubtitleLanguage"))), nullableString(firstString(session, "subtitleCodec", "SubtitleCodec")), playbackID)
	if err != nil {
		return 500, nil, err
	}
	playbackRate := parseRate(session, session, nil)
	_, err = h.exec(ctx, `INSERT INTO "ActiveStream" ("id","serverId","sessionId","userId","mediaId","playbackId","playMethod","clientName","deviceName","ipAddress","bitrate","positionTicks","videoCodec","audioCodec","audioLanguage","subtitleLanguage","subtitleCodec","playbackRate") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT("sessionId","serverId") DO UPDATE SET "userId"=excluded."userId","mediaId"=excluded."mediaId","playbackId"=excluded."playbackId","playMethod"=excluded."playMethod","clientName"=excluded."clientName","deviceName"=excluded."deviceName","ipAddress"=excluded."ipAddress","positionTicks"=excluded."positionTicks","videoCodec"=excluded."videoCodec","audioCodec"=excluded."audioCodec","audioLanguage"=excluded."audioLanguage","subtitleLanguage"=excluded."subtitleLanguage","subtitleCodec"=excluded."subtitleCodec","playbackRate"=COALESCE(excluded."playbackRate","ActiveStream"."playbackRate"),"lastPingAt"=CURRENT_TIMESTAMP`, streamID, serverID, sessionID, userID, mediaID, playbackID, playMethod, nullableString(client), nullableString(device), ip, nullableInt(bitrate), nullableInt(position), nullableString(firstString(session, "videoCodec", "VideoCodec")), nullableString(firstString(session, "audioCodec", "AudioCodec")), nullableString(firstWord(firstString(session, "audioLanguage", "AudioLanguage"))), nullableString(firstWord(firstString(session, "subtitleLanguage", "SubtitleLanguage"))), nullableString(firstString(session, "subtitleCodec", "SubtitleCodec")), playbackRate)
	if err != nil {
		return 500, nil, err
	}
	return 200, map[string]any{"success": true, "message": "PlaybackStart processed.", "playbackId": playbackID}, nil
}

func (h *Handler) markMonitorPoll(ctx context.Context, sessionCount int) error {
	h.monitorMu.Lock()
	defer h.monitorMu.Unlock()
	now := time.Now().UTC()
	if now.Sub(h.lastMonitorWrite) < 10*time.Second {
		return nil
	}
	if _, err := h.exec(ctx, `INSERT INTO "SystemHealthState" ("id") VALUES ('global') ON CONFLICT("id") DO NOTHING`); err != nil {
		return err
	}
	var raw []byte
	if err := h.queryRow(ctx, `SELECT "monitor" FROM "SystemHealthState" WHERE "id"='global'`).Scan(&raw); err != nil {
		return err
	}
	state := map[string]any{}
	_ = json.Unmarshal(raw, &state)
	state["active"] = true
	state["sessionCount"] = sessionCount
	state["consecutiveErrors"] = 0
	state["lastPollAt"] = now.Format(time.RFC3339Nano)
	state["status"] = "ok"
	state["lastSuccessAt"] = now.Format(time.RFC3339Nano)
	state["lastError"] = nil
	state["lastErrorAt"] = nil
	if _, err := h.exec(ctx, `UPDATE "SystemHealthState" SET "monitor"=?,"updatedAt"=? WHERE "id"='global'`, jsonText(state), now.Format(time.RFC3339Nano)); err != nil {
		return err
	}
	h.lastMonitorWrite = now
	return nil
}

func (h *Handler) playbackProgress(ctx context.Context, p map[string]any, serverID string) (int, any, error) {
	user, media, session := objectValue(p, "user", "User"), objectValue(p, "media", "Media"), objectValue(p, "session", "Session")
	userKey := firstString(user, "jellyfinUserId", "JellyfinUserId", "id", "Id")
	mediaKey := firstString(media, "jellyfinMediaId", "JellyfinMediaId", "id", "Id")
	sessionID := firstString(p, "sessionId", "SessionId")
	if sessionID == "" {
		sessionID = firstString(session, "sessionId", "SessionId")
	}
	if userKey == "" || mediaKey == "" || sessionID == "" {
		return 400, map[string]string{"error": "Missing userId, mediaId, or sessionId."}, nil
	}
	userID, err := h.upsertUser(ctx, serverID, userKey, firstString(user, "username", "Username", "name", "Name"), true)
	if err != nil {
		return 500, nil, err
	}
	title := firstString(media, "title", "Title", "name", "Name")
	if title == "" {
		title = "Unknown"
	}
	typeName := firstString(media, "type", "Type")
	if typeName == "" {
		typeName = "Unknown"
	}
	collection := firstString(media, "collectionType", "CollectionType")
	if collection == "" {
		collection = inferLibrary(typeName)
	}
	mediaID, duration, size, err := h.upsertMedia(ctx, serverID, media, mediaKey, title, typeName, collection)
	if err != nil {
		return 500, nil, err
	}
	playbackID, err := h.openPlayback(ctx, serverID, userID, mediaID)
	if err != nil {
		return 500, nil, err
	}
	position := integerValue(p, "positionTicks", "PositionTicks")
	if position == 0 {
		position = integerValue(session, "positionTicks", "PositionTicks")
	}
	var priorTicks sql.NullInt64
	var priorPing, priorPlayback sql.NullString
	priorErr := h.queryRow(ctx, `SELECT "positionTicks","lastPingAt","playbackId" FROM "ActiveStream" WHERE "serverId"=? AND "sessionId"=?`, serverID, sessionID).Scan(&priorTicks, &priorPing, &priorPlayback)
	if priorErr != nil && !errors.Is(priorErr, sql.ErrNoRows) {
		return 500, nil, priorErr
	}
	if priorPlayback.Valid && priorPlayback.String != "" {
		playbackID = priorPlayback.String
	}
	paused := boolValue(p, "isPaused", "IsPaused")
	method := firstString(session, "playMethod", "PlayMethod")
	if method == "" {
		method = "Unknown"
	}
	client := firstString(session, "clientName", "ClientName")
	device := firstString(session, "deviceName", "DeviceName")
	ip := normalizedIP(firstString(session, "ipAddress", "IpAddress"))
	streamID, err := newID()
	if err != nil {
		return 500, nil, err
	}
	bitrate := integerValue(session, "bitrate", "Bitrate")
	if bitrate <= 0 && size > 0 && duration > 0 {
		bitrate = int64(math.Round(float64(size) * 8000 / float64(duration)))
	}
	playbackRate := parseRate(p, session, nil)
	_, err = h.exec(ctx, `INSERT INTO "ActiveStream" ("id","serverId","sessionId","userId","mediaId","playbackId","playMethod","clientName","deviceName","ipAddress","bitrate","positionTicks","videoCodec","audioCodec","audioLanguage","subtitleLanguage","subtitleCodec","playbackRate") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT("sessionId","serverId") DO UPDATE SET "userId"=excluded."userId","mediaId"=excluded."mediaId","playbackId"=excluded."playbackId","playMethod"=excluded."playMethod","clientName"=excluded."clientName","deviceName"=excluded."deviceName","ipAddress"=excluded."ipAddress","positionTicks"=excluded."positionTicks","videoCodec"=excluded."videoCodec","audioCodec"=excluded."audioCodec","audioLanguage"=excluded."audioLanguage","subtitleLanguage"=excluded."subtitleLanguage","subtitleCodec"=excluded."subtitleCodec","playbackRate"=COALESCE(excluded."playbackRate","ActiveStream"."playbackRate"),"lastPingAt"=CURRENT_TIMESTAMP`, streamID, serverID, sessionID, userID, mediaID, playbackID, method, nullableString(client), nullableString(device), ip, nullableInt(bitrate), nullableInt(position), nullableString(firstString(session, "videoCodec", "VideoCodec")), nullableString(firstString(session, "audioCodec", "AudioCodec")), nullableString(firstWord(firstString(session, "audioLanguage", "AudioLanguage"))), nullableString(firstWord(firstString(session, "subtitleLanguage", "SubtitleLanguage"))), nullableString(firstString(session, "subtitleCodec", "SubtitleCodec")), playbackRate)
	if err != nil {
		return 500, nil, err
	}
	seconds := int64(0)
	if !paused && priorTicks.Valid && position > priorTicks.Int64 {
		delta := (position - priorTicks.Int64) / 10_000_000
		if delta > 0 && delta <= 300 {
			seconds = delta
		}
	}
	if !paused && seconds == 0 && priorPing.Valid {
		if last, parseErr := parseTime(priorPing.String); parseErr == nil {
			wall := int64(time.Since(last).Seconds())
			if wall > 0 && wall <= 60 {
				seconds = wall
			}
		}
	}
	var lastState string
	_ = h.queryRow(ctx, `SELECT "eventType" FROM "TelemetryEvent" WHERE "playbackId"=? AND "eventType" IN ('pause','resume') ORDER BY "createdAt" DESC LIMIT 1`, playbackID).Scan(&lastState)
	if lastState == "pause" {
		seconds = 0
	}
	limitSeconds := int64(86400)
	if duration > 0 {
		limitSeconds = int64(math.Ceil(float64(duration)/1000)) + 10
	}
	_, err = h.exec(ctx, `UPDATE "PlaybackHistory" SET "durationWatched"=CASE WHEN "durationWatched"+?>? THEN ? ELSE "durationWatched"+? END,"playMethod"=?,"clientName"=COALESCE(?,"clientName"),"deviceName"=COALESCE(?,"deviceName"),"ipAddress"=COALESCE(?,"ipAddress"),"audioLanguage"=COALESCE(?,"audioLanguage"),"audioCodec"=COALESCE(?,"audioCodec"),"subtitleLanguage"=COALESCE(?,"subtitleLanguage"),"subtitleCodec"=COALESCE(?,"subtitleCodec"),"endedAt"=NULL,"bitrate"=COALESCE(?,"bitrate") WHERE "id"=?`, seconds, limitSeconds, limitSeconds, seconds, method, nullableString(client), nullableString(device), ip, nullableString(firstWord(firstString(session, "audioLanguage", "AudioLanguage"))), nullableString(firstString(session, "audioCodec", "AudioCodec")), nullableString(firstWord(firstString(session, "subtitleLanguage", "SubtitleLanguage"))), nullableString(firstString(session, "subtitleCodec", "SubtitleCodec")), nullableInt(bitrate), playbackID)
	if err != nil {
		return 500, nil, err
	}
	_ = size
	return 200, map[string]any{"success": true, "message": "PlaybackProgress processed."}, nil
}

func (h *Handler) playbackEnd(ctx context.Context, p map[string]any, event, serverID string) (int, any, error) {
	user, session := objectValue(p, "user", "User"), objectValue(p, "session", "Session")
	sessionID := firstString(p, "sessionId", "SessionId")
	if sessionID == "" {
		sessionID = firstString(session, "sessionId", "SessionId")
	}
	if sessionID == "" {
		return 400, map[string]string{"error": "Missing sessionId."}, nil
	}
	position := integerValue(p, "positionTicks", "PositionTicks")
	if position == 0 {
		position = integerValue(session, "positionTicks", "PositionTicks")
	}
	var playbackID, userID string
	var previous sql.NullInt64
	var mediaDuration sql.NullInt64
	var alreadyEnded sql.NullString
	var lastPing sql.NullString
	err := h.queryRow(ctx, `SELECT a."playbackId",a."userId",a."positionTicks",a."lastPingAt",m."durationMs",p."endedAt" FROM "ActiveStream" a LEFT JOIN "Media" m ON m."id"=a."mediaId" LEFT JOIN "PlaybackHistory" p ON p."id"=a."playbackId" WHERE a."serverId"=? AND a."sessionId"=?`, serverID, sessionID).Scan(&playbackID, &userID, &previous, &lastPing, &mediaDuration, &alreadyEnded)
	if errors.Is(err, sql.ErrNoRows) {
		return 200, map[string]any{"success": true, "message": event + " processed.", "result": map[string]any{"closed": false, "reason": "no_active_stream"}}, nil
	}
	if err != nil {
		return 500, nil, err
	}
	if playbackID == "" {
		_, err = h.exec(ctx, `DELETE FROM "ActiveStream" WHERE "serverId"=? AND "sessionId"=?`, serverID, sessionID)
		return 200, map[string]any{"success": true, "message": event + " processed.", "result": map[string]any{"closed": false, "reason": "no_playback"}}, err
	}
	if position <= 0 && previous.Valid {
		position = previous.Int64
	}
	now := time.Now().UTC()
	var oldDuration int64
	err = h.queryRow(ctx, `SELECT "durationWatched" FROM "PlaybackHistory" WHERE "id"=?`, playbackID).Scan(&oldDuration)
	if err != nil {
		return 500, nil, err
	}
	seconds := oldDuration
	if position > previous.Int64 && previous.Valid {
		delta := (position - previous.Int64) / 10_000_000
		if delta > 0 && delta <= 300 {
			seconds += delta
		}
	}
	if lastPing.Valid {
		if last, parseErr := parseTime(lastPing.String); parseErr == nil {
			wall := int64(now.Sub(last).Seconds())
			if wall > 0 && wall <= 60 && position <= previous.Int64 {
				seconds += wall
			}
		}
	}
	if seconds < 0 {
		seconds = 0
	}
	limitSeconds := int64(86400)
	if mediaDuration.Valid && mediaDuration.Int64 > 0 {
		limitSeconds = int64(math.Ceil(float64(mediaDuration.Int64)/1000)) + 10
	}
	seconds = int64(math.Min(float64(seconds), float64(limitSeconds)))
	if !alreadyEnded.Valid {
		tx, txErr := h.db.BeginTx(ctx, nil)
		if txErr != nil {
			return 500, nil, txErr
		}
		defer tx.Rollback()
		var result sql.Result
		result, err = h.execTx(ctx, tx, `UPDATE "PlaybackHistory" SET "endedAt"=?,"durationWatched"=? WHERE "id"=? AND "endedAt" IS NULL`, now.Format(time.RFC3339Nano), seconds, playbackID)
		if err != nil {
			return 500, nil, err
		}
		rowsChanged, _ := result.RowsAffected()
		if rowsChanged > 0 {
			eventType := "stop"
			if event == "SessionEnded" {
				eventType = "session_end"
			}
			telemetryID, e := newID()
			if e != nil {
				return 500, nil, e
			}
			metadata := jsonText(map[string]any{"source": strings.ToLower(strings.ReplaceAll(event, "Playback", "playback")), "clientName": nullableString(firstString(session, "clientName", "ClientName")), "deviceName": nullableString(firstString(session, "deviceName", "DeviceName"))})
			if _, err = h.execTx(ctx, tx, `INSERT INTO "TelemetryEvent" ("id","serverId","playbackId","eventType","positionMs","metadata","createdAt") VALUES (?,?,?,?,?,?,?)`, telemetryID, serverID, playbackID, eventType, position/10000, metadata, now.Format(time.RFC3339Nano)); err != nil {
				return 500, nil, err
			}
		}
		if err = tx.Commit(); err != nil {
			return 500, nil, err
		}
	}
	_, err = h.exec(ctx, `DELETE FROM "ActiveStream" WHERE "serverId"=? AND "sessionId"=?`, serverID, sessionID)
	if err != nil {
		return 500, nil, err
	}
	_ = user
	return 200, map[string]any{"success": true, "message": event + " processed.", "result": map[string]any{"closed": !alreadyEnded.Valid, "playbackId": playbackID, "durationS": seconds}}, nil
}

func (h *Handler) stateChanged(ctx context.Context, p map[string]any, serverID string) (int, any, error) {
	session := objectValue(p, "session", "Session")
	sessionID := firstString(p, "sessionId", "SessionId")
	if sessionID == "" {
		sessionID = firstString(session, "sessionId", "SessionId")
	}
	if sessionID == "" {
		return 400, map[string]string{"error": "Missing sessionId."}, nil
	}
	change := strings.ToLower(firstString(p, "changeType", "ChangeType", "stateChangeType", "StateChangeType"))
	allowed := map[string]bool{"pause": true, "resume": true, "seek": true, "audio_change": true, "subtitle_change": true, "speed_change": true}
	if !allowed[change] {
		return 400, map[string]string{"error": "Unsupported state change: " + change}, nil
	}
	metadata := objectValue(p, "metadata", "Metadata")
	rate := parseRate(p, session, metadata)
	var playbackID string
	err := h.queryRow(ctx, `SELECT COALESCE("playbackId",'') FROM "ActiveStream" WHERE "serverId"=? AND "sessionId"=?`, serverID, sessionID).Scan(&playbackID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return 500, nil, err
	}
	if playbackID != "" {
		ticks := integerValue(p, "positionTicks", "PositionTicks")
		if ticks == 0 {
			ticks = integerValue(session, "positionTicks", "PositionTicks")
		}
		positionMS := ticks / 10000
		typ := change
		if change == "seek" {
			from := integerValue(metadata, "fromMs", "FromMs")
			if from == 0 {
				from = integerValue(metadata, "fromTicks", "FromTicks") / 10000
			}
			to := integerValue(metadata, "toMs", "ToMs")
			if to == 0 {
				to = integerValue(metadata, "toTicks", "ToTicks") / 10000
			}
			if to == 0 {
				to = positionMS
			}
			delta := to - from
			if hasObjectKey(metadata, "deltaMs", "DeltaMs") {
				delta = integerValue(metadata, "deltaMs", "DeltaMs")
			}
			direction := strings.ToLower(firstString(metadata, "direction", "Direction"))
			if delta < 0 || direction == "backward" {
				typ = "replay"
			}
			if from != 0 || to != 0 {
				metadata["fromMs"] = from
				metadata["toMs"] = to
				metadata["deltaMs"] = delta
				metadata["direction"] = "forward"
				if typ == "replay" {
					metadata["direction"] = "backward"
				}
				low, high := from, to
				if low > high {
					low, high = high, low
				}
				metadata["rangeStartMs"], metadata["rangeEndMs"] = low, high
				metadata["fromLabel"], metadata["toLabel"] = positionLabel(from), positionLabel(to)
				metadata["rangeLabel"] = positionLabel(low) + " -> " + positionLabel(high)
			}
		}
		column := map[string]string{"pause": "pauseCount", "seek": "seekCount", "replay": "rewatchCount", "audio_change": "audioChanges", "subtitle_change": "subtitleChanges", "speed_change": "speedChangeCount"}[typ]
		if column != "" {
			if change == "seek" && typ == "replay" {
				_, err = h.exec(ctx, `UPDATE "PlaybackHistory" SET "seekCount"="seekCount"+1,"rewatchCount"="rewatchCount"+1 WHERE "id"=?`, playbackID)
			} else if typ == "speed_change" && rate != nil {
				_, err = h.exec(ctx, `UPDATE "PlaybackHistory" SET "speedChangeCount"="speedChangeCount"+1,"maxPlaybackRate"=CASE WHEN COALESCE("maxPlaybackRate",0)<? THEN ? ELSE "maxPlaybackRate" END WHERE "id"=?`, *rate, *rate, playbackID)
			} else if _, err = h.exec(ctx, `UPDATE "PlaybackHistory" SET `+`"`+column+`"="`+column+`"+1 WHERE "id"=?`, playbackID); err != nil {
				return 500, nil, err
			}
			if err != nil {
				return 500, nil, err
			}
		}
		if typ == "speed_change" && rate != nil {
			metadata["toRate"] = *rate
			metadata["toRateLabel"] = fmt.Sprintf("x%.2g", *rate)
			metadata["source"] = "jellyfin"
			metadata["confidence"] = 1
		}
		id, e := newID()
		if e != nil {
			return 500, nil, e
		}
		var meta any
		if len(metadata) > 0 {
			meta = jsonText(metadata)
		}
		if _, err = h.exec(ctx, `INSERT INTO "TelemetryEvent" ("id","serverId","playbackId","eventType","positionMs","metadata","createdAt") VALUES (?,?,?,?,?,?,?)`, id, serverID, playbackID, typ, positionMS, meta, time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
			return 500, nil, err
		}
	}
	if change == "pause" || change == "resume" || change == "audio_change" || change == "subtitle_change" || change == "speed_change" || change == "seek" {
		ticks := integerValue(p, "positionTicks", "PositionTicks")
		if ticks == 0 {
			ticks = integerValue(session, "positionTicks", "PositionTicks")
		}
		_, err = h.exec(ctx, `UPDATE "ActiveStream" SET "lastPingAt"=CURRENT_TIMESTAMP,"positionTicks"=CASE WHEN ?>0 THEN ? ELSE "positionTicks" END,"playbackRate"=COALESCE(?,"playbackRate"),"audioLanguage"=COALESCE(?,"audioLanguage"),"audioCodec"=COALESCE(?,"audioCodec"),"subtitleLanguage"=COALESCE(?,"subtitleLanguage"),"subtitleCodec"=COALESCE(?,"subtitleCodec") WHERE "serverId"=? AND "sessionId"=?`, ticks, ticks, rate, nullableString(firstString(session, "audioLanguage", "AudioLanguage")), nullableString(firstString(session, "audioCodec", "AudioCodec")), nullableString(firstWord(firstString(session, "subtitleLanguage", "SubtitleLanguage"))), nullableString(firstString(session, "subtitleCodec", "SubtitleCodec")), serverID, sessionID)
		if err != nil {
			return 500, nil, err
		}
	}
	return 200, map[string]any{"success": true, "message": "PlaybackStateChanged processed."}, nil
}

func (h *Handler) libraryChanged(ctx context.Context, p map[string]any, serverID string) (int, any, error) {
	items := arrayValue(p, "items", "Items")
	synced := 0
	for _, raw := range items {
		item, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		mediaKey := firstString(item, "jellyfinMediaId", "JellyfinMediaId", "id", "Id")
		if mediaKey == "" {
			continue
		}
		title := firstString(item, "title", "Title", "name", "Name")
		if title == "" {
			title = "Unknown"
		}
		typ := firstString(item, "type", "Type")
		if typ == "" {
			typ = "Unknown"
		}
		collection := firstString(item, "collectionType", "CollectionType")
		if collection == "" {
			collection = inferLibrary(typ)
		}
		if _, _, _, err := h.upsertMedia(ctx, serverID, item, mediaKey, title, typ, collection); err != nil {
			return 500, nil, err
		}
		synced++
	}
	return 200, map[string]any{"success": true, "message": fmt.Sprintf("%d items synced.", synced)}, nil
}

func (h *Handler) openPlayback(ctx context.Context, serverID, userID, mediaID string) (string, error) {
	var id string
	err := h.queryRow(ctx, `SELECT "id" FROM "PlaybackHistory" WHERE "serverId"=? AND "userId"=? AND "mediaId"=? AND "endedAt" IS NULL ORDER BY "startedAt" DESC LIMIT 1`, serverID, userID, mediaID).Scan(&id)
	if err == nil {
		return id, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", err
	}
	created, err := newID()
	if err != nil {
		return "", err
	}
	_, err = h.exec(ctx, `INSERT INTO "PlaybackHistory" ("id","serverId","userId","mediaId","playMethod") VALUES (?,?,?,?,?)`, created, serverID, userID, mediaID, "Unknown")
	return created, err
}

func (h *Handler) upsertUser(ctx context.Context, serverID, key, name string, bump bool) (string, error) {
	key = normalizeID(key)
	if key == "" {
		return "", errors.New("empty Jellyfin user id")
	}
	name = strings.TrimSpace(name)
	if name == "" || name == "Unknown" {
		name = key
	}
	id, err := newID()
	if err != nil {
		return "", err
	}
	var userID string
	lastActive := any(nil)
	if bump {
		lastActive = time.Now().UTC().Format(time.RFC3339Nano)
	}
	ids := jellyfinIDForms(key)
	rows, err := h.db.QueryContext(ctx, database.Bind(`SELECT "id","jellyfinUserId" FROM "User" WHERE "serverId"=? AND "jellyfinUserId" IN (?,?) ORDER BY CASE WHEN "jellyfinUserId"=? THEN 0 ELSE 1 END,"createdAt"`, h.driver), serverID, ids[0], ids[1], key)
	if err != nil {
		return "", err
	}
	type foundUser struct{ id, jellyfinID string }
	var found []foundUser
	for rows.Next() {
		var item foundUser
		if err := rows.Scan(&item.id, &item.jellyfinID); err != nil {
			rows.Close()
			return "", err
		}
		found = append(found, item)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return "", err
	}
	if err := rows.Close(); err != nil {
		return "", err
	}
	if len(found) == 0 {
		err = h.queryRow(ctx, `INSERT INTO "User" ("id","serverId","jellyfinUserId","username","lastActive") VALUES (?,?,?,?,?) ON CONFLICT("jellyfinUserId","serverId") DO UPDATE SET "username"=excluded."username","lastActive"=CASE WHEN excluded."lastActive" IS NULL THEN "User"."lastActive" ELSE excluded."lastActive" END,"updatedAt"=CURRENT_TIMESTAMP RETURNING "id"`, id, serverID, key, name, lastActive).Scan(&userID)
		return userID, err
	}
	userID = found[0].id
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()
	if _, err = h.execTx(ctx, tx, `UPDATE "User" SET "jellyfinUserId"=?,"username"=?,"lastActive"=COALESCE(?,"lastActive"),"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=?`, key, name, lastActive, userID); err != nil {
		return "", err
	}
	for _, duplicate := range found[1:] {
		if _, err = h.execTx(ctx, tx, `UPDATE "PlaybackHistory" SET "userId"=? WHERE "userId"=?`, userID, duplicate.id); err != nil {
			return "", err
		}
		if _, err = h.execTx(ctx, tx, `UPDATE "ActiveStream" SET "userId"=? WHERE "userId"=?`, userID, duplicate.id); err != nil {
			return "", err
		}
		if _, err = h.execTx(ctx, tx, `DELETE FROM "User" WHERE "id"=?`, duplicate.id); err != nil {
			return "", err
		}
	}
	return userID, tx.Commit()
}

func (h *Handler) upsertMedia(ctx context.Context, serverID string, p map[string]any, key, title, typ, collection string) (string, int64, int64, error) {
	key = normalizeID(key)
	if key == "" {
		return "", 0, 0, errors.New("empty Jellyfin media id")
	}
	duration := integerValue(p, "durationMs", "DurationMs")
	if duration <= 0 {
		ticks := integerValue(p, "runTimeTicks", "RunTimeTicks")
		if ticks > 0 {
			duration = ticks / 10000
		}
	}
	size := integerValue(p, "size", "Size")
	genres := stringArray(p, "genres", "Genres")
	directors := peopleNames(p, "people", "People", "Director")
	actors := peopleNames(p, "people", "People", "Actor")
	studios := stringArray(p, "studios", "Studios")
	id, err := newID()
	if err != nil {
		return "", 0, 0, err
	}
	var mediaID string
	arrayGenres, arrayDirectors, arrayActors, arrayStudios := databaseArrayValue(h.driver, genres), databaseArrayValue(h.driver, directors), databaseArrayValue(h.driver, actors), databaseArrayValue(h.driver, studios)
	var durValue, sizeValue any
	if duration > 0 {
		durValue = duration
	}
	if size > 0 {
		sizeValue = size
	}
	ids := jellyfinIDForms(key)
	rows, err := h.db.QueryContext(ctx, database.Bind(`SELECT "id","jellyfinMediaId" FROM "Media" WHERE "serverId"=? AND "jellyfinMediaId" IN (?,?) ORDER BY CASE WHEN "jellyfinMediaId"=? THEN 0 ELSE 1 END,"createdAt"`, h.driver), serverID, ids[0], ids[1], key)
	if err != nil {
		return "", 0, 0, err
	}
	type foundMedia struct{ id, jellyfinID string }
	var found []foundMedia
	for rows.Next() {
		var item foundMedia
		if err := rows.Scan(&item.id, &item.jellyfinID); err != nil {
			rows.Close()
			return "", 0, 0, err
		}
		found = append(found, item)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return "", 0, 0, err
	}
	if err := rows.Close(); err != nil {
		return "", 0, 0, err
	}
	args := []any{serverID, key, title, typ, nullableString(collection), nullableString(firstString(p, "libraryName", "LibraryName")), arrayGenres, nullableString(normalizeResolution(firstString(p, "resolution", "Resolution"))), durValue, sizeValue, arrayDirectors, arrayActors, arrayStudios, nullableString(firstString(p, "parentId", "ParentId")), nullableString(firstString(p, "artist", "Artist", "albumArtist", "AlbumArtist")), nullableTime(eventDate(p))}
	if len(found) == 0 {
		err = h.queryRow(ctx, `INSERT INTO "Media" ("id","serverId","jellyfinMediaId","title","type","collectionType","libraryName","genres","resolution","durationMs","size","directors","actors","studios","parentId","artist","dateAdded") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT("jellyfinMediaId","serverId") DO UPDATE SET "title"=excluded."title","type"=excluded."type","collectionType"=excluded."collectionType","libraryName"=excluded."libraryName","genres"=excluded."genres","resolution"=excluded."resolution","durationMs"=COALESCE(excluded."durationMs","Media"."durationMs"),"size"=COALESCE(excluded."size","Media"."size"),"directors"=excluded."directors","actors"=excluded."actors","studios"=excluded."studios","parentId"=excluded."parentId","artist"=excluded."artist","dateAdded"=COALESCE(excluded."dateAdded","Media"."dateAdded"),"updatedAt"=CURRENT_TIMESTAMP RETURNING "id"`, append([]any{id}, args...)...).Scan(&mediaID)
		return mediaID, duration, size, err
	}
	mediaID = found[0].id
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return "", 0, 0, err
	}
	defer tx.Rollback()
	if _, err = h.execTx(ctx, tx, `UPDATE "Media" SET "jellyfinMediaId"=?,"title"=?,"type"=?,"collectionType"=?,"libraryName"=?,"genres"=?,"resolution"=?,"durationMs"=COALESCE(?,"durationMs"),"size"=COALESCE(?,"size"),"directors"=?,"actors"=?,"studios"=?,"parentId"=?,"artist"=?,"dateAdded"=COALESCE(?,"dateAdded"),"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=?`, append(args[1:], mediaID)...); err != nil {
		return "", 0, 0, err
	}
	for _, duplicate := range found[1:] {
		if _, err = h.execTx(ctx, tx, `UPDATE "PlaybackHistory" SET "mediaId"=? WHERE "mediaId"=?`, mediaID, duplicate.id); err != nil {
			return "", 0, 0, err
		}
		if _, err = h.execTx(ctx, tx, `UPDATE "ActiveStream" SET "mediaId"=? WHERE "mediaId"=?`, mediaID, duplicate.id); err != nil {
			return "", 0, 0, err
		}
		if _, err = h.execTx(ctx, tx, `DELETE FROM "Media" WHERE "id"=?`, duplicate.id); err != nil {
			return "", 0, 0, err
		}
	}
	return mediaID, duration, size, tx.Commit()
}

func (h *Handler) libraryExcluded(ctx context.Context, serverID, library, collection, typ string) bool {
	var raw string
	query := `SELECT "excludedLibraries" FROM "GlobalSettings" WHERE "id"='global'`
	if h.driver == "postgres" {
		query = `SELECT COALESCE(to_json("excludedLibraries")::text,'[]') FROM "GlobalSettings" WHERE "id"='global'`
	}
	err := h.queryRow(ctx, query).Scan(&raw)
	if err != nil {
		return false
	}
	var excluded []string
	_ = json.Unmarshal([]byte(raw), &excluded)
	normalizedLibrary := normalizeLibraryIdentity(library)
	normalizedCollection := normalizeLibraryKey(collection)
	inferred := normalizeLibraryKey(inferLibrary(typ))
	for _, item := range excluded {
		if strings.HasPrefix(item, "srvlib|") {
			parts := strings.SplitN(strings.TrimPrefix(item, "srvlib|"), "|", 2)
			if len(parts) == 2 && strings.TrimSpace(parts[0]) != "" && len(parts[1]) > 0 {
				if scopedName, decodeErr := url.QueryUnescape(parts[1]); decodeErr == nil && strings.EqualFold(strings.TrimSpace(parts[0]), serverID) && normalizedLibrary != "" && normalizeLibraryIdentity(scopedName) == normalizedLibrary {
					return true
				}
			}
			continue
		}
		key := normalizeLibraryKey(item)
		if normalizedLibrary != "" && normalizedLibrary == normalizeLibraryIdentity(item) {
			return true
		}
		if key != "" && (key == normalizedCollection || key == inferred || key == normalizeLibraryKey(typ)) {
			return true
		}
	}
	return false
}

func (h *Handler) queryRow(ctx context.Context, q string, args ...any) *sql.Row {
	return h.db.QueryRowContext(ctx, database.Bind(q, h.driver), args...)
}
func (h *Handler) exec(ctx context.Context, q string, args ...any) (sql.Result, error) {
	return h.db.ExecContext(ctx, database.Bind(q, h.driver), args...)
}
func (h *Handler) execTx(ctx context.Context, tx *sql.Tx, q string, args ...any) (sql.Result, error) {
	return tx.ExecContext(ctx, database.Bind(q, h.driver), args...)
}
func (h *Handler) fail(w http.ResponseWriter, operation string, err error) {
	h.logger.Error(operation, "error", err)
	writeJSON(w, 500, map[string]string{"error": "Internal Server Error"})
}

func setCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Api-Key")
}
func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func newID() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16]), nil
}
func firstEnv(keys ...string) string {
	for _, key := range keys {
		if value := strings.TrimSpace(os.Getenv(key)); value != "" {
			return value
		}
	}
	return ""
}
func objectValue(p map[string]any, keys ...string) map[string]any {
	for _, key := range keys {
		if value, ok := p[key].(map[string]any); ok {
			return value
		}
	}
	return map[string]any{}
}
func arrayValue(p map[string]any, keys ...string) []any {
	for _, key := range keys {
		if value, ok := p[key].([]any); ok {
			return value
		}
	}
	return nil
}
func stringValue(p map[string]any, keys ...string) string {
	for _, key := range keys {
		if value, ok := p[key].(string); ok {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
func firstString(p map[string]any, keys ...string) string { return stringValue(p, keys...) }
func hasObjectKey(p map[string]any, keys ...string) bool {
	for _, key := range keys {
		if _, ok := p[key]; ok {
			return true
		}
	}
	return false
}
func integerValue(p map[string]any, keys ...string) int64 {
	for _, key := range keys {
		switch value := p[key].(type) {
		case json.Number:
			n, _ := value.Int64()
			if n == 0 {
				f, _ := value.Float64()
				if !math.IsInf(f, 0) && !math.IsNaN(f) {
					return int64(math.Round(f))
				}
			}
			return n
		case float64:
			if !math.IsInf(value, 0) && !math.IsNaN(value) && value >= math.MinInt64 && value <= math.MaxInt64 {
				return int64(math.Round(value))
			}
		case int64:
			return value
		case string:
			n, _ := strconv.ParseInt(strings.TrimSpace(value), 10, 64)
			return n
		}
	}
	return 0
}
func boolValue(p map[string]any, keys ...string) bool {
	for _, key := range keys {
		if v, ok := p[key].(bool); ok {
			return v
		}
	}
	return false
}
func parseRate(payload, session, metadata map[string]any) *float64 {
	for _, source := range []map[string]any{metadata, payload, session} {
		for _, key := range []string{"toRate", "rate", "playbackRate", "PlaybackRate", "playbackSpeed", "PlaybackSpeed", "speed", "Speed"} {
			var value float64
			switch raw := source[key].(type) {
			case json.Number:
				value, _ = raw.Float64()
			case float64:
				value = raw
			case string:
				value, _ = strconv.ParseFloat(strings.TrimPrefix(strings.TrimSpace(raw), "x"), 64)
			}
			if value >= 0.25 && value <= 4 && !math.IsNaN(value) && !math.IsInf(value, 0) {
				return &value
			}
		}
	}
	return nil
}
func positionLabel(ms int64) string {
	if ms < 0 {
		ms = 0
	}
	total := ms / 1000
	hours := total / 3600
	minutes := (total % 3600) / 60
	seconds := total % 60
	if hours > 0 {
		return fmt.Sprintf("%d:%02d:%02d", hours, minutes, seconds)
	}
	return fmt.Sprintf("%d:%02d", minutes, seconds)
}
func nullableString(v string) any {
	if strings.TrimSpace(v) == "" {
		return nil
	}
	return strings.TrimSpace(v)
}
func firstWord(v string) string {
	fields := strings.Fields(v)
	if len(fields) == 0 {
		return ""
	}
	return fields[0]
}
func nullableInt(v int64) any {
	if v == 0 {
		return nil
	}
	return v
}
func jsonText(v any) string {
	raw, err := json.Marshal(v)
	if err != nil {
		return "{}"
	}
	return string(raw)
}
func inferLibrary(typ string) string {
	switch normalizeLibraryKey(typ) {
	case "movie", "film", "films", "movies":
		return "movies"
	case "episode", "season", "series", "tv", "tvshows", "tvshow":
		return "tvshows"
	case "audio", "track", "musicalbum", "music":
		return "music"
	case "book", "audiobook", "comic", "comicbook":
		return "books"
	case "photo", "photos":
		return "photos"
	case "video", "homevideo", "homevideos":
		return "homevideos"
	default:
		return normalizeLibraryKey(typ)
	}
}

func normalizeLibraryIdentity(value string) string {
	return strings.Join(strings.Fields(strings.ToLower(strings.TrimSpace(value))), " ")
}

func normalizeResolution(value string) string {
	trimmed := strings.TrimSpace(value)
	lower := strings.ToLower(trimmed)
	if trimmed == "" || lower == "directplay" || lower == "transcode" || lower == "remux" || lower == "unknown" {
		return "Unknown"
	}
	switch {
	case resolution4K.MatchString(lower):
		return "4K"
	case resolution1080.MatchString(lower):
		return "1080p"
	case resolution1440.MatchString(lower):
		return "1440p"
	case resolution720.MatchString(lower):
		return "720p"
	case resolutionSD.MatchString(lower):
		return "SD"
	default:
		return trimmed
	}
}

func normalizeLibraryKey(value string) string {
	cleaned := strings.ToLower(strings.Map(func(r rune) rune {
		if r >= 'a' && r <= 'z' || r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, value))
	aliases := map[string]string{
		"movie": "movies", "film": "movies", "films": "movies", "filmsuhd": "filmsuhd", "moviesuhd": "filmsuhd", "film4k": "filmsuhd", "movie4k": "filmsuhd",
		"tv": "tvshows", "tvshow": "tvshows", "tvshows": "tvshows", "series": "tvshows", "show": "tvshows", "shows": "tvshows", "seriestv": "tvshows", "seriesuhd": "seriesuhd", "tvshowsuhd": "seriesuhd", "series4k": "seriesuhd", "tv4k": "seriesuhd",
		"music": "music", "musics": "music", "musique": "music", "musiques": "music", "album": "music", "albums": "music",
		"book": "books", "books": "books", "audiobook": "books", "audiobooks": "books", "comic": "books", "comics": "books", "comicbook": "books", "comicbooks": "books",
		"photo": "photos", "photos": "photos", "homevideo": "homevideos", "homevideos": "homevideos", "livetv": "livetv",
	}
	if alias, ok := aliases[cleaned]; ok {
		return alias
	}
	return cleaned
}

var compactJellyfinUUID = regexp.MustCompile(`^[a-fA-F0-9]{32}$`)
var dashedJellyfinUUID = regexp.MustCompile(`^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$`)
var invalidServerIDCharacter = regexp.MustCompile(`[^a-z0-9._-]`)
var resolution4K = regexp.MustCompile(`(?i)(4k|2160|3840|ultra[-\s]?hd|uhd)`)
var resolution1080 = regexp.MustCompile(`(?i)(1080p|1080|full[-\s]?hd|fhd)`)
var resolution1440 = regexp.MustCompile(`(?i)(1440p|2560x1440|qhd|2k)`)
var resolution720 = regexp.MustCompile(`(?i)(720p|720|\bhd\b)`)
var resolutionSD = regexp.MustCompile(`(?i)(480p|480|\bsd\b)`)

func normalizeID(raw string) string {
	value := strings.TrimSpace(raw)
	if compactJellyfinUUID.MatchString(value) {
		value = strings.ToLower(value)
		return value[:8] + "-" + value[8:12] + "-" + value[12:16] + "-" + value[16:20] + "-" + value[20:]
	}
	if dashedJellyfinUUID.MatchString(value) {
		return strings.ToLower(value)
	}
	return value
}
func jellyfinIDForms(value string) [2]string {
	compact := strings.ReplaceAll(strings.ToLower(value), "-", "")
	if compact == value {
		return [2]string{value, ""}
	}
	return [2]string{value, compact}
}
func normalizedIP(raw string) any {
	ip := net.ParseIP(strings.TrimSpace(strings.Split(raw, ",")[0]))
	if ip == nil {
		return nil
	}
	return ip.String()
}
func stringArray(p map[string]any, keys ...string) []string {
	for _, key := range keys {
		if values, ok := p[key].([]any); ok {
			out := make([]string, 0, len(values))
			for _, value := range values {
				if text, ok := value.(string); ok && strings.TrimSpace(text) != "" {
					out = append(out, strings.TrimSpace(text))
				}
			}
			return out
		}
	}
	return nil
}
func peopleNames(p map[string]any, keys ...string) []string {
	people := arrayValue(p, keys[:len(keys)-1]...)
	role := keys[len(keys)-1]
	out := []string{}
	for _, raw := range people {
		person, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		typ := firstString(person, "type", "Type")
		if strings.EqualFold(typ, role) {
			if name := firstString(person, "name", "Name"); name != "" {
				out = append(out, name)
			}
		}
	}
	return out
}
func databaseArrayValue(driver string, v []string) any {
	if v == nil {
		v = []string{}
	}
	if v == nil {
		v = []string{}
	}
	if driver == "postgres" {
		return v
	}
	raw, _ := json.Marshal(v)
	return string(raw)
}
func nullableTime(v time.Time) any {
	if v.IsZero() {
		return nil
	}
	return v.UTC().Format(time.RFC3339Nano)
}
func eventTime(p map[string]any) time.Time {
	for _, key := range []string{"observedAtUtc", "ObservedAtUtc", "timestamp", "Timestamp"} {
		switch value := p[key].(type) {
		case string:
			if t, err := time.Parse(time.RFC3339Nano, strings.TrimSpace(value)); err == nil {
				return t.UTC()
			}
		case json.Number:
			n, err := value.Float64()
			if err == nil {
				return unixTime(n)
			}
		case float64:
			return unixTime(value)
		}
	}
	return time.Time{}
}
func eventDate(p map[string]any) time.Time {
	for _, key := range []string{"dateAdded", "DateAdded"} {
		if text, ok := p[key].(string); ok {
			t, _ := time.Parse(time.RFC3339Nano, text)
			return t.UTC()
		}
	}
	return time.Time{}
}
func parseTime(value string) (time.Time, error) {
	for _, layout := range []string{time.RFC3339Nano, "2006-01-02 15:04:05.999999999-07:00", "2006-01-02 15:04:05"} {
		if t, err := time.Parse(layout, value); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("invalid time %q", value)
}
func unixTime(raw float64) time.Time {
	if raw > 1e10 {
		return time.UnixMilli(int64(raw)).UTC()
	}
	return time.Unix(int64(raw), int64((raw-math.Trunc(raw))*1e9)).UTC()
}
func schemaVersion(p map[string]any) (int, bool, bool) {
	for _, key := range []string{"eventSchemaVersion", "EventSchemaVersion", "schemaVersion", "SchemaVersion"} {
		v, exists := p[key]
		if !exists || v == nil {
			continue
		}
		switch raw := v.(type) {
		case json.Number:
			n, err := raw.Int64()
			return int(n), true, err == nil && n > 0 && int64(int(n)) == n
		case string:
			n, err := strconv.Atoi(strings.TrimSpace(raw))
			return n, true, err == nil && n > 0
		default:
			return 0, true, false
		}
	}
	return 0, false, false
}
func nonNegativeInteger(p map[string]any, keys ...string) any {
	v := integerValue(p, keys...)
	if !hasObjectKey(p, keys...) {
		return nil
	}
	if v < 0 {
		return int64(0)
	}
	return v
}

type limiterEntry struct {
	count int
	reset time.Time
}
type limiter struct {
	mu      sync.Mutex
	entries map[string]limiterEntry
	max     int
	window  time.Duration
	calls   uint64
}

func newLimiter() *limiter {
	max, window := 1200, 60*time.Second
	if n, err := strconv.Atoi(os.Getenv("PLUGIN_EVENT_RATE_LIMIT_MAX")); err == nil && n > 0 {
		max = n
	}
	if n, err := strconv.Atoi(os.Getenv("PLUGIN_EVENT_RATE_LIMIT_WINDOW_SECONDS")); err == nil && n > 0 && n <= 3600 {
		window = time.Duration(n) * time.Second
	}
	return &limiter{entries: map[string]limiterEntry{}, max: max, window: window}
}
func (l *limiter) consume(key string) (int, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	l.calls++
	if l.calls%128 == 0 || len(l.entries) > 20000 {
		for k, v := range l.entries {
			if !v.reset.After(now) {
				delete(l.entries, k)
			}
		}
	}
	entry, ok := l.entries[key]
	if !ok && len(l.entries) >= 50000 {
		return int(math.Ceil(l.window.Seconds())), false
	}
	if !ok || !entry.reset.After(now) {
		entry = limiterEntry{reset: now.Add(l.window)}
	}
	entry.count++
	l.entries[key] = entry
	if entry.count > l.max {
		return max(1, int(math.Ceil(time.Until(entry.reset).Seconds()))), false
	}
	return 0, true
}
func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	return host
}
func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
