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
	"github.com/maelmoreau21/jellytrack/v3/internal/database"
	"github.com/maelmoreau21/jellytrack/v3/internal/jellyfin"
	"github.com/maelmoreau21/jellytrack/v3/internal/requestip"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/oauth2"
)

const cookieName = "jellytrack_session"

type Manager struct {
	db                             *sql.DB
	driver, secret, username       string
	passwordHash                   []byte
	secure                         bool
	oidcIssuer                     string
	oidcClientID, oidcClientSecret string
	oidcUserGroup, oidcAdminGroup  string
	oidcEnabled                    bool
	oidcTimeout                    time.Duration
}
type Principal struct {
	Username  string `json:"username"`
	Role      string `json:"role"`
	CSRFToken string `json:"csrfToken,omitempty"`
	sessionID string
}
type loginBucket struct {
	count int
	reset time.Time
}

const oidcFlowCookie = "jellytrack_oidc_flow"

func (m *Manager) oidcStart(w http.ResponseWriter, r *http.Request) {
	if !m.oidcEnabled || m.secret == "" {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "Connexion OIDC non configurée."})
		return
	}
	provider, oauth, err := m.oidcConfig(r.Context())
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "Le fournisseur OIDC est inaccessible."})
		return
	}
	_ = provider
	state, err := randomValue(32)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "Erreur interne."})
		return
	}
	nonce, err := randomValue(32)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "Erreur interne."})
		return
	}
	verifier := oauth2.GenerateVerifier()
	flow := state + "." + nonce + "." + verifier
	http.SetCookie(w, &http.Cookie{Name: oidcFlowCookie, Value: flow, Path: "/api/auth/oidc", MaxAge: 600, HttpOnly: true, Secure: m.secure, SameSite: http.SameSiteLaxMode})
	query := oauth2.SetAuthURLParam("nonce", nonce)
	http.Redirect(w, r, oauth.AuthCodeURL(state, query, oauth2.S256ChallengeOption(verifier)), http.StatusFound)
}

func (m *Manager) oidcCallback(w http.ResponseWriter, r *http.Request) {
	clearFlow := func() {
		http.SetCookie(w, &http.Cookie{Name: oidcFlowCookie, Value: "", Path: "/api/auth/oidc", MaxAge: -1, HttpOnly: true, Secure: m.secure, SameSite: http.SameSiteLaxMode})
	}
	if !m.oidcEnabled || m.secret == "" {
		writeJSON(w, 503, map[string]string{"error": "Connexion OIDC non configurée."})
		return
	}
	cookie, err := r.Cookie(oidcFlowCookie)
	if err != nil {
		writeJSON(w, 400, map[string]string{"error": "État OIDC manquant."})
		return
	}
	parts := strings.Split(cookie.Value, ".")
	if len(parts) != 3 || !constantStringEqual(parts[0], r.URL.Query().Get("state")) || r.URL.Query().Get("code") == "" {
		clearFlow()
		writeJSON(w, 400, map[string]string{"error": "État OIDC invalide."})
		return
	}
	if provider, oauth, e := m.oidcConfig(r.Context()); e == nil {
		ctx, cancel := context.WithTimeout(r.Context(), m.oidcTimeout)
		defer cancel()
		token, e := oauth.Exchange(ctx, r.URL.Query().Get("code"), oauth2.VerifierOption(parts[2]))
		if e != nil {
			clearFlow()
			writeJSON(w, 401, map[string]string{"error": "Échange OIDC refusé."})
			return
		}
		raw, ok := token.Extra("id_token").(string)
		if !ok {
			clearFlow()
			writeJSON(w, 401, map[string]string{"error": "Jeton OIDC manquant."})
			return
		}
		idToken, e := provider.Verifier(&oidc.Config{ClientID: m.oidcClientID}).Verify(ctx, raw)
		if e != nil {
			clearFlow()
			writeJSON(w, 401, map[string]string{"error": "Jeton OIDC invalide."})
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
			writeJSON(w, 401, map[string]string{"error": "Vérification OIDC refusée."})
			return
		}
		username := first(claims.Username, claims.Email, claims.Name, claims.Subject)
		if username == "" {
			clearFlow()
			writeJSON(w, 403, map[string]string{"error": "Le profil OIDC ne fournit pas de nom."})
			return
		}
		role := ""
		for _, group := range claims.Groups {
			if m.oidcAdminGroup != "" && group == m.oidcAdminGroup {
				role = "admin"
				break
			}
			if m.oidcUserGroup != "" && group == m.oidcUserGroup {
				role = "user"
			}
		}
		if role == "" {
			clearFlow()
			writeJSON(w, 403, map[string]string{"error": "Accès refusé : aucun groupe JellyTrack autorisé."})
			return
		}
		if _, e = m.createSession(w, r, username, role); e != nil {
			clearFlow()
			writeJSON(w, 500, map[string]string{"error": "Impossible de créer la session."})
			return
		}
		clearFlow()
		http.Redirect(w, r, "/", http.StatusSeeOther)
		return
	}
	clearFlow()
	writeJSON(w, 502, map[string]string{"error": "Le fournisseur OIDC est inaccessible."})
}

