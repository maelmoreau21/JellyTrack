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
	AuthServerName      string `json:"authServerName,omitempty"`
	AuthServerIsPrimary *bool  `json:"authServerIsPrimary,omitempty"`
	sessionID           string
}

func (p Principal) IsAdmin() bool {
	return strings.EqualFold(p.Role, "admin")
}

type loginBucket struct {
	count int
	reset time.Time
}

const oidcFlowCookie = "jellytrack_oidc_flow"

func (m *Manager) oidcStart(w http.ResponseWriter, r *http.Request) {
	cfg := m.resolveOIDC(r.Context())
	if !cfg.enabled || m.secret == "" {
		http.Redirect(w, r, "/login?error=OAuthSignin", http.StatusSeeOther)
		return
	}
	provider, oauth, err := m.oidcConfigWith(r.Context(), cfg)
	if err != nil {
		http.Redirect(w, r, "/login?error=OAuthSignin", http.StatusSeeOther)
		return
	}
	_ = provider
	state, err := randomValue(32)
	if err != nil {
		http.Redirect(w, r, "/login?error=OAuthSignin", http.StatusSeeOther)
		return
	}
	nonce, err := randomValue(32)
	if err != nil {
		http.Redirect(w, r, "/login?error=OAuthSignin", http.StatusSeeOther)
		return
	}
	verifier := oauth2.GenerateVerifier()
	flow := state + "." + nonce + "." + verifier
	http.SetCookie(w, &http.Cookie{Name: oidcFlowCookie, Value: flow, Path: "/api/auth", MaxAge: 600, HttpOnly: true, Secure: m.secure, SameSite: http.SameSiteLaxMode})
	query := oauth2.SetAuthURLParam("nonce", nonce)
	http.Redirect(w, r, oauth.AuthCodeURL(state, query, oauth2.S256ChallengeOption(verifier)), http.StatusFound)
}

