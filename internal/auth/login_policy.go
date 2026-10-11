package auth

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/internal/jellyfin"
)

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
	if match.ID == "" || match.Policy.IsDisabled || match.Policy.AuthenticationProviderID != jellyfin.LocalAuthenticationProvider {
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
	if err != nil || current.Name == "" || !sameJellyfinID(current.ID, match.ID) || current.Policy.IsDisabled || current.Policy.AuthenticationProviderID != jellyfin.LocalAuthenticationProvider {
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
	if serverID == "" || userID == "" || subject == "" {
		return jellyfin.AuthenticatedUser{}, "", fmt.Errorf("missing stable identity claims")
	}
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
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	user, err := client.AuthenticationUser(ctx, userID)
	if err != nil || !sameJellyfinID(user.ID, userID) || user.Name == "" || user.Policy.IsDisabled || user.Policy.AuthenticationProviderID != jellyfin.LDAPAuthenticationProvider {
		return jellyfin.AuthenticatedUser{}, "", fmt.Errorf("SSO requires verified LDAP identity")
	}
	return user, serverID, nil
}