func (m *Manager) oidcConfig(ctx context.Context) (*oidc.Provider, *oauth2.Config, error) {
	issuer := m.oidcIssuer
	if issuer == "" {
		return nil, nil, sql.ErrNoRows
	}
	ctx, cancel := context.WithTimeout(ctx, m.oidcTimeout)
	defer cancel()
	provider, err := oidc.NewProvider(ctx, issuer)
	if err != nil {
		return nil, nil, err
	}
	base := strings.TrimRight(strings.TrimSpace(os.Getenv("NEXTAUTH_URL")), "/")
	parsed, err := url.Parse(base)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "https" && parsed.Scheme != "http") || parsed.User != nil {
		return nil, nil, fmt.Errorf("NEXTAUTH_URL must be an absolute HTTP(S) URL")
	}
	config := &oauth2.Config{ClientID: m.oidcClientID, ClientSecret: m.oidcClientSecret, Endpoint: provider.Endpoint(), RedirectURL: base + "/api/auth/oidc/callback", Scopes: []string{oidc.ScopeOpenID, "profile", "email", "groups"}}
	return provider, config, nil
}

func (m *Manager) createSession(w http.ResponseWriter, r *http.Request, username, role string) (string, error) {
	idBytes := make([]byte, 32)
	if _, err := rand.Read(idBytes); err != nil {
		return "", err
	}
	id := base64.RawURLEncoding.EncodeToString(idBytes)
	expires := time.Now().UTC().Add(12 * time.Hour)
	if _, err := m.db.ExecContext(r.Context(), database.Bind(`INSERT INTO "AuthSession" ("id","username","role","expiresAt") VALUES (?,?,?,?)`, m.driver), id, username, role, expires.Format(time.RFC3339Nano)); err != nil {
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
	secret := secretValue(os.Getenv("NEXTAUTH_SECRET"), os.Getenv("AUTH_SECRET"), os.Getenv("JELLYTRACK_SECRET"))
	username := first(os.Getenv("JELLYTRACK_LOCAL_ADMIN_USER"), os.Getenv("JELLYGATE_LOCAL_ADMIN_USER"), "admin")
	password := first(os.Getenv("JELLYTRACK_LOCAL_ADMIN_PASSWORD"), os.Getenv("JELLYGATE_LOCAL_ADMIN_PASSWORD"))
	var hash []byte
	if strongPassword(username, password) && len(secret) >= 32 && !strings.HasPrefix(secret, "CHANGE_ME") {
		hash, _ = bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	}
	issuer := first(os.Getenv("OIDC_ISSUER"), os.Getenv("OIDC_URL"), os.Getenv("AUTHENTIK_URL"), os.Getenv("JELLYTRACK_AUTHENTIK_URL"))
	return &Manager{db: db, driver: driver, secret: secret, username: username, passwordHash: hash, secure: true, oidcIssuer: strings.TrimRight(issuer, "/"), oidcClientID: strings.TrimSpace(os.Getenv("OIDC_CLIENT_ID")), oidcClientSecret: os.Getenv("OIDC_CLIENT_SECRET"), oidcUserGroup: strings.TrimSpace(os.Getenv("OIDC_USER_GROUP")), oidcAdminGroup: strings.TrimSpace(os.Getenv("OIDC_ADMIN_GROUP")), oidcEnabled: strings.EqualFold(os.Getenv("OIDC_ENABLED"), "true") && issuer != "" && os.Getenv("OIDC_CLIENT_ID") != "" && os.Getenv("OIDC_CLIENT_SECRET") != "", oidcTimeout: 15 * time.Second}
}

func (m *Manager) Routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/auth/options", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]bool{"oidc": m.oidcEnabled})
	})
	mux.HandleFunc("POST /api/auth/login", m.login)
	mux.HandleFunc("GET /api/auth/me", m.me)
	mux.HandleFunc("POST /api/auth/logout", m.logout)
	mux.HandleFunc("GET /api/auth/oidc/start", m.oidcStart)
	mux.HandleFunc("GET /api/auth/oidc/callback", m.oidcCallback)
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
		Username string `json:"username"`
		Password string `json:"password"`
	}
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&input); err != nil || len(input.Username) > 128 || len(input.Password) > 1024 {
		writeJSON(w, 400, map[string]string{"error": "Requête invalide."})
		return
	}
	var extra any
	if err := dec.Decode(&extra); err != io.EOF {
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
	userOK := subtle.ConstantTimeCompare([]byte(input.Username), []byte(m.username)) == 1
	if userOK && len(m.passwordHash) > 0 && bcrypt.CompareHashAndPassword(m.passwordHash, []byte(input.Password)) == nil {
		csrf, err := m.createSession(w, r, m.username, "admin")
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
	if len(m.passwordHash) == 0 && userOK && strings.TrimSpace(os.Getenv("JELLYTRACK_LOCAL_ADMIN_PASSWORD")) != "" {
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
			csrf, e := m.createSession(w, r, user.Name, role)
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
		next.ServeHTTP(w, r)
	})
}

func (m *Manager) AdminMiddleware(next http.Handler) http.Handler {
	return m.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		principal, ok := m.authenticate(r)
		if !ok || principal.Role != "admin" {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "Droits administrateur requis."})
			return
		}
		next.ServeHTTP(w, r)
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
	var expires string
	err = m.db.QueryRowContext(r.Context(), database.Bind(`SELECT "username","role","expiresAt" FROM "AuthSession" WHERE "id"=?`, m.driver), id).Scan(&p.Username, &p.Role, &expires)
	if err != nil {
		return Principal{}, false
	}
	parsed, err := time.Parse(time.RFC3339Nano, expires)
	if err != nil || !parsed.After(time.Now()) || parsed.Unix() != expiry {
		return Principal{}, false
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
func sameOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return false
	}
	return strings.EqualFold(origin, "http://"+r.Host) || strings.EqualFold(origin, "https://"+r.Host)
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
