// Package auth implements local and OpenID Connect sessions.
package auth

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/maelmoreau21/jellytrack/internal/config"
	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/internal/jellyfin"
	"github.com/maelmoreau21/jellytrack/internal/requestip"
	"github.com/maelmoreau21/jellytrack/internal/security"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/oauth2"
)

const cookieName = "jellytrack_session"

type contextKey string

const PrincipalContextKey contextKey = "jellytrack_principal"

func PrincipalFromContext(ctx context.Context) (Principal, bool) {
	p, ok := ctx.Value(PrincipalContextKey).(Principal)
	return p, ok
}

type Manager struct {
	db                             *sql.DB
	driver, secret, username       string
	passwordHash                   []byte
	secure                         bool
	oidcIssuer                     string
	oidcClientID, oidcClientSecret string
	oidcUserGroup, oidcAdminGroup  string
	oidcEnabled                    bool
	oidcAutoRedirect               bool
	oidcTimeout                    time.Duration
}

type Principal struct {
	Username            string `json:"username"`
	Role                string `json:"role"`
	CSRFToken           string `json:"csrfToken,omitempty"`
	JellyfinUserID      string `json:"jellyfinUserId,omitempty"`
	AuthServerID        string `json:"authServerId,omitempty"`
	AuthMethod          string `json:"authMethod,omitempty"`
	OIDCIssuer          string `json:"oidcIssuer,omitempty"`
	OIDCSubject         string `json:"oidcSubject,omitempty"`
	OIDCAdminGroup      string `json:"oidcAdminGroup,omitempty"`
	IdentityVersion     int    `json:"identityVersion,omitempty"`
	AuthServerName      string `json:"authServerName,omitempty"`
	AuthServerIsPrimary *bool  `json:"authServerIsPrimary,omitempty"`
	sessionID           string
}

func (p Principal) IsAdmin() bool {
	return p.Role == "super_admin" || (p.Role == "admin" && p.AuthServerID == "" && p.AuthMethod != "oidc" && p.AuthMethod != "jellyfin")
}

// A server administrator never inherits global administration from Jellyfin.
func (p Principal) CanAdminServer(serverID string) bool {
	return p.IsAdmin() || (p.Role == "server_admin" && p.AuthServerID != "" && p.AuthServerID == serverID)
}

type loginBucket struct {
	count int
	reset time.Time
}

const oidcFlowCookie = "jellytrack_oidc_flow"

func (m *Manager) oidcStart(w http.ResponseWriter, r *http.Request) {
	cfg := m.resolveOIDC(r.Context())
	if !cfg.enabled || m.secret == "" {
		slog.Warn("OIDC start rejected", "enabled", cfg.enabled, "hasSecret", m.secret != "")
		http.Redirect(w, r, "/login?error=OAuthSignin", http.StatusSeeOther)
		return
	}
	provider, oauth, err := m.oidcConfigWith(r.Context(), cfg, r)
	if err != nil {
		slog.Error("OIDC provider initialization failed", "issuer", cfg.issuer, "error", err)
		http.Redirect(w, r, "/login?error=OAuthSignin", http.StatusSeeOther)
		return
	}
	_ = provider
	state, err := randomValue(32)
	if err != nil {
		slog.Error("OIDC state generation failed", "error", err)
		http.Redirect(w, r, "/login?error=OAuthSignin", http.StatusSeeOther)
		return
	}
	nonce, err := randomValue(32)
	if err != nil {
		slog.Error("OIDC nonce generation failed", "error", err)
		http.Redirect(w, r, "/login?error=OAuthSignin", http.StatusSeeOther)
		return
	}
	verifier := oauth2.GenerateVerifier()
	flow := state + "." + nonce + "." + verifier
	if server := r.URL.Query().Get("serverId"); server != "" {
		if !m.selectableServer(r.Context(), server) {
			writeJSON(w, 403, map[string]string{"error": "Authentification par ce serveur non autorisée."})
			return
		}
		flow += "." + base64.RawURLEncoding.EncodeToString([]byte(server))
	}
	http.SetCookie(w, &http.Cookie{Name: oidcFlowCookie, Value: flow, Path: "/api/auth", MaxAge: 600, HttpOnly: true, Secure: m.secure, SameSite: http.SameSiteLaxMode})
	query := oauth2.SetAuthURLParam("nonce", nonce)
	http.Redirect(w, r, oauth.AuthCodeURL(state, query, oauth2.S256ChallengeOption(verifier)), http.StatusFound)
}

func extractGroupsFromClaims(rawClaims map[string]any) []string {
	var results []string
	candidateKeys := []string{"groups", "user_groups", "roles", "memberOf", "group", "https://goauthentik.io/groups", "groups_list"}
	for _, key := range candidateKeys {
		if val, exists := rawClaims[key]; exists && val != nil {
			// Some providers emit one group as a scalar claim. Treat it as
			// one exact group name; never split spaces or commas into roles.
			switch value := val.(type) {
			case string:
				if name := strings.TrimSpace(value); name != "" {
					results = append(results, name)
				}
			case []string:
				for _, group := range value {
					if name := strings.TrimSpace(group); name != "" {
						results = append(results, name)
					}
				}
			}
			if list, ok := val.([]any); ok {
				for _, item := range list {
					if str, ok := item.(string); ok && strings.TrimSpace(str) != "" {
						results = append(results, strings.TrimSpace(str))
					} else if obj, ok := item.(map[string]any); ok {
						for _, prop := range []string{"name", "value", "id"} {
							if name, ok := obj[prop].(string); ok && strings.TrimSpace(name) != "" {
								results = append(results, strings.TrimSpace(name))
								break
							}
						}
					}
				}
			}
		}
	}
	if realmAccess, ok := rawClaims["realm_access"].(map[string]any); ok {
		if roles, ok := realmAccess["roles"].([]any); ok {
			for _, item := range roles {
				if str, ok := item.(string); ok && strings.TrimSpace(str) != "" {
					results = append(results, strings.TrimSpace(str))
				}
			}
		}
	}
	return results
}

