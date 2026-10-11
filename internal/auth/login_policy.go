package auth

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/config"
	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/internal/jellyfin"
)

func jellyfinLoginEnabled() bool {
	value, set := config.EnvironmentOverride("true", "JELLYFIN_AUTH_ENABLED")
	return !set || config.EnvironmentBool(value)
}

func ldapSSOOnly() bool {
	value, set := config.EnvironmentOverride("true", "LDAP_SSO_ONLY")
	return !set || config.EnvironmentBool(value)
}

func passwordProviderAllowed(provider string) bool {
	return provider == jellyfin.LocalAuthenticationProvider || (!ldapSSOOnly() && provider == jellyfin.LDAPAuthenticationProvider)
}

// A positive password result is insufficient: Jellyfin may delegate to LDAP.
// Metadata failures are terminal, including on the primary server, so fallback
// cannot turn an unverifiable or SSO-only identity into a password session.
func authenticateLocal(ctx context.Context, baseURL, apiKey, username, password string) (jellyfin.AuthenticatedUser, bool, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	client, err := jellyfin.New(baseURL, apiKey)
	if err != nil {
		return jellyfin.AuthenticatedUser{}, true, err
	}
	users, err := client.AuthenticationUsers(ctx)
	if err != nil {
		return jellyfin.AuthenticatedUser{}, true, err
	}
	var match *jellyfin.AuthenticatedUser
	for i := range users {
		if strings.EqualFold(users[i].Name, username) {
			if match != nil {
				return jellyfin.AuthenticatedUser{}, true, fmt.Errorf("ambiguous identity")
			}
			match = &users[i]
		}
	}
	if match == nil {
		return jellyfin.AuthenticatedUser{}, false, fmt.Errorf("invalid credentials")
	}
	if match.ID == "" || match.Policy.IsDisabled || !passwordProviderAllowed(match.Policy.AuthenticationProviderID) {
		return jellyfin.AuthenticatedUser{}, true, fmt.Errorf("password login forbidden")
	}
	user, err := jellyfin.Authenticate(ctx, baseURL, username, password)
	if err != nil {
		return user, false, err
	}
	if !sameJellyfinID(user.ID, match.ID) {
		return user, true, fmt.Errorf("identity changed")
	}
	// Re-read with the administrative API key; ordinary login responses can omit policy.
	current, err := client.AuthenticationUser(ctx, user.ID)
	if err != nil || current.Name == "" || !sameJellyfinID(current.ID, match.ID) || current.Policy.IsDisabled || !passwordProviderAllowed(current.Policy.AuthenticationProviderID) || current.Policy.AuthenticationProviderID != match.Policy.AuthenticationProviderID {
		return user, true, fmt.Errorf("unverifiable local identity")
	}
	return current, false, nil
}

func sameJellyfinID(a, b string) bool {
	if a == "" || b == "" {
		return false
	}
	return JellyfinIDForms(a)[0] == JellyfinIDForms(b)[0]
}

