package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/auth"
)

func TestUsersHistoricalMeaningfulSessionsAndInactiveAccounts(t *testing.T) {
	db := apiDB(t)
	queries := []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','jf','Server','http://jf')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username","isActive","lastActive") VALUES('u','s','jfu','Active',1,'2026-10-01T00:00:00Z'),('empty','s','jfe','Empty',0,'2026-10-08T00:00:00Z')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type") VALUES('m','s','jfm','Film','Movie')`,
		`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","durationWatched","clientName","startedAt","endedAt") VALUES('p1','s','u','m','Transcode',1200,'Zeta','2026-10-01T10:00:00Z','2026-10-01T11:00:00Z'),('p2','s','u','m','Transcode',1200,'Alpha','2026-10-02T10:00:00Z','2026-10-02T11:00:00Z'),('p3','s','u','m','DirectPlay',1200,'Beta','2026-10-03T10:00:00Z','2026-10-03T11:00:00Z'),('zap','s','u','m','DirectPlay',10,'Zeta','2026-10-09T10:00:00Z','2026-10-09T10:00:10Z'),('ezap','s','empty','m','DirectPlay',10,'Zeta','2026-10-08T10:00:00Z','2026-10-08T10:00:10Z')`,
	}
	for _, q := range queries {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	w := httptest.NewRecorder()
	New(db, "sqlite").users(w, httptest.NewRequest("GET", "/api/users?limit=1", nil))
	var res struct {
		Items []map[string]any `json:"items"`
		Total int              `json:"total"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatal(err)
	}
	if w.Code != 200 || res.Total != 2 || len(res.Items) != 1 {
		t.Fatalf("list response: %d %s", w.Code, w.Body.String())
	}
	u := res.Items[0]
	if u["totalHours"] != float64(1) || u["sessionsCount"] != float64(3) || u["transcodeRatio"] != float64(67) || u["favoriteClient"] != "Alpha" || u["lastActive"] != "2026-10-09T10:00:10Z" {
		t.Fatalf("historical stats mismatch: %+v", u)
	}
	w = httptest.NewRecorder()
	New(db, "sqlite").users(w, httptest.NewRequest("GET", "/api/users?limit=1&offset=1", nil))
	_ = json.Unmarshal(w.Body.Bytes(), &res)
	if len(res.Items) != 1 || res.Items[0]["id"] != "empty" || res.Items[0]["lastActive"] != nil || res.Items[0]["favoriteClient"] != "Inconnu" {
		t.Fatalf("inactive/no meaningful history lost: %s", w.Body.String())
	}
}

func TestProfileSeparatesCardsAndChartsAndUsesCumulativeCompletion(t *testing.T) {
	str := func(s string) sql.NullString { return sql.NullString{String: s, Valid: true} }
	sessions := []profileSession{
		{mediaID: "movie", jellyfinMediaID: "film", title: "Film", kind: "Movie", duration: 2400, runtime: 6000000, method: "DirectPlay", source: "playback", started: "2026-10-08T12:00:00Z", ended: str("2026-10-08T13:00:00Z"), client: str("Web"), device: str("Browser"), genres: str(`["Action"]`), bitrate: sql.NullInt64{Int64: 8000000, Valid: true}},
		{mediaID: "movie", jellyfinMediaID: "film", title: "Film", kind: "Movie", duration: 2400, runtime: 6000000, method: "DirectStream", source: "playback", started: "2026-10-09T13:00:00Z", ended: str("2026-10-09T14:00:00Z"), client: str("Web"), genres: str(`["Action"]`), bitrate: sql.NullInt64{Int64: 4000, Valid: true}},
		{mediaID: "audio", jellyfinMediaID: "track", title: "Song", kind: "Audio", duration: 60, runtime: 100000, method: "DirectPlay", source: "playback", started: "2026-10-09T13:00:00Z", ended: str("2026-10-09T13:01:00Z"), client: str("Phone"), genres: str(`["Pop"]`)},
		{mediaID: "zap", kind: "Movie", duration: 10, runtime: 100000, source: "playback", method: "Transcode", started: "2026-10-09T14:00:00Z", ended: str("2026-10-09T14:00:10Z"), client: str("TV")},
		{mediaID: "unknown", duration: 0, source: "download", method: "Download", started: "2026-10-09T14:00:00Z", ended: str("2026-10-09T14:00:00Z")},
	}
	stats, activity, charts := aggregateProfileSessions(sessions, time.Date(2026, 10, 9, 18, 0, 0, 0, time.UTC), time.UTC)
	if stats["sessionsCount"] != 4 || stats["totalHours"] != 1.4 || stats["averageCompletion"] != float64(47) || stats["bestStreak"] != 2 || stats["uniqueMovies"] != 1 || stats["uniqueAudio"] != 1 {
		t.Fatalf("profile card policies: %+v", stats)
	}
	if len(activity) != 30 || activity[29]["hours"] != 0.7 || charts["directPlayRatio"] != 40 || charts["averageBitrateKbps"] != float64(6000) {
		t.Fatalf("all-session charts policy: activity=%v charts=%+v", activity[29], charts)
	}
	completion := charts["completion"].([]map[string]any)
	if len(completion) != 2 || completion[0]["name"] != "completed" || completion[0]["value"] != 2 || completion[1]["name"] != "abandoned" {
		t.Fatalf("cumulative completion thresholds: %+v", completion)
	}
	empty, _, emptyCharts := aggregateProfileSessions(nil, time.Now(), time.UTC)
	if empty["lastActive"] != nil || empty["mostWatched"] != nil || emptyCharts["averageBitrateKbps"] != nil || emptyCharts["hasHistory"] != false || len(emptyCharts["completion"].([]map[string]any)) != 0 {
		t.Fatalf("empty profile fabricates data: %+v %+v", empty, emptyCharts)
	}
}

func TestProfileHistoryFiltersExportAndIdentityScope(t *testing.T) {
	db := apiDB(t)
	for _, q := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s1','jf1','One','http://jf1'),('s2','jf2','Two','http://jf2')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u1','s1','jf-u1','Alice'),('u2','s2','jf-u2','Alice'),('empty','s1','jf-empty','Empty')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","resolution","durationMs") VALUES('m1','s1','jfm1','Needle film','Movie','1080p',5400000),('m2','s2','jfm2','Private film','Movie','4K',NULL)`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	for i := 0; i < 55; i++ {
		_, err := db.Exec(`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","durationWatched","startedAt","endedAt","clientName","deviceName","audioLanguage","subtitleCodec","ipAddress","bitrate") VALUES(?,'s1','u1','m1','DirectPlay',120,'2026-10-09T10:00:00Z','2026-10-09T10:02:00Z','Web','Browser','fra','srt','192.0.2.1',8000000)`, fmt.Sprintf("p%02d", i))
		if err != nil {
			t.Fatal(err)
		}
	}
	for _, q := range []string{
		`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","durationWatched","startedAt","endedAt") VALUES('private','s2','u2','m2','DirectPlay',7200,'2026-10-09T10:00:00Z','2026-10-09T12:00:00Z')`,
		`INSERT INTO "TelemetryEvent"("id","serverId","playbackId","eventType","positionMs","metadata") VALUES('event','s1','p00','pause',1000,'{"reason":"user"}')`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	h := New(db, "sqlite")
	p := auth.Principal{Username: "Alice", Role: "user", JellyfinUserID: "jf-u1", AuthServerID: "s1", IdentityVersion: 1}
	call := func(id, query string) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest("GET", "/api/users/"+id+query, nil)
		req.SetPathValue("id", id)
		req = req.WithContext(context.WithValue(req.Context(), auth.PrincipalContextKey, p))
		w := httptest.NewRecorder()
		h.userDetail(w, req)
		return w
	}
	for _, query := range []string{"?page=2", "?query=192.0.2&client=web&audio=fra&subtitle=srt&type=Movie,Audio&resolution=1080&playMethod=directplay&dateFrom=2026-10-09&dateTo=2026-10-09&page=2"} {
		w := call("jf-u1", query)
		var res struct {
			History struct {
				Items       []map[string]any `json:"items"`
				Total, Page int
			} `json:"history"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
			t.Fatal(err)
		}
		if w.Code != 200 || res.History.Total != 55 || res.History.Page != 2 || len(res.History.Items) != 5 {
			t.Fatalf("pagination/filters: %d %s", w.Code, w.Body.String())
		}
		for _, item := range res.History.Items {
			if item["serverId"] != "s1" || item["userId"] != "u1" || item["bitrate"] != float64(8000) || item["mediaDurationMs"] != float64(5400000) {
				t.Fatalf("history disclosure or normalization: %+v", item)
			}
		}
	}
	w := call("jf-u1", "?export=true&sort=date_asc")
	var exported struct {
		History struct {
			Items []map[string]any `json:"items"`
			Total int
		} `json:"history"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &exported)
	if w.Code != 200 || len(exported.History.Items) != 55 || len(exported.History.Items[0]["telemetryEvents"].([]any)) != 1 {
		t.Fatalf("full scoped export/telemetry: %d %s", w.Code, w.Body.String())
	}
	if w := call("jf-u1", "?query=private"); w.Code != 200 {
		t.Fatalf("filter status: %d", w.Code)
	} else {
		var res map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &res)
		if res["history"].(map[string]any)["total"] != float64(0) {
			t.Fatal("cross-server filter exposed history")
		}
	}
	for _, id := range []string{"jf-u2", "u2", "jf-empty"} {
		if w := call(id, "?export=true"); w.Code != 403 {
			t.Fatalf("other profile %s status=%d", id, w.Code)
		}
	}
	if w := call("me", "?dateFrom=not-a-date"); w.Code != 400 {
		t.Fatalf("invalid date=%d", w.Code)
	}
	// Administrators retain access to an account with no history.
	p.Role = "admin"
	w = call("jf-u1", "?export=true")
	var linked struct {
		Stats   map[string]any `json:"stats"`
		History struct {
			Total int
			Items []map[string]any `json:"items"`
		} `json:"history"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &linked); err != nil {
		t.Fatal(err)
	}
	if w.Code != 200 || linked.Stats["sessionsCount"] != float64(56) || linked.History.Total != 56 {
		t.Fatalf("admin historical linked aggregation: %d %s", w.Code, w.Body.String())
	}
	foundPrivate := false
	for _, item := range linked.History.Items {
		if item["id"] == "private" {
			foundPrivate = true
			if item["serverId"] != "s2" || item["userId"] != "u2" {
				t.Fatalf("linked row mislabeled: %+v", item)
			}
		}
	}
	if !foundPrivate {
		t.Fatal("admin linked history omitted second server")
	}
	w = call("jf-empty", "")
	if w.Code != 200 {
		t.Fatalf("empty profile=%d %s", w.Code, w.Body.String())
	}
}

func TestProfileReconnectionUsesOtherSessionsOnCurrentPage(t *testing.T) {
	item := func(id, user, server, media, started string, ended any) map[string]any {
		return map[string]any{"id": id, "userId": user, "serverId": server, "mediaId": media, "startedAt": started, "endedAt": ended}
	}
	page := []map[string]any{
		item("previous", "u", "s", "m", "2026-10-09T09:00:00Z", "2026-10-09T10:00:00Z"),
		item("long-reconnection", "u", "s", "m", "2026-10-09T10:00:30Z", "2026-10-09T11:00:00Z"),
		item("outside-window", "u", "s", "m", "2026-10-09T11:00:31Z", "2026-10-09T12:00:00Z"),
		item("other-user", "other", "s", "m", "2026-10-09T10:00:01Z", "2026-10-09T10:00:05Z"),
		item("other-media", "u", "s", "other", "2026-10-09T10:00:01Z", "2026-10-09T10:00:05Z"),
		item("other-server", "u", "other", "m", "2026-10-09T10:00:01Z", "2026-10-09T10:00:05Z"),
		item("self-short-only", "alone", "s", "m", "2026-10-09T10:00:01Z", "2026-10-09T10:00:05Z"),
		item("missing-end", "open", "s", "m", "2026-10-09T10:00:01Z", nil),
		item("after-missing-end", "open", "s", "m", "2026-10-09T10:00:02Z", "2026-10-09T11:00:00Z"),
	}
	markProfileReconnections(page)
	for i, row := range page {
		if row["isReconnection"] != (i == 1) {
			t.Fatalf("row %s reconnect=%v", row["id"], row["isReconnection"])
		}
	}
	// A previous page's predecessor is deliberately excluded, like main.
	markProfileReconnections(page[1:2])
	if page[1]["isReconnection"] != false {
		t.Fatal("reconnection inferred from a session outside current page")
	}
}

func TestProfileFavoritesTiesKeepHistoricalFirstSession(t *testing.T) {
	sessions := []profileSession{
		{mediaID: "late", kind: "Movie", client: sql.NullString{String: "Zeta", Valid: true}, device: sql.NullString{String: "TV", Valid: true}, started: "2026-10-09T13:00:00Z", duration: 120, source: "playback", genres: sql.NullString{String: `["Zeta"]`, Valid: true}},
		{mediaID: "early", kind: "Audio", client: sql.NullString{String: "Alpha", Valid: true}, device: sql.NullString{String: "Phone", Valid: true}, started: "2026-10-08T00:00:00Z", duration: 120, source: "playback", genres: sql.NullString{String: `["Alpha"]`, Valid: true}},
	}
	stats, _, charts := aggregateProfileSessions(sessions, time.Now(), time.UTC)
	if stats["favoriteClient"] != "Zeta" || stats["favoriteDevice"] != "TV" || stats["favoriteFormat"] != "Movie" || stats["peakDay"] != 5 || stats["peakHour"] != 13 || charts["favoriteClient"] != "Zeta" {
		t.Fatalf("historical first-row tie semantics: %+v %+v", stats, charts)
	}
}

func TestUserAvatarOptInMissingResponse(t *testing.T) {
	t.Setenv("JELLYFIN_URL", "")
	db := apiDB(t)
	h := New(db, "sqlite")
	for _, tc := range []struct {
		query  string
		status int
	}{{"", 200}, {"&fallback=none", 404}} {
		w := httptest.NewRecorder()
		h.jellyfinUserImageProxy(w, httptest.NewRequest("GET", "/api/jellyfin/user-image?userId=missing"+tc.query, nil))
		if w.Code != tc.status {
			t.Fatalf("avatar %s=%d", tc.query, w.Code)
		}
	}
}