func (m *Manager) oidcCallback(w http.ResponseWriter, r *http.Request) {
	clearFlow := func() {
		http.SetCookie(w, &http.Cookie{Name: oidcFlowCookie, Value: "", Path: "/api/auth", MaxAge: -1, HttpOnly: true, Secure: m.secure, SameSite: http.SameSiteLaxMode})
	}
	cfg := m.resolveOIDC(r.Context())
	if !cfg.enabled || m.secret == "" {
		clearFlow()
		slog.Warn("OIDC callback rejected: disabled or secret missing")
		http.Redirect(w, r, "/login?error=OAuthSignin", http.StatusSeeOther)
		return
	}
	cookie, err := r.Cookie(oidcFlowCookie)
	if err != nil {
		clearFlow()
		slog.Warn("OIDC callback missing flow cookie", "error", err)
		http.Redirect(w, r, "/login?error=OAuthCallback", http.StatusSeeOther)
		return
	}
	parts := strings.Split(cookie.Value, ".")
	if (len(parts) != 3 && len(parts) != 4) || !constantStringEqual(parts[0], r.URL.Query().Get("state")) || r.URL.Query().Get("code") == "" {
		clearFlow()
		slog.Warn("OIDC state mismatch or code missing")
		http.Redirect(w, r, "/login?error=OAuthCallback", http.StatusSeeOther)
		return
	}
	provider, oauth, e := m.oidcConfigWith(r.Context(), cfg, r)
	if e != nil {
		clearFlow()
		slog.Error("OIDC provider re-init failed on callback", "error", e)
		http.Redirect(w, r, "/login?error=OAuthSignin", http.StatusSeeOther)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), m.oidcTimeout)
	defer cancel()
	token, e := oauth.Exchange(ctx, r.URL.Query().Get("code"), oauth2.VerifierOption(parts[2]))
	if e != nil {
		clearFlow()
		slog.Error("OIDC code exchange failed", "error", e)
		http.Redirect(w, r, "/login?error=OAuthSignin", http.StatusSeeOther)
		return
	}
	raw, ok := token.Extra("id_token").(string)
	if !ok {
		clearFlow()
		slog.Error("OIDC missing id_token in token response")
		http.Redirect(w, r, "/login?error=OAuthCallback", http.StatusSeeOther)
		return
	}
	idToken, e := provider.Verifier(&oidc.Config{ClientID: cfg.clientID, SupportedSigningAlgs: []string{oidc.RS256}}).Verify(ctx, raw)
	if e != nil {
		clearFlow()
		slog.Error("OIDC id_token verification failed", "error", e)
		http.Redirect(w, r, "/login?error=OAuthCallback", http.StatusSeeOther)
		return
	}
	var rawClaims map[string]any
	if e = idToken.Claims(&rawClaims); e != nil {
		clearFlow()
		slog.Error("OIDC claims decoding failed", "error", e)
		http.Redirect(w, r, "/login?error=OAuthCallback", http.StatusSeeOther)
		return
	}
	nonce, _ := rawClaims["nonce"].(string)
	if !constantStringEqual(nonce, parts[1]) {
		clearFlow()
		slog.Warn("OIDC nonce mismatch")
		http.Redirect(w, r, "/login?error=OAuthCallback", http.StatusSeeOther)
		return
	}
	username := oidcProfileName(rawClaims)
	if username == "" {
		clearFlow()
		slog.Warn("OIDC missing username claim in token")
		http.Redirect(w, r, "/login?error=AccessDenied", http.StatusSeeOther)
		return
	}

	groups := extractGroupsFromClaims(rawClaims)

	// If groups were not in ID token, try fetching UserInfo from OIDC provider
	if len(groups) == 0 {
		if userInfo, err := provider.UserInfo(ctx, oauth2.StaticTokenSource(token)); err == nil {
			var userInfoClaims map[string]any
			if err := userInfo.Claims(&userInfoClaims); err == nil {
				groups = extractGroupsFromClaims(userInfoClaims)
				for k, v := range userInfoClaims {
					if _, exists := rawClaims[k]; !exists {
						rawClaims[k] = v
					}
				}
			}
		}
	}

	slog.Info("OIDC extracted claims", "username", username, "groups", groups, "requiredUserGroup", cfg.userGroup, "requiredAdminGroup", cfg.adminGroup)

	role := ""
	for _, group := range groups {
		if cfg.adminGroup != "" && strings.EqualFold(group, cfg.adminGroup) {
			role = "admin"
			break
		}
		if cfg.userGroup != "" && strings.EqualFold(group, cfg.userGroup) {
			role = "user"
		}
	}
	if role == "" && cfg.adminGroup == "" && cfg.userGroup == "" {
		role = "user"
	}

	if role == "" {
		clearFlow()
		ip := requestip.ClientIP(r.RemoteAddr, map[string]string{"X-Forwarded-For": r.Header.Get("X-Forwarded-For"), "X-Real-IP": r.Header.Get("X-Real-IP")})
		_ = security.LogAudit(r.Context(), m.db, m.driver, "SSO Login Denied (Unauthorized Group)", nil, &username, nil, &ip, map[string]any{
			"userGroups":         groups,
			"requiredUserGroup":  cfg.userGroup,
			"requiredAdminGroup": cfg.adminGroup,
		})
		slog.Warn("OIDC SSO Login Denied: user not in required group", "username", username, "userGroups", groups, "requiredUserGroup", cfg.userGroup, "requiredAdminGroup", cfg.adminGroup)
		http.Redirect(w, r, "/login?error=AccessDeniedGroup", http.StatusSeeOther)
		return
	}
	selectedServer := ""
	if len(parts) == 4 {
		decoded, err := base64.RawURLEncoding.DecodeString(parts[3])
		if err != nil || !m.selectableServer(r.Context(), string(decoded)) {
			clearFlow()
			http.Redirect(w, r, "/login?error=AccessDenied", http.StatusSeeOther)
			return
		}
		selectedServer = string(decoded)
	}
	account, resolvedServerID, policyErr := m.oidcAccount(r.Context(), rawClaims, selectedServer)
	if policyErr != nil {
		clearFlow()
		slog.Warn("OIDC account reconciliation failed", "username", username, "error", policyErr)
		http.Redirect(w, r, "/login?error=AccessDenied", http.StatusSeeOther)
		return
	}
	if cfg.adminGroup == "" && cfg.userGroup == "" && account.Policy.IsAdministrator {
		role = "admin"
	}
	oidcAdminGroup := ""
	if role == "admin" && cfg.adminGroup != "" {
		// This grant comes from a verified provider claim matching the operator's
		// configured admin group, not from a Jellyfin server administrator flag.
		role = "super_admin"
		oidcAdminGroup = cfg.adminGroup
	} else if role == "admin" {
		role = "server_admin"
	}
	if globalIdentityAllowed(resolvedServerID, account.ID) {
		role = "super_admin"
	}
	username, resolvedJfID := account.Name, account.ID
	if e = m.upsertUser(r.Context(), stableUserID(resolvedServerID, resolvedJfID), resolvedServerID, resolvedJfID, username, time.Now().UTC().Format(time.RFC3339Nano)); e != nil {
		clearFlow()
		slog.Error("OIDC user upsert failed", "username", username, "error", e)
		http.Redirect(w, r, "/login?error=OAuthSignin", http.StatusSeeOther)
		return
	}
	if _, e = m.createSessionIdentity(w, r, Principal{Username: username, Role: role, JellyfinUserID: resolvedJfID, AuthServerID: resolvedServerID, AuthMethod: "oidc", OIDCIssuer: idToken.Issuer, OIDCSubject: idToken.Subject, OIDCAdminGroup: oidcAdminGroup}, false); e != nil {
		clearFlow()
		slog.Error("OIDC session identity creation failed", "error", e)
		http.Redirect(w, r, "/login?error=OAuthSignin", http.StatusSeeOther)
		return
	}

	ip := requestip.ClientIP(r.RemoteAddr, map[string]string{"X-Forwarded-For": r.Header.Get("X-Forwarded-For"), "X-Real-IP": r.Header.Get("X-Real-IP")})
	_ = security.LogAudit(r.Context(), m.db, m.driver, "SSO Login successful", &resolvedJfID, &username, nil, &ip, map[string]any{
		"isAdmin":  role == "super_admin",
		"groups":   groups,
		"provider": "oidc",
	})
	slog.Info("OIDC SSO Login successful", "username", username, "role", role, "jellyfinUserId", resolvedJfID)

	clearFlow()
	http.Redirect(w, r, "/", http.StatusSeeOther)
}

