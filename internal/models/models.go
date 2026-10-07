// Package models defines the core database and domain data models for JellyTrack.
package models

import (
	"time"
)

// Server represents a configured Jellyfin media server.
type Server struct {
	ID                string    `json:"id"`
	JellyfinServerID  string    `json:"jellyfinServerId"`
	Name              string    `json:"name"`
	URL               string    `json:"url"`
	JellyfinAPIKey    *string   `json:"jellyfinApiKey,omitempty"`
	AllowAuthFallback bool      `json:"allowAuthFallback"`
	IsActive          bool      `json:"isActive"`
	CreatedAt         time.Time `json:"createdAt"`
	UpdatedAt         time.Time `json:"updatedAt"`
}

// User represents a Jellyfin user associated with a Server.
type User struct {
	ID             string     `json:"id"`
	ServerID       string     `json:"serverId"`
	JellyfinUserID string     `json:"jellyfinUserId"`
	Username       string     `json:"username"`
	IsActive       bool       `json:"isActive"`
	LastActive     *time.Time `json:"lastActive,omitempty"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`
}

// Media represents an item in the Jellyfin media catalog.
type Media struct {
	ID              string     `json:"id"`
	ServerID        string     `json:"serverId"`
	JellyfinMediaID string     `json:"jellyfinMediaId"`
	Title           string     `json:"title"`
	Type            string     `json:"type"` // e.g., "Movie", "Episode", "Track"
	CollectionType  *string    `json:"collectionType,omitempty"`
	LibraryName     *string    `json:"libraryName,omitempty"`
	Genres          []string   `json:"genres"`
	Resolution      *string    `json:"resolution,omitempty"`
	DurationMs      *int64     `json:"durationMs,omitempty"`
	Size            *int64     `json:"size,omitempty"`
	Directors       []string   `json:"directors"`
	Actors          []string   `json:"actors"`
	Studios         []string   `json:"studios"`
	ParentID        *string    `json:"parentId,omitempty"`
	Artist          *string    `json:"artist,omitempty"`
	DateAdded       *time.Time `json:"dateAdded,omitempty"`
	CreatedAt       time.Time  `json:"createdAt"`
	UpdatedAt       time.Time  `json:"updatedAt"`
}

// PlaybackHistory records a watched media session or completed download.
type PlaybackHistory struct {
	ID               string     `json:"id"`
	ServerID         string     `json:"serverId"`
	UserID           *string    `json:"userId,omitempty"`
	MediaID          string     `json:"mediaId"`
	PlayMethod       string     `json:"playMethod"`  // "DirectPlay", "Transcode", "Download", etc.
	EventSource      string     `json:"eventSource"` // "playback" or "download"
	SourceEventID    *string    `json:"sourceEventId,omitempty"`
	ClientName       *string    `json:"clientName,omitempty"`
	DeviceName       *string    `json:"deviceName,omitempty"`
	IPAddress        *string    `json:"ipAddress,omitempty"`
	Country          *string    `json:"country,omitempty"`
	City             *string    `json:"city,omitempty"`
	DurationWatched  int64      `json:"durationWatched"` // in seconds
	StartedAt        time.Time  `json:"startedAt"`
	EndedAt          *time.Time `json:"endedAt,omitempty"`
	AudioLanguage    *string    `json:"audioLanguage,omitempty"`
	AudioCodec       *string    `json:"audioCodec,omitempty"`
	SubtitleLanguage *string    `json:"subtitleLanguage,omitempty"`
	SubtitleCodec    *string    `json:"subtitleCodec,omitempty"`
	Bitrate          *int64     `json:"bitrate,omitempty"`
	PauseCount       int        `json:"pauseCount"`
	AudioChanges     int        `json:"audioChanges"`
	SubtitleChanges  int        `json:"subtitleChanges"`
	SeekCount        int        `json:"seekCount"`
	RewatchCount     int        `json:"rewatchCount"`
	SpeedChangeCount int        `json:"speedChangeCount"`
	MaxPlaybackRate  *float64   `json:"maxPlaybackRate,omitempty"`
}

// TelemetryEvent records an event during playback (pause, seek, audio/subtitles change, download, etc.).
type TelemetryEvent struct {
	ID         string    `json:"id"`
	ServerID   string    `json:"serverId"`
	PlaybackID string    `json:"playbackId"`
	EventType  string    `json:"eventType"`
	PositionMs int64     `json:"positionMs"`
	Metadata   *string   `json:"metadata,omitempty"` // JSON string
	CreatedAt  time.Time `json:"createdAt"`
}

// ActiveStream represents an ongoing playback session on a Jellyfin server.
type ActiveStream struct {
	ID               string    `json:"id"`
	ServerID         string    `json:"serverId"`
	SessionID        string    `json:"sessionId"`
	UserID           string    `json:"userId"`
	MediaID          string    `json:"mediaId"`
	PlaybackID       *string   `json:"playbackId,omitempty"`
	PlayMethod       string    `json:"playMethod"`
	ClientName       *string   `json:"clientName,omitempty"`
	DeviceName       *string   `json:"deviceName,omitempty"`
	IPAddress        *string   `json:"ipAddress,omitempty"`
	Country          *string   `json:"country,omitempty"`
	City             *string   `json:"city,omitempty"`
	VideoCodec       *string   `json:"videoCodec,omitempty"`
	AudioCodec       *string   `json:"audioCodec,omitempty"`
	TranscodeFPS     *float64  `json:"transcodeFps,omitempty"`
	Bitrate          *int64    `json:"bitrate,omitempty"`
	AudioLanguage    *string   `json:"audioLanguage,omitempty"`
	SubtitleLanguage *string   `json:"subtitleLanguage,omitempty"`
	SubtitleCodec    *string   `json:"subtitleCodec,omitempty"`
	PlaybackRate     *float64  `json:"playbackRate,omitempty"`
	PositionTicks    *int64    `json:"positionTicks,omitempty"`
	StartedAt        time.Time `json:"startedAt"`
	LastPingAt       time.Time `json:"lastPingAt"`
}

