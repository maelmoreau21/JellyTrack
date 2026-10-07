package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/maelmoreau21/jellytrack/v3/internal/database"
	"golang.org/x/crypto/bcrypt"
)

const cookieName = "jellytrack_session"

type Manager struct {
	db                       *sql.DB
	driver, secret, username string
	passwordHash             []byte
	secure                   bool
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

var loginMu sync.Mutex
var loginAttempts = map[string]loginBucket{}

func New(db *sql.DB, driver string) *Manager {
	secret := first(os.Getenv("NEXTAUTH_SECRET"), os.Getenv("AUTH_SECRET"), os.Getenv("JELLYTRACK_SECRET"))
	username := first(os.Getenv("JELLYTRACK_LOCAL_ADMIN_USER"), "admin")
	password := os.Getenv("JELLYTRACK_LOCAL_ADMIN_PASSWORD")
	var hash []byte
	if strongPassword(username, password) && len(secret) >= 32 && !strings.HasPrefix(secret, "CHANGE_ME") {
		hash, _ = bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	}
	return &Manager{db: db, driver: driver, secret: secret, username: username, passwordHash: hash, secure: true}
}

func (m *Manager) Routes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/auth/login", m.login)
	mux.HandleFunc("GET /api/auth/me", m.me)
	mux.HandleFunc("POST /api/auth/logout", m.logout)
}

func (m *Manager) login(w http.ResponseWriter, r *http.Request) {
	key := r.RemoteAddr
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
	if len(m.passwordHash) == 0 || m.secret == "" {
		writeJSON(w, 503, map[string]string{"error": "Connexion locale non configurée. Définissez un secret et un mot de passe administrateur fort."})
		return
	}
	userOK := subtle.ConstantTimeCompare([]byte(input.Username), []byte(m.username)) == 1
	passErr := bcrypt.CompareHashAndPassword(m.passwordHash, []byte(input.Password))
	if !userOK || passErr != nil {
		writeJSON(w, 401, map[string]string{"error": "Identifiants invalides."})
		return
	}
	if !sameOrigin(r) {
		writeJSON(w, 403, map[string]string{"error": "Origine refusée."})
		return
	}
	idBytes := make([]byte, 32)
	if _, err := rand.Read(idBytes); err != nil {
		writeJSON(w, 500, map[string]string{"error": "Erreur interne."})
		return
	}
	id := base64.RawURLEncoding.EncodeToString(idBytes)
	expires := time.Now().UTC().Add(12 * time.Hour)
	loginMu.Lock()
	delete(loginAttempts, key)
	loginMu.Unlock()
	if _, err := m.db.ExecContext(r.Context(), database.Bind(`INSERT INTO "AuthSession" ("id","username","role","expiresAt") VALUES (?,?,?,?)`, m.driver), id, m.username, "admin", expires.Format(time.RFC3339Nano)); err != nil {
		writeJSON(w, 500, map[string]string{"error": "Erreur interne."})
		return
	}
	csrf := m.csrf(id)
	w.Header().Set("Set-Cookie", (&http.Cookie{Name: cookieName, Value: m.sign(id, expires.Unix()), Path: "/", Expires: expires, HttpOnly: true, Secure: m.secure, SameSite: http.SameSiteLaxMode}).String())
	writeJSON(w, 200, Principal{Username: m.username, Role: "admin", CSRFToken: csrf})
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