type resolvedOIDCConfig struct {
	enabled      bool
	issuer       string
	clientID     string
	clientSecret string
	userGroup    string
	adminGroup   string
	autoRedirect bool
}

func (m *Manager) resolveOIDC(ctx context.Context) resolvedOIDCConfig {
	cfg := resolvedOIDCConfig{
		enabled:      m.oidcEnabled,
		issuer:       m.oidcIssuer,
		clientID:     m.oidcClientID,
		clientSecret: m.oidcClientSecret,
		userGroup:    m.oidcUserGroup,
		adminGroup:   m.oidcAdminGroup,
		autoRedirect: m.oidcAutoRedirect,
	}

	if value, set := config.EnvironmentOverride("", "OIDC_ENABLED"); set {
		cfg.enabled = config.EnvironmentBool(value)
	}
	cfg.issuer, _ = config.EnvironmentOverride(cfg.issuer, "OIDC_ISSUER", "OIDC_URL", "AUTHENTIK_URL", "JELLYTRACK_AUTHENTIK_URL")
	cfg.clientID, _ = config.EnvironmentOverride(cfg.clientID, "OIDC_CLIENT_ID")
	cfg.clientSecret, _ = config.EnvironmentOverride(cfg.clientSecret, "OIDC_CLIENT_SECRET")
	cfg.userGroup, _ = config.EnvironmentOverride(cfg.userGroup, "OIDC_USER_GROUP")
	cfg.adminGroup, _ = config.EnvironmentOverride(cfg.adminGroup, "OIDC_ADMIN_GROUP")
	if value, set := config.EnvironmentOverride("", "OIDC_AUTO_REDIRECT", "OIDC_AUTO_LOGIN"); set {
		cfg.autoRedirect = config.EnvironmentBool(value)
	}
	return cfg
}

func detectBaseURL(r *http.Request) string {
	base := strings.TrimRight(strings.TrimSpace(first(os.Getenv("JELLYTRACK_URL"), os.Getenv("AUTH_URL"), os.Getenv("NEXTAUTH_URL"))), "/")
	if base != "" && !strings.Contains(base, "localhost:3000") && !strings.Contains(base, "127.0.0.1:3000") {
		return base
	}
	if r != nil {
		host := ""
		if requestip.TrustedPeer(r.RemoteAddr) {
			host = strings.TrimSpace(r.Header.Get("X-Forwarded-Host"))
		}
		if host == "" {
			host = r.Host
		}
		if idx := strings.Index(host, ","); idx != -1 {
			host = strings.TrimSpace(host[:idx])
		}
		proto := ""
		if requestip.TrustedPeer(r.RemoteAddr) {
			proto = strings.TrimSpace(r.Header.Get("X-Forwarded-Proto"))
		}
		if proto == "" {
			if r.TLS != nil {
				proto = "https"
			} else {
				proto = "http"
			}
		}
		if idx := strings.Index(proto, ","); idx != -1 {
			proto = strings.TrimSpace(proto[:idx])
		}
		if host != "" {
			return proto + "://" + host
		}
	}
	if base != "" {
		return base
	}
	return "http://localhost:3000"
}

func (m *Manager) oidcConfigWith(ctx context.Context, cfg resolvedOIDCConfig, req ...*http.Request) (*oidc.Provider, *oauth2.Config, error) {
	if cfg.issuer == "" {
		return nil, nil, sql.ErrNoRows
	}
	ctx, cancel := context.WithTimeout(ctx, m.oidcTimeout)
	defer cancel()
	provider, err := oidc.NewProvider(ctx, cfg.issuer)
	if err != nil {
		// Tolerant fallback: Authentik and some OIDC providers strictly differentiate
		// between with/without trailing slash (e.g. "/path" vs "/path/").
		altIssuer := cfg.issuer
		if strings.HasSuffix(altIssuer, "/") {
			altIssuer = strings.TrimRight(altIssuer, "/")
		} else {
			altIssuer = altIssuer + "/"
		}
		if altProvider, altErr := oidc.NewProvider(ctx, altIssuer); altErr == nil {
			provider = altProvider
			err = nil
		} else {
			return nil, nil, err
		}
	}
	var r *http.Request
	if len(req) > 0 {
		r = req[0]
	}
	base := detectBaseURL(r)
	parsed, err := url.Parse(base)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "https" && parsed.Scheme != "http") || parsed.User != nil {
		return nil, nil, fmt.Errorf("JELLYTRACK_URL must be an absolute HTTP(S) URL")
	}
	redirectURL := base + "/api/auth/oidc/callback"
	config := &oauth2.Config{
		ClientID:     cfg.clientID,
		ClientSecret: cfg.clientSecret,
		Endpoint:     provider.Endpoint(),
		RedirectURL:  redirectURL,
		Scopes:       []string{oidc.ScopeOpenID, "profile", "email", "groups"},
	}
	return provider, config, nil
}

func (m *Manager) createSession(w http.ResponseWriter, r *http.Request, username, role string, rememberMe ...bool) (string, error) {
	return m.createSessionIdentity(w, r, Principal{Username: username, Role: role}, rememberMe...)
}