// GlobalSettings represents the application-wide configuration singleton.
type GlobalSettings struct {
	ID                            string     `json:"id"`
	DiscordWebhookURL             *string    `json:"discordWebhookUrl,omitempty"`
	DiscordAlertCondition         string     `json:"discordAlertCondition"`
	DiscordAlertsEnabled          bool       `json:"discordAlertsEnabled"`
	MaxConcurrentTranscodes       int        `json:"maxConcurrentTranscodes"`
	ExcludedLibraries             []string   `json:"excludedLibraries"`
	SyncCronHour                  int        `json:"syncCronHour"`
	SyncCronMinute                int        `json:"syncCronMinute"`
	BackupCronHour                int        `json:"backupCronHour"`
	BackupCronMinute              int        `json:"backupCronMinute"`
	DefaultLocale                 string     `json:"defaultLocale"`
	TimeFormat                    string     `json:"timeFormat"`
	WrappedVisible                bool       `json:"wrappedVisible"`
	WrappedPeriodEnabled          bool       `json:"wrappedPeriodEnabled"`
	WrappedStartMonth             int        `json:"wrappedStartMonth"`
	WrappedStartDay               int        `json:"wrappedStartDay"`
	WrappedEndMonth               int        `json:"wrappedEndMonth"`
	WrappedEndDay                 int        `json:"wrappedEndDay"`
	PluginAPIKey                  *string    `json:"pluginApiKey,omitempty"`
	PluginPreviousAPIKey          *string    `json:"pluginPreviousApiKey,omitempty"`
	PluginPreviousAPIKeyExpiresAt *time.Time `json:"pluginPreviousApiKeyExpiresAt,omitempty"`
	PluginKeyCreatedAt            *time.Time `json:"pluginKeyCreatedAt,omitempty"`
	PluginKeyExpiresAt            *time.Time `json:"pluginKeyExpiresAt,omitempty"`
	PluginKeyRotationDays         int        `json:"pluginKeyRotationDays"`
	PluginAutoRotateEnabled       bool       `json:"pluginAutoRotateEnabled"`
	PluginKeyRotationGraceHours   int        `json:"pluginKeyRotationGraceHours"`
	PluginLastSeen                *time.Time `json:"pluginLastSeen,omitempty"`
	PluginVersion                 *string    `json:"pluginVersion,omitempty"`
	PluginServerName              *string    `json:"pluginServerName,omitempty"`
	PluginTelemetrySettings       *string    `json:"pluginTelemetrySettings,omitempty"`
	AuthRememberThirtyDaysEnabled bool       `json:"authRememberThirtyDaysEnabled"`
	AuthSessionsRevokedAt         *time.Time `json:"authSessionsRevokedAt,omitempty"`
	ResolutionThresholds          *string    `json:"resolutionThresholds,omitempty"`
	SSOSettings                   *string    `json:"ssoSettings,omitempty"`
	UpdatedAt                     time.Time  `json:"updatedAt"`
}

// AdminAuditLog records security and administrative actions.
type AdminAuditLog struct {
	ID            string    `json:"id"`
	Action        string    `json:"action"`
	ActorUserID   *string   `json:"actorUserId,omitempty"`
	ActorUsername *string   `json:"actorUsername,omitempty"`
	Target        *string   `json:"target,omitempty"`
	IPAddress     *string   `json:"ipAddress,omitempty"`
	Details       *string   `json:"details,omitempty"` // JSON string
	CreatedAt     time.Time `json:"createdAt"`
}

// SystemHealthState represents the health status of system components.
type SystemHealthState struct {
	ID        string    `json:"id"`
	Monitor   string    `json:"monitor"` // JSON string
	Sync      string    `json:"sync"`    // JSON string
	Backup    string    `json:"backup"`  // JSON string
	UpdatedAt time.Time `json:"updatedAt"`
}

// SystemHealthEvent records health anomalies or system state changes.
type SystemHealthEvent struct {
	ID        string    `json:"id"`
	StateID   string    `json:"stateId"`
	Source    string    `json:"source"`
	Kind      string    `json:"kind"`
	Message   string    `json:"message"`
	Details   *string   `json:"details,omitempty"` // JSON string
	CreatedAt time.Time `json:"createdAt"`
}

// DailyStats aggregates viewing statistics per date, user, library, and media type.
type DailyStats struct {
	ID            string    `json:"id"`
	Date          time.Time `json:"date"`
	UserID        *string   `json:"userId,omitempty"`
	LibraryName   *string   `json:"libraryName,omitempty"`
	MediaType     *string   `json:"mediaType,omitempty"`
	TotalPlays    int       `json:"totalPlays"`
	TotalDuration int       `json:"totalDuration"` // seconds
	DirectPlays   int       `json:"directPlays"`
	Transcodes    int       `json:"transcodes"`
	UniqueMedia   int       `json:"uniqueMedia"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

// AuthSession represents an active user session.
type AuthSession struct {
	ID        string    `json:"id"`
	Username  string    `json:"username"`
	Role      string    `json:"role"` // "user" or "admin"
	ExpiresAt time.Time `json:"expiresAt"`
	CreatedAt time.Time `json:"createdAt"`
}