func (m *Manager) oidcCallback(w http.ResponseWriter, r *http.Request) {
	clearFlow := func() {
		http.SetCookie(w, &http.Cookie{Name: oidcFlowCookie, Value: "", Path: "/api/auth", MaxAge: -1, HttpOnly: true, Secure: m.secure, SameSite: http.SameSiteLaxMode})
	}
	cfg := m.resolveOIDC(r.Context())
	if !cfg.enabled || m.secret == "" {
		clearFlow()
		http.Redirect(w, r, "/login?error=OAuthSignin", http.StatusSeeOther)
		return
	}
	cookie, err := r.Cookie(oidcFlowCookie)
	if err != nil {
		clearFlow()
		http.Redirect(w, r, "/login?error=OAuthCallback", http.StatusSeeOther)
		return
	}
	parts := strings.Split(cookie.Value, ".")
	if len(parts) != 3 || !constantStringEqual(parts[0], r.URL.Query().Get("state")) || r.URL.Query().Get("code") == "" {
		clearFlow()
		http.Redirect(w, r, "/login?error=OAuthCallback", http.StatusSeeOther)
		return
	}
	if provider, oauth, e := m.oidcConfigWith(r.Context(), cfg); e == nil {
		ctx, cancel := context.WithTimeout(r.Context(), m.oidcTimeout)
		defer cancel()
		token, e := oauth.Exchange(ctx, r.URL.Query().Get("code"), oauth2.VerifierOption(parts[2]))
		if e != nil {
			clearFlow()
			http.Redirect(w, r, "/login?error=OAuthSignin", http.StatusSeeOther)
			return
		}
		raw, ok := token.Extra("id_token").(string)
		if !ok {
			clearFlow()
			http.Redirect(w, r, "/login?error=OAuthCallback", http.StatusSeeOther)
			return
		}
		idToken, e := provider.Verifier(&oidc.Config{ClientID: cfg.clientID}).Verify(ctx, raw)
		if e != nil {
			clearFlow()
			http.Redirect(w, r, "/login?error=OAuthCallback", http.StatusSeeOther)
			return
		}
		var claims struct {
			Nonce    string   `json:"nonce"`
			Subject  string   `json:"sub"`
			Username string   `json:"preferred_username"`
			Name     string   `json:"name"`
			Email    string   `json:"email"`
			Groups   []string `json:"groups"`
		}
		if e = idToken.Claims(&claims); e != nil || !constantStringEqual(claims.Nonce, parts[1]) {
			clearFlow()
			http.Redirect(w, r, "/login?error=OAuthCallback", http.StatusSeeOther)
			return
		}
		username := first(claims.Username, claims.Email, claims.Name, claims.Subject)
		if username == "" {
			clearFlow()
			http.Redirect(w, r, "/login?error=AccessDenied", http.StatusSeeOther)
			return
		}
		role := ""
		for _, group := range claims.Groups {
			if cfg.adminGroup != "" && group == cfg.adminGroup {
				role = "admin"
				break
			}
			if cfg.userGroup != "" && group == cfg.userGroup {
				role = "user"
			}
		}
		if role == "" {
			clearFlow()
			http.Redirect(w, r, "/login?error=AccessDeniedGroup", http.StatusSeeOther)
			return
		}
		if _, e = m.createSession(w, r, username, role, false); e != nil {
			clearFlow()
			http.Redirect(w, r, "/login?error=OAuthSignin", http.StatusSeeOther)
			return
		}
		clearFlow()
		http.Redirect(w, r, "/", http.StatusSeeOther)
		return
	}
	clearFlow()
	http.Redirect(w, r, "/login?error=OAuthSignin", http.StatusSeeOther)
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

	// If environment variables did not enable OIDC, check DB ssoSettings
	if (!cfg.enabled || cfg.issuer == "" || cfg.clientID == "") && m.db != nil {
		var raw sql.NullString
		_ = m.db.QueryRowContext(ctx, database.Bind(`SELECT "ssoSettings" FROM "GlobalSettings" WHERE "id"='global'`, m.driver)).Scan(&raw)
		if raw.Valid && raw.String != "" {
			var dbMap map[string]any
			if json.Unmarshal([]byte(raw.String), &dbMap) == nil {
				dbEnabled, _ := dbMap["enabled"].(bool)
				if dbEnabled {
					if u, ok := dbMap["url"].(string); ok && cfg.issuer == "" {
						cfg.issuer = strings.TrimRight(strings.TrimSpace(u), "/")
					}
					if cid, ok := dbMap["clientId"].(string); ok && cfg.clientID == "" {
						cfg.clientID = strings.TrimSpace(cid)
					}
					if cs, ok := dbMap["clientSecret"].(string); ok && cfg.clientSecret == "" {
						cfg.clientSecret = strings.TrimSpace(cs)
					}
					if ug, ok := dbMap["userGroup"].(string); ok && cfg.userGroup == "" {
						cfg.userGroup = strings.TrimSpace(ug)
					}
					if ag, ok := dbMap["adminGroup"].(string); ok && cfg.adminGroup == "" {
						cfg.adminGroup = strings.TrimSpace(ag)
					}
					if ar, ok := dbMap["autoRedirect"].(bool); ok {
						cfg.autoRedirect = ar
					}
					if cfg.issuer != "" && cfg.clientID != "" {
						cfg.enabled = true
					}
				}
			}
		}
	}
	return cfg
}