func (m *Manager) createSessionIdentity(w http.ResponseWriter, r *http.Request, principal Principal, rememberMe ...bool) (string, error) {
	principal.IdentityVersion = 2
	idBytes := make([]byte, 32)
	if _, err := rand.Read(idBytes); err != nil {
		return "", err
	}
	id := base64.RawURLEncoding.EncodeToString(idBytes)

	// Check if 30-day session retention is enabled
	duration := 24 * time.Hour
	var rememberThirty bool
	_ = m.db.QueryRowContext(r.Context(), database.Bind(`SELECT "authRememberThirtyDaysEnabled" FROM "GlobalSettings" WHERE "id"='global'`, m.driver)).Scan(&rememberThirty)
	rem := len(rememberMe) > 0 && rememberMe[0]
	if rem || rememberThirty {
		duration = 30 * 24 * time.Hour
	}

	expires := time.Now().UTC().Add(duration)
	nowStr := time.Now().UTC().Format(time.RFC3339Nano)
	identity, err := json.Marshal(principal)
	if err != nil {
		return "", err
	}
	if _, err := m.db.ExecContext(r.Context(), database.Bind(`INSERT INTO "AuthSession" ("id","username","role","expiresAt","createdAt","identity") VALUES (?,?,?,?,?,?)`, m.driver), id, principal.Username, principal.Role, expires.Format(time.RFC3339Nano), nowStr, string(identity)); err != nil {
		return "", err
	}
	http.SetCookie(w, &http.Cookie{Name: cookieName, Value: m.sign(id, expires.Unix()), Path: "/", Expires: expires, HttpOnly: true, Secure: m.secure, SameSite: http.SameSiteLaxMode})
	return m.csrf(id), nil
}

func randomValue(n int) (string, error) {
	value := make([]byte, n)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(value), nil
}

func constantStringEqual(a, b string) bool {
	return len(a) == len(b) && subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

var loginMu sync.Mutex
var loginAttempts = map[string]loginBucket{}

func New(db *sql.DB, driver string) *Manager {
	config.LoadDotEnv()
	secret := secretValue(os.Getenv("JELLYTRACK_SECRET"), os.Getenv("AUTH_SECRET"))
	username := first(os.Getenv("JELLYTRACK_LOCAL_ADMIN_USER"), os.Getenv("LOCAL_ADMIN_USER"), os.Getenv("JELLYGATE_LOCAL_ADMIN_USER"), "admin")
	password := first(os.Getenv("JELLYTRACK_LOCAL_ADMIN_PASSWORD"), os.Getenv("LOCAL_ADMIN_PASSWORD"), os.Getenv("JELLYGATE_LOCAL_ADMIN_PASSWORD"))
	var hash []byte
	if strongPassword(username, password) && len(secret) >= 32 && !strings.HasPrefix(secret, "CHANGE_ME") {
		hash, _ = bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	}
	issuer := first(os.Getenv("OIDC_ISSUER"), os.Getenv("OIDC_URL"), os.Getenv("AUTHENTIK_URL"), os.Getenv("JELLYTRACK_AUTHENTIK_URL"))
	oidcEnvRaw := strings.TrimSpace(os.Getenv("OIDC_ENABLED"))
	oidcEnv := strings.EqualFold(oidcEnvRaw, "true") || oidcEnvRaw == "1" || strings.EqualFold(oidcEnvRaw, "yes") || strings.EqualFold(oidcEnvRaw, "on")
	clientID := strings.TrimSpace(first(os.Getenv("OIDC_CLIENT_ID"), "jellytrack"))
	autoRedirRaw := first(os.Getenv("OIDC_AUTO_REDIRECT"), os.Getenv("OIDC_AUTO_LOGIN"))
	autoRedir := strings.EqualFold(autoRedirRaw, "true") || autoRedirRaw == "1"

	return &Manager{
		db:               db,
		driver:           driver,
		secret:           secret,
		username:         username,
		passwordHash:     hash,
		secure:           true,
		oidcIssuer:       strings.TrimSpace(issuer),
		oidcClientID:     clientID,
		oidcClientSecret: os.Getenv("OIDC_CLIENT_SECRET"),
		oidcUserGroup:    strings.TrimSpace(os.Getenv("OIDC_USER_GROUP")),
		oidcAdminGroup:   strings.TrimSpace(os.Getenv("OIDC_ADMIN_GROUP")),
		oidcEnabled:      oidcEnv || (issuer != ""),
		oidcAutoRedirect: autoRedir,
		oidcTimeout:      15 * time.Second,
	}
}

func (m *Manager) Routes(mux *http.ServeMux) {
	mux.Handle("GET /api/me/accounts", m.Middleware(http.HandlerFunc(m.linkedAccounts)))
	mux.Handle("POST /api/me/accounts/proof", m.Middleware(http.HandlerFunc(m.accountProof)))
	mux.Handle("POST /api/me/accounts/link", m.Middleware(http.HandlerFunc(m.linkAccount)))
	mux.Handle("DELETE /api/me/accounts/{id}", m.Middleware(http.HandlerFunc(m.unlinkAccount)))
	mux.HandleFunc("GET /api/auth/options", func(w http.ResponseWriter, r *http.Request) {
		cfg := m.resolveOIDC(r.Context())
		hasLocal := len(m.passwordHash) > 0 ||
			strings.TrimSpace(os.Getenv("JELLYTRACK_LOCAL_ADMIN_PASSWORD")) != "" ||
			strings.TrimSpace(os.Getenv("LOCAL_ADMIN_PASSWORD")) != "" ||
			strings.TrimSpace(os.Getenv("JELLYGATE_LOCAL_ADMIN_PASSWORD")) != ""
		writeJSON(w, http.StatusOK, map[string]any{
			"jellyfin":       jellyfinLoginEnabled(),
			"servers":        m.loginServers(r.Context()),
			"oidc":           cfg.enabled,
			"ssoButtonLabel": m.ssoButtonLabel(r.Context()),
			"autoRedirect":   cfg.autoRedirect,
			"localAdmin":     hasLocal,
		})
	})
	mux.HandleFunc("GET /api/auth/sso/config", func(w http.ResponseWriter, r *http.Request) {
		cfg := m.resolveOIDC(r.Context())
		writeJSON(w, http.StatusOK, map[string]any{
			"enabled":      cfg.enabled,
			"autoRedirect": cfg.autoRedirect,
			"issuer":       cfg.issuer,
			"clientId":     cfg.clientID,
		})
	})
	mux.HandleFunc("GET /api/auth/status", func(w http.ResponseWriter, r *http.Request) {
		p, ok := m.authenticate(r)
		if ok {
			writeJSON(w, http.StatusOK, map[string]any{
				"authenticated": true,
				"username":      p.Username,
				"role":          p.Role,
				"isAdmin":       p.IsAdmin(),
			})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"authenticated": false})
	})
	mux.HandleFunc("POST /api/auth/login", m.login)
	mux.HandleFunc("GET /api/auth/me", m.me)
	mux.HandleFunc("POST /api/auth/logout", m.logout)
	mux.HandleFunc("POST /api/auth/signout", m.logout)
	mux.HandleFunc("GET /api/auth/oidc/start", m.oidcStart)
	mux.HandleFunc("GET /api/auth/oidc/callback", m.oidcCallback)
	mux.HandleFunc("GET /api/auth/callback/oidc", m.oidcCallback)
	mux.HandleFunc("GET /api/auth/callback/sso", m.oidcCallback)

	// Session, CSRF, and provider metadata endpoints
	mux.HandleFunc("GET /api/auth/session", m.authSession)
	mux.HandleFunc("GET /api/auth/csrf", m.authCSRF)
	mux.HandleFunc("GET /api/auth/providers", m.authProviders)
}