// Called only with claims from the verified ID token. The IdP administrator
// must own these claims; user-editable profile fields are not identity proof.
func (m *Manager) oidcAccount(ctx context.Context, claims map[string]any) (jellyfin.AuthenticatedUser, string, error) {
	serverID, _ := claims["jellyfin_server_id"].(string)
	userID, _ := claims["jellyfin_user_id"].(string)
	subject, _ := claims["sub"].(string)
	if subject == "" {
		return jellyfin.AuthenticatedUser{}, "", fmt.Errorf("missing stable identity claims: sub is required")
	}

	// 1. If explicit serverID and userID claims are provided, verify them directly
	if serverID != "" && userID != "" {
		var baseURL, apiKey string
		err := m.db.QueryRowContext(ctx, database.Bind(`SELECT "url",COALESCE("jellyfinApiKey",'') FROM "Server" WHERE "id"=? AND "isActive"=TRUE`, m.driver), serverID).Scan(&baseURL, &apiKey)
		if err != nil {
			return jellyfin.AuthenticatedUser{}, "", err
		}
		if strings.EqualFold(strings.TrimRight(baseURL, "/"), strings.TrimRight(os.Getenv("JELLYFIN_URL"), "/")) {
			apiKey = first(os.Getenv("JELLYFIN_API_KEY"), os.Getenv("JELLYTRACK_JELLYFIN_API_KEY"), apiKey)
		}
		client, err := jellyfin.New(baseURL, apiKey)
		if err != nil {
			return jellyfin.AuthenticatedUser{}, "", err
		}
		ctxTimeout, cancel := context.WithTimeout(ctx, 10*time.Second)
		defer cancel()
		user, err := client.AuthenticationUser(ctxTimeout, userID)
		if err != nil || !sameJellyfinID(user.ID, userID) || user.Name == "" || user.Policy.IsDisabled || (user.Policy.AuthenticationProviderID != jellyfin.LDAPAuthenticationProvider && (ldapSSOOnly() || user.Policy.AuthenticationProviderID != jellyfin.LocalAuthenticationProvider)) {
			return jellyfin.AuthenticatedUser{}, "", fmt.Errorf("SSO requires verified Jellyfin identity and allowed authentication provider")
		}
		return user, serverID, nil
	}

	// 2. Automatic reconciliation fallback: Find matching Jellyfin user by OIDC username/email/name
	preferredUsername, _ := claims["preferred_username"].(string)
	email, _ := claims["email"].(string)
	name, _ := claims["name"].(string)
	targetName := first(preferredUsername, email, name, subject)
	if targetName == "" {
		return jellyfin.AuthenticatedUser{}, "", fmt.Errorf("missing username in claims")
	}

	// Query active servers
	rows, err := m.db.QueryContext(ctx, `SELECT "id", "url", COALESCE("jellyfinApiKey",'') FROM "Server" WHERE "isActive"=TRUE ORDER BY "createdAt" ASC`)
	if err != nil {
		return jellyfin.AuthenticatedUser{}, "", err
	}
	defer rows.Close()

	type srvInfo struct {
		id, url, apiKey string
	}
	var servers []srvInfo
	for rows.Next() {
		var s srvInfo
		if err := rows.Scan(&s.id, &s.url, &s.apiKey); err == nil {
			servers = append(servers, s)
		}
	}
	_ = rows.Close()

	// If no servers in database, check environment JELLYFIN_URL
	if len(servers) == 0 {
		envURL := strings.TrimRight(strings.TrimSpace(os.Getenv("JELLYFIN_URL")), "/")
		if envURL != "" {
			servers = append(servers, srvInfo{
				id:     first(os.Getenv("JELLYFIN_SERVER_ID"), "master"),
				url:    envURL,
				apiKey: first(os.Getenv("JELLYFIN_API_KEY"), os.Getenv("JELLYTRACK_JELLYFIN_API_KEY")),
			})
		}
	}

	for _, srv := range servers {
		apiKey := srv.apiKey
		if strings.EqualFold(strings.TrimRight(srv.url, "/"), strings.TrimRight(os.Getenv("JELLYFIN_URL"), "/")) {
			apiKey = first(os.Getenv("JELLYFIN_API_KEY"), os.Getenv("JELLYTRACK_JELLYFIN_API_KEY"), apiKey)
		}
		client, err := jellyfin.New(srv.url, apiKey)
		if err != nil {
			continue
		}
		ctxTimeout, cancel := context.WithTimeout(ctx, 10*time.Second)
		users, err := client.AuthenticationUsers(ctxTimeout)
		cancel()
		if err != nil {
			continue
		}
		for _, u := range users {
			if strings.EqualFold(u.Name, targetName) {
				if u.ID != "" && !u.Policy.IsDisabled {
					if u.Policy.AuthenticationProviderID != jellyfin.LDAPAuthenticationProvider && (ldapSSOOnly() || u.Policy.AuthenticationProviderID != jellyfin.LocalAuthenticationProvider) {
						return jellyfin.AuthenticatedUser{}, "", fmt.Errorf("SSO requires verified Jellyfin identity and allowed authentication provider")
					}
					return u, srv.id, nil
				}
			}
		}
	}

	// If LDAP_SSO_ONLY is active, do not allow arbitrary synthetic accounts without matched LDAP identity
	if ldapSSOOnly() {
		return jellyfin.AuthenticatedUser{}, "", fmt.Errorf("SSO requires verified Jellyfin LDAP identity")
	}

	// If not matched to an existing Jellyfin account, allow SSO synthetic account if server exists
	if len(servers) > 0 {
		return jellyfin.AuthenticatedUser{
			ID:   "oidc-" + subject,
			Name: targetName,
		}, servers[0].id, nil
	}

	return jellyfin.AuthenticatedUser{
		ID:   "oidc-" + subject,
		Name: targetName,
	}, "master", nil
}
