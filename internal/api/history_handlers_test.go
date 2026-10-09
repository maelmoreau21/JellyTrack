package api

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/maelmoreau21/jellytrack/internal/auth"
)

func TestHistoryFiltersPaginationAndSelfScope(t *testing.T) {
	db := apiDB(t)
	for _, query := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s1','jf1','One','http://one'),('s2','jf2','Two','http://two')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('alice','s1','jf-alice','Alice'),('bob','s2','jf-bob','Bob')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type") VALUES('m1','s1','jf1','First Movie','Movie'),('m2','s2','jf2','Second Episode','Episode')`,
		`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","clientName","durationWatched","startedAt","endedAt") VALUES('p1','s1','alice','m1','DirectPlay','Jellyfin Web',600,'2026-01-01T17:00:00Z','2026-01-01T17:10:00Z'),('p2','s2','bob','m2','Transcode','Android',1800,'2026-01-02T18:00:00Z','2026-01-02T18:30:00Z'),('p3','s1','alice','m1','DirectPlay','Jellyfin Web',30,'2026-01-02T00:00:00Z','2026-01-02T00:00:30Z')`,
	} {
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	h := New(db, "sqlite")
	for _, tc := range []struct {
		name, query, role, user string
		want                    int
		id                      string
	}{
		{"all admin", "days=all", "admin", "Admin", 2, "p2"},
		{"custom exact day", "days=all&dateFrom=2026-01-01&dateTo=2026-01-01", "admin", "Admin", 1, "p1"},
		{"server", "days=all&servers=s1", "admin", "Admin", 1, "p1"},
		{"self", "days=all", "user", "Alice", 1, "p1"},
		{"cannot read bob", "days=all&userId=bob", "user", "Alice", 0, ""},
		{"family", "days=all&type=Series&hour=18&playMethod=Transcode&client=android&q=second", "admin", "Admin", 1, "p2"},
		{"show zapped sorted", "days=all&hideZapped=false&sort=duration_asc&limit=1", "admin", "Admin", 3, "p3"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest("GET", "/api/history?"+tc.query, nil)
			r = r.WithContext(context.WithValue(r.Context(), auth.PrincipalContextKey, auth.Principal{Role: tc.role, Username: tc.user}))
			w := httptest.NewRecorder()
			h.history(w, r)
			if w.Code != 200 {
				t.Fatalf("status %d: %s", w.Code, w.Body.String())
			}
			var result struct {
				Total int `json:"total"`
				Items []struct {
					ID string `json:"id"`
				} `json:"items"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
				t.Fatal(err)
			}
			if result.Total != tc.want {
				t.Fatalf("total=%d want %d", result.Total, tc.want)
			}
			if tc.id != "" && (len(result.Items) == 0 || result.Items[0].ID != tc.id) {
				t.Fatalf("unexpected first result %+v", result.Items)
			}
		})
	}
}

func TestCustomDashboardDateAliasesAndValidation(t *testing.T) {
	db := apiDB(t)
	h := New(db, "sqlite")
	for _, endpoint := range []string{"dashboard", "stats/deep", "stats/granular", "stats/network"} {
		for _, dates := range []string{"from=2026-01-01&to=2026-01-02", "startDate=2026-01-01&endDate=2026-01-02"} {
			r := httptest.NewRequest("GET", "/api/"+endpoint+"?timeRange=custom&"+dates, nil)
			filter, err := dashboardFilter(r, 30)
			if err != nil || filter.From != "2026-01-01" || filter.To != "2026-01-02" {
				t.Fatalf("filter %+v error %v", filter, err)
			}
		}
	}
	for _, query := range []string{"timeRange=custom", "from=2026-01-03&to=2026-01-01", "from=bad&to=2026-01-01"} {
		r := httptest.NewRequest("GET", "/api/dashboard?"+query, nil)
		w := httptest.NewRecorder()
		h.dashboard(w, r)
		if w.Code != 400 {
			t.Fatalf("invalid custom status %d", w.Code)
		}
	}
}

func TestHomonymousUsersCannotCrossServerIdentityBoundary(t *testing.T) {
	db := apiDB(t)
	for _, query := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s1','jf1','One','http://one'),('s2','jf2','Two','http://two')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u1','s1','shared-jellyfin-id','SameName'),('u2','s2','shared-jellyfin-id','SameName')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type") VALUES('m1','s1','jf1','Private One','Movie'),('m2','s2','jf2','Private Two','Movie')`,
		`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","durationWatched","startedAt","endedAt") VALUES('p1','s1','u1','m1','DirectPlay',600,'2026-01-01T17:00:00Z','2026-01-01T17:10:00Z'),('p2','s2','u2','m2','DirectPlay',900,'2026-01-01T18:00:00Z','2026-01-01T18:15:00Z')`,
		`INSERT INTO "ActiveStream"("id","serverId","sessionId","userId","mediaId","playMethod") VALUES('stream1','s1','session-one','u1','m1','DirectPlay'),('stream2','s2','session-two','u2','m2','DirectPlay')`,
		`INSERT INTO "GlobalSettings"("id","wrappedVisible","wrappedPeriodEnabled") VALUES('global',1,0)`,
	} {
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	h := New(db, "sqlite")
	known := auth.Principal{Username: "SameName", Role: "user", JellyfinUserID: "shared-jellyfin-id", AuthServerID: "s1"}
	for _, tc := range []struct {
		name, query       string
		principal         auth.Principal
		wantStatus, total int
	}{
		{"bound identity", "days=all", known, 200, 1},
		{"requested other server", "days=all&servers=s2", known, 200, 0},
		{"requested other user", "days=all&userId=u2", known, 200, 0},
		{"ambiguous legacy name", "days=all", auth.Principal{Username: "SameName", Role: "user"}, 403, 0},
		{"ambiguous legacy external ID", "days=all", auth.Principal{Username: "SameName", Role: "user", JellyfinUserID: "shared-jellyfin-id"}, 403, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest("GET", "/api/history?"+tc.query, nil)
			r = r.WithContext(context.WithValue(r.Context(), auth.PrincipalContextKey, tc.principal))
			w := httptest.NewRecorder()
			h.history(w, r)
			if w.Code != tc.wantStatus {
				t.Fatalf("status=%d want=%d", w.Code, tc.wantStatus)
			}
			if w.Code == 200 {
				var result struct {
					Total int `json:"total"`
					Items []struct {
						UserID string `json:"userId"`
					} `json:"items"`
				}
				if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
					t.Fatal(err)
				}
				if result.Total != tc.total {
					t.Fatalf("total=%d", result.Total)
				}
				for _, item := range result.Items {
					if item.UserID != "u1" {
						t.Fatalf("cross-account result=%s", item.UserID)
					}
				}
			}
		})
	}
	for _, kind := range []string{"active-stream", "wrapped", "profile"} {
		for _, tc := range []struct {
			id     string
			status int
		}{{"u1", 200}, {"shared-jellyfin-id", 200}, {"SameName", 200}, {"me", 200}, {"@me", 200}, {"u2", 403}} {
			t.Run(kind+"/"+tc.id, func(t *testing.T) {
				r := httptest.NewRequest("GET", "/api/test?year=2026", nil)
				r.SetPathValue("id", tc.id)
				r = r.WithContext(context.WithValue(r.Context(), auth.PrincipalContextKey, known))
				w := httptest.NewRecorder()
				if kind == "wrapped" {
					h.userWrapped(w, r)
				} else if kind == "profile" {
					h.userDetail(w, r)
				} else {
					h.userActiveStream(w, r)
				}
				if w.Code != tc.status {
					t.Fatalf("status=%d want=%d", w.Code, tc.status)
				}
				if w.Code == 200 {
					if kind == "wrapped" || kind == "profile" {
						var result struct {
							TotalPlays int64 `json:"totalPlays"`
						}
						if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
							t.Fatal(err)
						}
						if result.TotalPlays != 1 {
							t.Fatalf("cross-account Wrapped plays=%d", result.TotalPlays)
						}
					} else if strings.Contains(w.Body.String(), "session-two") {
						t.Fatal("cross-account active stream")
					}
				}
			})
		}
	}
	for _, kind := range []string{"active-stream", "wrapped", "profile"} {
		r := httptest.NewRequest("GET", "/api/test?year=2026", nil)
		r.SetPathValue("id", "me")
		r = r.WithContext(context.WithValue(r.Context(), auth.PrincipalContextKey, auth.Principal{Username: "SameName", Role: "user"}))
		w := httptest.NewRecorder()
		switch kind {
		case "wrapped":
			h.userWrapped(w, r)
		case "profile":
			h.userDetail(w, r)
		default:
			h.userActiveStream(w, r)
		}
		if w.Code != 403 {
			t.Fatalf("legacy ambiguous %s status=%d", kind, w.Code)
		}
	}
}