func (m *Manager) authSession(w http.ResponseWriter, r *http.Request) {
	p, ok := m.authenticate(r)
	if !ok {
		writeJSON(w, 200, map[string]any{})
		return
	}
	var expiresStr string
	_ = m.db.QueryRowContext(r.Context(), database.Bind(`SELECT "expiresAt" FROM "AuthSession" WHERE "id"=?`, m.driver), p.sessionID).Scan(&expiresStr)

	resolvedJfID := p.JellyfinUserID
	if identity, err := ResolveAccount(r.Context(), m.db, m.driver, p); err == nil {
		resolvedJfID = identity.JellyfinUserID
		p.AuthServerID = identity.ServerID
	}
	writeJSON(w, 200, map[string]any{
		"user": map[string]any{
			"name":           p.Username,
			"username":       p.Username,
			"role":           p.Role,
			"isAdmin":        p.IsAdmin(),
			"jellyfinUserId": resolvedJfID,
			"authServerId":   p.AuthServerID,
		},
		"expires": expiresStr,
	})
}

func (m *Manager) authCSRF(w http.ResponseWriter, r *http.Request) {
	p, ok := m.authenticate(r)
	token := ""
	if ok {
		token = m.csrf(p.sessionID)
	} else {
		token = hex.EncodeToString([]byte("anonymous-csrf"))
	}
	writeJSON(w, 200, map[string]string{"csrfToken": token})
}

func (m *Manager) authProviders(w http.ResponseWriter, r *http.Request) {
	cfg := m.resolveOIDC(r.Context())
	hasLocal := len(m.passwordHash) > 0 ||
		strings.TrimSpace(os.Getenv("JELLYTRACK_LOCAL_ADMIN_PASSWORD")) != "" ||
		strings.TrimSpace(os.Getenv("LOCAL_ADMIN_PASSWORD")) != "" ||
		strings.TrimSpace(os.Getenv("JELLYGATE_LOCAL_ADMIN_PASSWORD")) != ""

	providers := map[string]any{
		"credentials": map[string]any{
			"id":   "credentials",
			"name": "Credentials",
			"type": "credentials",
		},
	}
	if !jellyfinLoginEnabled() {
		delete(providers, "credentials")
	}
	if hasLocal {
		providers["local-credentials"] = map[string]any{
			"id":   "local-credentials",
			"name": "Local Admin",
			"type": "credentials",
		}
	}
	if cfg.enabled {
		providers["oidc"] = map[string]any{
			"id":          "oidc",
			"name":        "SSO",
			"type":        "oauth",
			"signinUrl":   "/api/auth/oidc/start",
			"callbackUrl": "/api/auth/callback/oidc",
		}
	}
	writeJSON(w, 200, providers)
}