func (m *Manager) oidcConfigWith(ctx context.Context, cfg resolvedOIDCConfig) (*oidc.Provider, *oauth2.Config, error) {
	if cfg.issuer == "" {
		return nil, nil, sql.ErrNoRows
	}
	ctx, cancel := context.WithTimeout(ctx, m.oidcTimeout)
	defer cancel()
	provider, err := oidc.NewProvider(ctx, cfg.issuer)
	if err != nil {
		return nil, nil, err
	}
	base := strings.TrimRight(strings.TrimSpace(first(os.Getenv("JELLYTRACK_URL"), os.Getenv("AUTH_URL"))), "/")
	if base == "" {
		base = "http://localhost:3000"
	}
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
	if _, err := m.db.ExecContext(r.Context(), database.Bind(`INSERT INTO "AuthSession" ("id","username","role","expiresAt","createdAt") VALUES (?,?,?,?,?)`, m.driver), id, username, role, expires.Format(time.RFC3339Nano), nowStr); err != nil {
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
		oidcIssuer:       strings.TrimRight(issuer, "/"),
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
	mux.HandleFunc("GET /api/auth/options", func(w http.ResponseWriter, r *http.Request) {
		cfg := m.resolveOIDC(r.Context())
		hasLocal := len(m.passwordHash) > 0 ||
			strings.TrimSpace(os.Getenv("JELLYTRACK_LOCAL_ADMIN_PASSWORD")) != "" ||
			strings.TrimSpace(os.Getenv("LOCAL_ADMIN_PASSWORD")) != "" ||
			strings.TrimSpace(os.Getenv("JELLYGATE_LOCAL_ADMIN_PASSWORD")) != ""
		writeJSON(w, http.StatusOK, map[string]any{
			"oidc":         cfg.enabled,
			"autoRedirect": cfg.autoRedirect,
			"localAdmin":   hasLocal,
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

	var jfID string
	if m.db != nil {
		_ = m.db.QueryRowContext(r.Context(), database.Bind(`SELECT "id" FROM "User" WHERE LOWER("username") = LOWER(?) LIMIT 1`, m.driver), p.Username).Scan(&jfID)
	}

	writeJSON(w, 200, map[string]any{
		"user": map[string]any{
			"name":           p.Username,
			"username":       p.Username,
			"role":           p.Role,
			"isAdmin":        p.Role == "admin",
			"jellyfinUserId": jfID,
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
		Username   string `json:"username"`
		Password   string `json:"password"`
		RememberMe any    `json:"rememberMe"`
	}
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(&input); err != nil || len(input.Username) > 128 || len(input.Password) > 1024 {
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
		csrf, err := m.createSession(w, r, m.username, "admin", rememberBool)
		if err != nil {
			writeJSON(w, 500, map[string]string{"error": "Erreur interne."})
			return
		}
		loginMu.Lock()
		delete(loginAttempts, key)
		loginMu.Unlock()
		writeJSON(w, 200, Principal{Username: m.username, Role: "admin", CSRFToken: csrf})
		return
	}
	localPassEnv := first(os.Getenv("JELLYTRACK_LOCAL_ADMIN_PASSWORD"), os.Getenv("LOCAL_ADMIN_PASSWORD"), os.Getenv("JELLYGATE_LOCAL_ADMIN_PASSWORD"))
	if len(m.passwordHash) == 0 && userOK && strings.TrimSpace(localPassEnv) != "" {
		writeJSON(w, 503, map[string]string{"error": "Le mot de passe administrateur local est trop faible. Définissez un mot de passe de 12 caractères minimum, avec au moins trois types de caractères."})
		return
	}
	baseURL := first(os.Getenv("JELLYFIN_URL"))
	if baseURL != "" {
		ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
		user, err := jellyfin.Authenticate(ctx, baseURL, input.Username, input.Password)
		cancel()
		if err == nil {
			role := "user"
			if user.Policy.IsAdministrator {
				role = "admin"
			}
			csrf, e := m.createSession(w, r, user.Name, role, rememberBool)
			if e != nil {
				writeJSON(w, 500, map[string]string{"error": "Erreur interne."})
				return
			}
			loginMu.Lock()
			delete(loginAttempts, key)
			loginMu.Unlock()
			writeJSON(w, 200, Principal{Username: user.Name, Role: role, CSRFToken: csrf})
			return
		}
	}
	writeJSON(w, 401, map[string]string{"error": "Identifiants invalides."})
}

func (m *Manager) me(w http.ResponseWriter, r *http.Request) {
	p, ok := m.authenticate(r)
	if !ok {
		writeJSON(w, 401, map[string]string{"error": "Session requise."})
		return
	}
	p.CSRFToken = m.csrf(p.sessionID)
	if p.JellyfinUserID == "" && m.db != nil {
		var jfID string
		if err := m.db.QueryRowContext(r.Context(), database.Bind(`SELECT "id" FROM "User" WHERE LOWER("username") = LOWER(?) LIMIT 1`, m.driver), p.Username).Scan(&jfID); err == nil {
			p.JellyfinUserID = jfID
		}
	}
	writeJSON(w, 200, p)
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
		if !ok || principal.Role != "admin" {
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
	err = m.db.QueryRowContext(r.Context(), database.Bind(`SELECT "username","role","expiresAt","createdAt" FROM "AuthSession" WHERE "id"=?`, m.driver), id).Scan(&p.Username, &p.Role, &expires, &createdAt)
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
	return p, true
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
	if forwardedHost != "" {
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