func (m *Manager) login(w http.ResponseWriter, r *http.Request) {
	key := requestip.ClientIP(r.RemoteAddr, map[string]string{"X-Forwarded-For": r.Header.Get("X-Forwarded-For"), "X-Real-IP": r.Header.Get("X-Real-IP")})
	loginMu.Lock()
	bucket := loginAttempts[key]
	now := time.Now()
	if bucket.reset.Before(now) {
		bucket = loginBucket{reset: now.Add(15 * time.Minute)}
	}
	if bucket.count >= 5 {
		loginAttempts[key] = bucket
		loginMu.Unlock()
		w.Header().Set("Retry-After", "900")
		writeJSON(w, 429, map[string]string{"error": "Trop de tentatives. Réessayez dans 15 minutes."})
		return
	}
	bucket.count++
	loginAttempts[key] = bucket
	if len(loginAttempts) > 2048 {
		for k, b := range loginAttempts {
			if b.reset.Before(now) {
				delete(loginAttempts, k)
			}
		}
	}
	loginMu.Unlock()
	r.Body = http.MaxBytesReader(w, r.Body, 8192)
	var input struct {
		ServerID   string `json:"serverId"`
		Username   string `json:"username"`
		Password   string `json:"password"`
		RememberMe any    `json:"rememberMe"`
	}
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(&input); err != nil || len(input.Username) > 128 || len(input.Password) > 1024 || len(input.ServerID) > 128 {
		writeJSON(w, 400, map[string]string{"error": "Requête invalide."})
		return
	}
	var extra any
	if err := dec.Decode(&extra); err != io.EOF && err != nil {
		writeJSON(w, 400, map[string]string{"error": "Requête invalide."})
		return
	}
	if m.secret == "" {
		writeJSON(w, 503, map[string]string{"error": "Définissez un secret de session d’au moins 32 caractères."})
		return
	}
	if !sameOrigin(r) {
		writeJSON(w, 403, map[string]string{"error": "Origine refusée."})
		return
	}

	rememberBool := false
	if b, ok := input.RememberMe.(bool); ok {
		rememberBool = b
	} else if s, ok := input.RememberMe.(string); ok {
		rememberBool = strings.EqualFold(s, "true") || s == "1"
	}

	userOK := subtle.ConstantTimeCompare([]byte(input.Username), []byte(m.username)) == 1
	if userOK && len(m.passwordHash) > 0 && bcrypt.CompareHashAndPassword(m.passwordHash, []byte(input.Password)) == nil {
		isPrimary := true
		csrf, err := m.createSessionIdentity(w, r, Principal{Username: m.username, Role: "super_admin", JellyfinUserID: "local-admin", AuthServerName: "Local Admin", AuthServerIsPrimary: &isPrimary, AuthMethod: "local-admin"}, rememberBool)
		if err != nil {
			writeJSON(w, 500, map[string]string{"error": "Erreur interne."})
			return
		}
		loginMu.Lock()
		delete(loginAttempts, key)
		loginMu.Unlock()
		localAdminID := "local-admin"
		_ = security.LogAudit(r.Context(), m.db, m.driver, "Local Admin login successful", &localAdminID, &m.username, nil, &key, map[string]any{"authType": "local-admin"})
		isPrim := true
		writeJSON(w, 200, Principal{
			Username:            m.username,
			Role:                "super_admin",
			CSRFToken:           csrf,
			JellyfinUserID:      "local-admin",
			AuthServerName:      "Local Admin",
			AuthServerIsPrimary: &isPrim,
		})
		return
	}
	localPassEnv := first(os.Getenv("JELLYTRACK_LOCAL_ADMIN_PASSWORD"), os.Getenv("LOCAL_ADMIN_PASSWORD"), os.Getenv("JELLYGATE_LOCAL_ADMIN_PASSWORD"))
	if len(m.passwordHash) == 0 && userOK && strings.TrimSpace(localPassEnv) != "" {
		writeJSON(w, 503, map[string]string{"error": "Le mot de passe administrateur local est trop faible. Définissez un mot de passe de 12 caractères minimum, avec au moins trois types de caractères."})
		return
	}

	if userOK && len(m.passwordHash) > 0 {
		writeJSON(w, 401, map[string]string{"error": "Identifiants invalides."})
		return
	}

	if !jellyfinLoginEnabled() {
		writeJSON(w, 403, map[string]string{"error": "La connexion Jellyfin classique est désactivée. Utilisez le SSO."})
		return
	}

	type serverCandidate struct {
		id                string
		name              string
		url               string
		apiKey            string
		isPrimary         bool
		allowAuthFallback bool
	}
	var candidates []serverCandidate
	seenURLs := make(map[string]bool)

	primaryURL := strings.TrimRight(strings.TrimSpace(first(os.Getenv("JELLYFIN_URL"))), "/")
	primaryName := strings.TrimSpace(os.Getenv("JELLYFIN_SERVER_NAME"))
	if primaryName == "" {
		primaryName = "Primary Jellyfin"
	}
	if primaryURL != "" {
		candidates = append(candidates, serverCandidate{
			name:      primaryName,
			url:       primaryURL,
			apiKey:    first(os.Getenv("JELLYFIN_API_KEY"), os.Getenv("JELLYTRACK_JELLYFIN_API_KEY")),
			isPrimary: true,
		})
		seenURLs[strings.ToLower(primaryURL)] = true
	}

	if m.db != nil {
		rows, err := m.db.QueryContext(r.Context(), `SELECT "id", "name", "url", COALESCE("jellyfinApiKey",''), "allowAuthFallback" FROM "Server" WHERE "isActive" = TRUE ORDER BY "createdAt","id"`)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var sID, sName, sURL, sKey string
				var allowFallback bool
				if err := rows.Scan(&sID, &sName, &sURL, &sKey, &allowFallback); err == nil {
					norm := strings.ToLower(strings.TrimRight(strings.TrimSpace(sURL), "/"))
					if norm == "" {
						continue
					}
					if !seenURLs[norm] {
						seenURLs[norm] = true
						candidates = append(candidates, serverCandidate{
							id:                sID,
							name:              sName,
							url:               strings.TrimRight(strings.TrimSpace(sURL), "/"),
							apiKey:            sKey,
							isPrimary:         len(candidates) == 0,
							allowAuthFallback: allowFallback,
						})
					} else {
						for i := range candidates {
							if strings.EqualFold(strings.TrimRight(strings.TrimSpace(candidates[i].url), "/"), strings.TrimRight(strings.TrimSpace(sURL), "/")) && candidates[i].id == "" {
								candidates[i].id = sID
								if candidates[i].apiKey == "" {
									candidates[i].apiKey = sKey
								}
							}
						}
					}
				}
			}
		}
	}

	if input.ServerID != "" {
		selected := []serverCandidate{}
		for _, candidate := range candidates {
			if candidate.id == input.ServerID && (candidate.isPrimary || candidate.allowAuthFallback) {
				selected = append(selected, candidate)
			}
		}
		if len(selected) != 1 {
			writeJSON(w, 403, map[string]string{"error": "Authentification par ce serveur non autorisée."})
			return
		}
		candidates = selected
	}
	var authUser *jellyfin.AuthenticatedUser
	var authCandidate *serverCandidate

	for i := range candidates {
		c := &candidates[i]
		if !c.isPrimary {
			continue
		}
		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		u, denied, err := authenticateLocal(ctx, c.url, c.apiKey, input.Username, input.Password)
		cancel()
		if denied {
			writeJSON(w, 403, map[string]string{"error": "Connexion par mot de passe refusée. Utilisez le SSO pour les comptes LDAP ; la politique Jellyfin doit être vérifiable."})
			return
		}
		if err == nil {
			authUser = &u
			authCandidate = c
			break
		}
	}

	if authUser == nil {
		for i := range candidates {
			c := &candidates[i]
			if c.isPrimary || !c.allowAuthFallback {
				continue
			}
			ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
			u, denied, err := authenticateLocal(ctx, c.url, c.apiKey, input.Username, input.Password)
			cancel()
			if denied {
				writeJSON(w, 403, map[string]string{"error": "Connexion par mot de passe refusée."})
				return
			}
			if err == nil {
				authUser = &u
				authCandidate = c
				break
			}
		}
	}

	if authUser != nil && authCandidate != nil {
		role := "user"
		if authUser.Policy.IsAdministrator {
			role = "server_admin"
		}
		if globalIdentityAllowed(authCandidate.id, authUser.ID) {
			role = "super_admin"
		}
		isPrimary := authCandidate.isPrimary
		csrf, e := m.createSessionIdentity(w, r, Principal{Username: authUser.Name, Role: role, JellyfinUserID: authUser.ID, AuthServerID: authCandidate.id, AuthServerName: authCandidate.name, AuthServerIsPrimary: &isPrimary, AuthMethod: "jellyfin"}, rememberBool)
		if e != nil {
			writeJSON(w, 500, map[string]string{"error": "Erreur interne."})
			return
		}
		loginMu.Lock()
		delete(loginAttempts, key)
		loginMu.Unlock()

		srvID := authCandidate.id
		if srvID != "" && m.db != nil {
			nowIso := time.Now().UTC().Format(time.RFC3339Nano)
			stableUID := stableUserID(srvID, authUser.ID)
			_ = m.upsertUser(r.Context(), stableUID, srvID, authUser.ID, authUser.Name, nowIso)
		}

		_ = security.LogAudit(r.Context(), m.db, m.driver, "Login successful", &authUser.ID, &authUser.Name, nil, &key, map[string]any{
			"server":    authCandidate.name,
			"isPrimary": authCandidate.isPrimary,
		})

		isPrim := authCandidate.isPrimary
		writeJSON(w, 200, Principal{
			Username:            authUser.Name,
			Role:                role,
			CSRFToken:           csrf,
			JellyfinUserID:      authUser.ID,
			AuthServerID:        authCandidate.id,
			AuthServerName:      authCandidate.name,
			AuthServerIsPrimary: &isPrim,
		})
		return
	}

	_ = security.LogAudit(r.Context(), m.db, m.driver, "Login failed", nil, &input.Username, nil, &key, map[string]any{"reason": "bad_credentials"})
	writeJSON(w, 401, map[string]string{"error": "Identifiants invalides."})
}

func (m *Manager) me(w http.ResponseWriter, r *http.Request) {
	p, ok := m.authenticate(r)
	if !ok {
		writeJSON(w, 401, map[string]string{"error": "Session requise."})
		return
	}
	p.CSRFToken = m.csrf(p.sessionID)
	if identity, err := ResolveAccount(r.Context(), m.db, m.driver, p); err == nil {
		p.JellyfinUserID, p.AuthServerID = identity.JellyfinUserID, identity.ServerID
		if p.AuthServerName == "" {
			p.AuthServerName = identity.ServerName
		}
	}
	writeJSON(w, 200, p)
}

func (m *Manager) upsertUser(ctx context.Context, id, serverID, jfUserID, username, lastActive string) error {
	if forms := JellyfinIDForms(jfUserID); len(forms) == 2 {
		rows, err := m.db.QueryContext(ctx, database.Bind(`SELECT "id","jellyfinUserId" FROM "User" WHERE "serverId"=? AND LOWER("jellyfinUserId") IN (?,?) LIMIT 2`, m.driver), serverID, forms[0], forms[1])
		if err != nil {
			return err
		}
		matches := 0
		var existingID, existingJFID string
		for rows.Next() {
			if err := rows.Scan(&existingID, &existingJFID); err != nil {
				rows.Close()
				return err
			}
			matches++
		}
		queryErr := rows.Err()
		rows.Close()
		if queryErr != nil {
			return queryErr
		}
		if matches > 1 {
			return fmt.Errorf("ambiguous Jellyfin user identity")
		}
		if matches == 1 {
			id, jfUserID = existingID, existingJFID
		}
	}
	query := `INSERT INTO "User" ("id", "serverId", "jellyfinUserId", "username", "lastActive", "isActive", "updatedAt")
VALUES (?, ?, ?, ?, ?, TRUE, CURRENT_TIMESTAMP)
ON CONFLICT("jellyfinUserId", "serverId") DO UPDATE SET
  "username" = excluded."username",
  "lastActive" = COALESCE(excluded."lastActive", "User"."lastActive"),
  "isActive" = TRUE,
  "updatedAt" = CURRENT_TIMESTAMP`
	_, err := m.db.ExecContext(ctx, database.Bind(query, m.driver), id, serverID, jfUserID, username, lastActive)
	return err
}

func (m *Manager) logout(w http.ResponseWriter, r *http.Request) {
	p, ok := m.authenticate(r)
	if !ok {
		writeJSON(w, 401, map[string]string{"error": "Session requise."})
		return
	}
	if !m.checkCSRF(r, p) {
		writeJSON(w, 403, map[string]string{"error": "Jeton CSRF invalide."})
		return
	}
	_, _ = m.db.ExecContext(r.Context(), database.Bind(`DELETE FROM "AuthSession" WHERE "id"=?`, m.driver), p.sessionID)
	http.SetCookie(w, &http.Cookie{Name: cookieName, Value: "", Path: "/", Expires: time.Unix(0, 0), MaxAge: -1, HttpOnly: true, Secure: m.secure, SameSite: http.SameSiteLaxMode})
	writeJSON(w, 200, map[string]bool{"ok": true})
}

func (m *Manager) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p, ok := m.authenticate(r)
		if !ok {
			writeJSON(w, 401, map[string]string{"error": "Session requise."})
			return
		}
		if r.Method != "GET" && r.Method != "HEAD" && r.Method != "OPTIONS" && !m.checkCSRF(r, p) {
			writeJSON(w, 403, map[string]string{"error": "Jeton CSRF invalide."})
			return
		}
		ctx := context.WithValue(r.Context(), PrincipalContextKey, p)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (m *Manager) AdminMiddleware(next http.Handler) http.Handler {
	return m.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		principal, ok := m.authenticate(r)
		if !ok || !principal.IsAdmin() {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "Droits administrateur requis."})
			return
		}
		ctx := context.WithValue(r.Context(), PrincipalContextKey, principal)
		next.ServeHTTP(w, r.WithContext(ctx))
	}))
}

func (m *Manager) authenticate(r *http.Request) (Principal, bool) {
	c, err := r.Cookie(cookieName)
	if err != nil {
		return Principal{}, false
	}
	id, expiry, ok := m.verify(c.Value)
	if !ok {
		return Principal{}, false
	}
	var p Principal
	var expires, createdAt string
	var identity sql.NullString
	err = m.db.QueryRowContext(r.Context(), database.Bind(`SELECT "username","role","expiresAt","createdAt","identity" FROM "AuthSession" WHERE "id"=?`, m.driver), id).Scan(&p.Username, &p.Role, &expires, &createdAt, &identity)
	if err != nil {
		return Principal{}, false
	}
	parsed, err := time.Parse(time.RFC3339Nano, expires)
	if err != nil || !parsed.After(time.Now()) || parsed.Unix() != expiry {
		return Principal{}, false
	}

	// Check if global sessions revocation occurred after this session's creation
	var revokedAt sql.NullString
	_ = m.db.QueryRowContext(r.Context(), database.Bind(`SELECT "authSessionsRevokedAt" FROM "GlobalSettings" WHERE "id"='global'`, m.driver)).Scan(&revokedAt)
	if revokedAt.Valid && revokedAt.String != "" {
		if rTime, rErr := parseTimeFlex(revokedAt.String); rErr == nil {
			if cTime, cErr := parseTimeFlex(createdAt); cErr == nil {
				if cTime.Before(rTime) {
					// Session was revoked
					_, _ = m.db.ExecContext(r.Context(), database.Bind(`DELETE FROM "AuthSession" WHERE "id"=?`, m.driver), id)
					return Principal{}, false
				}
			}
		}
	}

	p.sessionID = id
	if identity.Valid {
		var stored Principal
		if json.Unmarshal([]byte(identity.String), &stored) == nil {
			p.JellyfinUserID, p.AuthServerID, p.AuthServerName, p.AuthServerIsPrimary = stored.JellyfinUserID, stored.AuthServerID, stored.AuthServerName, stored.AuthServerIsPrimary
			p.IdentityVersion = stored.IdentityVersion
			p.AuthMethod, p.OIDCIssuer, p.OIDCSubject = stored.AuthMethod, stored.OIDCIssuer, stored.OIDCSubject
			p.OIDCAdminGroup = stored.OIDCAdminGroup
		}
	}
	// Pre-policy sessions may have bypassed SSO; require a fresh login.
	if p.IdentityVersion < 2 {
		return Principal{}, false
	}
	if p.Role == "admin" && (p.AuthServerID != "" || p.AuthMethod == "oidc" || p.AuthMethod == "jellyfin") {
		p.Role = "server_admin"
	}
	if p.Role == "super_admin" && p.AuthMethod != "local-admin" && !globalIdentityAllowed(p.AuthServerID, p.JellyfinUserID) && !m.oidcAdminAllowed(r.Context(), p) {
		p.Role = "user"
	}
	return p, true
}

// Match synchronisation IDs; a prefix of hex-encoded input collides for users
// sharing a server prefix and can panic when IDs are short.
func stableUserID(serverID, userID string) string {
	sum := sha256.Sum256([]byte(serverID + ":" + userID))
	return "usr_" + hex.EncodeToString(sum[:16])
}

func (m *Manager) sign(id string, expiry int64) string {
	payload := id + "." + base64.RawURLEncoding.EncodeToString([]byte(time.Unix(expiry, 0).UTC().Format(time.RFC3339)))
	mac := hmac.New(sha256.New, []byte(m.secret))
	mac.Write([]byte(payload))
	return payload + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (m *Manager) verify(value string) (string, int64, bool) {
	parts := strings.Split(value, ".")
	if len(parts) != 3 || m.secret == "" {
		return "", 0, false
	}
	payload := parts[0] + "." + parts[1]
	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return "", 0, false
	}
	mac := hmac.New(sha256.New, []byte(m.secret))
	mac.Write([]byte(payload))
	want := mac.Sum(nil)
	if len(sig) != len(want) || subtle.ConstantTimeCompare(sig, want) != 1 {
		return "", 0, false
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "", 0, false
	}
	t, err := time.Parse(time.RFC3339, string(raw))
	if err != nil || !t.After(time.Now()) {
		return "", 0, false
	}
	return parts[0], t.Unix(), true
}

func (m *Manager) csrf(id string) string {
	mac := hmac.New(sha256.New, []byte(m.secret))
	mac.Write([]byte("csrf:" + id))
	return hex.EncodeToString(mac.Sum(nil))
}

func (m *Manager) checkCSRF(r *http.Request, p Principal) bool {
	given := r.Header.Get("X-CSRF-Token")
	want := m.csrf(p.sessionID)
	return len(given) == len(want) && subtle.ConstantTimeCompare([]byte(given), []byte(want)) == 1 && sameOrigin(r)
}

func extractOrigin(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return ""
	}
	scheme := u.Scheme
	if scheme == "" {
		scheme = "http"
	}
	return strings.ToLower(scheme + "://" + u.Host)
}

func sameOrigin(r *http.Request) bool {
	originHeader := r.Header.Get("Origin")
	if originHeader == "" {
		originHeader = r.Header.Get("Referer")
	}
	if originHeader == "" {
		return strings.EqualFold(os.Getenv("ALLOW_MISSING_ORIGIN_FOR_MUTATIONS"), "true")
	}

	requestOrigin := extractOrigin(originHeader)
	if requestOrigin == "" {
		return false
	}

	// Check against Host header
	if strings.EqualFold(requestOrigin, "http://"+r.Host) || strings.EqualFold(requestOrigin, "https://"+r.Host) {
		return true
	}

	// Check against X-Forwarded-Host
	forwardedHost := strings.TrimSpace(r.Header.Get("X-Forwarded-Host"))
	if forwardedHost != "" && requestip.TrustedPeer(r.RemoteAddr) {
		for _, fh := range strings.Split(forwardedHost, ",") {
			fh = strings.TrimSpace(fh)
			if strings.EqualFold(requestOrigin, "http://"+fh) || strings.EqualFold(requestOrigin, "https://"+fh) {
				return true
			}
		}
	}

	// Check against trusted environment origins
	checkEnv := func(envKey string) bool {
		val := strings.TrimSpace(os.Getenv(envKey))
		if val == "" {
			return false
		}
		for _, item := range strings.Split(val, ",") {
			o := extractOrigin(item)
			if o != "" && strings.EqualFold(requestOrigin, o) {
				return true
			}
		}
		return false
	}

	if checkEnv("JELLYTRACK_URL") || checkEnv("AUTH_URL") || checkEnv("AUTH_TRUSTED_ORIGIN") || checkEnv("AUTH_TRUSTED_ORIGINS") || checkEnv("JELLYGATE_URL") {
		return true
	}

	return false
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func first(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func secretValue(values ...string) string {
	for _, v := range values {
		v = strings.TrimSpace(v)
		if len(v) >= 32 && !strings.HasPrefix(v, "CHANGE_ME") {
			return v
		}
	}
	return ""
}

func strongPassword(username, password string) bool {
	if len(password) < 12 || len(password) > 1024 || strings.EqualFold(password, username) {
		return false
	}
	classes := 0
	var lower, upper, digit, symbol bool
	for _, r := range password {
		switch {
		case r >= 'a' && r <= 'z':
			lower = true
		case r >= 'A' && r <= 'Z':
			upper = true
		case r >= '0' && r <= '9':
			digit = true
		default:
			symbol = true
		}
	}
	for _, ok := range []bool{lower, upper, digit, symbol} {
		if ok {
			classes++
		}
	}
	return classes >= 3
}

func parseTimeFlex(s string) (time.Time, error) {
	formats := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02 15:04:05.999999999-07:00",
		"2006-01-02 15:04:05.999999999",
		"2006-01-02 15:04:05",
		"2006-01-02T15:04:05",
	}
	for _, f := range formats {
		if t, err := time.Parse(f, s); err == nil {
			return t, nil
		}
	}
	return time.Parse(time.RFC3339, s)
}
